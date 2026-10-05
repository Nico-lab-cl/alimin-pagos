/**
 * Resumen semanal de pagos por WhatsApp.
 *
 * Cada lunes a las 11:00 (hora de Chile) sale un mensaje por proyecto al grupo
 * interno de postventa, desde el numero de quien atiende ese proyecto (la misma
 * asignacion de src/lib/evolution.ts: Denisse -> Libertad y Alegria, Cindy ->
 * Arena y Sol y Lomas del Mar). Solo numeros, nunca nombres de clientes.
 *
 * Reglas acordadas con postventa (05-10-2026):
 *  - La semana es de lunes a domingo, la anterior al lunes del envio.
 *  - Un pago cuenta en la semana en que postventa lo APROBO o REGISTRO, no en la
 *    fecha de la transferencia. Asi un resumen ya enviado no cambia despues.
 *  - El monto suma SOLO cuotas: pie, reserva, gastos y mora quedan fuera.
 *  - Portal vs manual se lee de la caja: "Pago Manual Cuota..." lo registro
 *    postventa a mano; "Pago Cuota ... Aprobado" es un comprobante que el
 *    cliente subio al portal y postventa aprobo.
 *  - Al dia / en mora usa las mismas etiquetas de la lista de clientes:
 *    "En Mora" es mora; "Al Dia", "Aviso Proximo" y "Dias de Gracia" son al dia.
 *    Contado/pagado completo, Congelado y fichas duplicadas no entran en la base.
 *    Es una foto del momento del envio, no del domingo.
 */

import { prisma } from "@/lib/prisma";
import { computePostventaData } from "@/lib/postventaData";
import { esAlContado } from "@/lib/utils";

/** Grupo de WhatsApp de cada proyecto. No es secreto: es a donde va el resumen. */
export const GRUPO_RESUMEN: Record<string, string> = {
  "libertad-y-alegria": "120363334363201368@g.us", // Post Ventas PAGOS Alimin Libertad y Alegria (Denisse)
  "arena-y-sol": "120363299386447333@g.us", // Proyecto Arena y Sol (Cindy)
  "lomas-del-mar": "120363421825250613@g.us", // Postventa Lomas del Mar (Cindy)
};

const TZ = "America/Santiago";
const TEST_EMAIL = "nicolas.cab.v@gmail.com";

type FechaChile = { y: number; m: number; d: number };

function partesEnChile(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"), // "Mon", "Tue", ...
  };
}

/** Instante UTC de las 00:00 de ese dia en Santiago (respeta el cambio de hora). */
function medianocheChile({ y, m, d }: FechaChile): Date {
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = partesEnChile(new Date(guess));
    const comoUTC = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second);
    guess -= comoUTC - Date.UTC(y, m - 1, d, 0, 0, 0);
  }
  return new Date(guess);
}

