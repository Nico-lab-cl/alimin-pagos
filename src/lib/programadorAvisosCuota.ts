/**
 * Aviso "tu cuota vence pronto" para Alimin app. El propio servidor revisa
 * cada 15 minutos y, entre las 10:00 y las 12:59 de Chile, avisa a los
 * clientes con la app instalada cuya proxima cuota vence dentro de 3 dias o
 * menos. Mismo esquema que programadorResumen.ts.
 *
 * - Solo a quien esta al dia: si el terreno ya tiene cuotas vencidas (o mora
 *   historica) no se manda; de eso se encarga la cobranza.
 * - Solo a quien tiene un telefono registrado (users.fcm_token): no llena la
 *   bandeja del portal de quien no usa la app.
 * - La cuota y la fecha salen de cargarTerrenosDelUsuario, el mismo calculo
 *   que ve el cliente en el portal y en la app.
 * - Una vez por cuota y terreno: antes de avisar busca el mismo aviso en los
 *   ultimos 20 dias. Si el servidor estuvo caido a las 10, sale en la
 *   siguiente revision de la ventana, o al dia siguiente con menos dias.
 * - Solo en produccion. Se apaga con AVISO_CUOTA_AUTO=false.
 */

import { prisma } from "@/lib/prisma";
import { cargarTerrenosDelUsuario } from "@/lib/terrenosCliente";
import { avisarAClientes, pesos } from "@/lib/avisosCliente";

const CADA_MS = 15 * 60 * 1000;
const DIAS_ANTES = 3;
const TIPO = "INSTALLMENT_DUE";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const g = globalThis as unknown as { __programadorAvisosCuota?: NodeJS.Timeout; __avisosCuotaEnCurso?: boolean };

function hoyEnChile(ahora = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(ahora)
      .map((x) => [x.type, x.value])
  );
  return { dia: Date.UTC(+p.year, +p.month - 1, +p.day), hora: +p.hour };
}

/** Los vencimientos vienen como fecha de Chile guardada en UTC: se leen en UTC. */
function diaDe(iso: string) {
  const d = new Date(iso);
  return { dia: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), texto: `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}` };
}

type Cuota = { number: number; dueDate?: string | null; amount?: number; baseAmount?: number; isOverdue?: boolean; isHistorical?: boolean };
type Terreno = { projectName?: string; lotNumber?: string | number; upcomingInstallments?: Cuota[] };

export async function revisarAvisosCuota(ahora = new Date()) {
  const hoy = hoyEnChile(ahora).dia;
  const usuarios = await prisma.user.findMany({
    where: { role: "USER", fcm_token: { not: null } },
    select: { id: true },
  });

  let avisados = 0;
  for (const { id } of usuarios) {
    const r = await cargarTerrenosDelUsuario(id).catch(() => null);
    const lotes: Terreno[] = (r && "lots" in r && r.lots) || [];
    for (const lote of lotes) {
      const cuotas = lote.upcomingInstallments || [];
      if (cuotas.some((c) => c.isOverdue || c.isHistorical || c.number === 0)) continue;
      const proxima = cuotas.find((c) => c.number > 0 && c.dueDate);
      if (!proxima?.dueDate) continue;

      const vence = diaDe(proxima.dueDate);
      const dias = Math.round((vence.dia - hoy) / 86_400_000);
      if (dias < 1 || dias > DIAS_ANTES) continue;

      // La marca para no repetir va en el mensaje: "cuota #19 ... Lote 42".
      const marca = `cuota #${proxima.number} de ${lote.projectName} · Lote ${lote.lotNumber}`;
      const ya = await prisma.notification.findFirst({
        where: { user_id: id, type: TIPO, message: { contains: marca }, created_at: { gte: new Date(ahora.getTime() - 20 * 86_400_000) } },
        select: { id: true },
      });
      if (ya) continue;

      const cuando = dias === 1 ? "mañana" : `el ${vence.texto}`;
      await avisarAClientes([id], {
        tipo: TIPO,
        titulo: dias === 1 ? "Tu cuota vence mañana" : "Tu cuota vence pronto",
        mensaje: `Tu ${marca} vence ${cuando}: ${pesos(proxima.baseAmount ?? proxima.amount ?? 0)}.`,
        push: `La cuota #${proxima.number} de ${pesos(proxima.baseAmount ?? proxima.amount ?? 0)} vence ${cuando}. Págala desde la app.`,
        ruta: "/pagar",
      });
      avisados++;
    }
  }
  return { revisados: usuarios.length, avisados };
}

async function revisar() {
  const { hora } = hoyEnChile();
  if (hora < 10 || hora > 12 || g.__avisosCuotaEnCurso) return;
  g.__avisosCuotaEnCurso = true;
  try {
    const r = await revisarAvisosCuota();
    if (r.avisados > 0) console.log(`[aviso-cuota] ${r.avisados} avisos (de ${r.revisados} clientes con la app).`);
  } catch (e) {
    console.error("[aviso-cuota] el programador fallo:", e);
  } finally {
    g.__avisosCuotaEnCurso = false;
  }
}

export function iniciarProgramadorAvisosCuota() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.AVISO_CUOTA_AUTO === "false") return;
  if (g.__programadorAvisosCuota) return;

  g.__programadorAvisosCuota = setInterval(revisar, CADA_MS);
  setTimeout(revisar, 2 * 60 * 1000);
  console.log("[aviso-cuota] programador activo: 10:00 a 12:59 (America/Santiago), 3 días antes.");
}
