/**
 * Conversion entre "fecha y hora que escribio postventa" (siempre hora de
 * Chile, America/Santiago) y el instante real en UTC que se guarda en la base.
 *
 * Sin "use server" ni prisma: la importa tambien la pantalla para mostrar la
 * hora actual de Chile y validar antes de mandar nada al servidor.
 *
 * Respeta el cambio de hora de Chile (horario de verano / invierno): el
 * desfase se calcula con Intl para ese dia concreto, no con un -3 o -4 fijo.
 */

export const TZ_CHILE = "America/Santiago";

function partesEnChile(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_CHILE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { y: get("year"), m: get("month"), d: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/**
 * "2026-10-27" + "09:30" en hora de Chile -> instante UTC. Devuelve null si
 * el texto no es una fecha/hora valida. Si la hora no existe ese dia (el
 * salto de 00:00 a 01:00 cuando empieza el horario de verano), cae en la
 * primera hora valida siguiente.
 */
export function chileLocalToUtc(fecha: string, hora: string): Date | null {
  const fm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha || "");
  const hm = /^(\d{2}):(\d{2})$/.exec(hora || "");
  if (!fm || !hm) return null;
  const [y, m, d] = [Number(fm[1]), Number(fm[2]), Number(fm[3])];
  const [h, mi] = [Number(hm[1]), Number(hm[2])];
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;

  const objetivo = Date.UTC(y, m - 1, d, h, mi, 0);
  let guess = objetivo;
  for (let i = 0; i < 3; i++) {
    const p = partesEnChile(new Date(guess));
    const comoUTC = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second);
    guess -= comoUTC - objetivo;
  }
  const out = new Date(guess);
  return Number.isNaN(out.getTime()) ? null : out;
}

/** Fecha y hora de hoy en Chile, en el formato de los <input type="date|time">. */
export function ahoraEnChile(now = new Date()): { fecha: string; hora: string } {
  const p = partesEnChile(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { fecha: `${p.y}-${pad(p.m)}-${pad(p.d)}`, hora: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Suma dias a una fecha "AAAA-MM-DD" (calendario, sin hora). */
export function sumarDiasFecha(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
}

/** "lun 27-10-2026, 09:30" en hora de Chile, para mostrar en pantalla. */
export function formatoFechaHoraChile(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ_CHILE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}
