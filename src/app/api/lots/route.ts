import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectSlug = searchParams.get("project");

  if (!projectSlug) {
    return NextResponse.json({ error: "Proyecto requerido" }, { status: 400 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { slug: projectSlug },
    });

    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }

    const lots = await prisma.lot.findMany({
      where: { project_id: project.id },
      orderBy: [{ stage: "asc" }, { number: "asc" }],
      include: {
        reservations: {
          where: { status: "active" },
          select: { id: true, name: true, last_name: true },
          take: 1,
        },
      },
    });

    return NextResponse.json({ lots });
  } catch (error) {
    console.error("Error fetching lots:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