function sumarDias(f: FechaChile, dias: number): FechaChile {
  const t = new Date(Date.UTC(f.y, f.m - 1, f.d + dias));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const DIA_SEMANA: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export type Semana = {
  /** Lunes, inclusive, 00:00 Chile. */
  desde: Date;
  /** Lunes siguiente, exclusivo, 00:00 Chile. */
  hasta: Date;
  lunes: FechaChile;
  domingo: FechaChile;
  /** "2026-09-28", sirve de llave para no mandar dos veces la misma semana. */
  clave: string;
};

function aClave(f: FechaChile) {
  return `${f.y}-${String(f.m).padStart(2, "0")}-${String(f.d).padStart(2, "0")}`;
}

/**
 * La semana a resumir. Sin argumento: la anterior al lunes de esta semana
 * (si hoy es lunes 5-oct, devuelve 28-sep a 4-oct). Con "AAAA-MM-DD": la
 * semana que empieza ese lunes.
 */
export function semanaAResumir(lunesISO?: string | null, ahora = new Date()): Semana {
  let lunes: FechaChile;
  if (lunesISO && /^\d{4}-\d{2}-\d{2}$/.test(lunesISO)) {
    const [y, m, d] = lunesISO.split("-").map(Number);
    lunes = { y, m, d };
  } else {
    const p = partesEnChile(ahora);
    const hoy = { y: p.y, m: p.m, d: p.d };
    const lunesDeEstaSemana = sumarDias(hoy, -(DIA_SEMANA[p.weekday] ?? 0));
    lunes = sumarDias(lunesDeEstaSemana, -7);
  }
  const lunesSiguiente = sumarDias(lunes, 7);
  return {
    desde: medianocheChile(lunes),
    hasta: medianocheChile(lunesSiguiente),
    lunes,
    domingo: sumarDias(lunes, 6),
    clave: aClave(lunes),
  };
}

/** True si en Chile es lunes entre las 11:00 y las 11:59. */
export function esLunesOnceEnChile(ahora = new Date()): boolean {
  const p = partesEnChile(ahora);
  return p.weekday === "Mon" && p.hour === 11;
}

export type ResumenProyecto = {
  slug: string;
  nombre: string;
  pagosPortal: number;
  pagosManuales: number;
  montoCuotas: number;
  /** Comprobantes subidos que siguen sin aprobar ni rechazar al momento del envio. */
  porAprobar: number;
  clientesBase: number;
  alDia: number;
  enMora: number;
};

export async function calcularResumen(slug: string, semana: Semana): Promise<ResumenProyecto> {
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!project) throw new Error(`Proyecto ${slug} no existe`);

  const filasCuota = await prisma.financialLedger.findMany({
    where: {
      category: "CUOTA",
      created_at: { gte: semana.desde, lt: semana.hasta },
      reservation: {
        project_id: project.id,
        NOT: [{ email: TEST_EMAIL }, { user: { is: { email: TEST_EMAIL } } }],
      },
    },
    select: { amount_clp: true, description: true },
  });

  let pagosPortal = 0;
  let pagosManuales = 0;
  let montoCuotas = 0;
  for (const f of filasCuota) {
    montoCuotas += f.amount_clp || 0;
    if ((f.description || "").trim().toLowerCase().startsWith("pago manual")) pagosManuales++;
    else pagosPortal++;
  }

  // Lo que el cliente ya subio pero postventa no ha revisado. No entra en los
  // montos de esta semana (cuenta la fecha de aprobacion): aparece en el
  // resumen de la semana en que se apruebe.
  const porAprobar = await prisma.paymentReceipt.count({
    where: {
      status: "PENDING",
      reservation: {
        project_id: project.id,
        NOT: [{ email: TEST_EMAIL }, { user: { is: { email: TEST_EMAIL } } }],
      },
    },
  });

  const cartera: any = await computePostventaData(slug);
  if (cartera?.error) throw new Error(`No se pudo calcular la cartera de ${slug}: ${cartera.error}`);

  const base = (cartera.data as any[]).filter(
    (c) =>
      !c.isGhostDuplicate &&
      !esAlContado(c) &&
      ["OK", "UPCOMING", "GRACE", "LATE"].includes(c.status) &&
      (c.clientEmail || "").toLowerCase() !== TEST_EMAIL
  );
  const enMora = base.filter((c) => c.status === "LATE").length;

  return {
    slug,
    nombre: project.name,
    pagosPortal,
    pagosManuales,
    montoCuotas,
    porAprobar,
    clientesBase: base.length,
    alDia: base.length - enMora,
    enMora,
  };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fechaLarga(f: FechaChile, conAnio: boolean) {
  return `${f.d} de ${MESES[f.m - 1]}${conAnio ? ` de ${f.y}` : ""}`;
}

function clp(n: number) {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

/** Porcentajes enteros que suman 100 (el resto se lo lleva el mayor decimal). */
function porcentajes(a: number, b: number): [number, number] {
  const total = a + b;
  if (total === 0) return [0, 0];
  const pa = Math.round((a / total) * 100);
  return [pa, 100 - pa];
}

export function textoResumen(r: ResumenProyecto, semana: Semana, ahora = new Date()): string {
  const mismoAnio = semana.lunes.y === semana.domingo.y;
  const rango = `${fechaLarga(semana.lunes, !mismoAnio)} al ${fechaLarga(semana.domingo, true)}`;
  const hoy = partesEnChile(ahora);
  const [pAlDia, pMora] = porcentajes(r.alDia, r.enMora);
  const totalPagos = r.pagosPortal + r.pagosManuales;

  return [
    `📊 *Resumen semanal · ${r.nombre}*`,
    `Semana del ${rango}`,
    ``,
    `💳 Pagos subidos al portal y aprobados: *${r.pagosPortal}*`,
    `✍️ Pagos registrados manualmente: *${r.pagosManuales}*`,
    `💰 Entraron *${clp(r.montoCuotas)}* en cuotas (${totalPagos} ${totalPagos === 1 ? "pago" : "pagos"})`,
    `⏳ Comprobantes por aprobar: *${r.porAprobar}*${r.porAprobar > 0 ? " (se suman al resumen de la semana en que se aprueben)" : ""}`,
    ``,
    `👥 Clientes en cuotas al ${fechaLarga({ y: hoy.y, m: hoy.m, d: hoy.d }, false)}: ${r.clientesBase}`,
    `✅ Al día: *${pAlDia}%* (${r.alDia})`,
    `🔴 En mora: *${pMora}%* (${r.enMora})`,
    ``,
    `_Mensaje automático del Portal de Pagos._`,
  ].join("\n");
}
