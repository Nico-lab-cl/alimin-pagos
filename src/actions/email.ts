"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import crypto from "crypto";
import { getFullPostventaData, getAdminProjects } from "./postventa";
import {
  buzonForProject,
  knownEmailProjectSlugs,
  emailWebhookConfigured,
  sendEmail,
} from "@/lib/emailWebhook";
import {
  buildEmailHtml,
  renderEmailVariables,
  EMAIL_SUBJECT_MAX,
  EMAIL_BODY_MAX,
  EMAIL_TEMPLATE_VARIABLES,
  EMAIL_ATTACHMENTS_MAX_FILES,
  EMAIL_ATTACHMENTS_MAX_BYTES,
  EMAIL_ATTACHMENT_BLOCKED_EXT,
  EMAIL_SCHEDULE_MAX_DAYS,
} from "@/lib/emailTemplate";
import {
  EMAIL_AUDIENCES as AUDIENCES,
  AUDIENCE_LABELS,
  santiagoDayKey,
  matchesAudience,
  installmentAmount,
  buildEmailClientValues,
  validEmails,
  EMAIL_REGEX,
  loadEmailAttachments,
  sendEmailsToReservations,
  type EmailAudience,
  type EmailChunkResult,
} from "@/lib/correoMasivo";
import { chileLocalToUtc, formatoFechaHoraChile } from "@/lib/horaChile";

// Solo tipos: se borran al compilar, asi que no rompen la regla de que un
// archivo "use server" exporte unicamente funciones async.
export type { EmailAudience, EmailChunkResult };

/**
 * Modulo de correo masivo: postventa escribe asunto + cuerpo, elige a quien,
 * y este archivo llama al webhook de n8n que manda el correo real desde la
 * cuenta de Gmail que corresponda (Cindy o Denisse).
 *
 * Regla de oro, igual que en whatsapp.ts: la segmentacion NO se recalcula
 * aca. Los estados de cobranza salen tal cual de getFullPostventaData.
 * El envio en si (y las reglas de segmento) viven en lib/correoMasivo.ts,
 * compartidas con el programador de tandas (lib/programadorCorreos.ts).
 *
 * Solo dos cuentas pueden mandar tandas: postventa@lomasdelmar.cl (buzon
 * cindy, cubre Lomas del Mar y Arena y Sol) y postventa@libertadyalegria.cl
 * (buzon denisse). Cualquier otra cuenta ADMIN puede ver el panel y el
 * historial, pero el envio se corta en el servidor, no solo en la pantalla.
 */

const BULK_SENDER_ALLOWLIST = new Set([
  "postventa@lomasdelmar.cl",
  "postventa@libertadyalegria.cl",
]);

/** Cuantos correos salen como maximo en una llamada. */
const MAX_CHUNK = 5;
/** Techo por tanda, igual que en la pantalla. */
const MAX_PER_BATCH = 250;

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") return null;
  return user;
}

function canAccessProject(user: any, slug: string): boolean {
  if (!user?.allowedProjects || !Array.isArray(user.allowedProjects)) return true;
  return user.allowedProjects.includes(slug);
}

function canSendBulk(user: any): boolean {
  return typeof user?.email === "string" && BULK_SENDER_ALLOWLIST.has(user.email.toLowerCase());
}

/** Proyectos que el admin puede ver Y que este modulo sabe atender (tienen buzon). */
async function scopedProjects(projectSlug: string) {
  const res = await getAdminProjects();
  const all = (res.projects || []).filter((p: any) => knownEmailProjectSlugs().includes(p.slug));
  if (projectSlug === "ALL") return all;
  return all.filter((p: any) => p.slug === projectSlug);
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export async function getEmailOverview({ projectSlug }: { projectSlug: string }) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  try {
    const projects = await scopedProjects(projectSlug);
    const slugs = projects.map((p: any) => p.slug);

    if (slugs.length === 0) {
      return { error: "No tienes proyectos de correo habilitados" };
    }

    const now = new Date();
    const since = (days: number) => new Date(now.getTime() - days * 86_400_000);
    const where = { project_slug: { in: slugs } };

    const [sentToday, sent7, sent30, sentTotal, failedTotal, recent] = await Promise.all([
      prisma.emailMessage.count({ where: { ...where, status: "SENT", created_at: { gte: since(1) } } }),
      prisma.emailMessage.count({ where: { ...where, status: "SENT", created_at: { gte: since(7) } } }),
      prisma.emailMessage.count({ where: { ...where, status: "SENT", created_at: { gte: since(30) } } }),
      prisma.emailMessage.count({ where: { ...where, status: "SENT" } }),
      prisma.emailMessage.count({ where: { ...where, status: "FAILED" } }),
      prisma.emailMessage.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: 25,
        select: {
          id: true,
          client_name: true,
          to_email: true,
          subject: true,
          status: true,
          error: true,
          project_slug: true,
          buzon: true,
          sent_by: true,
          created_at: true,
        },
      }),
    ]);

    return {
      success: true,
      projects: projects.map((p: any) => ({ slug: p.slug, name: p.name })),
      canSend: canSendBulk(user),
      configured: emailWebhookConfigured(),
      stats: { sentToday, sent7, sent30, sentTotal, failedTotal },
      recent,
    };
  } catch (error) {
    console.error("Error cargando el panel de correo:", error);
    return { error: "Error al cargar el panel de correo" };
  }
}

