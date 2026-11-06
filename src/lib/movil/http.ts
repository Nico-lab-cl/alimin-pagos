import { usuarioDelToken, type UsuarioMovil } from "@/lib/movil/sesion";

/**
 * Piezas comunes de los endpoints /api/mobile/*: respuestas JSON sin cache,
 * errores con un codigo estable para la app y lectura del token Bearer.
 */

export function respuesta(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** `codigo` es lo que la app usa para decidir que mostrar; `mensaje` se le puede mostrar al cliente. */
export function falla(status: number, codigo: string, mensaje: string) {
  return respuesta({ error: { codigo, mensaje } }, status);
}

export function noAutorizado() {
  return falla(401, "sesion_invalida", "Tu sesión terminó. Vuelve a ingresar.");
}

export function tokenDe(request: Request): string | null {
  const m = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function usuarioDeLaPeticion(request: Request): Promise<UsuarioMovil | null> {
  const token = tokenDe(request);
  return token ? usuarioDelToken(token) : null;
}

export function ipDe(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "desconocida";
}

/**
 * Limite de intentos en memoria, por instancia. Alcanza para frenar a alguien
 * probando claves contra un correo; no reemplaza un limite en el proxy.
 */
const intentos = new Map<string, { cuenta: number; reinicio: number }>();

export function superaLimite(llave: string, maximo: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  const actual = intentos.get(llave);
  if (!actual || actual.reinicio < ahora) {
    intentos.set(llave, { cuenta: 1, reinicio: ahora + ventanaMs });
    if (intentos.size > 5000) {
      for (const [k, v] of intentos) if (v.reinicio < ahora) intentos.delete(k);
    }
    return false;
  }
  actual.cuenta += 1;
  return actual.cuenta > maximo;
}
