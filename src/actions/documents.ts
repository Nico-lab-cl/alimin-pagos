"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { memoryCache } from "@/lib/cache";
import { deletePaymentReceipt, logSystemNote } from "@/actions/postventa";

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
      },
      orderBy: { created_at: "desc" },
    });

    const receiptDocs = receipts.map((r: any) => {
      let ext = "pdf";
      let fileType = "application/pdf";
      if (r.receipt_url && r.receipt_url.startsWith("data:")) {
        const parts = r.receipt_url.split(";");
        if (parts[0]) {
          fileType = parts[0].substring(5);
          if (fileType === "image/png") ext = "png";
          else if (fileType === "image/jpeg") ext = "jpg";
          else if (fileType === "image/webp") ext = "webp";
          else if (fileType === "application/pdf") ext = "pdf";
        }
      }
      
      let docName = "Comprobante de Pago";
      if (r.scope === "PIE") {
        docName = `Comprobante_Pago_Pie.${ext}`;
      } else {
        docName = r.nominal_installment_range
          ? `Comprobante_Pago_Cuotas_${r.nominal_installment_range}.${ext}`
          : r.nominal_installment_number
            ? `Comprobante_Pago_Cuota_${r.nominal_installment_number}.${ext}`
            : `Comprobante_Pago_Cuota.${ext}`;
      }

      return {
        id: r.id,
        name: docName,
        file_type: fileType,
        created_at: r.processed_at || r.created_at,
        type: "receipt",
      };
    });

    const tableDocs = documents.map((d: any) => ({
      id: d.id,
      name: d.name,
      file_type: d.file_type,
      created_at: d.created_at,
      type: "table",
    }));

    const combined = [...tableDocs, ...receiptDocs].sort(
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

    // 2. Comprobante bancario (PaymentReceipt): reutiliza la lógica de reversión
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
