/**
 * Todo lo que el cliente ve en "Mis Documentos", armado en un solo lugar.
 *
 * Antes esto estaba escrito dos veces —una en `getUserLots` para el portal y
 * otra en `getClientPOV` para la vista que usa postventa— y las dos copias se
 * desincronizaron: la vista del admin seguía mostrando el diseño viejo con los
 * datos nuevos. Ahora las dos llaman acá.
 *
 * La pantalla ya no es una grilla de tarjetas sino dos tablas:
 *
 *   cuotas      una fila por cuota pagada, de la más reciente a la más antigua,
 *               con el comprobante que emitimos nosotros y el que subió el
 *               cliente, uno al lado del otro.
 *   documentos  todo lo que no es una cuota: reserva, pie, gastos
 *               operacionales, abono de intereses, y el contrato, certificados
 *               y fichas de la propiedad.
 *
 * Las dos columnas de archivo van juntas en cada fila a propósito. Antes lo que
 * subía el cliente vivía en una pestaña aparte, y para saber si su transferencia
 * de la cuota 7 estaba respaldada había que cambiar de pestaña y buscarla.
 */
import {
  SCOPE_LABELS,
  buildReceiptDocName,
  buildOfficialReceiptFileName,
  buildOfficialReceiptTitle,
  comprobanteCubreCuota,
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
  /**
   * Tiene comprobante aprobado pero la ficha NO la cuenta como pagada. Solo se
   * arma para postventa; el cliente nunca ve estas filas.
   */
  noContada?: boolean;
  /** Vencimiento pactado: a qué mes corresponde. */
  vencimiento: Date | null;
  /** Fecha de la transferencia. NULL en las cuotas migradas o registradas a mano. */
  fechaPago: Date | null;
  monto: number;
  recibo: ArchivoCliente;
  /** El respaldo que subió el cliente, si es que hay. */
  comprobante: ArchivoCliente | null;
  /**
   * El pago del que salen los archivos de esta fila. Lo necesita postventa para
   * poder actuar sobre él: quitar el archivo que subió el cliente, o rehacer el
   * recibo. NULL cuando la cuota figura pagada sin ningún pago detrás (historial
   * migrado), que es justo cuando no hay nada que quitar.
   */
  pagoId: string | null;
};

/**
 * Una fila de la pestaña Documentos. Cubre dos cosas a la vez: los pagos que no
 * son cuota (reserva, pie, gastos operacionales, abono de intereses) y los
 * archivos de la propiedad (contrato, certificados, fichas).
 */
export type FilaDocumento = {
  nombre: string;
  /** "Pago", "Contratos", "Certificados" o "Fichas". */
  tipo: string;
  fecha: Date | null;
  /** NULL en los que no son un pago: un contrato no tiene monto. */
  monto: number | null;
  /** El archivo que emitimos nosotros. */
  emitido: ArchivoCliente;
  /** La transferencia que subió el cliente. NULL en los archivos. */
  comprobante: ArchivoCliente | null;
  orden: number;
};

export type DocumentosCliente = {
  cuotas: FilaCuota[];
  documentos: FilaDocumento[];
  /**
   * Lista plana de los archivos. El panel no la usa, pero el dashboard sigue
   * buscando ahí el contrato y el certificado.
   */
  planos: any[];
};

