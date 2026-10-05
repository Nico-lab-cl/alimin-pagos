/**
 * Programador interno del resumen semanal: el propio servidor del portal
 * revisa la hora cada 5 minutos y, cuando en Chile es lunes entre 11:00 y
 * 11:59, manda el resumen de la semana anterior a los tres grupos. No depende
 * de n8n, de un cron de EasyPanel ni de nadie que llame a una URL.
 *
 * - Lo arranca src/instrumentation.ts al iniciar el servidor.
 * - Solo corre en produccion: un `npm run dev` local nunca escribe a los grupos.
 * - Si el servidor se reinicia dentro de esa hora, el registro de AuditLog
 *   evita repetir la semana; si estuvo caido toda la hora, ese lunes no sale
 *   (se puede mandar a mano con el endpoint y force=true).
 * - Se apaga con la variable RESUMEN_SEMANAL_AUTO=false.
 */

import { esLunesOnceEnChile } from "@/lib/resumenSemanal";
import { enviarResumenSemanal } from "@/lib/enviarResumenSemanal";

const CADA_MS = 5 * 60 * 1000;

const g = globalThis as unknown as { __programadorResumen?: NodeJS.Timeout; __resumenEnCurso?: boolean };

async function revisar() {
  if (!esLunesOnceEnChile() || g.__resumenEnCurso) return;
  g.__resumenEnCurso = true;
  try {
    const r = await enviarResumenSemanal();
    const enviados = r.resultados.filter((x: any) => x.enviado).length;
    if (enviados > 0 || r.resultados.some((x: any) => x.error)) {
      console.log(`[resumen-semanal] semana ${r.semana}:`, JSON.stringify(r.resultados.map((x: any) => ({ slug: x.slug, enviado: !!x.enviado, error: x.error, skipped: x.skipped }))));
    }
  } catch (e) {
    console.error("[resumen-semanal] el programador fallo:", e);
  } finally {
    g.__resumenEnCurso = false;
  }
}

export function iniciarProgramadorResumen() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.RESUMEN_SEMANAL_AUTO === "false") return;
  if (g.__programadorResumen) return;

  g.__programadorResumen = setInterval(revisar, CADA_MS);
  // Primera revision al minuto de arrancar, por si el deploy cae justo el lunes a las 11.
  setTimeout(revisar, 60 * 1000);
  console.log("[resumen-semanal] programador activo: lunes 11:00 (America/Santiago).");
}
