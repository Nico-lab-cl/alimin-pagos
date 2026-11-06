import { prisma } from "@/lib/prisma";
import { falla, noAutorizado, respuesta, usuarioDeLaPeticion } from "@/lib/movil/http";

/** Avisos del cliente, los mismos que ve en el portal (los 50 mas recientes). */
export async function GET(request: Request) {
  const usuario = await usuarioDeLaPeticion(request);
  if (!usuario) return noAutorizado();

  try {
    const notifications = await prisma.notification.findMany({
      where: { user_id: usuario.id },
      orderBy: { created_at: "desc" },
      take: 50,
      select: { id: true, type: true, title: true, message: true, read: true, created_at: true },
    });
    return respuesta({ notifications, unread: notifications.filter((n) => !n.read).length });
  } catch (error) {
    console.error("[mobile/notifications]", error);
    return falla(500, "error_servidor", "No pudimos cargar tus avisos.");
  }
}
