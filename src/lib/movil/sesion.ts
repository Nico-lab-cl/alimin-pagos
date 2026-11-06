import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Sesion de la app movil de clientes (Alimin app). La app no usa la cookie de
 * NextAuth: recibe un token firmado al ingresar y lo manda en cada peticion
 * como `Authorization: Bearer <token>`.
 *
 * Cambiar la contrasena invalida los tokens emitidos antes (se compara contra
 * `password_changed_at`), asi que no hace falta una tabla de sesiones.
 */

const DURACION_DIAS = 30;
const EMISOR = "pagos.aliminspa.cl";
const AUDIENCIA = "alimin-app";

function clave() {
  const secreto = process.env.MOBILE_JWT_SECRET || process.env.AUTH_SECRET;
  if (!secreto) throw new Error("Falta MOBILE_JWT_SECRET o AUTH_SECRET para firmar la sesion de la app");
  // Prefijo propio: un token de la app nunca sirve como cookie del portal ni al reves.
  return new TextEncoder().encode(`alimin-app:${secreto}`);
}

export type UsuarioMovil = {
  id: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
};

export async function emitirTokenMovil(userId: string) {
  const vence = new Date(Date.now() + DURACION_DIAS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ typ: "movil" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(EMISOR)
    .setAudience(AUDIENCIA)
    .setIssuedAt()
    .setExpirationTime(Math.floor(vence.getTime() / 1000))
    .sign(clave());
  return { token, expiresAt: vence.toISOString() };
}

/** Usuario dueno del token, o null si el token no sirve (vencido, mal firmado, clave cambiada). */
export async function usuarioDelToken(token: string): Promise<UsuarioMovil | null> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, clave(), {
      issuer: EMISOR,
      audience: AUDIENCIA,
      algorithms: ["HS256"],
    }));
  } catch {
    return null;
  }
  if (payload.typ !== "movil" || !payload.sub) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, must_change_password: true, password_changed_at: true },
  });
  if (!user || user.role !== "USER") return null;

  // iat viene en segundos y password_changed_at en milisegundos: el margen de 1 s
  // evita botar el token que se emite justo despues de cambiar la clave.
  const emitidoMs = (payload.iat || 0) * 1000;
  if (user.password_changed_at && user.password_changed_at.getTime() > emitidoMs + 1000) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    mustChangePassword: !!user.must_change_password,
  };
}

/**
 * Valida correo y contrasena igual que el login del portal (src/auth.ts), pero
 * solo con correo y solo para clientes: la app de postventa es otra.
 */
export async function verificarCredenciales(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return { ok: false as const, motivo: "credenciales" as const };

  const coincide = await bcrypt.compare(password, user.password);
  if (!coincide) return { ok: false as const, motivo: "credenciales" as const };
  if (user.role !== "USER") return { ok: false as const, motivo: "no-cliente" as const };

  return { ok: true as const, user };
}