// ---------------------------------------------------------------------------
// Destinatarios
// ---------------------------------------------------------------------------

export async function getEmailRecipients({
  projectSlug,
  audience,
}: {
  projectSlug: string;
  audience: EmailAudience;
}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado", recipients: [] };

  if (!AUDIENCES.includes(audience)) {
    return { error: "Segmento inválido", recipients: [] };
  }

  try {
    const projects = await scopedProjects(projectSlug);
    if (projects.length === 0) {
      return { error: "Proyecto no disponible", recipients: [] };
    }

    const todayKey = santiagoDayKey(new Date())!;

    const clientResults = await Promise.all(
      projects.map((p: any) => getFullPostventaData({ projectSlug: p.slug }))
    );
    const matched = clientResults.flatMap((res: any, i: number) =>
      (res.data || [])
        .filter((c: any) => matchesAudience(c, audience, todayKey))
        .map((c: any) => ({
          ...c,
          projectSlug: projects[i].slug,
          projectName: projects[i].name,
        }))
    );

    const recipients = matched
      .map((c: any) => {
        const emails = validEmails(c);
        const monto = installmentAmount(c);
        const multa = Number(c?.penaltyAmount) || 0;
        return {
          id: c.id,
          clientName: c.clientName,
          rut: c.rut,
          clientPhone: c.clientPhone,
          projectSlug: c.projectSlug,
          projectName: c.projectName,
          lotNumber: c.lotNumber,
          lotStage: c.lotStage,
          nextInstallmentNumber: c.nextInstallmentNumber,
          nextInstallmentMonth: c.nextInstallmentMonth,
          nextDueDate: c.nextDueDate,
          pendingBalance: c.pendingBalance,
          penaltyAmount: multa,
          monto,
          lateDays: c.lateDays,
          grace_days: c.grace_days,
          emails,
          to: emails.join(", "),
          sendable: emails.length > 0,
          buzonReady: Boolean(buzonForProject(c.projectSlug)),
        };
      })
      .sort((a: any, b: any) => (a.clientName || "").localeCompare(b.clientName || ""));

    return {
      success: true,
      audience,
      recipients,
      summary: {
        total: recipients.length,
        sendable: recipients.filter((r: any) => r.sendable && r.buzonReady).length,
        badEmail: recipients.filter((r: any) => !r.sendable).length,
      },
    };
  } catch (error) {
    console.error("Error cargando destinatarios de correo:", error);
    return { error: "Error al cargar los destinatarios", recipients: [] };
  }
}

// ---------------------------------------------------------------------------
// Plantillas (borradores reutilizables)
// ---------------------------------------------------------------------------

export async function getEmailTemplates() {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado", templates: [] };

  try {
    const templates = await prisma.emailTemplate.findMany({ orderBy: { updated_at: "desc" } });
    return { success: true, templates, variables: EMAIL_TEMPLATE_VARIABLES };
  } catch (error) {
    console.error("Error cargando plantillas de correo:", error);
    return { error: "Error al cargar las plantillas", templates: [] };
  }
}