/** Scopes que no son cuotas: van en la pestaña Documentos. */
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
  /**
   * Incluir las cuotas que tienen comprobante pero que la ficha todavía no
   * cuenta como pagadas. Solo las vistas de postventa lo piden.
   */
  incluirNoContadas?: boolean;
}): DocumentosCliente {
  const {
    reservation: res,
    lotNumber,
    montosPorCuota,
    vencimientosPorCuota,
    incluirNoContadas = false,
  } = opts;

  // Solo los aprobados. Un comprobante en revisión todavía no respalda nada, y
  // uno rechazado no corresponde mostrarlo como pago.
  const aprobados = (res.receipts || []).filter(
    (r: any) => r.status === "APPROVED" || !r.status
  );

  // Recibos que postventa sacó de la vista porque quedaron mal emitidos (ver
  // `ocultarReciboOficial`). El PAGO sigue contando igual —cuotas, caja y saldo
  // no cambian—; lo único que desaparece es el papel.
  const visibles = aprobados.filter((r: any) => !r.oculto_at);

  // ------------------------------------------------------------------ cuotas
  const cuotas: FilaCuota[] = [];
  const pagadas = res.installments_paid || 0;

  // Cuotas que TIENEN comprobante pero que la ficha no cuenta como pagadas.
  //
  // Existen: es el desfase que marca la Revisión de Comprobantes. Y hasta ahora
  // eran invisibles en todas las pantallas —el recorrido de abajo solo llega
  // hasta `installments_paid`, y en Documentos no entran porque no son reserva,
  // pie ni gastos—, así que postventa veía en la auditoría que el último
  // comprobante era de la cuota 8 y al abrir los documentos no encontraba nada
  // de la cuota 8.
  //
  // Se muestran SOLO a postventa (`incluirNoContadas`). Al cliente no: su panel
  // dice que pagó 7, y mostrarle una cuota 8 pagada lo contradiría. Cuál de las
  // dos cifras está bien es justamente lo que hay que resolver.
  const noContadas: number[] = [];
  if (incluirNoContadas) {
    const maxConComprobante = aprobados.reduce((max: number, r: any) => {
      const n = r.nominal_installment_range
        ? Number(String(r.nominal_installment_range).split("-")[1])
        : r.nominal_installment_number || 0;
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    for (let n = maxConComprobante; n > pagadas; n--) {
      if (aprobados.some((r: any) => comprobanteCubreCuota(r, n))) noContadas.push(n);
    }
  }

  for (const n of noContadas) {
    const origen = aprobados.find((r: any) => comprobanteCubreCuota(r, n));
    if (!origen) continue;
    cuotas.push({
      numero: n,
      etiqueta: `Cuota ${String(n).padStart(2, "0")}`,
      agrupadaCon: origen.nominal_installment_range || null,
      noContada: true,
      vencimiento: aFecha(vencimientosPorCuota[n]),
      fechaPago: fechaDePagoComprobante(origen),
      monto: origen.amount_clp || 0,
      recibo: archivoDelRecibo(origen, lotNumber),
      comprobante: archivoDelComprobante(origen),
      pagoId: origen.id,
    });
  }

  for (let n = pagadas; n >= 1; n--) {
    // La fecha y el agrupamiento salen del pago aunque su recibo esté oculto:
    // ocultar un papel no borra el hecho de que la cuota se pagó ese día.
    const origen = aprobados.find((r: any) => comprobanteCubreCuota(r, n));
    // Los archivos, en cambio, solo salen de un pago visible.
    const origenVisible = visibles.find((r: any) => comprobanteCubreCuota(r, n));

    // El recibo de una cuota SIN comprobante detrás (historial migrado, pago
    // registrado a mano, o recibo ocultado) se emite igual, desde los datos de
    // la reserva: lo emitimos nosotros, no depende de que el cliente haya
    // subido su transferencia. Si el recibo de un rango se ocultó, cada cuota
    // pasa a tener el suyo, limpio y por separado.
    const recibo = origenVisible
      ? archivoDelRecibo(origenVisible, lotNumber)
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
      agrupadaCon: origenVisible?.nominal_installment_range || null,
      vencimiento: aFecha(vencimientosPorCuota[n]),
      fechaPago: origen ? fechaDePagoComprobante(origen) : null,
      // El monto PACTADO de esta cuota, no el total del comprobante: una sola
      // transferencia puede cubrir varias cuotas, y usar su total repetía la
      // suma completa en cada fila.
      monto: montosPorCuota[n] || 0,
      recibo,
      comprobante: origenVisible ? archivoDelComprobante(origenVisible) : null,
      pagoId: origenVisible?.id || null,
    });
  }

  // ------------------------------------------------------------- documentos
  // Una sola lista con dos clases de fila, porque para el cliente son lo mismo:
  // papeles suyos que no son una cuota.
  //
  //   pagos sueltos  reserva, pie, gastos operacionales y abono de intereses.
  //                  Traen el comprobante que emitimos nosotros y, si la subió,
  //                  la transferencia del cliente.
  //   archivos       contrato, certificados y fichas. Un solo archivo, el que
  //                  emitimos nosotros; ahí nunca hay nada que el cliente suba.
  const documentos: FilaDocumento[] = [];

  const pagosSueltos: FilaDocumento[] = [];
  for (const r of visibles) {
    const esScopeSuelto = SCOPES_SUELTOS.includes(r.scope);

    // Un abono de intereses NO queda guardado con scope "MORA": tanto
    // `registerInterestPayment` como `approveReceiptAsInterestPayment` lo dejan
    // como "INSTALLMENT" sin número ni rango de cuota. Por eso no lo reclama
    // ninguna cuota —`comprobanteCubreCuota` no lo matchea con ninguna— y, si no
    // se lo recogiera acá, el pago se caía de las dos tablas y el cliente no
    // veía por ningún lado que lo hizo.
    const esAbonoDeIntereses =
      r.scope === "INSTALLMENT" &&
      !r.nominal_installment_number &&
      !r.nominal_installment_range;

    if (!esScopeSuelto && !esAbonoDeIntereses) continue;

    pagosSueltos.push({
      nombre: esScopeSuelto
        ? SCOPE_LABELS[r.scope] || r.scope
        : SCOPE_LABELS.MORA,
      tipo: "Pago",
      fecha: fechaDePagoComprobante(r),
      monto: r.amount_clp || 0,
      emitido: archivoDelRecibo(r, lotNumber),
      comprobante: archivoDelComprobante(r),
      // Los pagos primero; los archivos de la propiedad, después.
      orden: 0,
    });
  }
  // Lo más reciente arriba, igual que en la tabla de cuotas.
  pagosSueltos.sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0));
  documentos.push(...pagosSueltos);

  // Los archivos guardados van después de los pagos. Se dejan fuera los recibos
  // VIEJOS que el portal generaba con cada aprobación: hoy el comprobante es uno
  // solo y se emite al vuelo.
  const archivos: (ArchivoCliente & { categoria: string; fecha: Date | null })[] = [];

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

  for (const a of archivos) {
    documentos.push({
      nombre: a.nombre,
      tipo: a.categoria,
      fecha: a.fecha,
      // Un contrato no tiene monto; la celda queda con un guion.
      monto: null,
      emitido: { nombre: a.nombre, archivo: a.archivo, url: a.url, fileType: a.fileType },
      comprobante: null,
      // Después de los pagos, que son los que el cliente consulta seguido.
      orden: 1,
    });
  }

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

  return { cuotas, documentos, planos };
}
