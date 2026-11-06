import { prisma } from "@/lib/prisma";
import { falla, noAutorizado, respuesta, usuarioDeLaPeticion } from "@/lib/movil/http";

/** Marca un aviso como leido. Solo afecta avisos del propio cliente. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDeLaPeticion(request);
  if (!usuario) return noAutorizado();

  const { id } = await ctx.params;
  const { count } = await prisma.notification.updateMany({
    where: { id, user_id: usuario.id },
    data: { read: true },
  });
  if (count === 0) return falla(404, "no_encontrado", "Ese aviso ya no existe.");

  return respuesta({ ok: true });
}