export async function saveEmailTemplate(data: {
  id?: string;
  name: string;
  subject: string;
  body: string;
}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  if (!data.name?.trim()) return { error: "Ponle un nombre a la plantilla" };
  if (!data.subject?.trim()) return { error: "El asunto no puede quedar vacío" };
  if (data.subject.length > EMAIL_SUBJECT_MAX) {
    return { error: `El asunto supera los ${EMAIL_SUBJECT_MAX} caracteres` };
  }
  if (!data.body?.trim()) return { error: "El mensaje no puede quedar vacío" };
  if (data.body.length > EMAIL_BODY_MAX) {
    return { error: `El mensaje supera los ${EMAIL_BODY_MAX} caracteres` };
  }

  try {
    if (data.id) {
      await prisma.emailTemplate.update({
        where: { id: data.id },
        data: {
          name: data.name.trim(),
          subject: data.subject.trim(),
          body: data.body,
          updated_by: user.email,
        },
      });
    } else {
      await prisma.emailTemplate.create({
        data: {
          name: data.name.trim(),
          subject: data.subject.trim(),
          body: data.body,
          created_by: user.email,
          updated_by: user.email,
        },
      });
    }
    return { success: true };
  } catch (error) {
    console.error("Error guardando plantilla de correo:", error);
    return { error: "Error al guardar la plantilla" };
  }
}

export async function deleteEmailTemplate(id: string) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  try {
    await prisma.emailTemplate.delete({ where: { id } });
    return { success: true };
  } catch (error) {
    console.error("Error eliminando plantilla de correo:", error);
    return { error: "Error al eliminar la plantilla" };
  }
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

export async function startEmailBatch(data: { projectSlug: string; audience: string; total: number }) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };
  if (!canSendBulk(user)) return { error: "Tu cuenta no tiene permiso para enviar correos masivos" };

  const batchId = crypto.randomUUID();

  try {
    await prisma.auditLog.create({
      data: {
        action: "OTHER",
        entity: "EmailBatch",
        entity_id: batchId,
        details: `Inicio de envío masivo por correo: ${data.total} correos a "${
          AUDIENCE_LABELS[data.audience as EmailAudience] ?? data.audience
        }" (proyecto: ${data.projectSlug}).`,
        user_id: user.id,
        user_email: user.email,
      },
    });
  } catch (error) {
    console.error("Error registrando el inicio de la tanda de correo:", error);
    // No se bloquea el envio por no poder auditar.
  }

  return { success: true, batchId };
}

/**
 * Revisa el borrador (asunto, cuerpo, adjuntos) igual para "Enviar ahora",
 * "Programar" y la prueba. Devuelve el mensaje de error o null.
 */
function validateDraft(subject: string, body: string, attachmentIds?: string[] | null): string | null {
  if (!subject?.trim()) return "El asunto no puede quedar vacío";
  if (subject.length > EMAIL_SUBJECT_MAX) return `El asunto supera los ${EMAIL_SUBJECT_MAX} caracteres`;
  if (!body?.trim()) return "El mensaje no puede quedar vacío";
  if (body.length > EMAIL_BODY_MAX) return `El mensaje supera los ${EMAIL_BODY_MAX} caracteres`;
  if ((attachmentIds?.length ?? 0) > EMAIL_ATTACHMENTS_MAX_FILES) {
    return `Se pueden adjuntar hasta ${EMAIL_ATTACHMENTS_MAX_FILES} archivos por correo`;
  }
  return null;
}

/**
 * Envia un tramo de la tanda (maximo MAX_CHUNK correos). Mismo patrón que
 * sendWhatsappChunk: se releen los datos de cobranza justo antes de mandar,
 * por si el cliente pagó mientras se armaba la lista.
 */
