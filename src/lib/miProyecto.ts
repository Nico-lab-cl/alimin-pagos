import { prisma } from "@/lib/prisma";

/**
 * "Mi proyecto" de Alimin app: novedades y fotos por proyecto. Este modulo no
 * revisa sesion (lo usan el admin y la API movil, que la revisan antes).
 * Tolera que la migracion 14 todavia no este corrida: sin tablas no hay
 * contenido y el resto del portal sigue igual.
 */

export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
/** Base64 de ~3 MB de imagen. El admin las achica antes de subir, asi que rara vez se acerca. */
export const MAX_BASE64_FOTO = 4_200_000;

export function faltaMigracionMiProyecto(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "P2021" || /project_(posts|photos).*does not exist|does not exist.*project_(posts|photos)/i.test(String(e?.message || ""));
}

/** Separa una data-URL en tipo y contenido, o null si no es una imagen aceptada. */
export function leerFotoDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!TIPOS_FOTO.includes(mime) || m[2].length === 0 || m[2].length > MAX_BASE64_FOTO) return null;
  return { mime, base64: m[2] };
}

export const urlFoto = (id: string) => `/api/mobile/proyecto/fotos/${id}`;

/** Lo publicado de un proyecto, como lo ve el cliente en la app. */
export async function contenidoPublicado(projectId: string) {
  try {
    const [fotos, novedades] = await Promise.all([
      prisma.projectPhoto.findMany({
        where: { project_id: projectId, post_id: null },
        orderBy: [{ is_cover: "desc" }, { sort_order: "asc" }, { created_at: "asc" }],
        select: { id: true, caption: true, is_cover: true },
      }),
      prisma.projectPost.findMany({
        where: { project_id: projectId, status: "PUBLISHED" },
        orderBy: { published_at: "desc" },
        take: 30,
        select: {
          id: true,
          title: true,
          body: true,
          published_at: true,
          photos: { orderBy: { sort_order: "asc" }, select: { id: true, caption: true } },
        },
      }),
    ]);
    return {
      portada: fotos[0] ? urlFoto(fotos[0].id) : null,
      fotos: fotos.map((f) => ({ id: f.id, caption: f.caption, url: urlFoto(f.id) })),
      novedades: novedades.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        publishedAt: n.published_at,
        fotos: n.photos.map((f) => ({ id: f.id, caption: f.caption, url: urlFoto(f.id) })),
      })),
    };
  } catch (error) {
    if (faltaMigracionMiProyecto(error)) return { portada: null, fotos: [], novedades: [] };
    throw error;
  }
}

/** Usuarios (titulares y co-titulares) con una reserva vigente en el proyecto. */
export async function clientesDelProyecto(projectId: string): Promise<string[]> {
  const reservas = await prisma.reservation.findMany({
    where: { project_id: projectId, status: { in: ["active", "COMPLETED"] } },
    select: { user_id: true, coOwners: { select: { user_id: true } } },
  }).catch(async (error) => {
    // Sin la tabla de co-titulares (migracion 13) se avisa solo a los titulares.
    if (!/co_owners/i.test(String(error?.message || ""))) throw error;
    const solo = await prisma.reservation.findMany({
      where: { project_id: projectId, status: { in: ["active", "COMPLETED"] } },
      select: { user_id: true },
    });
    return solo.map((r) => ({ user_id: r.user_id, coOwners: [] as { user_id: string }[] }));
  });
  const ids = new Set<string>();
  for (const r of reservas) {
    ids.add(r.user_id);
    for (const c of r.coOwners) ids.add(c.user_id);
  }
  return [...ids];
}
