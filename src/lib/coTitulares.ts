import { prisma } from "@/lib/prisma";

/**
 * Co-titulares: la segunda persona que firmo la promesa de un lote. Entra al
 * portal con su propio usuario y recibe los mismos correos y WhatsApp que el
 * titular, pero los pagos siguen viviendo solo en la reserva.
 *
 * Todo lo de aca tolera que la tabla todavia no exista (migracion 13 sin
 * correr): sin tabla no hay co-titulares y el portal sigue igual que antes.
 * Vive fuera de actions/ porque no revisa sesion.
 */

export type CoTitular = {
  id: string;
  reservation_id: string;
  user_id: string;
  name: string;
  rut: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  marital_status: string | null;
  profession: string | null;
  nationality: string | null;
};

/** La tabla nueva todavia no existe en la base (falta correr la migracion 13). */
export function faltaMigracionCoTitulares(error: any): boolean {
  return error?.code === "P2021" || /does not exist/i.test(String(error?.message || ""));
}

/** Reservas en las que este usuario figura como co-titular. */
export async function reservasComoCoTitular(userId: string): Promise<string[]> {
  try {
    const rows = await prisma.reservationCoOwner.findMany({
      where: { user_id: userId },
      select: { reservation_id: true },
    });
    return rows.map((r) => r.reservation_id);
  } catch (error) {
    if (!faltaMigracionCoTitulares(error)) console.error("[co-titulares] lectura fallida:", error);
    return [];
  }
}

/**
 * Filtro de Prisma para "reservas que este usuario puede ver en su portal":
 * las suyas como titular y las que comparte como co-titular.
 */
export async function filtroReservasDelUsuario(userId: string) {
  const compartidas = await reservasComoCoTitular(userId);
  return compartidas.length > 0
    ? { OR: [{ user_id: userId }, { id: { in: compartidas } }] }
    : { user_id: userId };
}

/** ¿Puede este usuario (no admin) ver esta reserva? */
export async function puedeVerReserva(
  userId: string,
  reservation: { id: string; user_id: string } | null | undefined
): Promise<boolean> {
  if (!reservation) return false;
  if (reservation.user_id === userId) return true;
  const compartidas = await reservasComoCoTitular(userId);
  return compartidas.includes(reservation.id);
}

/** Co-titulares de varias reservas de una sola pasada, agrupados por reserva. */
export async function coTitularesPorReserva(reservationIds: string[]): Promise<Map<string, CoTitular[]>> {
  const out = new Map<string, CoTitular[]>();
  if (reservationIds.length === 0) return out;
  try {
    const rows = await prisma.reservationCoOwner.findMany({
      where: { reservation_id: { in: reservationIds } },
      orderBy: { created_at: "asc" },
    });
    for (const row of rows) {
      const lista = out.get(row.reservation_id) || [];
      lista.push(row as CoTitular);
      out.set(row.reservation_id, lista);
    }
  } catch (error) {
    if (!faltaMigracionCoTitulares(error)) console.error("[co-titulares] lectura fallida:", error);
  }
  return out;
}

/** Usuarios co-titulares de una reserva (para notificaciones dentro del portal). */
export async function usuariosCoTitulares(reservationId: string): Promise<string[]> {
  const mapa = await coTitularesPorReserva([reservationId]);
  return (mapa.get(reservationId) || []).map((c) => c.user_id);
}
