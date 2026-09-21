"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { memoryCache } from "@/lib/cache";
import { deletePaymentReceipt, logSystemNote } from "@/actions/postventa";
import {
  SCOPE_LABELS,
  buildReceiptDocName,
  receiptFileType,
  receiptHasFile,
  fechaDePagoComprobante,
} from "@/lib/receiptDocs";

/**
 * Uploads a document associated with a reservation.
 */
export async function uploadDocument({
  reservationId,
  name,
  fileType,
  base64Content,
  category,
}: {
  reservationId: string;
  name: string;
  fileType: string;
  base64Content: string;
  category?: string;
}) {
  console.log(`[ACTION] uploadDocument called for reservation: ${reservationId}, name: ${name}`);
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    console.error("[ACTION] uploadDocument Unauthorized");
    return { error: "No autorizado" };
  }

  try {
    const document = await prisma.reservationDocument.create({
      data: {
        reservation_id: reservationId,
        name,
        file_type: fileType,
        base64_content: base64Content,
      },
    });

    console.log(`[ACTION] uploadDocument SUCCESS: ${document.id}`);

    // Invalidate user data cache so user sees new document instantly
    memoryCache.deleteByPrefix("user_data_");

    // Force revalidation for both views
    revalidatePath("/admin/clients");
    revalidatePath("/user/documents");
    
    return { success: true, documentId: document.id };
  } catch (error) {
    console.error("[ACTION] Error uploading document:", error);
    return { error: "Error al subir el documento" };
  }
}

/**
 * Lists metadata for all documents of a reservation.
 */