export async function sendEmailChunk(data: {
  batchId: string;
  subject: string;
  body: string;
  reservationIds: string[];
  /** Total de la tanda completa y cuantos ya se procesaron antes de este tramo. */
  batchTotal?: number;
  startIndex?: number;
  /** Adjuntos ya subidos con uploadEmailAttachment. */
  attachmentIds?: string[];
}): Promise<{ error?: string; results?: EmailChunkResult[] }> {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };
  if (!canSendBulk(user)) return { error: "Tu cuenta no tiene permiso para enviar correos masivos" };

  const draftError = validateDraft(data.subject, data.body, data.attachmentIds);
  if (draftError) return { error: draftError };
  if (!data.reservationIds?.length) return { error: "No hay destinatarios en este tramo" };
  if (data.reservationIds.length > MAX_CHUNK) {
    return { error: `Un tramo no puede superar los ${MAX_CHUNK} correos` };
  }
  if (!emailWebhookConfigured()) {
    return { error: "Falta configurar el webhook de correo (N8N_EMAIL_WEBHOOK_*)" };
  }

  try {
    const reservations = await prisma.reservation.findMany({
      where: { id: { in: data.reservationIds } },
      select: { project: { select: { slug: true } } },
    });
    for (const slug of new Set(reservations.map((r) => r.project.slug))) {
      if (!canAccessProject(user, slug)) {
        return { error: `Sin acceso al proyecto ${slug}` };
      }
    }

    const attachments = await loadEmailAttachments(data.attachmentIds);
    if (!attachments.ok) return { error: attachments.error };

    const results = await sendEmailsToReservations({
      batchId: data.batchId,
      subject: data.subject,
      body: data.body,
      reservationIds: data.reservationIds,
      adjuntos: attachments.adjuntos,
      sentBy: user.email,
      batchTotal: data.batchTotal ?? data.reservationIds.length,
      startIndex: data.startIndex ?? 0,
    });

    return { results };
  } catch (error) {
    console.error("Error enviando tramo de correo:", error);
    return { error: "Error al enviar los correos" };
  }
}

/**
 * Correo de prueba a una direccion cualquiera, con datos de ejemplo de un
 * cliente real del proyecto (para ver como llega antes de soltar la tanda).
 */
export async function sendEmailTest(data: {
  projectSlug: string;
  subject: string;
  body: string;
  to: string;
  /**
   * Reserva marcada en la pantalla, si hay alguna. Si viene, la prueba usa
   * los datos REALES de ese cliente en vez de "el primero que aparezca en la
   * lista" — que es justo lo que confundía a postventa: marcaban a un
   * cliente abajo y la prueba mostraba los datos de otro.
   */
  reservationId?: string | null;
  /** Los mismos adjuntos de la tanda: la prueba sirve justamente para ver que lleguen. */
  attachmentIds?: string[];
}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };
  if (!canSendBulk(user)) return { error: "Tu cuenta no tiene permiso para enviar correos" };

  const to = data.to?.trim();
  if (!to || !EMAIL_REGEX.test(to)) return { error: "Correo de prueba inválido" };
  const draftError = validateDraft(data.subject, data.body, data.attachmentIds);
  if (draftError) return { error: draftError };
  if (!emailWebhookConfigured()) {
    return { error: "Falta configurar el webhook de correo (N8N_EMAIL_WEBHOOK_*)" };
  }

  try {
    const projects = await scopedProjects(data.projectSlug);
    const project = projects[0];
    if (!project) return { error: "Proyecto no disponible" };

    const buzon = buzonForProject(project.slug);
    if (!buzon) return { error: `No hay una cuenta de correo asignada al proyecto ${project.slug}` };

    const attachments = await loadEmailAttachments(data.attachmentIds);
    if (!attachments.ok) return { error: attachments.error };

    const res = await getFullPostventaData({ projectSlug: project.slug });
    const sample = data.reservationId
      ? (res.data || []).find((c: any) => c.id === data.reservationId) || (res.data || [])[0]
      : (res.data || [])[0];

    const values = buildEmailClientValues(sample, project.name);
    const subject = `[PRUEBA] ${renderEmailVariables(data.subject, values)}`;
    const bodyText = renderEmailVariables(data.body, values);
    const html = buildEmailHtml({ projectSlug: project.slug, projectName: project.name, bodyText });

    const sent = await sendEmail({
      buzon,
      modo: "PRUEBA",
      to,
      subject,
      html,
      texto: bodyText,
      proyectoSlug: project.slug,
      proyectoNombre: project.name,
      clienteNombre: values.nombre,
      clienteRut: values.rut,
      clienteLote: values.lote,
      clienteEtapa: values.etapa,
      reservaId: null,
      mensajeId: crypto.randomUUID(),
      tandaId: crypto.randomUUID(),
      indice: 1,
      total: 1,
      enviadoPor: user.email,
      adjuntos: attachments.adjuntos,
    });

    await prisma.emailMessage.create({
      data: {
        reservation_id: null,
        project_slug: project.slug,
        buzon,
        batch_id: crypto.randomUUID(),
        client_name: `PRUEBA (${user.email})`,
        to_email: to,
        subject,
        body_html: html,
        status: sent.ok ? "SENT" : "FAILED",
        error: sent.ok ? null : sent.error.slice(0, 500),
        sent_by: user.email,
      },
    });

    if (!sent.ok) return { error: sent.error };
    return { success: true, sentTo: to };
  } catch (error) {
    console.error("Error enviando correo de prueba:", error);
    return { error: "Error al enviar el correo de prueba" };
  }
}

