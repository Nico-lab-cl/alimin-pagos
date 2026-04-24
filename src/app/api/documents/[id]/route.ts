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

  try {
    const document = await prisma.reservationDocument.findUnique({
      where: { id },
    });

    if (!document) {
      return new NextResponse("Document not found", { status: 404 });
    }

    // Check if user is either ADMIN or the OWNER of the reservation
    const user = session.user as any;
    if (user.role !== "ADMIN") {
        const reservation = await prisma.reservation.findUnique({
            where: { id: document.reservation_id },
            select: { user_id: true }
        });
        if (!reservation || reservation.user_id !== user.id) {
            return new NextResponse("Forbidden", { status: 403 });
        }
    }

    // Convert base64 to Buffer
    const base64Data = document.base64_content.includes(",") 
        ? document.base64_content.split(",")[1] 
        : document.base64_content;
    const buffer = Buffer.from(base64Data, 'base64');

    // DETECCIÓN ROBUSTA DE TIPO DE ARCHIVO (Magic Numbers)
    let contentType = document.file_type || "application/octet-stream";
    let detectedExtension = "";

    // Leer los primeros bytes para identificar el archivo
    const header = buffer.subarray(0, 8).toString('hex'); // Leemos 8 bytes para más precisión
    
    if (header.startsWith("25504446")) { // %PDF
        contentType = "application/pdf";
        detectedExtension = "pdf";
    } else if (header.startsWith("89504e47")) { // .PNG
        contentType = "image/png";
        detectedExtension = "png";
    } else if (header.startsWith("ffd8ff")) { // JPEG
        contentType = "image/jpeg";
        detectedExtension = "jpg";
    } else if (header.startsWith("52494646")) { // WebP/RIFF
        contentType = "image/webp";
        detectedExtension = "webp";
    } else if (header.startsWith("504b0304")) { // ZIP / DOCX / XLSX
        // Por defecto para office moderno si no sabemos cuál es
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        detectedExtension = "docx";
    } else if (header.startsWith("d0cf11e0")) { // DOC antiguo
        contentType = "application/msword";
        detectedExtension = "doc";
    }

    // Asegurar que el nombre tenga la extensión correcta para que Windows/Android lo reconozcan
    let filename = document.name;
    if (detectedExtension && !filename.toLowerCase().endsWith(`.${detectedExtension}`)) {
        filename = `${filename}.${detectedExtension}`;
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving document:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
