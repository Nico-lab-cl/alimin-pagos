"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { memoryCache } from "@/lib/cache";
import { revalidatePath } from "next/cache";

/** Cada cuánto se le vuelve a preguntar el NPS a quien ya respondió o pospuso. */
const NPS_COOLDOWN_DAYS = 90;

const FEEDBACK_CATEGORIES = ["SUGERENCIA", "PROBLEMA", "FELICITACION"] as const;
type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

const MAX_MESSAGE_LENGTH = 2000;

/** Lo que NextAuth deja en la sesión y este módulo necesita. */
type SessionUser = { id?: string; role?: string };

/**
 * Reserva del usuario a la que se asocia su feedback. Si tiene varias se toma la
 * más reciente: sirve de contexto para postventa, no es un dato financiero.
 */
async function getUserReservationId(userId: string): Promise<string | null> {
  const reservation = await prisma.reservation.findFirst({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    select: { id: true },
  });
  return reservation?.id || null;
}

/**
 * Guarda un comentario libre del cliente (sugerencia, problema o felicitación).
 */
export async function submitFeedback(data: {
  category: string;
  message: string;
  pageContext?: string;
}) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) return { error: "No autorizado" };

  const message = (data.message || "").trim();
  if (message.length < 5) {
    return { error: "Cuéntanos un poco más para poder ayudarte" };
  }

  const category = FEEDBACK_CATEGORIES.includes(data.category as FeedbackCategory)
    ? data.category
    : "SUGERENCIA";

  try {
    const reservationId = await getUserReservationId(user.id);

    await prisma.feedback.create({
      data: {
        user_id: user.id,
        reservation_id: reservationId,
        type: "COMMENT",
        category,
        message: message.slice(0, MAX_MESSAGE_LENGTH),
        page_context: data.pageContext?.slice(0, 160) || null,
        status: "NEW",
      },
    });

    memoryCache.deleteByPrefix("feedback_");
    revalidatePath("/admin/feedback");

    return { success: true };
  } catch (error) {
    console.error("Error saving feedback:", error);
    return { error: "No pudimos enviar tu comentario. Inténtalo de nuevo." };
  }
}

/**
 * Indica si al cliente le toca ver la encuesta NPS. Se le muestra si nunca
 * respondió ni pospuso, o si su última interacción con la encuesta tiene más de
 * NPS_COOLDOWN_DAYS días.
 */
export async function getNpsStatus() {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) return { shouldAsk: false };

  try {
    const last = await prisma.feedback.findFirst({
      where: { user_id: user.id, type: { in: ["NPS", "NPS_SKIP"] } },
      orderBy: { created_at: "desc" },
      select: { created_at: true, type: true },
    });

    if (!last) return { shouldAsk: true };

    const lastDate = last.created_at ? new Date(last.created_at) : null;
    if (!lastDate) return { shouldAsk: true };

    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    return { shouldAsk: daysSince >= NPS_COOLDOWN_DAYS, lastAnsweredAt: lastDate.toISOString() };
  } catch (error) {
    // Si la consulta falla, no bloqueamos el portal: simplemente no se pregunta.
    console.error("Error checking NPS status:", error);
    return { shouldAsk: false };
  }
}

/**
 * Guarda la respuesta de la encuesta NPS (0-10 + comentario opcional).
 */
export async function submitNpsResponse(data: { score: number; message?: string }) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) return { error: "No autorizado" };

  const score = Number(data.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return { error: "Selecciona una nota entre 0 y 10" };
  }

  try {
    const reservationId = await getUserReservationId(user.id);
    const message = (data.message || "").trim();

    await prisma.feedback.create({
      data: {
        user_id: user.id,
        reservation_id: reservationId,
        type: "NPS",
        score,
        message: message ? message.slice(0, MAX_MESSAGE_LENGTH) : null,
        status: "NEW",
      },
    });

    memoryCache.deleteByPrefix("feedback_");
    revalidatePath("/admin/feedback");

    return { success: true };
  } catch (error) {
    console.error("Error saving NPS response:", error);
    return { error: "No pudimos registrar tu respuesta. Inténtalo de nuevo." };
  }
}

/**
 * El cliente pospone la encuesta: se registra para no volver a molestarlo hasta
 * que pase el período de espera.
 */
export async function dismissNpsSurvey() {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) return { error: "No autorizado" };

  try {
    await prisma.feedback.create({
      data: { user_id: user.id, type: "NPS_SKIP", status: "DONE" },
    });
    return { success: true };
  } catch (error) {
    console.error("Error dismissing NPS survey:", error);
    return { error: "Error al posponer la encuesta" };
  }
}

/**
 * Vista de administración: comentarios + métricas NPS.
 *
 * El NPS se calcula sobre la ÚLTIMA respuesta de cada cliente (un cliente = un
 * voto), que es como se mide de verdad: si alguien respondió hace 6 meses y
 * volvió a responder ahora, cuenta su opinión actual, no las dos.
 */
export async function getFeedbackDashboard() {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const entries = await prisma.feedback.findMany({
      where: { type: { in: ["COMMENT", "NPS"] } },
      orderBy: { created_at: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        reservation: {
          select: {
            id: true,
            name: true,
            last_name: true,
            lot: { select: { number: true, stage: true } },
            project: { select: { name: true } },
          },
        },
      },
    });

    const items = entries.map((f) => ({
      id: f.id,
      type: f.type,
      category: f.category,
      score: f.score,
      message: f.message,
      status: f.status || "NEW",
      adminNote: f.admin_note,
      pageContext: f.page_context,
      createdAt: f.created_at?.toISOString() || null,
      clientName: `${f.reservation?.name || ""} ${f.reservation?.last_name || ""}`.trim() || f.user?.name || "Cliente",
      clientEmail: f.user?.email || "",
      lotNumber: f.reservation?.lot?.number || null,
      projectName: f.reservation?.project?.name || null,
      reservationId: f.reservation?.id || null,
    }));

    // Última respuesta NPS por cliente
    const latestByUser = new Map<string, number>();
    for (const f of entries) {
      if (f.type !== "NPS" || f.score == null) continue;
      if (!latestByUser.has(f.user_id)) latestByUser.set(f.user_id, f.score);
    }

    const scores = [...latestByUser.values()];
    const promoters = scores.filter((s) => s >= 9).length;
    const passives = scores.filter((s) => s >= 7 && s <= 8).length;
    const detractors = scores.filter((s) => s <= 6).length;
    const npsScore = scores.length
      ? Math.round(((promoters - detractors) / scores.length) * 100)
      : null;
    const average = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

    return {
      success: true,
      items,
      nps: {
        score: npsScore,
        average,
        responses: scores.length,
        promoters,
        passives,
        detractors,
      },
      pendingCount: items.filter((i) => i.status === "NEW").length,
    };
  } catch (error) {
    console.error("Error loading feedback dashboard:", error);
    return { error: "Error al cargar la retroalimentación" };
  }
}

/**
 * Marca un comentario/respuesta como leído o atendido.
 */
export async function updateFeedbackStatus(feedbackId: string, status: "NEW" | "READ" | "DONE", adminNote?: string) {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    await prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        status,
        ...(adminNote !== undefined ? { admin_note: adminNote.slice(0, MAX_MESSAGE_LENGTH) || null } : {}),
      },
    });

    memoryCache.deleteByPrefix("feedback_");
    revalidatePath("/admin/feedback");

    return { success: true };
  } catch (error) {
    console.error("Error updating feedback status:", error);
    return { error: "Error al actualizar el estado" };
  }
}
