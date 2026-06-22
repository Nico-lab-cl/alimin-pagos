import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const forceDownload = url.searchParams.get("download") === "true";

  try {
    let documentName = "";
    let base64Content = "";
    let fileTypeField: string | null = null;
    let reservationId = "";

    const document = await prisma.reservationDocument.findUnique({
      where: { id },
    });

    if (document) {
      documentName = document.name;
      base64Content = document.base64_content;
      fileTypeField = document.file_type;
      reservationId = document.reservation_id;
    } else {
      // Check if this is a legacy document request
      const nameParam = url.searchParams.get("name");
      if (nameParam) {
        const reservation = await prisma.reservation.findUnique({
          where: { id },
          select: { id: true, user_id: true, manual_documents: true }
        });
        if (reservation && reservation.manual_documents) {
          const docs = Array.isArray(reservation.manual_documents)
            ? reservation.manual_documents
            : JSON.parse(reservation.manual_documents as string);
          const legacyDoc = docs.find((d: any) => d.name === nameParam);
          if (legacyDoc) {
            documentName = legacyDoc.name;
            base64Content = legacyDoc.base64 || legacyDoc.content || legacyDoc.base64_content || (legacyDoc.url?.startsWith("data:") ? legacyDoc.url : "");
            fileTypeField = legacyDoc.fileType || legacyDoc.file_type || null;
            reservationId = reservation.id;
          }
        }
      }
    }

    if (!base64Content) {
      return new NextResponse("Document not found", { status: 404 });
    }

    // Check if user is either ADMIN, LEGAL or the OWNER of the reservation
    const user = session.user as any;
    if (user.role !== "ADMIN" && user.role !== "LEGAL") {
        const reservation = await prisma.reservation.findUnique({
            where: { id: reservationId },
            select: { user_id: true }
        });
        if (!reservation || reservation.user_id !== user.id) {
            return new NextResponse("Forbidden", { status: 403 });
        }
    }

    // Convert base64 to Buffer
    const base64Data = base64Content.includes(",") 
        ? base64Content.split(",")[1] 
        : base64Content;
    const buffer = Buffer.from(base64Data, 'base64');

    // DETECCIÓN ROBUSTA DE TIPO DE ARCHIVO (Nombre primero, luego Magic Numbers)
    let contentType = "application/octet-stream";
    let detectedExtension = "";

    const nameLower = documentName.toLowerCase();
    if (nameLower.endsWith(".pdf")) {
        contentType = "application/pdf";
        detectedExtension = "pdf";
    } else if (nameLower.endsWith(".png")) {
        contentType = "image/png";
        detectedExtension = "png";
    } else if (nameLower.endsWith(".jpg") || nameLower.endsWith(".jpeg")) {
        contentType = "image/jpeg";
        detectedExtension = "jpg";
    } else if (nameLower.endsWith(".webp")) {
        contentType = "image/webp";
        detectedExtension = "webp";
    } else if (nameLower.endsWith(".docx")) {
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        detectedExtension = "docx";
    } else if (nameLower.endsWith(".xlsx")) {
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        detectedExtension = "xlsx";
    } else {
        // Fallback: Magic Numbers
        const header = buffer.subarray(0, 8).toString('hex');
        if (header.startsWith("25504446")) {
            contentType = "application/pdf";
            detectedExtension = "pdf";
        } else if (header.startsWith("89504e47")) {
            contentType = "image/png";
            detectedExtension = "png";
        } else if (header.startsWith("ffd8ff")) {
            contentType = "image/jpeg";
            detectedExtension = "jpg";
        } else if (header.startsWith("52494646")) {
            contentType = "image/webp";
            detectedExtension = "webp";
        } else if (header.startsWith("504b0304")) {
            contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            detectedExtension = "docx";
        }
    }

    if (fileTypeField && contentType === "application/octet-stream") {
        contentType = fileTypeField;
    }

    // Asegurar que el nombre tenga la extensión correcta para que Windows/Android lo reconozcan
    let filename = documentName;
    if (detectedExtension && !filename.toLowerCase().endsWith(`.${detectedExtension}`)) {
        filename = `${filename}.${detectedExtension}`;
    }

    // Normalizar el nombre del archivo para la sección estándar de filename del encabezado
    // (removiendo caracteres no-ASCII para prevenir errores de Node/HTTP)
    const asciiFilename = filename
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remover tildes/acentos
      .replace(/[^\x20-\x7E]/g, "") // quitar no-ASCII
      .replace(/"/g, '\\"'); // escapar comillas dobles

    const dispositionMode = forceDownload ? "attachment" : "inline";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${dispositionMode}; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving document:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
