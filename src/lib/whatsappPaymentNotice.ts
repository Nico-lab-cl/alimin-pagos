/**
 * Aviso automático al cliente cuando su comprobante queda aprobado en la bandeja.
 *
 * Se llama desde las aprobaciones de la bandeja de comprobantes (cuotas, pie o
 * intereses). El aviso sale por el mismo número de WhatsApp con el que el equipo
 * ya le habla al cliente.
 *
 * Tres reglas que sostienen este archivo:
 *
 * 1. SOLO LEE. La unica tabla que escribe es whatsapp_messages (a traves de la
 *    cola). No toca reservations, financial_ledger ni payment_receipts, ni
 *    recalcula mora ni saldos. Un aviso jamas puede mover un peso.
 *
 * 2. NUNCA LANZA. Se invoca despues de que la transaccion financiera ya cerro,
 *    y si WhatsApp esta caido el pago tiene que quedar aprobado igual. Todo va
 *    envuelto y lo peor que pasa es que quede una linea roja en el historial.
 *
 * 3. EL TEXTO CALZA CON EL COMPROBANTE. El concepto ("Cuota 3 - Agosto 2026")
 *    sale de buildInstallmentConcept, la misma funcion que imprime el PDF. Si
 *    se armara aparte, tarde o temprano el mensaje y el comprobante dirian
 *    cosas distintas de la misma cuota.
 *
 * Lo que el mensaje NO dice: saldo, mora, dias de atraso ni cuanto falta. Un
 * aviso de pago confirma lo que se pago y nada mas; el estado de cuenta lo ve
 * el cliente en su portal y lo conversa con postventa.
 */

import { prisma } from "@/lib/prisma";
import { buildInstallmentConcept } from "@/lib/financials";
import { normalizePhone } from "@/lib/phone";
import { resolveInstance } from "@/lib/evolution";
import { enqueueMessage, recordUndeliverable, type QueuedMessage } from "@/lib/whatsappOutbox";
import {
  CONFIRMATION_PHRASES,
  DEFAULT_PAYMENT_TEMPLATES,
  PAYMENT_CATEGORY_BY_KIND,
  type PaymentCategory,
  type PaymentNoticeSource,
} from "@/lib/whatsappTemplates";

export type PaymentNoticeKind = "PIE" | "CUOTA" | "INTERES";

export type PaymentNoticeInput = {
  /**
   * Llave del pago, unica. Es lo que impide que dos clics en "Aprobar" le
   * manden al cliente el mismo mensaje dos veces. NO es una ventana de tiempo:
   * un cliente que paga la cuota y ademas abona interes el mismo dia recibe los
   * dos avisos, porque son dos pagos distintos con dos llaves distintas.
   */
  eventKey: string;
  reservationId: string;
  kind: PaymentNoticeKind;
  source: PaymentNoticeSource;
  /** Monto que se le informa al cliente; el mismo que sale en su comprobante. */
  amount: number;
  paidAt: Date;
  /**
   * Solo para cuotas. Tiene que venir del punto de llamada y no leerse aca,
   * porque para cuando esto corre installments_paid ya se incremento y el
   * numero quedaria corrido una cuota hacia adelante.
   */
  firstInstallmentNumber?: number | null;
  installmentsCount?: number | null;
  /** Quien aprobo o registro el pago; queda en el historial. */
  sentBy?: string | null;
};

function formatCLP(amount: number | null | undefined): string {
  return `$${Math.round(Number(amount) || 0).toLocaleString("es-CL")}`;
}

function formatDateCL(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Plantilla guardada en la base; si aun no existe, el texto por defecto. */
async function loadTemplate(
  category: PaymentCategory
): Promise<{ body: string; active: boolean }> {
  try {
    const stored = await prisma.whatsappTemplate.findUnique({ where: { category } });
    if (stored) return { body: stored.body, active: stored.active ?? true };
  } catch (error) {
    console.error("[aviso-pago] no se pudo leer la plantilla, se usa la por defecto:", error);
  }
  return { body: DEFAULT_PAYMENT_TEMPLATES[category].body, active: true };
}

function renderTemplate(body: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(key).join(value),
    body
  );
}

