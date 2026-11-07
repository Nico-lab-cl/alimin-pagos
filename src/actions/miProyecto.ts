"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clientesDelProyecto, faltaMigracionMiProyecto, leerFotoDataUrl, urlFoto } from "@/lib/miProyecto";
import { avisarAClientes } from "@/lib/avisosCliente";

/**
 * Admin de "Mi proyecto" (/admin/proyecto-app): postventa publica novedades y
 * fotos de cada proyecto para Alimin app. Cada cuenta admin solo toca los
 * proyectos que tiene permitidos (allowed_projects), igual que el resto del panel.
 */

const SIN_MIGRACION = "Falta correr la migración 14_mi_proyecto_app.sql en la base. Hasta entonces no se puede publicar.";

async function proyectoPermitido(projectSlug: string) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string; allowedProjects?: string[] | null } | undefined;
  if (!user || user.role !== "ADMIN") return { error: "No autorizado" as const };
  if (Array.isArray(user.allowedProjects) && !user.allowedProjects.includes(projectSlug)) {
    return { error: "No tienes acceso a este proyecto" as const };
  }
  const project = await prisma.project.findUnique({ where: { slug: projectSlug }, select: { id: true, name: true } });
  if (!project) return { error: "Proyecto no encontrado" as const };
  return { project, userId: user.id || null };
}

function errorDe(error: unknown, contexto: string) {
  if (faltaMigracionMiProyecto(error)) return { error: SIN_MIGRACION };
  console.error(`[miProyecto] ${contexto}:`, error);
  return { error: "No se pudo guardar. Inténtalo de nuevo." };
}

export async function getMiProyectoAdmin(projectSlug: string) {
  const acceso = await proyectoPermitido(projectSlug);
  if ("error" in acceso) return { error: acceso.error };
  try {
    const [fotos, novedades] = await Promise.all([
      prisma.projectPhoto.findMany({
        where: { project_id: acceso.project.id, post_id: null },
        orderBy: [{ is_cover: "desc" }, { sort_order: "asc" }, { created_at: "asc" }],
        select: { id: true, caption: true, is_cover: true },
      }),
      prisma.projectPost.findMany({
        where: { project_id: acceso.project.id },
        orderBy: [{ status: "asc" }, { published_at: "desc" }, { created_at: "desc" }],
        select: {
          id: true, title: true, body: true, status: true, published_at: true, created_at: true,
          photos: { orderBy: { sort_order: "asc" }, select: { id: true } },
        },
      }),
    ]);
    return {
      success: true,
      fotos: fotos.map((f) => ({ id: f.id, caption: f.caption, isCover: f.is_cover, url: urlFoto(f.id) })),
      novedades: novedades.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        status: n.status,
        publishedAt: n.published_at ? n.published_at.toISOString() : null,
        createdAt: n.created_at ? n.created_at.toISOString() : null,
        fotos: n.photos.map((f) => urlFoto(f.id)),
      })),
    };
  } catch (error) {
    if (faltaMigracionMiProyecto(error)) return { error: SIN_MIGRACION, faltaMigracion: true };
    console.error("[miProyecto] getMiProyectoAdmin:", error);
    return { error: "No se pudo cargar el contenido del proyecto." };
  }
}

/**
 * Crea una novedad (borrador o publicada) con sus fotos. Si se publica y
 * `avisar` viene en true, deja un aviso en la app a cada cliente del proyecto.
 */
export async function crearNovedad({
  projectSlug, title, body, publicar, avisar, fotos = [],
}: {
  projectSlug: string; title: string; body: string; publicar: boolean; avisar: boolean; fotos?: string[];
}) {
  const acceso = await proyectoPermitido(projectSlug);
  if ("error" in acceso) return { error: acceso.error };

  const titulo = title.trim();
  const texto = body.trim();
  if (titulo.length < 3 || titulo.length > 160) return { error: "El título debe tener entre 3 y 160 caracteres." };
  if (texto.length < 3) return { error: "Escribe el texto de la novedad." };
  if (fotos.length > 6) return { error: "Una novedad puede tener hasta 6 fotos." };
  const leidas = fotos.map(leerFotoDataUrl);
  if (leidas.some((f) => !f)) return { error: "Alguna foto no es JPG, PNG o WebP, o pesa demasiado." };

  try {
    const post = await prisma.projectPost.create({
      data: {
        project_id: acceso.project.id,
        title: titulo,
        body: texto,
        status: publicar ? "PUBLISHED" : "DRAFT",
        published_at: publicar ? new Date() : null,
        created_by: acceso.userId,
        photos: {
          create: leidas.map((f, i) => ({
            project_id: acceso.project.id,
            mime_type: f!.mime,
            base64_content: f!.base64,
            sort_order: i,
            created_by: acceso.userId,
          })),
        },
      },
      select: { id: true },
    });

    let avisados = 0;
    if (publicar && avisar) avisados = await avisarClientes(acceso.project.id, acceso.project.name, titulo);
    return { success: true, id: post.id, avisados };
  } catch (error) {
    return errorDe(error, "crearNovedad");
  }
}

