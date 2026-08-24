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
} from "@/lib/emailTemplate";

/**
 * Modulo de correo masivo: postventa escribe asunto + cuerpo, elige a quien,
 * y este archivo llama al webhook de n8n que manda el correo real desde la
 * cuenta de Gmail que corresponda (Cindy o Denisse).
 *
 * Regla de oro, igual que en whatsapp.ts: la segmentacion NO se recalcula
 * aca. Los estados de cobranza salen tal cual de getFullPostventaData.
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
/** Pausa entre correo y correo, para no gatillar limites de envio de Gmail. */
const DELAY_MIN_MS = 2_000;
const DELAY_MAX_MS = 5_000;

const AUDIENCES = ["TODOS", "MORA", "GRACIA", "PROXIMO", "VENCIMIENTO"] as const;
export type EmailAudience = (typeof AUDIENCES)[number];

const AUDIENCE_LABELS: Record<EmailAudience, string> = {
  TODOS: "Todos los clientes",
  MORA: "En mora",
  GRACIA: "Días de gracia",
  PROXIMO: "Próximo a pagar",
  VENCIMIENTO: "Vence hoy",
};

function santiagoDayKey(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Misma regla que matchesCategory en actions/whatsapp.ts, duplicada a
 * proposito: ese modulo ya funciona en producción y postventa lo dio por
 * bueno, así que se prefiere repetir 15 líneas antes que arriesgar una
 * regresión ahí por compartir código con un módulo nuevo.
 */
function matchesAudience(client: any, audience: EmailAudience, todayKey: string): boolean {
  if (client.status === "COMPLETED" || client.status === "FROZEN") return false;
  switch (audience) {
    case "TODOS":
      return true;
    case "MORA":
      return client.status === "LATE";
    case "GRACIA":
      return client.status === "GRACE";
    case "PROXIMO":
      return client.status === "UPCOMING";
    case "VENCIMIENTO":
      return client.status !== "LATE" && santiagoDayKey(client.nextDueDate) === todayKey;
    default:
      return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validEmails(client: any): string[] {
  const out: string[] = [];
  if (client.clientEmail && EMAIL_REGEX.test(client.clientEmail)) out.push(client.clientEmail);
  if (
    client.secondaryEmail &&
    EMAIL_REGEX.test(client.secondaryEmail) &&
    client.secondaryEmail !== client.clientEmail
  ) {
    out.push(client.secondaryEmail);
  }
  return out;
}

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
        return {
          id: c.id,
          clientName: c.clientName,
          rut: c.rut,
          projectSlug: c.projectSlug,
          projectName: c.projectName,
          lotNumber: c.lotNumber,
          lotStage: c.lotStage,
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

export type EmailChunkResult = {
  reservationId: string;
  clientName: string;
  ok: boolean;
  error?: string;
};

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
}): Promise<{ error?: string; results?: EmailChunkResult[] }> {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };
  if (!canSendBulk(user)) return { error: "Tu cuenta no tiene permiso para enviar correos masivos" };

  if (!data.subject?.trim()) return { error: "El asunto no puede quedar vacío" };
  if (data.subject.length > EMAIL_SUBJECT_MAX) {
    return { error: `El asunto supera los ${EMAIL_SUBJECT_MAX} caracteres` };
  }
  if (!data.body?.trim()) return { error: "El mensaje no puede quedar vacío" };
  if (data.body.length > EMAIL_BODY_MAX) {
    return { error: `El mensaje supera los ${EMAIL_BODY_MAX} caracteres` };
  }
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
      select: { id: true, project: { select: { slug: true, name: true } } },
    });

    const slugs = Array.from(new Set(reservations.map((r) => r.project.slug)));
    const dataBySlug = new Map<string, any[]>();
    for (const slug of slugs) {
      if (!canAccessProject(user, slug)) {
        return { error: `Sin acceso al proyecto ${slug}` };
      }
      const res = await getFullPostventaData({ projectSlug: slug });
      dataBySlug.set(slug, res.data || []);
    }

    const results: EmailChunkResult[] = [];
    let first = true;

    for (const reservationId of data.reservationIds) {
      const reservation = reservations.find((r) => r.id === reservationId);
      if (!reservation) {
        results.push({ reservationId, clientName: "?", ok: false, error: "La reserva ya no existe" });
        continue;
      }

      const slug = reservation.project.slug;
      const projectName = reservation.project.name;
      const client = (dataBySlug.get(slug) || []).find((c: any) => c.id === reservationId);

      if (!client) {
        results.push({
          reservationId,
          clientName: "?",
          ok: false,
          error: "No se pudieron leer los datos del cliente",
        });
        continue;
      }

      const label = client.clientName || "?";
      const emails = validEmails(client);

      if (emails.length === 0) {
        results.push({ reservationId, clientName: label, ok: false, error: "Sin correo válido registrado" });
        continue;
      }

      const buzon = buzonForProject(slug);
      if (!buzon) {
        results.push({
          reservationId,
          clientName: label,
          ok: false,
          error: `No hay una cuenta de correo asignada al proyecto ${slug}`,
        });
        continue;
      }

      if (!first) {
        await sleep(DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
      }
      first = false;

      const values = {
        nombre: label,
        proyecto: projectName,
        lote: String(client.lotNumber ?? ""),
        etapa: String(client.lotStage ?? ""),
        rut: client.rut || "",
      };
      const subject = renderEmailVariables(data.subject, values);
      const bodyText = renderEmailVariables(data.body, values);
      const html = buildEmailHtml({ projectSlug: slug, projectName, bodyText });

      const sent = await sendEmail({
        buzon,
        modo: "REAL",
        to: emails.join(", "),
        subject,
        html,
        texto: bodyText,
        proyectoSlug: slug,
        proyectoNombre: projectName,
        clienteNombre: label,
        clienteRut: client.rut || "",
        clienteLote: String(client.lotNumber ?? ""),
        clienteEtapa: String(client.lotStage ?? ""),
        reservaId: reservationId,
        mensajeId: crypto.randomUUID(),
        tandaId: data.batchId,
        indice: (data.startIndex ?? 0) + results.length + 1,
        total: data.batchTotal ?? data.reservationIds.length,
        enviadoPor: user.email,
      });

      await prisma.emailMessage.create({
        data: {
          reservation_id: reservationId,
          project_slug: slug,
          buzon,
          batch_id: data.batchId,
          client_name: label,
          to_email: emails.join(", "),
          subject,
          body_html: html,
          status: sent.ok ? "SENT" : "FAILED",
          error: sent.ok ? null : sent.error.slice(0, 500),
          sent_by: user.email,
        },
      });

      results.push({ reservationId, clientName: label, ok: sent.ok, error: sent.ok ? undefined : sent.error });
    }

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
}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };
  if (!canSendBulk(user)) return { error: "Tu cuenta no tiene permiso para enviar correos" };

  const to = data.to?.trim();
  if (!to || !EMAIL_REGEX.test(to)) return { error: "Correo de prueba inválido" };
  if (!emailWebhookConfigured()) {
    return { error: "Falta configurar el webhook de correo (N8N_EMAIL_WEBHOOK_*)" };
  }

  try {
    const projects = await scopedProjects(data.projectSlug);
    const project = projects[0];
    if (!project) return { error: "Proyecto no disponible" };

    const buzon = buzonForProject(project.slug);
    if (!buzon) return { error: `No hay una cuenta de correo asignada al proyecto ${project.slug}` };

    const res = await getFullPostventaData({ projectSlug: project.slug });
    const sample = (res.data || [])[0];

    const values = {
      nombre: sample?.clientName || "Cliente de ejemplo",
      proyecto: project.name,
      lote: String(sample?.lotNumber ?? "1"),
      etapa: String(sample?.lotStage ?? ""),
      rut: sample?.rut || "",
    };
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

export { AUDIENCES as EMAIL_AUDIENCES, AUDIENCE_LABELS as EMAIL_AUDIENCE_LABELS };
