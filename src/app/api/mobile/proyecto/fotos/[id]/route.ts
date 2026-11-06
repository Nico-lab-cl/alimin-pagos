import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { filtroReservasDelUsuario } from "@/lib/coTitulares";
import { faltaMigracionMiProyecto } from "@/lib/miProyecto";
import { usuarioDeLaPeticion } from "@/lib/movil/http";

/**
 * Una foto de "Mi proyecto". La ven los clientes con terreno en ese proyecto
 * (token de la app) y los admin con acceso al proyecto (cookie del portal,
 * para la vista previa en /admin/proyecto-app).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  let foto;
  try {
    foto = await prisma.projectPhoto.findUnique({
      where: { id },
      select: { mime_type: true, base64_content: true, project: { select: { id: true, slug: true } } },
    });
  } catch (error) {
    if (faltaMigracionMiProyecto(error)) return new Response("Not found", { status: 404 });
    throw error;
  }
  if (!foto) return new Response("Not found", { status: 404 });

  let permitido = false;
  const movil = await usuarioDeLaPeticion(request);
  if (movil) {
    const reserva = await prisma.reservation.findFirst({
      where: { ...(await filtroReservasDelUsuario(movil.id)), project_id: foto.project.id, status: { in: ["active", "COMPLETED"] } },
      select: { id: true },
    });
    permitido = !!reserva;
  } else {
    const session = await auth();
    const user = session?.user as { role?: string; allowedProjects?: string[] | null } | undefined;
    permitido =
      user?.role === "ADMIN" &&
      (!Array.isArray(user.allowedProjects) || user.allowedProjects.includes(foto.project.slug));
  }
  if (!permitido) return new Response("Forbidden", { status: 403 });

  return new Response(Buffer.from(foto.base64_content, "base64"), {
    headers: {
      "Content-Type": foto.mime_type,
      // Una foto nunca cambia de contenido (editarla es subir otra), asi que la
      // app la puede guardar; "private" para que ningun proxy la comparta.
      "Cache-Control": "private, max-age=604800, immutable",
    },
  });
}
