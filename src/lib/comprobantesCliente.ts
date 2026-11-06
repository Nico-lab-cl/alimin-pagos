import { prisma } from "@/lib/prisma";
import { memoryCache } from "@/lib/cache";
import { receiptHasFile } from "@/lib/receiptDocs";
import { filtroReservasDelUsuario } from "@/lib/coTitulares";

/**
 * Deja el comprobante que sube un cliente como PENDING para que postventa lo
 * apruebe. Lo usan la server action del portal y la API de la app movil. Vive
 * fuera de actions/ porque no revisa sesion: quien lo llame tiene que haber
 * verificado antes que `userId` es el usuario que sube el archivo.
 */
export async function registrarComprobanteCliente({
  userId,
  isAdmin,
  reservationId,
  amount,
  scope,
  receiptBase64,
  installmentsCount = 1,
}: {
  userId: string;
  isAdmin: boolean;
  reservationId: string;
  amount: number;
  scope: "PIE" | "INSTALLMENT";
  receiptBase64: string;
  installmentsCount?: number;
}) {
  if (!receiptHasFile(receiptBase64)) {
    return { error: "El archivo del comprobante llegó vacío. Descárgalo en tu teléfono y vuelve a adjuntarlo." };
  }

  try {
    const reservation = await prisma.reservation.findFirst({
      where: isAdmin
        ? { id: reservationId }
        : { id: reservationId, ...(await filtroReservasDelUsuario(userId)) },
      include: { lot: true },
    });

    if (!reservation) return { error: "Reserva no encontrada" };

    const nominalNumber =
      scope === "INSTALLMENT"
        ? (reservation.installments_paid || 0) + 1
        : null;

    const nominalRange =
      scope === "INSTALLMENT" && installmentsCount > 1
        ? `${nominalNumber}-${(nominalNumber || 0) + installmentsCount - 1}`
        : null;

    await prisma.paymentReceipt.create({
      data: {
        amount_clp: amount,
        status: "PENDING",
        receipt_url: receiptBase64,
        scope,
        installments_count: installmentsCount,
        nominal_installment_number: nominalNumber,
        nominal_installment_range: nominalRange,
        reservation_id: reservationId,
        lot_id: reservation.lot_id,
      },
    });

    memoryCache.deleteByPrefix("user_data_");
    memoryCache.deleteByPrefix("receipts_");

    return { success: true };
  } catch (error) {
    console.error("Error uploading receipt:", error);
    return { error: "Error al subir comprobante" };
  }
}
