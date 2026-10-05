import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveInstance, sendText } from "@/lib/evolution";
import {
  GRUPO_RESUMEN,
  calcularResumen,
  esLunesOnceEnChile,
  semanaAResumir,
  textoResumen,
} from "@/lib/resumenSemanal";

// Resumen semanal de pagos por WhatsApp (ver src/lib/resumenSemanal.ts).
// Lo llama un cron con Authorization: Bearer CRON_SECRET (igual que sync-lomas).
//
// Parametros:
//   ?dryRun=true         arma los mensajes y los devuelve, sin enviar nada.
//                        Con &formato=texto los muestra tal cual saldrian.
//   ?to=569XXXXXXXX      PRUEBA: manda los tres resumenes a ese numero, cada uno
//                        desde la instancia de su proyecto. No marca la semana
//                        como enviada.
//   ?semana=AAAA-MM-DD   resume la semana que empieza ese lunes.
//   ?force=true          a los grupos fuera del lunes 11:00 o repitiendo semana.
//
// Sin "to" ni "force", solo envia si en Chile es lunes entre 11:00 y 11:59. Asi
// el cron puede programarse en UTC a las 14:00 y 15:00 de los lunes y acierta
// a las 11:00 de Chile con y sin horario de verano; la segunda llamada
// encuentra la semana ya enviada y no repite.
//
// Cada envio a un grupo queda en AuditLog con entity "ResumenSemanal" y
// entity_id "<proyecto>:<lunes>", que es tambien lo que evita mandar dos veces.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ENTITY = "ResumenSemanal";

async function logRun(action: "CREATE" | "OTHER", entityId: string, details: string) {
  try {
    await prisma.auditLog.create({ data: { action, entity: ENTITY, entity_id: entityId, details } });
  } catch (e) {
    console.error("[resumen-semanal] no se pudo escribir el registro de auditoria:", e);
  }
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization") || req.nextUrl.searchParams.get("secret") || "";
  if (!secret || (provided !== `Bearer ${secret}` && provided !== secret)) {
    await logRun("OTHER", "auth", secret
      ? "Corrida RECHAZADA (401): la credencial enviada no coincide con CRON_SECRET."
      : "Corrida RECHAZADA (401): CRON_SECRET no esta configurada en el servidor.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const dryRun = params.get("dryRun") === "true";
  const force = params.get("force") === "true";
  const to = (params.get("to") || "").replace(/\D/g, "");
  const semana = semanaAResumir(params.get("semana"));

  if (!dryRun && !to && !force && !esLunesOnceEnChile()) {
    return NextResponse.json({ skipped: "Fuera del lunes 11:00 de Chile; no se envia nada.", semana: semana.clave });
  }

  const resultados: any[] = [];

  for (const slug of Object.keys(GRUPO_RESUMEN)) {
    const entityId = `${slug}:${semana.clave}`;
    try {
      if (!dryRun && !to && !force) {
        const yaEnviado = await prisma.auditLog.findFirst({
          where: { entity: ENTITY, entity_id: entityId, action: "CREATE" },
          select: { id: true },
        });
        if (yaEnviado) {
          resultados.push({ slug, skipped: "La semana ya se envio a este grupo." });
          continue;
        }
      }

      const resumen = await calcularResumen(slug, semana);
      const texto = textoResumen(resumen, semana);
      const destino = to || GRUPO_RESUMEN[slug];

      if (dryRun) {
        resultados.push({ slug, destino, resumen, texto });
        continue;
      }

      const instance = resolveInstance(slug);
      if (!instance) {
        resultados.push({ slug, error: "Falta configurar la instancia de WhatsApp de este proyecto." });
        await logRun("OTHER", entityId, `Resumen NO enviado: falta configurar la instancia de WhatsApp de ${slug}.`);
        continue;
      }

      const sent = await sendText(instance, destino, texto);
      if (!sent.ok) {
        resultados.push({ slug, destino, error: sent.error });
        await logRun("OTHER", entityId, `Resumen NO enviado a ${to ? "numero de prueba" : "grupo"} desde ${instance.name}: ${sent.error}`);
        continue;
      }

      resultados.push({ slug, destino, instancia: instance.name, enviado: true, resumen });
      // Solo el envio real al grupo marca la semana como hecha; la prueba no.
      await logRun(
        to ? "OTHER" : "CREATE",
        entityId,
        `${to ? "[PRUEBA a numero personal] " : ""}Resumen semanal enviado desde ${instance.name}: ` +
          `${resumen.pagosPortal} portal, ${resumen.pagosManuales} manuales, $${resumen.montoCuotas.toLocaleString("es-CL")} en cuotas; ` +
          `al dia ${resumen.alDia} / mora ${resumen.enMora} de ${resumen.clientesBase}.`
      );
    } catch (e: any) {
      console.error(`[resumen-semanal] ${slug}:`, e);
      resultados.push({ slug, error: e?.message || "Error interno" });
      await logRun("OTHER", entityId, `Resumen fallo: ${e?.message || "error interno"}`);
    }
  }

  if (dryRun && params.get("formato") === "texto") {
    const cuerpo = resultados
      .map((r) => r.texto
        ? `===== ${r.slug} -> ${r.destino}\n\n${r.texto}`
        : `===== ${r.slug}\n\nERROR: ${r.error || r.skipped}`)
      .join("\n\n\n");
    return new NextResponse(cuerpo, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  return NextResponse.json({ semana: semana.clave, dryRun, prueba: Boolean(to), resultados });
}

export const GET = handle;
export const POST = handle;
