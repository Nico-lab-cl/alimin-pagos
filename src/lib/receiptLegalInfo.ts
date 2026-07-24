// Identidad legal (razon social/RUT/domicilio) que aparece en el pie del recibo
// oficial de pago (comprobante emitido por Alimin, distinto del comprobante que
// sube el cliente). Cada proyecto puede ser una razon social distinta.
export type ReceiptLegalInfo = {
  legalName: string;
  rut: string;
  address: string;
  contactEmail: string;
};

const LEGAL_INFO_BY_SLUG: Record<string, ReceiptLegalInfo> = {
  "lomas-del-mar": {
    legalName: "Alimin Lomas del Mar SpA.",
    rut: "77.587.618-2",
    address: "Manuel Bulnes 509, Of. 301, Temuco, Chile.",
    contactEmail: "bienesraices@aliminspa.cl",
  },
};

const DEFAULT_LEGAL_INFO: ReceiptLegalInfo = {
  legalName: "Alimin SpA.",
  rut: "77.508.711-0",
  address: "Manuel Bulnes 509, Of. 301, Temuco, Chile.",
  contactEmail: "inmobiliaria@aliminspa.cl",
};

export function getReceiptLegalInfo(projectSlug: string): ReceiptLegalInfo {
  return LEGAL_INFO_BY_SLUG[projectSlug] || DEFAULT_LEGAL_INFO;
}
