/**
 * Programador interno del correo masivo programado: el propio servidor del
 * portal revisa cada minuto si hay tandas cuya hora (de Chile) ya llego y las
 * manda, aunque nadie tenga la pantalla abierta. Mismo esquema que
 * programadorResumen.ts: no depende de n8n ni de un cron externo.
 *
 * - Lo arranca src/instrumentation.ts al iniciar el servidor.
 * - Solo corre en produccion: un `npm run dev` local nunca manda correos.
 * - Si el servidor se reinicia a mitad de tanda, la siguiente vuelta la
 *   retoma (heartbeat_at quieto mas de 10 min) y salta a quienes ya les
 *   salio el correo (quedan en email_messages con el mismo batch_id).
 * - Si el servidor estuvo caido y la hora se paso por mas de 6 horas, la
 *   tanda queda EXPIRED en vez de llegarle al cliente a destiempo.
 * - Se apaga con la variable CORREO_PROGRAMADO_AUTO=false.
 */

import { prisma } from "@/lib/prisma";
import {
  loadEmailAttachments,
  sendEmailsToReservations,
  sleep,
  type EmailAudience,
} from "@/lib/correoMasivo";
import { emailWebhookConfigured } from "@/lib/emailWebhook";

const CADA_MS = 60 * 1000;
const TRAMO = 5;
const RETOMAR_SI_QUIETO_MS = 10 * 60 * 1000;
const VENCE_DESPUES_MS = 6 * 60 * 60 * 1000;
const ADJUNTOS_HUERFANOS_MS = 7 * 86_400_000;
const MAX_DETALLE = 300;

const g = globalThis as unknown as {
  __programadorCorreos?: NodeJS.Timeout;
  __correosEnCurso?: boolean;
  __correosUltimaLimpieza?: number;
};

type Detalle = { clientName: string; error: string; skipped?: boolean };

/** Toma una tanda de forma atomica: si otra vuelta ya la tomo, devuelve false. */
async function tomarTanda(id: string, statusEsperado: string, quietoAntesDe?: Date): Promise<boolean> {
  const where: any = { id, status: statusEsperado };
  if (quietoAntesDe) where.OR = [{ heartbeat_at: null }, { heartbeat_at: { lt: quietoAntesDe } }];
  const res = await prisma.emailScheduledBatch.updateMany({
    where,
    data: { status: "SENDING", heartbeat_at: new Date(), started_at: statusEsperado === "PENDING" ? new Date() : undefined },
  });
  return res.count === 1;
}

async function procesarTanda(id: string) {
  const batch = await prisma.emailScheduledBatch.findUnique({ where: { id } });
  if (!batch) return;

  const adj = await loadEmailAttachments(batch.attachment_ids);
  if (!adj.ok) {
    await prisma.emailScheduledBatch.update({
      where: { id },
      data: { status: "FAILED", error: adj.error, finished_at: new Date() },
    });
    return;
  }

  // Lo que ya salio en una vuelta anterior (reinicio a mitad de tanda) no se repite.
  const yaProcesados = await prisma.emailMessage.findMany({
    where: { batch_id: id },
    select: { reservation_id: true },
  });
  const hechos = new Set(yaProcesados.map((m) => m.reservation_id).filter(Boolean) as string[]);
  const pendientes = batch.reservation_ids.filter((r) => !hechos.has(r));

  let sent = batch.sent_count;
  let failed = batch.failed_count;
  let skipped = batch.skipped_count;
  const detalle: Detalle[] = Array.isArray(batch.detail) ? ((batch.detail as any[]) as Detalle[]) : [];

  const cancelada = async () => {
    const row = await prisma.emailScheduledBatch.findUnique({ where: { id }, select: { status: true } });
    return row?.status === "CANCELLED";
  };

  for (let i = 0; i < pendientes.length; i += TRAMO) {
    if (await cancelada()) return;
    const tramo = pendientes.slice(i, i + TRAMO);

    let results;
    try {
      results = await sendEmailsToReservations({
        batchId: id,
        subject: batch.subject,
        body: batch.body,
        reservationIds: tramo,
        adjuntos: adj.adjuntos,
        sentBy: batch.created_by,
        batchTotal: batch.reservation_ids.length,
        startIndex: hechos.size + i,
        recheckAudience: batch.audience as EmailAudience,
        shouldStop: cancelada,
      });
    } catch (e: any) {
      console.error(`[correo-programado] tramo fallo en tanda ${id}:`, e);
      results = tramo.map((reservationId) => ({
        reservationId,
        clientName: "?",
        ok: false,
        error: e?.message || "Error inesperado",
      }));
    }

    for (const r of results) {
      if (r.ok) sent++;
      else if ((r as any).skipped) skipped++;
      else failed++;
      if (!r.ok && detalle.length < MAX_DETALLE) {
        detalle.push({ clientName: r.clientName, error: r.error || "Error desconocido", skipped: (r as any).skipped || undefined });
      }
    }

    await prisma.emailScheduledBatch.updateMany({
      where: { id, status: "SENDING" },
      data: { sent_count: sent, failed_count: failed, skipped_count: skipped, detail: detalle as any, heartbeat_at: new Date() },
    });

    if (i + TRAMO < pendientes.length) await sleep(2000 + Math.random() * 3000);
  }

  const final = failed === 0 ? "SENT" : sent === 0 ? "FAILED" : "PARTIAL";
  await prisma.emailScheduledBatch.updateMany({
    where: { id, status: "SENDING" },
    data: { status: final, finished_at: new Date(), heartbeat_at: new Date() },
  });
  console.log(`[correo-programado] tanda ${id}: ${sent} enviados, ${failed} con error, ${skipped} omitidos.`);
}

