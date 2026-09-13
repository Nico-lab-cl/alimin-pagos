// Identidad de marca y legal que sale impresa en el recibo oficial de pago (el
// PDF que emitimos nosotros, distinto del comprobante que sube el cliente).
//
// Está todo acá, en un solo objeto por proyecto, a propósito: cuando cambie la
// razón social, el logo o los colores —o cuando entre una inmobiliaria nueva—
// se toca este archivo y nada más. El generador del PDF no sabe de marcas.
export type ReceiptLegalInfo = {
  legalName: string;
  rut: string;
  address: string;
  contactEmail: string;
  /**
   * Archivo del logo dentro de `public/`. Se imprime arriba a la izquierda del
   * recibo. Si el archivo no existe, el recibo cae al nombre del proyecto en
   * texto y se emite igual: nunca se deja a un cliente sin su recibo por un
   * logo faltante.
   */
  logoFile: string;
  /** Color de marca del recibo (títulos, línea del encabezado, timbre). */
  brandColor: string;
};

const LEGAL_INFO_BY_SLUG: Record<string, ReceiptLegalInfo> = {
  "lomas-del-mar": {
    legalName: "Alimin Lomas del Mar SpA.",
    rut: "77.587.618-2",
    address: "Manuel Bulnes 509, Of. 301, Temuco, Chile.",
    contactEmail: "bienesraices@aliminspa.cl",
    logoFile: "logo.png",
    brandColor: "#4EA898",
  },
};

const DEFAULT_LEGAL_INFO: ReceiptLegalInfo = {
  legalName: "Alimin SpA.",
  rut: "77.508.711-0",
  address: "Manuel Bulnes 509, Of. 301, Temuco, Chile.",
  contactEmail: "inmobiliaria@aliminspa.cl",
  logoFile: "logo.png",
  brandColor: "#4EA898",
};

export function getReceiptLegalInfo(projectSlug: string): ReceiptLegalInfo {
  return LEGAL_INFO_BY_SLUG[projectSlug] || DEFAULT_LEGAL_INFO;
}
