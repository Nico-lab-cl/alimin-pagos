/**
 * Todo lo que el cliente ve en "Mis Documentos", armado en un solo lugar.
 *
 * Antes esto estaba escrito dos veces —una en `getUserLots` para el portal y
 * otra en `getClientPOV` para la vista que usa postventa— y las dos copias se
 * desincronizaron: la vista del admin seguía mostrando el diseño viejo con los
 * datos nuevos. Ahora las dos llaman acá.
 *
 * La pantalla ya no es una grilla de tarjetas sino cuatro tablas:
 *
 *   cuotas        una fila por cuota pagada, de la más reciente a la más
 *                 antigua, con su recibo y el comprobante que subió el cliente.
 *   otrosPagos    reserva, pie, gastos operacionales y abono de intereses:
 *                 cargos que no pertenecen al plan de cuotas.
 *   pagosSubidos  solo lo que envió el cliente. Es el único lugar donde puede
 *                 revisar sus propias transferencias sin mezclarlas con los
 *                 recibos que emitimos nosotros.
 *   archivos      contratos, certificados y fichas.
 */
import {
  SCOPE_LABELS,
  buildReceiptDocName,
  buildOfficialReceiptFileName,
  buildOfficialReceiptTitle,
  comprobanteCubreCuota,
  conceptSortKey,
  fechaDePagoComprobante,
  isLegacyStoredReceiptDoc,
  receiptFileType,
  receiptHasFile,
} from "@/lib/receiptDocs";

/** Un archivo descargable, con lo que hace falta para abrirlo o bajarlo. */
export type ArchivoCliente = {
  /** Cómo se llama en pantalla. */
  nombre: string;
  /** Cómo se llama al descargarlo. */
  archivo: string;
  url: string;
  fileType: string;
};

export type FilaCuota = {
  numero: number;
  /** Siempre "Cuota NN": una fila por cuota, con su propio número. */
  etiqueta: string;
  /** "2-4" cuando esta cuota se pagó junto con otras en una sola transferencia. */
  agrupadaCon: string | null;
  /** Vencimiento pactado: a qué mes corresponde. */
  vencimiento: Date | null;
  /** Fecha de la transferencia. NULL en las cuotas migradas o registradas a mano. */
  fechaPago: Date | null;
  monto: number;
  recibo: ArchivoCliente;
  /** El respaldo que subió el cliente, si es que hay. */
  comprobante: ArchivoCliente | null;
};

export type FilaOtroPago = {
  concepto: string;
  fechaPago: Date | null;
  monto: number;
  recibo: ArchivoCliente;
  comprobante: ArchivoCliente | null;
  orden: number;
};

export type FilaPagoSubido = {
  /** A qué se aplicó: "Cuota 07", "Pie", "Gastos Operacionales". */
  aplicadoA: string;
  fechaPago: Date | null;
  monto: number;
  archivo: ArchivoCliente;
  orden: number;
};

export type DocumentosCliente = {
  cuotas: FilaCuota[];
  otrosPagos: FilaOtroPago[];
  pagosSubidos: FilaPagoSubido[];
  archivos: (ArchivoCliente & { categoria: string; fecha: Date | null })[];
  /**
   * Lista plana de todo, como la devolvía antes esta función. El panel nuevo no
   * la usa, pero el dashboard sigue buscando ahí el contrato y el certificado.
   */
  planos: any[];
};

/** Scopes que no son cuotas: van en su propia pestaña. */
const SCOPES_SUELTOS = ["RESERVA", "PIE", "GASTOS", "MORA"];

function archivoDelRecibo(receipt: any, lotNumber: string): ArchivoCliente {
  return {
    nombre: buildOfficialReceiptTitle(receipt),
    archivo: buildOfficialReceiptFileName({ ...receipt, lotNumber }),
    url: `/api/documents/official-${receipt.id}`,
    fileType: "application/pdf",
  };
}

function archivoDelComprobante(receipt: any): ArchivoCliente | null {
  if (!receiptHasFile(receipt.receipt_url)) return null;
  const { ext, fileType } = receiptFileType(receipt.receipt_url);
  const archivo = buildReceiptDocName(receipt, ext);
  return {
    nombre: archivo.replace(/\.[^.]+$/, "").replace(/_/g, " "),
    archivo,
    url: `/api/documents/${receipt.id}`,
    fileType,
  };
}

/** Categoría de un documento que no es recibo ni comprobante. */
function categoriaArchivo(doc: { name?: string | null; category?: string | null }): string {
  const texto = `${doc.name || ""} ${doc.category || ""}`.toLowerCase();
  if (texto.includes("contrato") || texto.includes("promesa")) return "Contratos";
  if (texto.includes("certificado") || texto.includes("inscripcion")) return "Certificados";
  return "Fichas";
}

