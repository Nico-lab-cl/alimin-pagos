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

    const emails = reservations.map(r => ({
      name: `${r.name} ${r.last_name || ""}`.trim(),
      email: r.user?.email || r.email
    })).filter(e => e.email && e.email.includes("@"));

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

export async function sendBulkEmail(data: { projectSlug: string, subject: string, message: string }) {
    const session = await auth();
    const adminUser = session?.user as any;
    if (!session?.user || adminUser?.role !== "ADMIN") {
      return { error: "No autorizado" };
    }

    // In a real scenario, this would trigger an N8N webhook or a Resend API call.
    // For now, we will return success and log the action.
    console.log(`SENDING BULK EMAIL to project ${data.projectSlug}`);
    console.log(`Subject: ${data.subject}`);
    console.log(`Message: ${data.message}`);

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return { success: true };
}
