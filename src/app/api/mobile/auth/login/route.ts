import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { emitirTokenMovil, verificarCredenciales } from "@/lib/movil/sesion";
import { falla, ipDe, respuesta, superaLimite } from "@/lib/movil/http";

const Cuerpo = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Ingreso a Alimin app con correo y contrasena. Devuelve el token de la sesion. */
export async function POST(request: Request) {
  const parsed = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return falla(400, "datos_invalidos", "Escribe tu correo y tu contraseña.");

  const email = parsed.data.email.toLowerCase().trim();
  const ip = ipDe(request);
  if (superaLimite(`login:${ip}`, 20, 15 * 60 * 1000) || superaLimite(`login:${email}`, 8, 15 * 60 * 1000)) {
    return falla(429, "demasiados_intentos", "Hiciste muchos intentos. Espera unos minutos y vuelve a probar.");
  }

  const resultado = await verificarCredenciales(email, parsed.data.password);
  if (!resultado.ok) {
    return resultado.motivo === "no-cliente"
      ? falla(403, "no_es_cliente", "Esta app es para clientes. Postventa usa su propia app.")
      : falla(401, "credenciales", "El correo o la contraseña no coinciden.");
  }

  const { user } = resultado;
  const sesion = await emitirTokenMovil(user.id);

  try {
    await prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date(), last_platform: "alimin-app" } });
    await prisma.auditLog.create({
      data: {
        action: "LOGIN",
        entity: "ALIMIN_APP",
        entity_id: user.id,
        user_id: user.id,
        user_email: user.email,
        ip_address: ip,
        user_agent: request.headers.get("user-agent")?.slice(0, 500) || null,
        details: "Ingreso a la app movil de clientes",
      },
    });
  } catch (error) {
    console.error("[mobile/login] No se pudo registrar el ingreso:", error);
  }

  return respuesta({
    token: sesion.token,
    expiresAt: sesion.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      mustChangePassword: !!user.must_change_password,
    },
  });
}
