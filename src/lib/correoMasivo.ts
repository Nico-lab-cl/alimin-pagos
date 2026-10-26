/**
 * Nucleo del envio de correo masivo, compartido por:
 *  - actions/email.ts (sendEmailChunk): postventa aprieta "Enviar ahora" y el
 *    navegador va mandando tramos de 5.
 *  - lib/programadorCorreos.ts: la tanda programada que el servidor manda
 *    solo a la hora elegida, sin nadie con la pantalla abierta.
 *
 * Vive fuera de actions/ a proposito (mismo criterio que postventaData.ts):
 * todo lo exportado desde un archivo "use server" queda llamable desde el
 * navegador, y estas funciones NO revisan sesion. El permiso lo revisa quien
 * las llama.
 *
 * Regla de oro, igual que en whatsapp.ts: la segmentacion NO se recalcula
 * aca. Los estados de cobranza salen tal cual de computePostventaData.
 */

import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { computePostventaData } from "@/lib/postventaData";
import { buzonForProject, sendEmail, type EmailAttachmentPayload } from "@/lib/emailWebhook";
import { buildEmailHtml, renderEmailVariables, EMAIL_ATTACHMENTS_MAX_BYTES } from "@/lib/emailTemplate";

/** Pausa entre correo y correo, para no gatillar limites de envio de Gmail. */
const DELAY_MIN_MS = 2_000;
const DELAY_MAX_MS = 5_000;