const aFecha = (v: any): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function construirDocumentosCliente(opts: {
  reservation: any;
  lotNumber: string;
  /** Monto pactado de cada cuota pagada, por número de cuota. */
  montosPorCuota: Record<number, number>;
  /** Vencimiento pactado de cada cuota pagada, por número de cuota. */
  vencimientosPorCuota: Record<number, string>;
}): DocumentosCliente {
  const { reservation: res, lotNumber, montosPorCuota, vencimientosPorCuota } = opts;

  // Solo los aprobados. Un comprobante en revisión todavía no respalda nada, y
  // uno rechazado no corresponde mostrarlo como pago.
  const aprobados = (res.receipts || []).filter(
    (r: any) => r.status === "APPROVED" || !r.status
  );

  // ------------------------------------------------------------------ cuotas
  const cuotas: FilaCuota[] = [];
  const pagadas = res.installments_paid || 0;

  for (let n = pagadas; n >= 1; n--) {
    const origen = aprobados.find((r: any) => comprobanteCubreCuota(r, n));

    // El recibo de una cuota SIN comprobante detrás (historial migrado, pago
    // registrado a mano) se emite igual, desde los datos de la reserva: lo
    // emitimos nosotros, no depende de que el cliente haya subido su
    // transferencia.
    const recibo = origen
      ? archivoDelRecibo(origen, lotNumber)
      : {
          nombre: buildOfficialReceiptTitle({ nominal_installment_number: n }),
          archivo: buildOfficialReceiptFileName({
            scope: "INSTALLMENT",
            lotNumber,
            nominal_installment_number: n,
          }),
          url: `/api/documents/official-cuota-${res.id}-${n}`,
          fileType: "application/pdf",
        };

    cuotas.push({
      numero: n,
      // Cada fila lleva SU numero de cuota, siempre. Cuando un solo pago cubrio
      // varias (un rango "2-4"), las tres filas apuntan al mismo archivo pero
      // antes las tres se rotulaban "Cuotas 2-4" y parecian la misma fila
      // repetida tres veces.
      etiqueta: `Cuota ${String(n).padStart(2, "0")}`,
      // Si vino dentro de un pago que cubrio varias cuotas, se dice cuál: es la
      // explicacion de por que esas filas comparten recibo y comprobante.
      agrupadaCon: origen?.nominal_installment_range || null,
      vencimiento: aFecha(vencimientosPorCuota[n]),
      fechaPago: origen ? fechaDePagoComprobante(origen) : null,
      // El monto PACTADO de esta cuota, no el total del comprobante: una sola
      // transferencia puede cubrir varias cuotas, y usar su total repetía la
      // suma completa en cada fila.
      monto: montosPorCuota[n] || 0,
      recibo,
      comprobante: origen ? archivoDelComprobante(origen) : null,
    });
  }

  // ------------------------------------------------------------- otros pagos
  const otrosPagos: FilaOtroPago[] = aprobados
    .filter((r: any) => SCOPES_SUELTOS.includes(r.scope))
    .map((r: any) => ({
      concepto: SCOPE_LABELS[r.scope] || r.scope,
      fechaPago: fechaDePagoComprobante(r),
      monto: r.amount_clp || 0,
      recibo: archivoDelRecibo(r, lotNumber),
      comprobante: archivoDelComprobante(r),
      orden: conceptSortKey(r),
    }))
    .sort((a: FilaOtroPago, b: FilaOtroPago) => a.orden - b.orden);

  // ----------------------------------------------------------- pagos subidos
  // Todo lo que envió el cliente, sin importar a qué se aplicó. Es su registro
  // de lo que mandó.
  const pagosSubidos: FilaPagoSubido[] = aprobados
    .filter((r: any) => receiptHasFile(r.receipt_url))
    .map((r: any) => {
      const archivo = archivoDelComprobante(r)!;
      const aplicadoA = SCOPES_SUELTOS.includes(r.scope)
        ? SCOPE_LABELS[r.scope] || r.scope
        : r.nominal_installment_range
          ? `Cuotas ${r.nominal_installment_range}`
          : r.nominal_installment_number
            ? `Cuota ${String(r.nominal_installment_number).padStart(2, "0")}`
            : "Pago";
      return {
        aplicadoA,
        fechaPago: fechaDePagoComprobante(r),
        monto: r.amount_clp || 0,
        archivo,
        orden: conceptSortKey(r),
      };
    })
    .sort((a: FilaPagoSubido, b: FilaPagoSubido) => {
      const fa = a.fechaPago?.getTime() || 0;
      const fb = b.fechaPago?.getTime() || 0;
      return fb - fa;
    });

  // ---------------------------------------------------------------- archivos
  const archivos: (ArchivoCliente & { categoria: string; fecha: Date | null })[] = [];

  // Documentos guardados. Se dejan fuera los recibos VIEJOS que el portal
  // generaba con cada aprobación: hoy el recibo es uno solo y se emite al vuelo.
  for (const d of res.documents || []) {
    if (isLegacyStoredReceiptDoc(d.name)) continue;
    archivos.push({
      nombre: d.name,
      archivo: d.name,
      url: `/api/documents/${d.id}`,
      fileType: d.file_type || "application/octet-stream",
      categoria: categoriaArchivo(d),
      fecha: aFecha(d.created_at),
    });
  }

  // Documentos cargados a mano (formato antiguo, guardados en la reserva).
  if (res.manual_documents) {
    try {
      const parsed = Array.isArray(res.manual_documents)
        ? res.manual_documents
        : JSON.parse(res.manual_documents as string);
      for (const d of parsed) {
        archivos.push({
          nombre: d.name,
          archivo: d.name,
          url: `/api/documents/${res.id}?name=${encodeURIComponent(d.name)}`,
          fileType: d.fileType || d.file_type || "application/octet-stream",
          categoria: categoriaArchivo(d),
          fecha: aFecha(d.uploadedAt),
        });
      }
    } catch {}
  }

  archivos.sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0));

  // ------------------------------------------------------------------ planos
  // El dashboard busca acá el contrato, el certificado y la ficha.
  const planos = archivos.map((a) => ({
    name: a.nombre,
    fileName: a.archivo,
    category: a.categoria,
    kind: "OTRO",
    uploadedAt: a.fecha,
    fileType: a.fileType,
    url: a.url,
  }));

  return { cuotas, otrosPagos, pagosSubidos, archivos, planos };
}
