/**
 * Cola de salida de los avisos automaticos de WhatsApp.
 *
 * Por que existe: los avisos de pago no los dispara una persona apretando
 * "enviar", los dispara la aprobacion de un pago. Si postventa se sienta a
 * aprobar veinte comprobantes seguidos, saldrian veinte mensajes en un minuto
 * desde el mismo numero, que es justo el patron que WhatsApp castiga.
 *
 * Como resuelve el "al instante" y el "espaciado" al mismo tiempo: la fila vive
 * en la base (whatsapp_messages con status QUEUED) y se vacia apenas se encola.
 * Cuando el pago es uno suelto (el caso normal) no hay nada delante y el mensaje
 * sale de inmediato. El espaciado solo aparece cuando hay varios esperando, y
 * afecta al mensaje numero ocho de una tanda, no al cliente que acaba de pagar.
 *
 * La fila esta en la base y no en memoria a proposito: si el servidor se
 * reinicia a mitad de una tanda, los avisos que faltaban siguen ahi y se
 * retoman en el proximo encolado, en vez de perderse en silencio.
 *
 * Este archivo NUNCA escribe fuera de whatsapp_messages.
 */

import { prisma } from "@/lib/prisma";
import { resolveInstance, sendText } from "@/lib/evolution";

/** Pausa entre mensaje y mensaje de la misma instancia. */
const GAP_MIN_MS = 3_000;
const GAP_MAX_MS = 8_000;

/** Techo por instancia y por hora; el mismo que respeta la cobranza manual. */
const HOURLY_LIMIT = Number(process.env.WHATSAPP_HOURLY_LIMIT || 120);

/** Reintentos cuando Evolution no responde (sesion caida, servidor apagado). */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2 * 60_000;

/**
 * Un aviso que lleva mas de esto en la fila ya no se manda. Confirmarle un pago
 * al cliente medio dia despues confunde mas de lo que ayuda; es preferible que
 * quede como fallido y que postventa lo vea en el historial.
 */
const MAX_QUEUE_AGE_MS = 6 * 3_600_000;

/** Si el techo por hora esta copado, se vuelve a intentar mas tarde. */
const CEILING_RETRY_MS = 10 * 60_000;

/**
 * Solo se barren los envios interrumpidos una vez, en el primer vaciado de cada
 * arranque. En ese momento cualquier fila en SENDING es por definicion de un
 * proceso que ya murio, porque el vaciado es uno solo y siempre cierra la fila
 * antes de pasar a la siguiente. Barrer en cada vuelta seria peor: mataria un
 * mensaje que se esta enviando en este mismo instante.
 *
 * Esto asume un solo proceso del portal. Con varias replicas habria que mover
 * el turno a la base (un SELECT ... FOR UPDATE SKIP LOCKED) en vez de confiar
 * en el estado en memoria.
 */
let reclaimedOnBoot = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Un solo vaciador a la vez; varias aprobaciones en paralelo comparten el mismo. */
let draining = false;
/** Ultimo envio por instancia, para calcular la pausa que corresponde. */
const lastSentAt = new Map<string, number>();
/** Evita acumular timers repetidos cuando varias filas piden reintento. */
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(delayMs: number) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void drainOutbox();
  }, delayMs);
  // No debe mantener vivo el proceso solo por esperar la cola.
  retryTimer.unref?.();
}

export type QueuedMessage = {
  reservationId: string | null;
  projectSlug: string;
  instanceName: string;
  category: string;
  clientName: string;
  phone: string;
  message: string;
  eventKey: string;
  noticeConcept: string;
  noticeAmount: number;
  lotLabel: string | null;
  sentBy: string | null;
};

/**
 * Deja el aviso en la fila y arranca el vaciado.
 *
 * Devuelve false cuando el aviso ya existia: `event_key` es unico, asi que un
 * segundo clic en "Aprobar" choca contra el indice en vez de mandarle al
 * cliente el mismo mensaje dos veces.
 */
export async function enqueueMessage(msg: QueuedMessage): Promise<boolean> {
  try {
    await prisma.whatsappMessage.create({
      data: {
        reservation_id: msg.reservationId,
        project_slug: msg.projectSlug,
        instance: msg.instanceName,
        category: msg.category,
        client_name: msg.clientName,
        phone: msg.phone,
        message: msg.message,
        status: "QUEUED",
        event_key: msg.eventKey,
        notice_concept: msg.noticeConcept,
        notice_amount: msg.noticeAmount,
        lot_label: msg.lotLabel,
        sent_by: msg.sentBy,
      },
    });
  } catch (error: any) {
    // P2002 = choque de indice unico: el aviso de este pago ya estaba encolado.
    if (error?.code === "P2002") return false;
    console.error("[whatsapp-outbox] no se pudo encolar el aviso:", error);
    return false;
  }

  // Sin await: el que aprobo el pago no tiene por que esperar a que WhatsApp
  // conteste. Si esto falla, la fila queda igual y se retoma en el proximo aviso.
  void drainOutbox();
  return true;
}

/**
 * Registra un aviso que no se pudo ni intentar (telefono invalido, proyecto sin
 * instancia configurada). Queda como fallido en el historial para que postventa
 * corrija la ficha del cliente, en vez de desaparecer sin dejar rastro.
 */