// ---------------------------------------------------------------------------
// Adjuntos
// ---------------------------------------------------------------------------

/** La tabla nueva todavia no existe en la base (falta correr la migracion 12). */
function missingMigration(error: any): boolean {
  return error?.code === "P2021" || /does not exist/i.test(String(error?.message || ""));
}
const MISSING_MIGRATION_MSG =
  "Falta aplicar la migración 12 (adjuntos y envíos programados) en la base de datos";

/**
 * Sube UN archivo (la pantalla llama una vez por archivo). Se guarda en la
 * base y se devuelve el id: los tramos y el programador lo leen de ahi.
 */
export async function uploadEmailAttachment(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };
  if (!canSendBulk(user)) return { error: "Tu cuenta no tiene permiso para enviar correos" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No llegó ningún archivo" };
  if (file.size === 0) return { error: `«${file.name}» está vacío (0 bytes)` };
  if (file.size > EMAIL_ATTACHMENTS_MAX_BYTES) {
    return { error: `«${file.name}» supera los ${EMAIL_ATTACHMENTS_MAX_BYTES / (1024 * 1024)} MB` };
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (EMAIL_ATTACHMENT_BLOCKED_EXT.includes(ext)) {
    return { error: `Gmail no permite adjuntar archivos .${ext}` };
  }

  try {
    const data = Buffer.from(await file.arrayBuffer());
    const row = await prisma.emailAttachment.create({
      data: {
        file_name: file.name.slice(0, 255),
        mimetype: (file.type || "application/octet-stream").slice(0, 150),
        size_bytes: file.size,
        data,
        uploaded_by: user.email,
      },
      select: { id: true, file_name: true, mimetype: true, size_bytes: true },
    });
    return { success: true, attachment: row };
  } catch (error) {
    if (missingMigration(error)) return { error: MISSING_MIGRATION_MSG };
    console.error("Error subiendo adjunto de correo:", error);
    return { error: "No se pudo subir el archivo" };
  }
}

/** Quita un adjunto que postventa saco del borrador, salvo que una tanda programada lo use. */
export async function deleteEmailAttachment(id: string) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  try {
    const inUse = await prisma.emailScheduledBatch.count({
      where: { status: { in: ["PENDING", "SENDING"] }, attachment_ids: { has: id } },
    });
    if (inUse === 0) {
      await prisma.emailAttachment.deleteMany({ where: { id } });
    }
    return { success: true };
  } catch (error) {
    console.error("Error quitando adjunto de correo:", error);
    // El archivo huerfano lo limpia el programador a los 7 dias; no vale la pena molestar.
    return { success: true };
  }
}

// ---------------------------------------------------------------------------
// Envio programado
// ---------------------------------------------------------------------------

/**
 * Deja una tanda programada para una fecha y hora de Chile. No manda nada:
 * a esa hora la manda lib/programadorCorreos.ts, aunque nadie tenga el
 * portal abierto.
 */