/** Borra adjuntos de mas de 7 dias que no estan amarrados a una tanda por salir. */
async function limpiarAdjuntos() {
  const ahora = Date.now();
  if (g.__correosUltimaLimpieza && ahora - g.__correosUltimaLimpieza < 60 * 60 * 1000) return;
  g.__correosUltimaLimpieza = ahora;

  const enUso = await prisma.emailScheduledBatch.findMany({
    where: { status: { in: ["PENDING", "SENDING"] } },
    select: { attachment_ids: true },
  });
  const ids = Array.from(new Set(enUso.flatMap((b) => b.attachment_ids)));
  const res = await prisma.emailAttachment.deleteMany({
    where: { created_at: { lt: new Date(ahora - ADJUNTOS_HUERFANOS_MS) }, id: { notIn: ids } },
  });
  if (res.count > 0) console.log(`[correo-programado] ${res.count} adjunto(s) viejos borrados.`);
}

export async function revisarCorreosProgramados() {
  if (g.__correosEnCurso) return;
  g.__correosEnCurso = true;
  try {
    const ahora = new Date();

    // Las que se pasaron demasiado (servidor caido) no salen a destiempo.
    await prisma.emailScheduledBatch.updateMany({
      where: { status: "PENDING", scheduled_at: { lt: new Date(ahora.getTime() - VENCE_DESPUES_MS) } },
      data: {
        status: "EXPIRED",
        finished_at: ahora,
        error: "El servidor no estuvo disponible a la hora programada; no se envió para no llegar a destiempo.",
      },
    });

    if (!emailWebhookConfigured()) return;

    // Primero las que quedaron a medias por un reinicio, despues las nuevas.
    const quietoAntesDe = new Date(ahora.getTime() - RETOMAR_SI_QUIETO_MS);
    const aMedias = await prisma.emailScheduledBatch.findMany({
      where: { status: "SENDING", OR: [{ heartbeat_at: null }, { heartbeat_at: { lt: quietoAntesDe } }] },
      select: { id: true },
      orderBy: { scheduled_at: "asc" },
    });
    for (const b of aMedias) {
      if (await tomarTanda(b.id, "SENDING", quietoAntesDe)) await procesarTanda(b.id);
    }

    const listas = await prisma.emailScheduledBatch.findMany({
      where: { status: "PENDING", scheduled_at: { lte: ahora } },
      select: { id: true },
      orderBy: { scheduled_at: "asc" },
    });
    for (const b of listas) {
      if (await tomarTanda(b.id, "PENDING")) await procesarTanda(b.id);
    }

    await limpiarAdjuntos();
  } catch (e: any) {
    // Sin la migracion 12 la tabla no existe: no hay nada programado, no es un error que valga la pena gritar.
    if (e?.code !== "P2021") console.error("[correo-programado] el programador fallo:", e);
  } finally {
    g.__correosEnCurso = false;
  }
}

export function iniciarProgramadorCorreos() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.CORREO_PROGRAMADO_AUTO === "false") return;
  if (g.__programadorCorreos) return;

  g.__programadorCorreos = setInterval(revisarCorreosProgramados, CADA_MS);
  setTimeout(revisarCorreosProgramados, 30 * 1000);
  console.log("[correo-programado] programador activo: revisa cada minuto (hora de Chile).");
}
