import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { emitirTokenMovil } from "@/lib/movil/sesion";
import { falla, noAutorizado, respuesta, usuarioDeLaPeticion } from "@/lib/movil/http";

const Cuerpo = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

/**
 * Cambio de contrasena desde la app. Cierra las demas sesiones de la app (los
 * tokens anteriores dejan de servir) y devuelve uno nuevo para este telefono.
 */
export async function POST(request: Request) {
  const usuario = await usuarioDeLaPeticion(request);
  if (!usuario) return noAutorizado();

  const parsed = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return falla(400, "datos_invalidos", "La contraseña nueva debe tener al menos 8 caracteres.");

  const user = await prisma.user.findUnique({ where: { id: usuario.id }, select: { password: true } });
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.password))) {
    return falla(401, "clave_actual", "Tu contraseña actual no coincide.");
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: {
      password: await bcrypt.hash(parsed.data.newPassword, 10),
      must_change_password: false,
      password_changed_at: new Date(),
    },
  });

  const sesion = await emitirTokenMovil(usuario.id);
  return respuesta({ token: sesion.token, expiresAt: sesion.expiresAt });
}