async function avisarClientes(projectId: string, projectName: string, titulo: string) {
  const usuarios = await clientesDelProyecto(projectId);
  if (usuarios.length === 0) return 0;
  await avisarAClientes(usuarios, {
    tipo: "PROJECT_NEWS",
    titulo: `Novedad en ${projectName}`,
    mensaje: titulo,
    ruta: "/proyecto",
  });
  return usuarios.length;
}

/** Publica un borrador o lo vuelve a borrador (lo saca de la app). */
export async function cambiarEstadoNovedad({ projectSlug, id, publicar, avisar = false }: { projectSlug: string; id: string; publicar: boolean; avisar?: boolean }) {
  const acceso = await proyectoPermitido(projectSlug);
  if ("error" in acceso) return { error: acceso.error };
  try {
    const post = await prisma.projectPost.findFirst({ where: { id, project_id: acceso.project.id }, select: { id: true, title: true, published_at: true } });
    if (!post) return { error: "La novedad ya no existe." };
    await prisma.projectPost.update({
      where: { id },
      data: { status: publicar ? "PUBLISHED" : "DRAFT", published_at: publicar ? post.published_at || new Date() : post.published_at },
    });
    const avisados = publicar && avisar ? await avisarClientes(acceso.project.id, acceso.project.name, post.title) : 0;
    return { success: true, avisados };
  } catch (error) {
    return errorDe(error, "cambiarEstadoNovedad");
  }
}

export async function eliminarNovedad({ projectSlug, id }: { projectSlug: string; id: string }) {
  const acceso = await proyectoPermitido(projectSlug);
  if ("error" in acceso) return { error: acceso.error };
  try {
    const { count } = await prisma.projectPost.deleteMany({ where: { id, project_id: acceso.project.id } });
    return count ? { success: true } : { error: "La novedad ya no existe." };
  } catch (error) {
    return errorDe(error, "eliminarNovedad");
  }
}

export async function subirFotoGaleria({ projectSlug, foto, caption }: { projectSlug: string; foto: string; caption?: string }) {
  const acceso = await proyectoPermitido(projectSlug);
  if ("error" in acceso) return { error: acceso.error };
  const leida = leerFotoDataUrl(foto);
  if (!leida) return { error: "La foto tiene que ser JPG, PNG o WebP y pesar menos de 3 MB." };
  try {
    const ultima = await prisma.projectPhoto.findFirst({
      where: { project_id: acceso.project.id, post_id: null },
      orderBy: { sort_order: "desc" },
      select: { sort_order: true },
    });
    const hayFotos = !!ultima;
    await prisma.projectPhoto.create({
      data: {
        project_id: acceso.project.id,
        caption: caption?.trim().slice(0, 160) || null,
        mime_type: leida.mime,
        base64_content: leida.base64,
        sort_order: (ultima?.sort_order ?? -1) + 1,
        // La primera foto de la galeria queda de portada.
        is_cover: !hayFotos,
        created_by: acceso.userId,
      },
    });
    return { success: true };
  } catch (error) {
    return errorDe(error, "subirFotoGaleria");
  }
}

/** Guarda el orden de la galeria (ids de arriba a abajo) y cual es la portada. */
export async function ordenarGaleria({ projectSlug, orden, portadaId }: { projectSlug: string; orden: string[]; portadaId: string | null }) {
  const acceso = await proyectoPermitido(projectSlug);
  if ("error" in acceso) return { error: acceso.error };
  try {
    await prisma.$transaction(
      orden.map((id, i) =>
        prisma.projectPhoto.updateMany({
          where: { id, project_id: acceso.project.id, post_id: null },
          data: { sort_order: i, is_cover: id === portadaId },
        })
      )
    );
    return { success: true };
  } catch (error) {
    return errorDe(error, "ordenarGaleria");
  }
}

export async function eliminarFoto({ projectSlug, id }: { projectSlug: string; id: string }) {
  const acceso = await proyectoPermitido(projectSlug);
  if ("error" in acceso) return { error: acceso.error };
  try {
    const { count } = await prisma.projectPhoto.deleteMany({ where: { id, project_id: acceso.project.id } });
    return count ? { success: true } : { error: "La foto ya no existe." };
  } catch (error) {
    return errorDe(error, "eliminarFoto");
  }
}
