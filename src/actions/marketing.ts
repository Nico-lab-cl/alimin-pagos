"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function getProjectEmails(projectSlug: string) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const project = await prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true, name: true }
    });

    if (!project) return { error: "Proyecto no encontrado" };

    const reservations = await prisma.reservation.findMany({
      where: { 
        project_id: project.id,
        status: { not: "cancelled" }
      },
      select: {
        name: true,
        last_name: true,
        email: true,
        user: {
            select: {
                email: true
            }
        }
      }
    });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emails = reservations.map(r => ({
      name: `${r.name} ${r.last_name || ""}`.trim(),
      email: (r.user?.email && emailRegex.test(r.user.email)) ? r.user.email : r.email
    })).filter(e => e.email && emailRegex.test(e.email));

    // Remove duplicates
    const uniqueEmails = Array.from(new Set(emails.map(e => e.email)))
      .map(email => emails.find(e => e.email === email)!);

    return { 
      success: true, 
      projectName: project.name,
      emails: uniqueEmails 
    };
  } catch (error) {
    console.error("Error fetching project emails:", error);
    return { error: "Error al obtener correos" };
  }
}

// El envío masivo real vive en src/actions/email.ts (webhook a n8n -> Gmail de
// postventa). Este archivo ya no tiene un sendBulkEmail: el que había antes
// era un simulacro que devolvía éxito sin mandar nada, y dejarlo al lado del
// módulo real era la receta para que alguien lo invocara pensando que servía.