/**
 * Encola el aviso de un pago recien aprobado o registrado.
 *
 * No espera a que el mensaje salga: deja la fila puesta y vuelve, para que la
 * pantalla de postventa no quede colgada esperando a WhatsApp.
 */
export async function notifyPaymentApproved(input: PaymentNoticeInput): Promise<void> {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: input.reservationId },
      select: {
        id: true,
        name: true,
        last_name: true,
        rut: true,
        phone: true,
        due_day: true,
        installment_start_date: true,
        user: { select: { name: true } },
        project: { select: { slug: true, name: true } },
        lot: { select: { number: true, stage: true } },
      },
    });

    if (!reservation) {
      console.error("[aviso-pago] reserva no encontrada:", input.reservationId);
      return;
    }

    const category = PAYMENT_CATEGORY_BY_KIND[input.kind];
    const template = await loadTemplate(category);

    // Plantilla desactivada desde el portal: postventa apago este aviso a
    // proposito, asi que no se manda ni se registra como fallido.
    if (!template.active) return;

    const clientName =
      reservation.last_name && reservation.last_name !== "null"
        ? `${reservation.name} ${reservation.last_name}`.trim()
        : reservation.user?.name || reservation.name || "Cliente";

    const concept =
      input.kind === "PIE"
        ? "Pago de Pie"
        : input.kind === "INTERES"
          ? "Abono a intereses"
          : buildInstallmentConcept({
              installmentStartDate: reservation.installment_start_date,
              dueDay: reservation.due_day,
              firstInstallmentNumber: input.firstInstallmentNumber,
              installmentsCount: input.installmentsCount,
            });

    const message = renderTemplate(template.body, {
      "{nombre}": clientName,
      "{proyecto}": reservation.project?.name || "",
      "{lote}": String(reservation.lot?.number ?? ""),
      "{etapa}": String(reservation.lot?.stage ?? ""),
      "{rut}": reservation.rut || "",
      "{concepto}": concept,
      "{monto}": formatCLP(input.amount),
      "{fecha}": formatDateCL(input.paidAt),
      "{confirmacion}": CONFIRMATION_PHRASES[input.source],
      "{portal}": process.env.NEXT_PUBLIC_BASE_URL || "",
    });

    const projectSlug = reservation.project?.slug || "";
    const instance = resolveInstance(projectSlug);
    const phone = normalizePhone(reservation.phone);

    const base: Omit<QueuedMessage, "instanceName"> = {
      reservationId: reservation.id,
      projectSlug,
      category,
      clientName,
      phone: phone.ok ? phone.e164 : "",
      message,
      eventKey: input.eventKey,
      noticeConcept: concept,
      noticeAmount: Math.round(Number(input.amount) || 0),
      lotLabel: reservation.lot?.number ?? null,
      sentBy: input.sentBy ?? null,
    };

    // El telefono se valida con el mismo criterio estricto que la cobranza: si
    // no resuelve sin ambiguedad a un movil, no se adivina. Queda registrado
    // como fallido para que postventa corrija la ficha.
    if (!phone.ok) {
      await recordUndeliverable({ ...base, instanceName: instance?.name ?? null }, phone.reason);
      return;
    }

    if (!instance) {
      await recordUndeliverable(
        { ...base, instanceName: null },
        `Falta configurar la instancia de WhatsApp para ${projectSlug}`
      );
      return;
    }

    await enqueueMessage({ ...base, instanceName: instance.name });
  } catch (error) {
    // Deliberado: el pago ya esta aprobado y esa es la operacion que importa.
    console.error("[aviso-pago] no se pudo preparar el aviso de WhatsApp:", error);
  }
}
