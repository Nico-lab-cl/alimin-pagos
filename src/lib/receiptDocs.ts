/**
 * Nombres y etiquetas de los comprobantes, en un solo lugar.
 *
 * Antes cada pantalla resolvía el nombre con un `scope === "PIE" ? ... : "Cuota"`
 * propio, así que cualquier scope nuevo caía por defecto en "Cuota" y el cliente
 * veía un pago de reserva rotulado como cuota. Acá viven los cuatro conceptos
 * reales de caja y el criterio para distinguir el comprobante OFICIAL de Alimin
 * (el PDF que emite el portal) del respaldo bancario que sube postventa.
 */

/** Conceptos de caja que admite un pago. `INSTALLMENT` es el histórico "cuota". */
export type ReceiptScope = "PIE" | "INSTALLMENT" | "RESERVA" | "GASTOS" | "MORA";

/** Scopes que NO mueven cuotas, pie ni mora: son cargos aparte del plan de pago. */
export const STANDALONE_SCOPES = ["RESERVA", "GASTOS"] as const;

export const SCOPE_LABELS: Record<string, string> = {
  PIE: "Pie",
  INSTALLMENT: "Cuota",
  RESERVA: "Reserva",
  GASTOS: "Gastos Operacionales",
  MORA: "Abono de Intereses",
};

/** Texto que se imprime como concepto en el PDF del comprobante. */
export const SCOPE_CONCEPTS: Record<string, string> = {
  PIE: "Pago de Pie",
  RESERVA: "Pago de Reserva",
  GASTOS: "Gastos Operacionales",
  MORA: "Abono de Intereses",
};

/** Categoría del FinancialLedger que le corresponde a cada scope. */
export const SCOPE_TO_LEDGER_CATEGORY: Record<string, string> = {
  PIE: "PIE",
  INSTALLMENT: "CUOTA",
  RESERVA: "RESERVA",
  GASTOS: "GASTOS",
  MORA: "PENALTY",
};

/** Inversa de SCOPE_TO_LEDGER_CATEGORY: de la categoría de caja al scope del comprobante. */
export const LEDGER_CATEGORY_TO_SCOPE: Record<string, string> = {
  PIE: "PIE",
  CUOTA: "INSTALLMENT",
  RESERVA: "RESERVA",
  GASTOS: "GASTOS",
  PENALTY: "INSTALLMENT",
};

/**
 * Nombre de archivo del comprobante tal como lo ve el cliente.
 * `ext` es la extensión real del archivo (pdf/jpg/png/webp).
 */
export function buildReceiptDocName(
  receipt: {
    scope?: string | null;
    nominal_installment_number?: number | null;
    nominal_installment_range?: string | null;
  },
  ext: string
): string {
  switch (receipt.scope) {
    case "PIE":
      return `Comprobante_Pago_Pie.${ext}`;
    case "RESERVA":
      return `Comprobante_Pago_Reserva.${ext}`;
    case "GASTOS":
      return `Comprobante_Gastos_Operacionales.${ext}`;
    case "MORA":
      return `Comprobante_Abono_Intereses.${ext}`;
    default:
      return receipt.nominal_installment_range
        ? `Comprobante_Pago_Cuotas_${receipt.nominal_installment_range}.${ext}`
        : receipt.nominal_installment_number
          ? `Comprobante_Pago_Cuota_${receipt.nominal_installment_number}.${ext}`
          : `Comprobante_Pago_Cuota.${ext}`;
  }
}

/**
 * Nombre del PDF oficial de Alimin que el portal genera al aprobar/registrar un
 * pago. Lleva los primeros 6 caracteres del id del comprobante, que es lo que
 * después permite cruzarlo con su respaldo bancario.
 */
export function officialReceiptDocName(receiptId: string): string {
  return `Comprobante_Pago_${receiptId.substring(0, 6)}.pdf`;
}

/**
 * ¿Este documento es el comprobante oficial de Alimin de ese pago?
 * Se compara por el fragmento de id, no por el nombre completo, para que siga
 * funcionando si algún día el nombre se hace más descriptivo.
 */
export function isOfficialReceiptDocFor(docName: string, receiptId: string): boolean {
  const name = docName || "";
  // El prefijo evita que un contrato o certificado con seis caracteres
  // coincidentes se confunda con el comprobante de un pago.
  if (!name.startsWith("Comprobante_Pago_")) return false;
  return name.includes(receiptId.substring(0, 6));
}

/**
 * Comprobantes sin archivo digital real: pagos migrados desde la planilla,
 * condonaciones administrativas, o cargos que postventa registró sin tener a
 * mano la transferencia original ("SIN_RESPALDO"). No hay nada que
 * previsualizar ni descargar — en esos casos el respaldo del cliente es el
 * recibo oficial que emite Alimin, no este archivo.
 */
export function receiptHasFile(receiptUrl?: string | null): boolean {
  return (
    !!receiptUrl &&
    !["LEGACY_SYNC", "CONDONACION_ADMIN", "SIN_RESPALDO"].includes(receiptUrl)
  );
}

/** Extensión y mime del comprobante a partir de su data-URL. */
export function receiptFileType(receiptUrl?: string | null): { ext: string; fileType: string } {
  let ext = "pdf";
  let fileType = "application/pdf";
  if (receiptUrl && receiptUrl.startsWith("data:")) {
    const head = receiptUrl.split(";")[0];
    if (head) {
      fileType = head.substring(5);
      if (fileType === "image/png") ext = "png";
      else if (fileType === "image/jpeg") ext = "jpg";
      else if (fileType === "image/webp") ext = "webp";
      else if (fileType === "application/pdf") ext = "pdf";
    }
  }
  return { ext, fileType };
}
