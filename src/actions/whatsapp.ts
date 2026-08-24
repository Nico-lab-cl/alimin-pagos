"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getFullPostventaData, getAdminProjects } from "./postventa";
import { normalizePhone } from "@/lib/phone";
import {
  resolveInstance,
  getConnectionState,
  sendText,
  fetchInstances,
  instanceKeyForProject,
  knownProjectSlugs,
} from "@/lib/evolution";
import {
  WHATSAPP_CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_TEMPLATES,
  TEMPLATE_VARIABLES,
  PAYMENT_CATEGORIES,
  PAYMENT_CATEGORY_LABELS,
  DEFAULT_PAYMENT_TEMPLATES,
  PAYMENT_TEMPLATE_VARIABLES,
  type WhatsappCategory,
  type PaymentCategory,
} from "@/lib/whatsappTemplates";

/**
 * Modulo de WhatsApp: dashboard de mensajes y envio manual a clientes via
 * Evolution API.
 *
 * Regla de oro de este archivo: la segmentacion NO se recalcula aca. Los
 * estados de cobranza salen tal cual de getFullPostventaData, que es la unica
 * fuente de verdad de la mora. Duplicar esa formula era la via rapida para que
 * el WhatsApp le dijera al cliente un monto distinto al que ve en su portal.
 *
 * Nota: no se importa nada de @/lib/utils aca, porque ese archivo arrastra
 * Capacitor y no tiene por que terminar en el bundle del servidor.
 */

/** Cuantos mensajes salen como maximo en una llamada. */
const MAX_CHUNK = 5;
/** Pausa entre mensaje y mensaje, para no gatillar el antispam de WhatsApp. */
const DELAY_MIN_MS = 3_000;
const DELAY_MAX_MS = 8_000;
/** Techo duro por instancia y por hora. Red de seguridad, no limite de uso. */
const HOURLY_LIMIT = Number(process.env.WHATSAPP_HOURLY_LIMIT || 120);
/** Ventana del bloqueo antirrepeticion. */
const REPEAT_WINDOW_HOURS = 24;

// ---------------------------------------------------------------------------
// Utilidades locales
// ---------------------------------------------------------------------------

function formatCLP(amount: number | null | undefined): string {
  return `$${Math.round(Number(amount) || 0).toLocaleString("es-CL")}`;
}

/** Fecha en Chile como "YYYY-MM-DD", para comparar dias sin desfase horario. */
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/**
 * Valor de la proxima cuota. Respeta los tramos de installment_ranges cuando la
 * reserva los tiene (cuotas de distinto valor a lo largo del plan) y cae en
 * valor_cuota si no hay tramo que aplique.
 */
function installmentAmount(client: any): number {
  const n = client.nextInstallmentNumber;
  if (!n) return Number(client.valor_cuota) || 0;

  let ranges: any[] = [];
  try {
    const raw = client.installment_ranges;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) ranges = parsed;
  } catch {
    ranges = [];
  }

  const range = ranges.find(
    (r: any) => n >= Number(r.from ?? r.start ?? 0) && n <= Number(r.to ?? r.end ?? 0)
  );

  if (range) return Number(range.amount ?? range.value ?? 0) || 0;
  return Number(client.valor_cuota) || 0;
}

/** Reemplaza las variables de la plantilla con los datos reales del cliente. */
function renderTemplate(body: string, client: any, projectName: string): string {
  const monto = installmentAmount(client);
  const multa = Number(client.penaltyAmount) || 0;

  const values: Record<string, string> = {
    "{nombre}": client.clientName || "",
    "{proyecto}": projectName || "",
    "{lote}": String(client.lotNumber ?? ""),
    "{etapa}": String(client.lotStage ?? ""),
    "{rut}": client.rut || "",
    "{cuota}": client.nextInstallmentNumber ? String(client.nextInstallmentNumber) : "",
    "{mes_cuota}": client.nextInstallmentMonth || "",
    "{monto}": formatCLP(monto),
    "{multa}": formatCLP(multa),
    "{total}": formatCLP(monto + multa),
    "{saldo}": formatCLP(client.pendingBalance),
    "{dias_mora}": String(client.lateDays ?? 0),
    "{dias_gracia}": String(client.grace_days ?? 0),
    "{fecha_vencimiento}": formatDateCL(client.nextDueDate),
    "{portal}": process.env.NEXT_PUBLIC_BASE_URL || "",
  };

  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(key).join(value),
    body
  );
}

