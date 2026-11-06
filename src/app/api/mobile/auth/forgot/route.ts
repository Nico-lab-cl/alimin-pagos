import { z } from "zod";
import { requestPasswordReset } from "@/actions/user";
import { falla, ipDe, respuesta, superaLimite } from "@/lib/movil/http";

const Cuerpo = z.object({ email: z.string().email() });

/**
 * Recuperar contrasena desde la app: el mismo flujo del portal (correo por n8n
 * con un link a /reset-password). Responde igual exista o no el correo, para no
 * revelar quien es cliente.
 */
export async function POST(request: Request) {
  const parsed = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return falla(400, "datos_invalidos", "Escribe el correo con que reservaste.");

  if (superaLimite(`forgot:${ipDe(request)}`, 5, 15 * 60 * 1000)) {
    return falla(429, "demasiados_intentos", "Ya pediste varios correos. Espera unos minutos.");
  }

  const resultado = await requestPasswordReset(parsed.data.email);
  if (resultado.error) return falla(500, "error_servidor", "No pudimos enviar el correo. Inténtalo de nuevo.");

  return respuesta({ ok: true, mensaje: "Si el correo está registrado, te llegará un link para crear una contraseña nueva." });
}
