import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/notifications";

/**
 * Avisos al cliente: lo deja en su bandeja (portal y Alimin app) y le manda
 * la notificacion push al telefono si tiene uno registrado.
 *
 * - `ruta` es la pantalla de la app que se abre al tocar la notificacion.
 * - Nunca lanza: el aviso va despues de la operacion que importa (aprobar,
 *   rechazar, publicar) y si falla no debe deshacerla.
 * - El token de un iPhone es de APNs, no de Firebase: hasta tener la llave de
 *   Apple esos telefonos solo reciben el aviso en la bandeja.
 * - Si Firebase dice que el token ya no existe (app desinstalada), se borra.
 */

export type RutaApp = "/inicio" | "/movimientos" | "/proyecto" | "/documentos" | "/avisos" | "/pagar";

export type Aviso = {
  tipo: string;
  titulo: string;
  mensaje: string;
  /** Texto corto para la notificacion del telefono. Si no viene, se usa `mensaje`. */
  push?: string;
  ruta: RutaApp;
};

const TOKEN_MUERTO = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export async function avisarAClientes(userIds: string[], aviso: Aviso, { guardar = true } = {}): Promise<{ guardados: number; push: number }> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return { guardados: 0, push: 0 };

  let guardados = 0;
  try {
    if (guardar) {
      const r = await prisma.notification.createMany({
        data: ids.map((user_id) => ({ user_id, type: aviso.tipo, title: aviso.titulo, message: aviso.mensaje })),
      });
      guardados = r.count;
    }
  } catch (e) {
    console.error("[avisos] no se pudo guardar el aviso:", e);
  }

  let push = 0;
  try {
    const usuarios = await prisma.user.findMany({
      where: { id: { in: ids }, fcm_token: { not: null } },
      select: { id: true, fcm_token: true, last_platform: true },
    });
    for (const u of usuarios) {
      if (!u.fcm_token || u.last_platform === "alimin-app-ios") continue;
      const r = await sendPushNotification({
        token: u.fcm_token,
        title: aviso.titulo,
        body: aviso.push || aviso.mensaje,
        data: { ruta: aviso.ruta, tipo: aviso.tipo },
      });
      if ("success" in r && r.success) push++;
      else if ("code" in r && r.code && TOKEN_MUERTO.has(r.code)) {
        await prisma.user.updateMany({ where: { id: u.id, fcm_token: u.fcm_token }, data: { fcm_token: null } });
      }
    }
  } catch (e) {
    console.error("[avisos] no se pudo mandar el push:", e);
  }

  return { guardados, push };
}

/** $1.234.567 */
export function pesos(monto: number): string {
  return `$${Math.round(monto).toLocaleString("es-CL")}`;
}
