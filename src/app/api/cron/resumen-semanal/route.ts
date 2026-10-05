import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GRUPO_RESUMEN, esLunesOnceEnChile, semanaAResumir } from "@/lib/resumenSemanal";
import { enviarResumenSemanal, proyectosResumen } from "@/lib/enviarResumenSemanal";

// Resumen semanal de pagos por WhatsApp (ver src/lib/resumenSemanal.ts).
//
// El envio de los lunes a las 11:00 lo hace solo el servidor
// (src/lib/programadorResumen.ts). Este endpoint queda para probar y para
// mandar a mano, siempre con Authorization: Bearer CRON_SECRET o ?secret=.
//
// Parametros:
//   ?dryRun=true         arma los mensajes y los devuelve, sin enviar nada.
//                        Con &formato=texto los muestra tal cual saldrian.
//   ?to=569XXXXXXXX      PRUEBA: manda a ese numero, cada mensaje desde la
//                        instancia de su proyecto. No marca la semana como enviada.
//   ?proyecto=<slug>     solo ese proyecto.
//   ?semana=AAAA-MM-DD   resume la semana que empieza ese lunes.
//   ?force=true          a los grupos fuera del lunes 11:00 o repitiendo semana.
//
// Sin "to" ni "force" solo envia si en Chile es lunes entre 11:00 y 11:59, y
// nunca dos veces la misma semana al mismo grupo.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization") || req.nextUrl.searchParams.get("secret") || "";
  if (!secret || (provided !== `Bearer ${secret}` && provided !== secret)) {
    try {
      await prisma.auditLog.create({
        data: {
          action: "OTHER",
          entity: "ResumenSemanal",
          entity_id: "auth",
          details: secret
            ? "Corrida RECHAZADA (401): la credencial enviada no coincide con CRON_SECRET."
            : "Corrida RECHAZADA (401): CRON_SECRET no esta configurada en el servidor.",
        },
      });
    } catch (e) {
      console.error("[resumen-semanal] no se pudo escribir el registro de auditoria:", e);
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const dryRun = params.get("dryRun") === "true";
  const force = params.get("force") === "true";
  const to = params.get("to") || "";
  const soloProyecto = params.get("proyecto");

  if (proyectosResumen(soloProyecto).length === 0) {
    return NextResponse.json({ error: `Proyecto desconocido. Usa uno de: ${Object.keys(GRUPO_RESUMEN).join(", ")}` }, { status: 400 });
  }

  if (!dryRun && !to && !force && !esLunesOnceEnChile()) {
    return NextResponse.json({
      skipped: "Fuera del lunes 11:00 de Chile; no se envia nada.",
      semana: semanaAResumir(params.get("semana")).clave,
    });
  }

  const r = await enviarResumenSemanal({ dryRun, force, to, soloProyecto, semanaISO: params.get("semana") });

  if (dryRun && params.get("formato") === "texto") {
    const cuerpo = r.resultados
      .map((x: any) => x.texto
        ? `===== ${x.slug} -> ${x.destino}\n\n${x.texto}`
        : `===== ${x.slug}\n\nERROR: ${x.error || x.skipped}`)
      .join("\n\n\n");
    return new NextResponse(cuerpo, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  return NextResponse.json(r);
}

export const GET = handle;
export const POST = handle;
