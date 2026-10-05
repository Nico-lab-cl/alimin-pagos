/**
 * Envio del resumen semanal a los grupos (o a un numero de prueba).
 *
 * Lo usan dos caminos con el mismo codigo:
 *  - el programador interno (src/lib/programadorResumen.ts), que lo dispara
 *    solo cada lunes a las 11:00 de Chile;
 *  - el endpoint /api/cron/resumen-semanal, para pruebas manuales con clave.
 *
 * Cada envio a un grupo queda en AuditLog con entity "ResumenSemanal" y
 * entity_id "<proyecto>:<lunes>", que es tambien lo que evita mandar dos veces
 * la misma semana al mismo grupo.
 */

import { prisma } from "@/lib/prisma";
import { resolveInstance, sendText } from "@/lib/evolution";
import { GRUPO_RESUMEN, calcularResumen, semanaAResumir, textoResumen } from "@/lib/resumenSemanal";

const ENTITY = "ResumenSemanal";

async function logRun(action: "CREATE" | "OTHER", entityId: string, details: string) {
  try {
    await prisma.auditLog.create({ data: { action, entity: ENTITY, entity_id: entityId, details } });
  } catch (e) {
    console.error("[resumen-semanal] no se pudo escribir el registro de auditoria:", e);
  }
}

export type OpcionesEnvio = {
  /** Arma los mensajes sin enviar nada. */
  dryRun?: boolean;
  /** Reenvia aunque la semana ya se haya mandado a ese grupo. */
  force?: boolean;
  /** Numero de prueba: manda ahi en vez de al grupo y no marca la semana. */
  to?: string;
  /** Lunes "AAAA-MM-DD" de la semana a resumir; por defecto la anterior. */
  semanaISO?: string | null;
  /** Solo este proyecto. */
  soloProyecto?: string | null;
};

export function proyectosResumen(soloProyecto?: string | null): string[] {
  return Object.keys(GRUPO_RESUMEN).filter((s) => !soloProyecto || s === soloProyecto);
}

export async function enviarResumenSemanal(opciones: OpcionesEnvio = {}) {
  const { dryRun = false, force = false, soloProyecto } = opciones;
  const to = (opciones.to || "").replace(/\D/g, "");
  const semana = semanaAResumir(opciones.semanaISO);
  const resultados: any[] = [];

  for (const slug of proyectosResumen(soloProyecto)) {
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

  return { semana: semana.clave, dryRun, prueba: Boolean(to), resultados };
}
