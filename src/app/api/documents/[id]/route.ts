import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": document.file_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(document.name)}"`,
      },
    });
  } catch (error) {
    console.error("Error serving document:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
