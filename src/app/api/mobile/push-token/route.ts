import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { falla, noAutorizado, respuesta, usuarioDeLaPeticion } from "@/lib/movil/http";

const Cuerpo = z.object({
  token: z.string().min(10).max(255),
  platform: z.enum(["android", "ios"]),
});

/**
 * Guarda el token de notificaciones del telefono. Usa el mismo campo que la app
 * de postventa (users.fcm_token): son usuarios distintos, asi que no chocan.
 */
export async function POST(request: Request) {
  const usuario = await usuarioDeLaPeticion(request);
  if (!usuario) return noAutorizado();

  const parsed = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return falla(400, "datos_invalidos", "Token de notificaciones inválido.");

  await prisma.user.update({
    where: { id: usuario.id },
    data: { fcm_token: parsed.data.token, last_platform: `alimin-app-${parsed.data.platform}` },
  });
  return respuesta({ ok: true });
}
