"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

    return { success: true, documents };
  } catch (error) {
    console.error("[ACTION] Error listing documents:", error);
    return { error: "Error al listar documentos", documents: [] };
  }
}

/**
 * Deletes a document.
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
    const doc = await prisma.reservationDocument.delete({
      where: { id: documentId },
    });

    console.log(`[ACTION] deleteDocument SUCCESS for: ${doc.id}`);

    revalidatePath("/admin/clients");
    revalidatePath("/user/documents");

    return { success: true };
  } catch (error) {
    console.error("[ACTION] Error deleting document:", error);
    return { error: "Error al eliminar el documento" };
  }
}