export async function scheduleEmailBatch(data: {
  projectSlug: string;
  audience: string;
  subject: string;
  body: string;
  reservationIds: string[];
  attachmentIds?: string[];
  /** "AAAA-MM-DD" y "HH:MM", siempre hora de Chile. */
  fecha: string;
  hora: string;
}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };
  if (!canSendBulk(user)) return { error: "Tu cuenta no tiene permiso para enviar correos masivos" };

  const draftError = validateDraft(data.subject, data.body, data.attachmentIds);
  if (draftError) return { error: draftError };
  if (!AUDIENCES.includes(data.audience as EmailAudience)) return { error: "Segmento inválido" };

  const ids = Array.from(new Set(data.reservationIds || []));
  if (ids.length === 0) return { error: "No hay destinatarios seleccionados" };
  if (ids.length > MAX_PER_BATCH) return { error: `El máximo por tanda es de ${MAX_PER_BATCH} correos` };

  const scheduledAt = chileLocalToUtc(data.fecha, data.hora);
  if (!scheduledAt) return { error: "Fecha u hora inválida" };
  const now = Date.now();
  if (scheduledAt.getTime() < now + 5 * 60_000) {
    return { error: "Programa el envío con al menos 5 minutos de anticipación" };
  }
  if (scheduledAt.getTime() > now + EMAIL_SCHEDULE_MAX_DAYS * 86_400_000) {
    return { error: `No se puede programar a más de ${EMAIL_SCHEDULE_MAX_DAYS} días` };
  }

  try {
    const reservations = await prisma.reservation.findMany({
      where: { id: { in: ids } },
      select: { project: { select: { slug: true } } },
    });
    if (reservations.length !== ids.length) return { error: "Alguno de los clientes ya no existe" };
    for (const slug of new Set(reservations.map((r) => r.project.slug))) {
      if (!canAccessProject(user, slug)) return { error: `Sin acceso al proyecto ${slug}` };
    }

    const attachmentIds = Array.from(new Set(data.attachmentIds || []));
    const attachments = await loadEmailAttachments(attachmentIds);
    if (!attachments.ok) return { error: attachments.error };

    const batch = await prisma.emailScheduledBatch.create({
      data: {
        project_slug: data.projectSlug,
        audience: data.audience,
        subject: data.subject.trim(),
        body: data.body,
        reservation_ids: ids,
        attachment_ids: attachmentIds,
        scheduled_at: scheduledAt,
        created_by: user.email,
      },
      select: { id: true, scheduled_at: true },
    });

    try {
      await prisma.auditLog.create({
        data: {
          action: "CREATE",
          entity: "EmailScheduledBatch",
          entity_id: batch.id,
          details: `Correo masivo programado para ${formatoFechaHoraChile(scheduledAt)} (hora Chile): ${
            ids.length
          } correos a "${AUDIENCE_LABELS[data.audience as EmailAudience]}" (proyecto: ${data.projectSlug}), ${
            attachmentIds.length
          } adjunto(s). Asunto: ${data.subject.trim().slice(0, 120)}`,
          user_id: user.id,
          user_email: user.email,
        },
      });
    } catch (error) {
      console.error("Error auditando la tanda programada:", error);
    }

    return { success: true, id: batch.id, scheduledAt: batch.scheduled_at };
  } catch (error) {
    if (missingMigration(error)) return { error: MISSING_MIGRATION_MSG };
    console.error("Error programando tanda de correo:", error);
    return { error: "No se pudo programar el envío" };
  }
}

export async function getScheduledEmailBatches({ projectSlug = "ALL" }: { projectSlug?: string } = {}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado", batches: [] };

  try {
    const projects = await scopedProjects(projectSlug);
    const slugs = projects.map((p: any) => p.slug);
    // Una tanda de "Todos los proyectos" se guarda con project_slug "ALL".
    const visible = projectSlug === "ALL" ? [...slugs, "ALL"] : slugs;

    const rows = await prisma.emailScheduledBatch.findMany({
      where: { project_slug: { in: visible } },
      orderBy: [{ scheduled_at: "desc" }],
      take: 100,
      select: {
        id: true,
        project_slug: true,
        audience: true,
        subject: true,
        reservation_ids: true,
        attachment_ids: true,
        scheduled_at: true,
        status: true,
        sent_count: true,
        failed_count: true,
        skipped_count: true,
        detail: true,
        error: true,
        created_by: true,
        cancelled_by: true,
        created_at: true,
        finished_at: true,
      },
    });

    const attIds = Array.from(new Set(rows.flatMap((r) => r.attachment_ids)));
    const atts = attIds.length
      ? await prisma.emailAttachment.findMany({
          where: { id: { in: attIds } },
          select: { id: true, file_name: true, size_bytes: true },
        })
      : [];
    const attById = new Map(atts.map((a) => [a.id, a]));
    const projectNames = new Map(projects.map((p: any) => [p.slug, p.name]));

    return {
      success: true,
      canSend: canSendBulk(user),
      batches: rows.map(({ reservation_ids, attachment_ids, ...r }) => ({
        ...r,
        total: reservation_ids.length,
        projectName: r.project_slug === "ALL" ? "Todos los proyectos" : projectNames.get(r.project_slug) || r.project_slug,
        audienceLabel: AUDIENCE_LABELS[r.audience as EmailAudience] ?? r.audience,
        attachments: attachment_ids.map((id) => attById.get(id)).filter(Boolean),
      })),
    };
  } catch (error) {
    if (missingMigration(error)) return { error: MISSING_MIGRATION_MSG, batches: [] };
    console.error("Error cargando tandas programadas:", error);
    return { error: "Error al cargar los envíos programados", batches: [] };
  }
}