export async function recordUndeliverable(
  msg: Omit<QueuedMessage, "instanceName"> & { instanceName: string | null },
  reason: string
): Promise<void> {
  try {
    await prisma.whatsappMessage.create({
      data: {
        reservation_id: msg.reservationId,
        project_slug: msg.projectSlug,
        instance: msg.instanceName || "SIN INSTANCIA",
        category: msg.category,
        client_name: msg.clientName,
        phone: msg.phone || "SIN TELEFONO",
        message: msg.message,
        status: "FAILED",
        error: reason.slice(0, 500),
        event_key: msg.eventKey,
        notice_concept: msg.noticeConcept,
        notice_amount: msg.noticeAmount,
        lot_label: msg.lotLabel,
        sent_by: msg.sentBy,
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002") return;
    console.error("[whatsapp-outbox] no se pudo registrar el aviso no entregable:", error);
  }
}

/**
 * Vacia la fila de a un mensaje, respetando la pausa entre envios y el techo
 * por hora. Nunca lanza: cualquier problema queda escrito en la propia fila.
 */
export async function drainOutbox(): Promise<void> {
  if (draining) return;
  draining = true;

  try {
    await reclaimStaleSending();

    for (;;) {
      const next = await prisma.whatsappMessage.findFirst({
        where: {
          status: "QUEUED",
          OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: new Date() } }],
        },
        orderBy: { created_at: "asc" },
      });

      if (!next) break;

      const createdAt = next.created_at ?? new Date();

      if (Date.now() - createdAt.getTime() > MAX_QUEUE_AGE_MS) {
        await finish(next.id, {
          status: "FAILED",
          error: "El aviso espero demasiado en la cola y ya no era oportuno enviarlo",
        });
        continue;
      }

      const instance = resolveInstance(next.project_slug);
      if (!instance) {
        await finish(next.id, {
          status: "FAILED",
          error: `Falta configurar la instancia de WhatsApp para ${next.project_slug}`,
        });
        continue;
      }

      // Techo por instancia y por hora. No se descarta el aviso: se deja en la
      // fila y se reintenta, porque un pago confirmado tarde sigue sirviendo y
      // uno perdido no.
      const lastHour = await prisma.whatsappMessage.count({
        where: {
          instance: instance.name,
          status: "SENT",
          created_at: { gte: new Date(Date.now() - 3_600_000) },
        },
      });
      if (lastHour >= HOURLY_LIMIT) {
        await prisma.whatsappMessage.update({
          where: { id: next.id },
          data: { next_attempt_at: new Date(Date.now() + CEILING_RETRY_MS) },
        });
        scheduleRetry(CEILING_RETRY_MS);
        continue;
      }

      // Pausa desde el ultimo envio de ESTA instancia. Si no ha salido nada
      // recien (el caso del pago suelto) la espera es cero y sale al instante.
      const gap = GAP_MIN_MS + Math.random() * (GAP_MAX_MS - GAP_MIN_MS);
      const since = Date.now() - (lastSentAt.get(instance.name) ?? 0);
      if (since < gap) await sleep(gap - since);

      // Toma de turno atomica: si otro vaciado se adelanto, esta fila ya no
      // esta en QUEUED y el update no afecta nada.
      const claimed = await prisma.whatsappMessage.updateMany({
        where: { id: next.id, status: "QUEUED" },
        data: { status: "SENDING", attempts: { increment: 1 } },
      });
      if (claimed.count === 0) continue;

      const sent = await sendText(instance, next.phone, next.message);
      lastSentAt.set(instance.name, Date.now());

      if (sent.ok) {
        await finish(next.id, { status: "SENT", evolution_id: sent.evolutionId, error: null });
        continue;
      }

      const attempts = (next.attempts ?? 0) + 1;
      if (attempts < MAX_ATTEMPTS) {
        // Vuelve a la fila: casi siempre es la sesion de WhatsApp caida un rato.
        await prisma.whatsappMessage.update({
          where: { id: next.id },
          data: {
            status: "QUEUED",
            error: sent.error.slice(0, 500),
            next_attempt_at: new Date(Date.now() + RETRY_DELAY_MS),
          },
        });
        scheduleRetry(RETRY_DELAY_MS);
        continue;
      }

      await finish(next.id, {
        status: "FAILED",
        error: `${sent.error} (tras ${attempts} intentos)`.slice(0, 500),
      });
    }
  } catch (error) {
    console.error("[whatsapp-outbox] error vaciando la cola:", error);
  } finally {
    draining = false;
  }
}

/**
 * Cierra los mensajes que quedaron a medio enviar cuando el proceso se corto.
 *
 * Se marcan como fallidos y NO se reintentan: no hay forma de saber si el
 * mensaje alcanzo a salir, y volver a mandarlo puede dejarle al cliente dos
 * confirmaciones del mismo pago. Es preferible una linea roja explicita en el
 * historial, que postventa puede mirar, que un mensaje repetido.
 */
async function reclaimStaleSending(): Promise<void> {
  if (reclaimedOnBoot) return;
  reclaimedOnBoot = true;

  try {
    await prisma.whatsappMessage.updateMany({
      where: { status: "SENDING" },
      data: {
        status: "FAILED",
        error: "El envío quedó interrumpido y no se pudo confirmar si el mensaje salió",
        next_attempt_at: null,
      },
    });
  } catch (error) {
    console.error("[whatsapp-outbox] no se pudieron cerrar los envíos interrumpidos:", error);
  }
}

async function finish(
  id: string,
  data: { status: string; error?: string | null; evolution_id?: string | null }
): Promise<void> {
  try {
    await prisma.whatsappMessage.update({
      where: { id },
      data: { ...data, next_attempt_at: null },
    });
  } catch (error) {
    console.error("[whatsapp-outbox] no se pudo cerrar el mensaje", id, error);
  }
}