export async function getReservationDocuments(reservationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado", documents: [] };

  try {
    const documents = await prisma.reservationDocument.findMany({
      where: { reservation_id: reservationId },
      select: {
        id: true,
        name: true,
        file_type: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    const receipts = await prisma.paymentReceipt.findMany({
      where: {
        reservation_id: reservationId,
        status: "APPROVED",
      },
      select: {
        id: true,
        receipt_url: true,
        scope: true,
        nominal_installment_number: true,
        nominal_installment_range: true,
        created_at: true,
        processed_at: true,
        paid_at: true,
        oculto_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    // Respaldo bancario del pago (la transferencia que subió el cliente o
    // postventa). Es INTERNO: en el portal del cliente ya no se muestra cuando
    // existe el recibo oficial de Alimin, para que no vea dos archivos por el
    // mismo pago. Postventa lo sigue viendo completo acá.
    const receiptDocs = receipts.map((r: any) => {
      const { ext, fileType } = receiptFileType(r.receipt_url);

      return {
        id: r.id,
        name: buildReceiptDocName(r, ext),
        file_type: fileType,
        created_at: fechaDePagoComprobante(r),
        type: "receipt",
        // Pagos migrados/registrados sin un archivo digital real (ej. historial
        // importado, o condonaciones administrativas) no tienen nada que previsualizar.
        hasFile: receiptHasFile(r.receipt_url),
        internal: true,
      };
    });

    const tableDocs = documents.map((d: any) => ({
      id: d.id,
      name: d.name,
      file_type: d.file_type,
      created_at: d.created_at,
      type: "table",
      hasFile: true,
    }));

    // Recibo OFICIAL emitido por Alimin (distinto del comprobante que sube el
    // cliente): un documento adicional por cada comprobante aprobado, generado
    // al vuelo (sin archivo guardado) via /api/documents/official-{id}.
    // Un recibo ocultado por postventa deja de listarse. El pago sigue ahi: su
    // respaldo bancario se sigue viendo mas arriba como INTERNO.
    const officialReceiptDocs = receipts.filter((r: any) => !r.oculto_at).map((r: any) => {
      const docName = buildReceiptDocName(r, "pdf").replace(
        /^Comprobante_(Pago_)?/,
        "Recibo_Oficial_"
      );

      return {
        id: `official-${r.id}`,
        name: docName,
        file_type: "application/pdf",
        created_at: fechaDePagoComprobante(r),
        type: "official_receipt",
        hasFile: true,
      };
    });

    const combined = [...tableDocs, ...receiptDocs, ...officialReceiptDocs].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    return { success: true, documents: combined };
  } catch (error) {
    console.error("[ACTION] Error listing documents:", error);
    return { error: "Error al listar documentos", documents: [] };
  }
}

/**
 * Deletes a document. Handles both "digital" documents (contrato, certificado,
 * ficha técnica, comprobantes generados por el sistema) and comprobantes bancarios
 * (recibos de pago subidos por el cliente o ingresados manualmente por postventa).
 * Toda eliminación queda registrada en la Bitácora del cliente.
 */
export async function deleteDocument(documentId: string) {
  console.log(`[ACTION] deleteDocument called for ID: ${documentId}`);
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    console.error("[ACTION] deleteDocument Unauthorized");
    return { error: "No autorizado" };
  }

  try {
    // 1. Documento "digital" (contrato, certificado, ficha técnica, comprobante generado, etc.)
    const tableDoc = await prisma.reservationDocument.findUnique({
      where: { id: documentId },
    });

    if (tableDoc) {
      await prisma.reservationDocument.delete({ where: { id: documentId } });
      await logSystemNote(tableDoc.reservation_id, `Documento eliminado: "${tableDoc.name}".`, "ReservationDocument");

      console.log(`[ACTION] deleteDocument SUCCESS (table) for: ${tableDoc.id}`);
      memoryCache.deleteByPrefix("user_data_");
      revalidatePath("/admin/clients");
      revalidatePath("/user/documents");
      return { success: true };
    }

    // 2. Recibo OFICIAL de un pago. No es un archivo: se genera al vuelo, así
    // que no hay nada que borrar. Antes esto no encontraba nada y devolvía
    // "Documento no encontrado", así que el botón simplemente no funcionaba.
    //
    // Se oculta en vez de borrar, y el pago queda intacto: monto, cuotas y caja
    // no se tocan. Para deshacer un pago está el botón de la bandeja, que avisa
    // lo que revierte.
    if (documentId.startsWith("official-")) {
      return await ocultarReciboOficial(documentId.slice("official-".length));
    }

    // 3. Comprobante bancario (PaymentReceipt): reutiliza la lógica de reversión
    // financiera (revierte cuotas/ledger si estaba aprobado) y ya deja su propio
    // registro en la Bitácora.
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id: documentId },
    });

    if (receipt) {
      return await deletePaymentReceipt(documentId);
    }

    return { error: "Documento no encontrado" };
  } catch (error) {
    console.error("[ACTION] Error deleting document:", error);
    return { error: "Error al eliminar el documento" };
  }
}

/**
 * Deletes a legacy document stored as a JSON entry on reservation.manual_documents
 * (formato anterior a la tabla ReservationDocument). Queda registrado en la Bitácora.
 */
export async function deleteLegacyDocument(reservationId: string, docName: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { manual_documents: true },
    });
    if (!reservation?.manual_documents) return { error: "Documento no encontrado" };

    const docs = Array.isArray(reservation.manual_documents)
      ? reservation.manual_documents
      : JSON.parse(reservation.manual_documents as unknown as string);

    const filtered = (docs as any[]).filter((d: any) => d.name !== docName);
    if (filtered.length === (docs as any[]).length) return { error: "Documento no encontrado" };

    await prisma.reservation.update({
      where: { id: reservationId },
      data: { manual_documents: filtered },
    });
    await logSystemNote(reservationId, `Documento heredado eliminado: "${docName}".`, "Reservation");

    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");
    revalidatePath("/user/documents");

    return { success: true };
  } catch (error) {
    console.error("[ACTION] Error deleting legacy document:", error);
    return { error: "Error al eliminar el documento" };
  }
}

/**
 * Saca de la vista el recibo oficial de un pago, sin tocar el pago.
 *
 * Existe porque son dos cosas distintas que antes no se podían separar:
 *
 *   - Deshacer un PAGO (revertir cuotas y sacar la plata de caja) es
 *     `deletePaymentReceipt`, y avisa exactamente lo que revierte.
 *   - Sacar de la lista un RECIBO que quedó mal emitido —por ejemplo con rangos
 *     de cuota pisados— es esto, y no mueve un peso.
 *
 * El recibo se genera al vuelo desde el comprobante, así que no hay archivo que
 * borrar: se marca el comprobante y deja de listarse. Es reversible.
 *
 * No escribe en `financial_ledger` ni en `reservations`: no cambia cuotas
 * pagadas, saldos, mora ni montos.
 */
