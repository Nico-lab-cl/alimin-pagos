import { prisma } from "@/lib/prisma";
import { filtroReservasDelUsuario } from "@/lib/coTitulares";
import { contenidoPublicado } from "@/lib/miProyecto";
import { falla, noAutorizado, respuesta, usuarioDeLaPeticion } from "@/lib/movil/http";

/**
 * "Mi proyecto": novedades publicadas y fotos de cada proyecto donde el cliente
 * tiene un terreno (como titular o co-titular).
 */
export async function GET(request: Request) {
  const usuario = await usuarioDeLaPeticion(request);
  if (!usuario) return noAutorizado();

  try {
    const reservas = await prisma.reservation.findMany({
      where: { ...(await filtroReservasDelUsuario(usuario.id)), status: { in: ["active", "COMPLETED"] } },
      select: { project: { select: { id: true, slug: true, name: true } } },
    });
    const proyectos = [...new Map(reservas.map((r) => [r.project.id, r.project])).values()];

    const contenido = await Promise.all(
      proyectos.map(async (p) => ({ slug: p.slug, name: p.name, ...(await contenidoPublicado(p.id)) }))
    );
    return respuesta({ proyectos: contenido });
  } catch (error) {
    console.error("[mobile/proyectos]", error);
    return falla(500, "error_servidor", "No pudimos cargar las novedades de tu proyecto.");
  }
}
