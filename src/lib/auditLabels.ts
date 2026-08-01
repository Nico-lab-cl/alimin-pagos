/**
 * Etiquetas en español para la pantalla de Auditoría.
 * Compartido entre el server action (getAuditLogs) y la pantalla /admin/audit,
 * para que la traducción de "entidad" y "origen" quede en un solo lugar.
 */

export type EntityGroupKey = "RESERVA" | "LOTE" | "CAJA" | "DOCUMENTO" | "COMPROBANTE" | "PROYECTO" | "SINCRONIZACION";

export const ENTITY_GROUPS: { key: EntityGroupKey; label: string; matches: string[] }[] = [
  { key: "RESERVA", label: "Cliente / Reserva", matches: ["Reservation", "RESERVATION"] },
  { key: "LOTE", label: "Lote", matches: ["Lot", "LOT"] },
  { key: "CAJA", label: "Movimiento de Caja", matches: ["FinancialLedger", "FINANCIALLEDGER"] },
  { key: "DOCUMENTO", label: "Documento", matches: ["ReservationDocument", "RESERVATIONDOCUMENT"] },
  { key: "COMPROBANTE", label: "Comprobante de pago", matches: ["PaymentReceipt", "PAYMENTRECEIPT"] },
  { key: "PROYECTO", label: "Proyecto", matches: ["Project", "PROJECT"] },
  { key: "SINCRONIZACION", label: "Sincronización Lomas", matches: ["SyncLomas", "SYNCLOMAS"] },
];

/**
 * Grupos cuyo audit log guarda el ID de la RESERVA en entity_id (no el ID de la
 * fila borrada). Es el caso de todo lo que pasa por logSystemNote(): al eliminar
 * un comprobante o un documento la fila deja de existir, así que lo que queda
 * registrado —y lo único que permite mostrar el cliente— es el ID de la reserva.
 */
export const GROUPS_KEYED_BY_RESERVATION: EntityGroupKey[] = ["RESERVA", "DOCUMENTO", "COMPROBANTE"];

export function getEntityLabel(rawEntity: string | null | undefined): string {
  if (!rawEntity) return "—";
  const group = ENTITY_GROUPS.find((g) => g.matches.some((m) => m.toUpperCase() === rawEntity.toUpperCase()));
  return group?.label || rawEntity;
}

export function getEntityGroupKey(rawEntity: string): EntityGroupKey | null {
  const group = ENTITY_GROUPS.find((g) => g.matches.some((m) => m.toUpperCase() === rawEntity.toUpperCase()));
  return group?.key || null;
}

export const ACTION_LABELS_ES: Record<string, string> = {
  CREATE: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
  OTHER: "Otro",
};

export const ORIGIN_LABELS = {
  MANUAL: "Postventa",
  AUTOMATICO: "Desarrollador",
} as const;