/**
 * Saca el archivo que subió el cliente, dejando el PAGO intacto.
 *
 * Lo pide postventa: el cliente sube la foto equivocada -otra transferencia,
 * una captura cortada, el comprobante de otra cuota- y hay que poder quitarla
 * para que suba la buena. Hasta ahora la única forma era `deleteDocument` con
 * el id del comprobante, que llama a `deletePaymentReceipt` y REVIERTE el
 * pago: baja el contador de cuotas y deshace la caja. Para cambiar una foto
 * eso es una bomba.
 *
 * Acá solo se borra el archivo. La columna `receipt_url` no admite NULL, así
 * que se deja el centinela "SIN_RESPALDO", que es el que `receiptHasFile` ya
 * trata como "no hay archivo". La cuota sigue pagada, el recibo oficial se
 * sigue emitiendo, y la celda vuelve a mostrar "Subir".
 */
export async function quitarArchivoComprobante(receiptId: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id: receiptId },
      select: {
        id: true,
        reservation_id: true,
        amount_clp: true,
        scope: true,
        receipt_url: true,
        nominal_installment_number: true,
        nominal_installment_range: true,
      },
    });
    if (!receipt) return { error: "Comprobante no encontrado" };
    if (!receiptHasFile(receipt.receipt_url)) {
      return { error: "Este pago no tiene ningún archivo adjunto" };
    }

    await prisma.paymentReceipt.update({
      where: { id: receiptId },
      data: { receipt_url: "SIN_RESPALDO" },
    });

    const cual = receipt.nominal_installment_range
      ? `Cuotas ${receipt.nominal_installment_range}`
      : receipt.nominal_installment_number
        ? `Cuota ${receipt.nominal_installment_number}`
        : SCOPE_LABELS[receipt.scope] || receipt.scope;

    await logSystemNote(
      receipt.reservation_id,
      `Archivo del comprobante eliminado: ${cual} (monto ${receipt.amount_clp.toLocaleString(
        "es-CL"
      )}). El PAGO no se modificó: cuotas, caja y saldo quedan igual. La cuota vuelve a quedar sin respaldo, lista para adjuntar el archivo correcto.`,
      "PaymentReceipt"
    );

    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "PaymentReceipt",
        entity_id: receipt.id,
        details: `Archivo del comprobante eliminado (${cual}). Solo el archivo: el pago queda intacto.`,
        user_id: user.id,
        user_email: user.email,
      },
    });

    memoryCache.deleteByPrefix("user_data_");
    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("receipts_");
    revalidatePath("/admin/clients");
    revalidatePath("/user/documents");
    return { success: true };
  } catch (error) {
    console.error("Error quitando el archivo del comprobante:", error);
    return { error: "Error al quitar el archivo" };
  }
}

export async function ocultarReciboOficial(receiptId: string, motivo?: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id: receiptId },
      select: {
        id: true,
        reservation_id: true,
        amount_clp: true,
        scope: true,
        nominal_installment_number: true,
        nominal_installment_range: true,
      },
    });

    if (!receipt) return { error: "Comprobante no encontrado" };

    await prisma.paymentReceipt.update({
      where: { id: receiptId },
      data: { oculto_at: new Date(), oculto_motivo: motivo?.trim() || null },
    });

    const cual = receipt.nominal_installment_range
      ? `Cuotas ${receipt.nominal_installment_range}`
      : receipt.nominal_installment_number
        ? `Cuota ${receipt.nominal_installment_number}`
        : SCOPE_LABELS[receipt.scope] || receipt.scope;

    await logSystemNote(
      receipt.reservation_id,
      `Recibo oficial ocultado: ${cual} (monto $${receipt.amount_clp.toLocaleString(
        "es-CL"
      )}). El pago NO se modificó: cuotas, caja y saldo quedan igual.${
        motivo?.trim() ? ` Motivo: ${motivo.trim()}` : ""
      }`,
      "PaymentReceipt"
    );

    memoryCache.deleteByPrefix("user_data_");
    memoryCache.deleteByPrefix("postventa_");
    revalidatePath("/admin/clients");
    revalidatePath("/user/documents");

    return { success: true };
  } catch (error) {
    console.error("[ACTION] Error ocultando recibo oficial:", error);
    return { error: "Error al ocultar el recibo" };
  }
}