/** Cancela una tanda que todavia no sale (o frena una que va saliendo). */
export async function cancelScheduledEmailBatch(id: string) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };
  if (!canSendBulk(user)) return { error: "Tu cuenta no tiene permiso para enviar correos masivos" };

  try {
    const res = await prisma.emailScheduledBatch.updateMany({
      where: { id, status: { in: ["PENDING", "SENDING"] } },
      data: { status: "CANCELLED", cancelled_by: user.email, finished_at: new Date() },
    });
    if (res.count === 0) return { error: "Ese envío ya no se puede cancelar (ya salió o ya estaba cancelado)" };

    try {
      await prisma.auditLog.create({
        data: {
          action: "UPDATE",
          entity: "EmailScheduledBatch",
          entity_id: id,
          details: "Correo masivo programado cancelado.",
          user_id: user.id,
          user_email: user.email,
        },
      });
    } catch (error) {
      console.error("Error auditando la cancelacion:", error);
    }
    return { success: true };
  } catch (error) {
    console.error("Error cancelando tanda programada:", error);
    return { error: "No se pudo cancelar el envío" };
  }
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

const HISTORY_PAGE_SIZE = 50;
const HISTORY_EXPORT_LIMIT = 5_000;

export async function getEmailHistory({
  projectSlug = "ALL",
  status = "ALL",
  search = "",
  page = 0,
  forExport = false,
}: {
  projectSlug?: string;
  status?: string;
  search?: string;
  page?: number;
  forExport?: boolean;
} = {}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado", rows: [] };

  try {
    const projects = await scopedProjects(projectSlug);
    const slugs = projects.map((p: any) => p.slug);
    if (slugs.length === 0) return { error: "No tienes proyectos de correo habilitados", rows: [] };

    const where: any = { project_slug: { in: slugs } };
    if (status === "SENT") where.status = "SENT";
    else if (status === "FAILED") where.status = "FAILED";

    const term = search.trim();
    if (term) {
      where.OR = [
        { client_name: { contains: term, mode: "insensitive" } },
        { to_email: { contains: term, mode: "insensitive" } },
        { subject: { contains: term, mode: "insensitive" } },
      ];
    }

    const select = {
      id: true,
      client_name: true,
      to_email: true,
      subject: true,
      status: true,
      error: true,
      project_slug: true,
      buzon: true,
      sent_by: true,
      batch_id: true,
      created_at: true,
    } as const;

    const projectNames = new Map(projects.map((p: any) => [p.slug, p.name]));

    if (forExport) {
      const rows = await prisma.emailMessage.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: HISTORY_EXPORT_LIMIT,
        select,
      });
      return {
        success: true,
        rows: rows.map((r) => ({ ...r, projectName: projectNames.get(r.project_slug) || r.project_slug })),
      };
    }

    const [rows, total, sent, failed] = await Promise.all([
      prisma.emailMessage.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: Math.max(0, page) * HISTORY_PAGE_SIZE,
        take: HISTORY_PAGE_SIZE,
        select,
      }),
      prisma.emailMessage.count({ where }),
      prisma.emailMessage.count({ where: { ...where, status: "SENT" } }),
      prisma.emailMessage.count({ where: { ...where, status: "FAILED" } }),
    ]);

    return {
      success: true,
      projects: projects.map((p: any) => ({ slug: p.slug, name: p.name })),
      rows: rows.map((r) => ({ ...r, projectName: projectNames.get(r.project_slug) || r.project_slug })),
      stats: { total, sent, failed },
      page: Math.max(0, page),
      pageSize: HISTORY_PAGE_SIZE,
      hasMore: (Math.max(0, page) + 1) * HISTORY_PAGE_SIZE < total,
    };
  } catch (error) {
    console.error("Error cargando el historial de correo:", error);
    return { error: "Error al cargar el historial", rows: [] };
  }
}

export async function getEmailMessageHtml(id: string) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  try {
    const row = await prisma.emailMessage.findUnique({
      where: { id },
      select: { body_html: true, project_slug: true },
    });
    if (!row) return { error: "Correo no encontrado" };
    if (!canAccessProject(user, row.project_slug)) return { error: "Sin acceso a este proyecto" };
    return { success: true, html: row.body_html };
  } catch (error) {
    console.error("Error cargando el HTML del correo:", error);
    return { error: "Error al cargar el correo" };
  }
}