export const EMAIL_AUDIENCES = ["TODOS", "MORA", "GRACIA", "PROXIMO", "VENCIMIENTO"] as const;
export type EmailAudience = (typeof EMAIL_AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<EmailAudience, string> = {
  TODOS: "Todos los clientes",
  MORA: "En mora",
  GRACIA: "Días de gracia",
  PROXIMO: "Próximo a pagar",
  VENCIMIENTO: "Vence hoy",
};

export function santiagoDayKey(date: Date | string | null | undefined): string | null {
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
export function matchesAudience(client: any, audience: EmailAudience, todayKey: string): boolean {
  if (client.status === "COMPLETED" || client.status === "FROZEN") return false;
  // Ficha fantasma del puente Lomas (ver lib/fichasDuplicadas.ts): es la copia
  // atrasada de un cliente que ya esta en el portal, asi que su "mora" es de una
  // cuota que en realidad esta pagada. Cobrarle por ahi seria cobrarle dos veces.
  if (client.isGhostDuplicate) return false;
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

function formatCLP(amount: number | null | undefined): string {
  return `$${Math.round(Number(amount) || 0).toLocaleString("es-CL")}`;
}

function formatDateCL(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function installmentAmount(client: any): number {
  const n = client?.nextInstallmentNumber;
  if (!n) return Number(client?.valor_cuota) || 0;

  let ranges: any[] = [];
  try {
    const raw = client?.installment_ranges;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) ranges = parsed;
  } catch {
    ranges = [];
  }

  const range = ranges.find(
    (r: any) => n >= Number(r.from ?? r.start ?? 0) && n <= Number(r.to ?? r.end ?? 0)
  );

  if (range) return Number(range.amount ?? range.value ?? 0) || 0;
  return Number(client?.valor_cuota) || 0;
}

export function buildEmailClientValues(client: any, projectName: string): Record<string, string> {
  const monto = installmentAmount(client);
  const multa = Number(client?.penaltyAmount) || 0;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pagos.aliminspa.cl";

  return {
    nombre: client?.clientName || "",
    rut: client?.rut || "",
    email: client?.clientEmail || (validEmails(client)[0] ?? ""),
    telefono: client?.clientPhone || "",
    proyecto: projectName || "",
    lote: String(client?.lotNumber ?? ""),
    etapa: String(client?.lotStage ?? ""),
    portal: `${baseUrl.replace(/\/+$/, "")}/user`,
    monto: formatCLP(monto),
    cuota: client?.nextInstallmentNumber ? String(client.nextInstallmentNumber) : "",
    mes_cuota: client?.nextInstallmentMonth || "",
    fecha_vencimiento: formatDateCL(client?.nextDueDate),
    saldo: formatCLP(client?.pendingBalance),
    multa: formatCLP(multa),
    total: formatCLP(monto + multa),
    dias_mora: String(client?.lateDays ?? 0),
    dias_gracia: String(client?.grace_days ?? 0),
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmails(client: any): string[] {
  const out: string[] = [];
  if (client.clientEmail && EMAIL_REGEX.test(client.clientEmail)) out.push(client.clientEmail);
  if (
    client.secondaryEmail &&
    EMAIL_REGEX.test(client.secondaryEmail) &&
    client.secondaryEmail !== client.clientEmail
  ) {
    out.push(client.secondaryEmail);
  }
  // Co-titulares: les llega el mismo correo que al titular.
  for (const co of client.coOwners || []) {
    const email = String(co?.email || "").trim().toLowerCase();
    if (email && EMAIL_REGEX.test(email) && !out.some((e) => e.toLowerCase() === email)) {
      out.push(email);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Adjuntos
// ---------------------------------------------------------------------------

/**
 * Lee los adjuntos por id y los deja listos para el webhook. Devuelve error
 * (en vez de mandar el correo sin el archivo) si alguno ya no existe: un
 * comunicado que dice "adjuntamos el documento" y llega sin documento es peor
 * que no mandarlo.
 */
export async function loadEmailAttachments(
  ids: string[] | null | undefined
): Promise<{ ok: true; adjuntos: EmailAttachmentPayload[] } | { ok: false; error: string }> {
  const unique = Array.from(new Set((ids || []).filter(Boolean)));
  if (unique.length === 0) return { ok: true, adjuntos: [] };

  const rows = await prisma.emailAttachment.findMany({ where: { id: { in: unique } } });
  if (rows.length !== unique.length) {
    return { ok: false, error: "Uno de los archivos adjuntos ya no está disponible. Vuelve a adjuntarlo." };
  }
  const total = rows.reduce((acc, r) => acc + r.size_bytes, 0);
  if (total > EMAIL_ATTACHMENTS_MAX_BYTES) {
    return { ok: false, error: "Los adjuntos superan el máximo permitido por correo" };
  }

  // Mismo orden en que postventa los adjunto.
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    ok: true,
    adjuntos: unique.map((id) => {
      const r = byId.get(id)!;
      return { nombre: r.file_name, mimetype: r.mimetype, base64: Buffer.from(r.data).toString("base64") };
    }),
  };
}

// ---------------------------------------------------------------------------
// Envio de un tramo
// ---------------------------------------------------------------------------

export type EmailChunkResult = {
  reservationId: string;
  clientName: string;
  ok: boolean;
  /** true cuando no se mando a proposito (ya no esta en el segmento). */
  skipped?: boolean;
  error?: string;
};

/**
 * Envia un tramo de correos. Se releen los datos de cobranza justo antes de
 * mandar, por si el cliente pagó mientras se armaba la lista.
 *
 * recheckAudience: la tanda programada se armo horas o dias antes; al llegar
 * la hora se vuelve a revisar que cada cliente siga en el segmento, para no
 * mandarle "esta en mora" a alguien que pago entre medio.
 */
export async function sendEmailsToReservations(opts: {
  batchId: string;
  subject: string;
  body: string;
  reservationIds: string[];
  adjuntos: EmailAttachmentPayload[];
  sentBy: string;
  batchTotal: number;
  startIndex: number;
  recheckAudience?: EmailAudience | null;
  /** Si viene, se respeta antes de cada correo (para "Cancelar" a mitad de tanda). */
  shouldStop?: () => Promise<boolean> | boolean;
}): Promise<EmailChunkResult[]> {
  const reservations = await prisma.reservation.findMany({
    where: { id: { in: opts.reservationIds } },
    select: { id: true, project: { select: { slug: true, name: true } } },
  });

  const slugs = Array.from(new Set(reservations.map((r) => r.project.slug)));
  const dataBySlug = new Map<string, any[]>();
  for (const slug of slugs) {
    const res: any = await computePostventaData(slug);
    dataBySlug.set(slug, res.data || []);
  }

  const todayKey = santiagoDayKey(new Date())!;
  const results: EmailChunkResult[] = [];
  let first = true;

  for (const reservationId of opts.reservationIds) {
    if (opts.shouldStop && (await opts.shouldStop())) break;

    const reservation = reservations.find((r) => r.id === reservationId);
    if (!reservation) {
      results.push({ reservationId, clientName: "?", ok: false, error: "La reserva ya no existe" });
      continue;
    }

    const slug = reservation.project.slug;
    const projectName = reservation.project.name;
    const client = (dataBySlug.get(slug) || []).find((c: any) => c.id === reservationId);

    if (!client) {
      results.push({ reservationId, clientName: "?", ok: false, error: "No se pudieron leer los datos del cliente" });
      continue;
    }

    const label = client.clientName || "?";

    if (opts.recheckAudience && !matchesAudience(client, opts.recheckAudience, todayKey)) {
      results.push({
        reservationId,
        clientName: label,
        ok: false,
        skipped: true,
        error: `Ya no está en «${AUDIENCE_LABELS[opts.recheckAudience]}» a la hora del envío`,
      });
      continue;
    }

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

    const values = buildEmailClientValues(client, projectName);
    const subject = renderEmailVariables(opts.subject, values);
    const bodyText = renderEmailVariables(opts.body, values);
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
      tandaId: opts.batchId,
      indice: opts.startIndex + results.length + 1,
      total: opts.batchTotal,
      enviadoPor: opts.sentBy,
      adjuntos: opts.adjuntos,
    });

    await prisma.emailMessage.create({
      data: {
        reservation_id: reservationId,
        project_slug: slug,
        buzon,
        batch_id: opts.batchId,
        client_name: label,
        to_email: emails.join(", "),
        subject,
        body_html: html,
        status: sent.ok ? "SENT" : "FAILED",
        error: sent.ok ? null : sent.error.slice(0, 500),
        sent_by: opts.sentBy,
      },
    });

    results.push({ reservationId, clientName: label, ok: sent.ok, error: sent.ok ? undefined : sent.error });
  }

  return results;
}