/**
 * Decide si un cliente cae en una categoria.
 *
 * MORA / GRACIA / PROXIMO son literalmente el `status` que ya calcula
 * postventa. VENCIMIENTO es el unico filtro propio: la cuota vence hoy.
 *
 * Ojo con la superposicion: en el mismo dia del vencimiento el cliente tambien
 * aparece como GRACIA (venció, todavia sin multa). Son dos formas distintas de
 * mirar al mismo grupo, y el bloqueo antirrepeticion evita que le llegue el
 * mensaje dos veces si se usan ambas.
 */
function matchesCategory(client: any, category: WhatsappCategory, todayKey: string): boolean {
  if (client.status === "COMPLETED" || client.status === "FROZEN") return false;

  switch (category) {
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

/** Proyectos que el admin puede ver Y que este modulo sabe atender. */
async function scopedProjects(projectSlug: string) {
  const res = await getAdminProjects();
  const all = (res.projects || []).filter((p: any) => knownProjectSlugs().includes(p.slug));
  if (projectSlug === "ALL") return all;
  return all.filter((p: any) => p.slug === projectSlug);
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

/**
 * Los dos grupos de plantillas que conviven en la misma tabla.
 *
 * COBRANZA son las cuatro de siempre, las que alguien elige y dispara a mano
 * desde la pestana de envio. PAGO son los tres avisos automaticos que salen
 * solos cuando se aprueba o se registra un pago: nadie los elige, la categoria
 * la decide el objetivo del pago. Se editan igual, pero no se mezclan en
 * ninguna pantalla ni en ningun conteo.
 */
export type TemplateKind = "COBRANZA" | "PAGO";

const TEMPLATE_SETS = {
  COBRANZA: {
    categories: WHATSAPP_CATEGORIES as readonly string[],
    labels: CATEGORY_LABELS as Record<string, string>,
    defaults: DEFAULT_TEMPLATES as Record<string, { name: string; body: string }>,
    variables: TEMPLATE_VARIABLES,
  },
  PAGO: {
    categories: PAYMENT_CATEGORIES as readonly string[],
    labels: PAYMENT_CATEGORY_LABELS as Record<string, string>,
    defaults: DEFAULT_PAYMENT_TEMPLATES as Record<string, { name: string; body: string }>,
    variables: PAYMENT_TEMPLATE_VARIABLES,
  },
} as const;

function templateSetFor(category: string): (typeof TEMPLATE_SETS)[TemplateKind] | null {
  if ((WHATSAPP_CATEGORIES as readonly string[]).includes(category)) return TEMPLATE_SETS.COBRANZA;
  if ((PAYMENT_CATEGORIES as readonly string[]).includes(category)) return TEMPLATE_SETS.PAGO;
  return null;
}

export async function getWhatsappTemplates(kind: TemplateKind = "COBRANZA") {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado", templates: [] };

  const set = TEMPLATE_SETS[kind] ?? TEMPLATE_SETS.COBRANZA;

  try {
    const stored = await prisma.whatsappTemplate.findMany({
      where: { category: { in: [...set.categories] } },
    });
    const byCategory = new Map(stored.map((t) => [t.category, t]));

    const templates = set.categories.map((category) => {
      const found = byCategory.get(category);
      return {
        category,
        label: set.labels[category],
        name: found?.name ?? set.defaults[category].name,
        body: found?.body ?? set.defaults[category].body,
        active: found?.active ?? true,
        updated_by: found?.updated_by ?? null,
        updated_at: found?.updated_at ?? null,
        /** false = todavia no existe en la base, se esta mostrando el texto por defecto. */
        persisted: Boolean(found),
      };
    });

    return { success: true, templates, variables: set.variables };
  } catch (error) {
    console.error("Error cargando plantillas de WhatsApp:", error);
    return { error: "Error al cargar las plantillas", templates: [] };
  }
}

export async function saveWhatsappTemplate(data: {
  category: WhatsappCategory | PaymentCategory;
  name: string;
  body: string;
  active: boolean;
}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  const set = templateSetFor(data.category);
  if (!set) {
    return { error: "Categoría inválida" };
  }
  if (!data.body?.trim()) {
    return { error: "El mensaje no puede quedar vacío" };
  }
  if (data.body.length > 4000) {
    return { error: "El mensaje supera los 4.000 caracteres" };
  }

  try {
    await prisma.whatsappTemplate.upsert({
      where: { category: data.category },
      update: {
        name: data.name.trim() || set.labels[data.category],
        body: data.body,
        active: data.active,
        updated_by: user.email,
      },
      create: {
        category: data.category,
        name: data.name.trim() || set.labels[data.category],
        body: data.body,
        active: data.active,
        updated_by: user.email,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "WhatsappTemplate",
        entity_id: data.category,
        details: `Plantilla de WhatsApp "${set.labels[data.category]}" editada.`,
        user_id: user.id,
        user_email: user.email,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error guardando plantilla de WhatsApp:", error);
    return { error: "Error al guardar la plantilla" };
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getWhatsappOverview({ projectSlug }: { projectSlug: string }) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  try {
    const projects = await scopedProjects(projectSlug);
    const slugs = projects.map((p: any) => p.slug);

    if (slugs.length === 0) {
      return { error: "No tienes proyectos de WhatsApp habilitados" };
    }

    const todayKey = santiagoDayKey(new Date())!;

    // 1. Audiencia actual: cuantos clientes estan hoy en cada categoria.
    const clientResults = await Promise.all(
      projects.map((p: any) => getFullPostventaData({ projectSlug: p.slug }))
    );
    const clients = clientResults.flatMap((res: any, i: number) =>
      (res.data || []).map((c: any) => ({
        ...c,
        projectSlug: projects[i].slug,
        projectName: projects[i].name,
      }))
    );

    const audience = WHATSAPP_CATEGORIES.map((category) => {
      const matched = clients.filter((c) => matchesCategory(c, category, todayKey));
      const reachable = matched.filter((c) => normalizePhone(c.clientPhone).ok);
      return {
        category,
        label: CATEGORY_LABELS[category],
        total: matched.length,
        reachable: reachable.length,
        unreachable: matched.length - reachable.length,
      };
    });

    // 2. Mensajes enviados, por categoria y por ventana de tiempo.
    const now = new Date();
    const since = (days: number) => new Date(now.getTime() - days * 86_400_000);
    // Solo cobranza. Los avisos automaticos de pago viven en la misma tabla pero
    // tienen su propia pestana: mezclarlos aca inflaria los conteos de la tanda
    // manual con mensajes que nadie envio a mano.
    const where = {
      project_slug: { in: slugs },
      category: { in: [...WHATSAPP_CATEGORIES] },
    };

    const [byCategory, sentToday, sent7, sent30, sentTotal, failedTotal, recent, dailyRaw] =
      await Promise.all([
        prisma.whatsappMessage.groupBy({
          by: ["category"],
          where: { ...where, status: "SENT" },
          _count: { _all: true },
        }),
        prisma.whatsappMessage.count({
          where: { ...where, status: "SENT", created_at: { gte: since(1) } },
        }),
        prisma.whatsappMessage.count({
          where: { ...where, status: "SENT", created_at: { gte: since(7) } },
        }),
        prisma.whatsappMessage.count({
          where: { ...where, status: "SENT", created_at: { gte: since(30) } },
        }),
        prisma.whatsappMessage.count({ where: { ...where, status: "SENT" } }),
        prisma.whatsappMessage.count({ where: { ...where, status: "FAILED" } }),
        prisma.whatsappMessage.findMany({
          where,
          orderBy: { created_at: "desc" },
          take: 25,
          select: {
            id: true,
            client_name: true,
            phone: true,
            category: true,
            status: true,
            error: true,
            project_slug: true,
            instance: true,
            sent_by: true,
            created_at: true,
          },
        }),
        prisma.whatsappMessage.findMany({
          where: { ...where, created_at: { gte: since(14) } },
          select: { created_at: true, category: true, status: true },
        }),
      ]);

    const countByCategory = Object.fromEntries(
      byCategory.map((row) => [row.category, row._count._all])
    ) as Record<string, number>;

    // Serie de los ultimos 14 dias, en fecha de Chile.
    const dayBuckets = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      dayBuckets.set(santiagoDayKey(since(i))!, 0);
    }
    for (const row of dailyRaw) {
      if (row.status !== "SENT") continue;
      const key = santiagoDayKey(row.created_at);
      if (key && dayBuckets.has(key)) dayBuckets.set(key, dayBuckets.get(key)! + 1);
    }
    const daily = Array.from(dayBuckets.entries()).map(([day, count]) => ({ day, count }));

    // 3. Estado de las instancias de WhatsApp que atienden estos proyectos.
    const instanceSlugs = Array.from(
      new Map(slugs.map((s: string) => [instanceKeyForProject(s), s])).values()
    ) as string[];
    const connections = await Promise.all(
      instanceSlugs.map(async (slug) => ({
        instanceKey: instanceKeyForProject(slug),
        ...(await getConnectionState(slug)),
      }))
    );

    return {
      success: true,
      projects: projects.map((p: any) => ({ slug: p.slug, name: p.name })),
      audience,
      stats: {
        byCategory: WHATSAPP_CATEGORIES.map((category) => ({
          category,
          label: CATEGORY_LABELS[category],
          count: countByCategory[category] || 0,
        })),
        sentToday,
        sent7,
        sent30,
        sentTotal,
        failedTotal,
      },
      daily,
      recent,
      connections,
    };
  } catch (error) {
    console.error("Error cargando el panel de WhatsApp:", error);
    return { error: "Error al cargar el panel de WhatsApp" };
  }
}

// ---------------------------------------------------------------------------
// Destinatarios
// ---------------------------------------------------------------------------

export async function getWhatsappRecipients({
  projectSlug,
  category,
}: {
  projectSlug: string;
  category: WhatsappCategory;
}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado", recipients: [] };

  if (!WHATSAPP_CATEGORIES.includes(category)) {
    return { error: "Categoría inválida", recipients: [] };
  }

  try {
    const projects = await scopedProjects(projectSlug);
    if (projects.length === 0) {
      return { error: "Proyecto no disponible", recipients: [] };
    }

    const todayKey = santiagoDayKey(new Date())!;

    const templatesRes = await getWhatsappTemplates();
    const template = (templatesRes.templates || []).find((t: any) => t.category === category);
    if (!template) return { error: "No hay plantilla para esta categoría", recipients: [] };

    const clientResults = await Promise.all(
      projects.map((p: any) => getFullPostventaData({ projectSlug: p.slug }))
    );
    const matched = clientResults.flatMap((res: any, i: number) =>
      (res.data || [])
        .filter((c: any) => matchesCategory(c, category, todayKey))
        .map((c: any) => ({
          ...c,
          projectSlug: projects[i].slug,
          projectName: projects[i].name,
        }))
    );

    // A quien ya se le escribio por lo mismo en las ultimas 24h.
    const since = new Date(Date.now() - REPEAT_WINDOW_HOURS * 3_600_000);
    const recentSends = await prisma.whatsappMessage.findMany({
      where: {
        category,
        status: "SENT",
        created_at: { gte: since },
        reservation_id: { in: matched.map((c: any) => c.id) },
      },
      select: { reservation_id: true, created_at: true },
      orderBy: { created_at: "desc" },
    });
    const lastSentAt = new Map<string, Date>();
    for (const row of recentSends) {
      if (row.reservation_id && !lastSentAt.has(row.reservation_id)) {
        lastSentAt.set(row.reservation_id, row.created_at!);
      }
    }

    const recipients = matched
      .map((c: any) => {
        const phone = normalizePhone(c.clientPhone);
        const instance = resolveInstance(c.projectSlug);
        return {
          id: c.id,
          clientName: c.clientName,
          rut: c.rut,
          projectSlug: c.projectSlug,
          projectName: c.projectName,
          lotNumber: c.lotNumber,
          lotStage: c.lotStage,
          rawPhone: c.clientPhone,
          phone: phone.ok ? phone.e164 : null,
          phoneDisplay: phone.ok ? phone.display : null,
          phoneKind: phone.ok ? phone.kind : null,
          phoneError: phone.ok ? null : phone.reason,
          sendable: phone.ok,
          instanceKey: instanceKeyForProject(c.projectSlug),
          instanceReady: Boolean(instance),
          lateDays: c.lateDays || 0,
          penaltyAmount: c.penaltyAmount || 0,
          installmentAmount: installmentAmount(c),
          nextInstallmentNumber: c.nextInstallmentNumber,
          nextInstallmentMonth: c.nextInstallmentMonth,
          nextDueDate: c.nextDueDate,
          alreadySentAt: lastSentAt.get(c.id) ?? null,
          preview: renderTemplate(template.body, c, c.projectName),
        };
      })
      .sort((a: any, b: any) => (b.lateDays || 0) - (a.lateDays || 0));

    return {
      success: true,
      category,
      template: { name: template.name, body: template.body, active: template.active },
      recipients,
      summary: {
        total: recipients.length,
        sendable: recipients.filter((r: any) => r.sendable && r.instanceReady).length,
        badPhone: recipients.filter((r: any) => !r.sendable).length,
        notConfigured: recipients.filter((r: any) => r.sendable && !r.instanceReady).length,
        alreadySent: recipients.filter((r: any) => r.alreadySentAt).length,
      },
    };
  } catch (error) {
    console.error("Error cargando destinatarios de WhatsApp:", error);
    return { error: "Error al cargar los destinatarios", recipients: [] };
  }
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

/**
 * Deja constancia en auditoria de que se inicio una tanda. El detalle de cada
 * mensaje queda en whatsapp_messages; esto es para que la tanda completa aparezca
 * como un solo evento en /admin/audit y no como 100 lineas sueltas.
 */
export async function startWhatsappBatch(data: {
  projectSlug: string;
  category: WhatsappCategory;
  total: number;
}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  try {
    await prisma.auditLog.create({
      data: {
        action: "OTHER",
        entity: "WhatsappBatch",
        entity_id: data.category,
        details: `Inicio de envío masivo por WhatsApp: ${data.total} mensajes de "${
          CATEGORY_LABELS[data.category] ?? data.category
        }" (proyecto: ${data.projectSlug}).`,
        user_id: user.id,
        user_email: user.email,
      },
    });
    return { success: true };
  } catch (error) {
    console.error("Error registrando el inicio de la tanda:", error);
    // No se bloquea el envio por no poder auditar; se registra y se sigue.
    return { success: true };
  }
}

export type ChunkResult = {
  reservationId: string;
  clientName: string;
  ok: boolean;
  error?: string;
};

/**
 * Envia un tramo de la tanda (maximo MAX_CHUNK mensajes).
 *
 * El envio va en tramos y no de una sola vez a proposito: 100 mensajes con
 * pausas de hasta 8 segundos son mas de 13 minutos, y ninguna peticion HTTP
 * deberia quedar colgada tanto rato. Ademas asi la pantalla puede mostrar
 * progreso real y el usuario puede cortar a mitad de camino.
 */
export async function sendWhatsappChunk(data: {
  category: WhatsappCategory;
  reservationIds: string[];
  force?: boolean;
}): Promise<{ error?: string; results?: ChunkResult[] }> {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  if (!WHATSAPP_CATEGORIES.includes(data.category)) {
    return { error: "Categoría inválida" };
  }
  if (!data.reservationIds?.length) {
    return { error: "No hay destinatarios en este tramo" };
  }
  if (data.reservationIds.length > MAX_CHUNK) {
    return { error: `Un tramo no puede superar los ${MAX_CHUNK} mensajes` };
  }

  try {
    const templatesRes = await getWhatsappTemplates();
    const template = (templatesRes.templates || []).find(
      (t: any) => t.category === data.category
    );
    if (!template) return { error: "No hay plantilla para esta categoría" };
    if (!template.active) return { error: "La plantilla de esta categoría está desactivada" };

    const reservations = await prisma.reservation.findMany({
      where: { id: { in: data.reservationIds } },
      select: { id: true, project: { select: { slug: true, name: true } } },
    });

    // Los datos de cobranza se releen aca, ya con el cliente frente al envio,
    // para no mandar un monto que quedo obsoleto mientras se revisaba la lista.
    const slugs = Array.from(new Set(reservations.map((r) => r.project.slug)));
    const dataBySlug = new Map<string, any[]>();
    for (const slug of slugs) {
      if (!canAccessProject(user, slug)) {
        return { error: `Sin acceso al proyecto ${slug}` };
      }
      const res = await getFullPostventaData({ projectSlug: slug });
      dataBySlug.set(slug, res.data || []);
    }

    const todayKey = santiagoDayKey(new Date())!;
    const results: ChunkResult[] = [];
    let first = true;

    for (const reservationId of data.reservationIds) {
      const reservation = reservations.find((r) => r.id === reservationId);
      if (!reservation) {
        results.push({
          reservationId,
          clientName: "?",
          ok: false,
          error: "La reserva ya no existe",
        });
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
          error: "No se pudieron leer los datos de cobranza del cliente",
        });
        continue;
      }

      const label = client.clientName || "?";

      // Reverificacion: entre que se armo la lista y que se apreto enviar el
      // cliente pudo pagar. No tiene sentido cobrarle a alguien que ya no debe.
      if (!matchesCategory(client, data.category, todayKey)) {
        results.push({
          reservationId,
          clientName: label,
          ok: false,
          error: "El cliente ya no está en esta categoría (probablemente pagó)",
        });
        continue;
      }

      const phone = normalizePhone(client.clientPhone);
      if (!phone.ok) {
        results.push({ reservationId, clientName: label, ok: false, error: phone.reason });
        continue;
      }

      const instance = resolveInstance(slug);
      if (!instance) {
        results.push({
          reservationId,
          clientName: label,
          ok: false,
          error: `Falta configurar la instancia de WhatsApp para ${slug}`,
        });
        continue;
      }

      // Antirrepeticion. La pantalla ya los deja desmarcados, pero se revalida
      // aca porque una tanda larga puede solaparse con otra.
      if (!data.force) {
        const repeated = await prisma.whatsappMessage.findFirst({
          where: {
            reservation_id: reservationId,
            category: data.category,
            status: "SENT",
            created_at: { gte: new Date(Date.now() - REPEAT_WINDOW_HOURS * 3_600_000) },
          },
          select: { id: true },
        });
        if (repeated) {
          results.push({
            reservationId,
            clientName: label,
            ok: false,
            error: `Ya se le envió este mensaje en las últimas ${REPEAT_WINDOW_HOURS}h`,
          });
          continue;
        }
      }

      // Techo por instancia y por hora.
      const lastHour = await prisma.whatsappMessage.count({
        where: {
          instance: instance.name,
          status: "SENT",
          created_at: { gte: new Date(Date.now() - 3_600_000) },
        },
      });
      if (lastHour >= HOURLY_LIMIT) {
        results.push({
          reservationId,
          clientName: label,
          ok: false,
          error: `Se alcanzó el tope de ${HOURLY_LIMIT} mensajes por hora en ${instance.name}. Continúa en un rato.`,
        });
        continue;
      }

      // La pausa va antes de cada mensaje salvo el primero del tramo; entre
      // tramos ya espera la pantalla.
      if (!first) {
        await sleep(DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
      }
      first = false;

      const message = renderTemplate(template.body, client, projectName);
      const sent = await sendText(instance, phone.e164, message);

      await prisma.whatsappMessage.create({
        data: {
          reservation_id: reservationId,
          project_slug: slug,
          instance: instance.name,
          category: data.category,
          client_name: label,
          phone: phone.e164,
          message,
          status: sent.ok ? "SENT" : "FAILED",
          error: sent.ok ? null : sent.error.slice(0, 500),
          evolution_id: sent.ok ? sent.evolutionId : null,
          sent_by: user.email,
        },
      });

      results.push({
        reservationId,
        clientName: label,
        ok: sent.ok,
        error: sent.ok ? undefined : sent.error,
      });
    }

    return { results };
  } catch (error) {
    console.error("Error enviando tramo de WhatsApp:", error);
    return { error: "Error al enviar los mensajes" };
  }
}

/**
 * Manda un solo mensaje al numero que indique el admin, usando datos reales de
 * un cliente de la categoria. Sirve para ver como llega el texto antes de
 * soltarle la tanda a los clientes de verdad.
 */
export async function sendWhatsappTest(data: {
  projectSlug: string;
  category: WhatsappCategory;
  phone: string;
}) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  if (!WHATSAPP_CATEGORIES.includes(data.category)) {
    return { error: "Categoría inválida" };
  }

  const phone = normalizePhone(data.phone);
  if (!phone.ok) return { error: `Número de prueba inválido: ${phone.reason}` };

  try {
    const projects = await scopedProjects(data.projectSlug);
    const project = projects[0];
    if (!project) return { error: "Proyecto no disponible" };

    const instance = resolveInstance(project.slug);
    if (!instance) {
      return { error: `Falta configurar la instancia de WhatsApp para ${project.slug}` };
    }

    const templatesRes = await getWhatsappTemplates();
    const template = (templatesRes.templates || []).find(
      (t: any) => t.category === data.category
    );
    if (!template) return { error: "No hay plantilla para esta categoría" };

    const todayKey = santiagoDayKey(new Date())!;
    const res = await getFullPostventaData({ projectSlug: project.slug });
    const sample = (res.data || []).find((c: any) =>
      matchesCategory(c, data.category, todayKey)
    );

    if (!sample) {
      return {
        error: `No hay ningún cliente en "${CATEGORY_LABELS[data.category]}" en ${project.name} para armar la prueba`,
      };
    }

    const message =
      "[PRUEBA INTERNA — este mensaje no fue enviado a ningún cliente]\n\n" +
      renderTemplate(template.body, sample, project.name);

    const sent = await sendText(instance, phone.e164, message);

    await prisma.whatsappMessage.create({
      data: {
        reservation_id: null,
        project_slug: project.slug,
        instance: instance.name,
        category: data.category,
        client_name: `PRUEBA (${user.email})`,
        phone: phone.e164,
        message,
        status: sent.ok ? "SENT" : "FAILED",
        error: sent.ok ? null : sent.error.slice(0, 500),
        evolution_id: sent.ok ? sent.evolutionId : null,
        sent_by: user.email,
      },
    });

    if (!sent.ok) return { error: sent.error };

    return { success: true, sentTo: phone.display, preview: message };
  } catch (error) {
    console.error("Error enviando mensaje de prueba:", error);
    return { error: "Error al enviar el mensaje de prueba" };
  }
}

/**
 * Diagnostico de la conexion. Lista lo que el servidor de Evolution dice tener,
 * para poder comparar el nombre real de la instancia con el que quedo en las
 * variables de entorno.
 */
export async function getEvolutionDiagnostics() {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  try {
    const projects = await scopedProjects("ALL");

    const perProject = await Promise.all(
      projects.map(async (p: any) => ({
        projectSlug: p.slug,
        projectName: p.name,
        instanceKey: instanceKeyForProject(p.slug),
        ...(await getConnectionState(p.slug)),
      }))
    );

    const server = await fetchInstances();

    return {
      success: true,
      baseUrl: process.env.EVOLUTION_API_URL || null,
      projects: perProject,
      serverInstances: server.ok ? server.instances : [],
      serverError: server.ok ? null : server.error,
    };
  } catch (error) {
    console.error("Error en el diagnóstico de Evolution:", error);
    return { error: "Error al consultar el servidor de WhatsApp" };
  }
}

// ---------------------------------------------------------------------------
// Historial de los avisos automaticos de pago
// ---------------------------------------------------------------------------

/** Cuantas filas trae la pantalla de una vez. */
const HISTORY_PAGE_SIZE = 50;
/** Techo del CSV. Es una bitacora de avisos, no un respaldo de la base. */
const HISTORY_EXPORT_LIMIT = 5_000;

/**
 * Bitacora de los avisos que salieron solos al aprobar o registrar un pago.
 *
 * Es una vista de SOLO LECTURA sobre whatsapp_messages, filtrada a las tres
 * categorias de pago. Los mensajes de cobranza no aparecen aca, igual que estos
 * no aparecen en el panel de cobranza.
 *
 * El alcance por proyecto sale de scopedProjects, o sea de los proyectos que la
 * cuenta tiene permitidos: cada equipo de postventa ve lo suyo, sin cambios
 * respecto a como funciona hoy el resto del modulo.
 */
export async function getPaymentNoticeHistory({
  projectSlug = "ALL",
  category = "ALL",
  status = "ALL",
  search = "",
  page = 0,
  forExport = false,
}: {
  projectSlug?: string;
  category?: string;
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

    if (slugs.length === 0) {
      return { error: "No tienes proyectos de WhatsApp habilitados", rows: [] };
    }

    const categories =
      category !== "ALL" && (PAYMENT_CATEGORIES as readonly string[]).includes(category)
        ? [category]
        : [...PAYMENT_CATEGORIES];

    const where: any = {
      project_slug: { in: slugs },
      category: { in: categories },
    };

    // SENDING es el instante en que el mensaje esta saliendo. Para postventa es
    // lo mismo que estar en cola, asi que se muestran juntos.
    if (status === "SENT") where.status = "SENT";
    else if (status === "FAILED") where.status = "FAILED";
    else if (status === "QUEUED") where.status = { in: ["QUEUED", "SENDING"] };

    const term = search.trim();
    if (term) {
      where.OR = [
        { client_name: { contains: term, mode: "insensitive" } },
        { phone: { contains: term.replace(/\D/g, "") || term } },
        { lot_label: { contains: term, mode: "insensitive" } },
        { notice_concept: { contains: term, mode: "insensitive" } },
        { reservation: { rut: { contains: term, mode: "insensitive" } } },
      ];
    }

    const select = {
      id: true,
      client_name: true,
      phone: true,
      project_slug: true,
      lot_label: true,
      category: true,
      notice_concept: true,
      notice_amount: true,
      status: true,
      error: true,
      instance: true,
      sent_by: true,
      attempts: true,
      created_at: true,
      reservation: { select: { rut: true } },
    } as const;

    const projectNames = new Map(projects.map((p: any) => [p.slug, p.name]));

    if (forExport) {
      const rows = await prisma.whatsappMessage.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: HISTORY_EXPORT_LIMIT,
        select,
      });
      return {
        success: true,
        rows: rows.map((r) => ({
          ...r,
          rut: r.reservation?.rut ?? null,
          projectName: projectNames.get(r.project_slug) || r.project_slug,
        })),
        total: rows.length,
      };
    }

    const [rows, total, sent, failed, queued, lastSent] = await Promise.all([
      prisma.whatsappMessage.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: Math.max(0, page) * HISTORY_PAGE_SIZE,
        take: HISTORY_PAGE_SIZE,
        select,
      }),
      prisma.whatsappMessage.count({ where }),
      prisma.whatsappMessage.count({ where: { ...where, status: "SENT" } }),
      prisma.whatsappMessage.count({ where: { ...where, status: "FAILED" } }),
      prisma.whatsappMessage.count({
        where: { ...where, status: { in: ["QUEUED", "SENDING"] } },
      }),
      prisma.whatsappMessage.findFirst({
        where: { ...where, status: "SENT" },
        orderBy: { created_at: "desc" },
        select: { created_at: true },
      }),
    ]);

    return {
      success: true,
      projects: projects.map((p: any) => ({ slug: p.slug, name: p.name })),
      rows: rows.map((r) => ({
        ...r,
        rut: r.reservation?.rut ?? null,
        projectName: projectNames.get(r.project_slug) || r.project_slug,
      })),
      stats: { total, sent, failed, queued, lastSentAt: lastSent?.created_at ?? null },
      page: Math.max(0, page),
      pageSize: HISTORY_PAGE_SIZE,
      hasMore: (Math.max(0, page) + 1) * HISTORY_PAGE_SIZE < total,
    };
  } catch (error) {
    console.error("Error cargando el historial de avisos de pago:", error);
    return { error: "Error al cargar el historial", rows: [] };
  }
}

/**
 * Texto completo de un aviso. Se pide aparte porque la tabla no necesita cargar
 * el cuerpo de cincuenta mensajes para mostrar la lista.
 */
export async function getPaymentNoticeMessage(id: string) {
  const user = await requireAdmin();
  if (!user) return { error: "No autorizado" };

  try {
    const row = await prisma.whatsappMessage.findUnique({
      where: { id },
      select: { message: true, project_slug: true, category: true },
    });

    if (!row) return { error: "Mensaje no encontrado" };
    if (!(PAYMENT_CATEGORIES as readonly string[]).includes(row.category)) {
      return { error: "Mensaje no encontrado" };
    }
    if (!canAccessProject(user, row.project_slug)) {
      return { error: "Sin acceso a este proyecto" };
    }

    return { success: true, message: row.message };
  } catch (error) {
    console.error("Error cargando el texto del aviso:", error);
    return { error: "Error al cargar el mensaje" };
  }
}
