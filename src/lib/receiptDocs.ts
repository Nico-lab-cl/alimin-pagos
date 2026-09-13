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
 * Nombre del PDF oficial de Alimin que el portal generaba al aprobar/registrar
 * un pago. Lleva los primeros 6 caracteres del id del comprobante, que es lo
 * que después permite cruzarlo con su respaldo bancario.
 *
 * @deprecated Ese PDF ya no se genera: quedó uno solo, el recibo oficial que se
 * emite al vuelo (ver `buildOfficialReceiptFileName`). El nombre sigue acá
 * porque los archivos viejos siguen guardados y hay que saber reconocerlos para
 * dejar de mostrarlos.
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
 * ¿Este documento guardado es uno de los recibos VIEJOS que emitía el portal?
 *
 * Durante un tiempo cada aprobación guardaba un PDF propio ("Comprobante_Pago_
 * a1b2c3.pdf", con el diseño antiguo verde y dorado) además del recibo oficial
 * que hoy se emite al vuelo con el formato de Lomas del Mar. El cliente
 * terminaba con dos recibos nuestros distintos para el mismo pago, y cuál le
 * tocaba dependía de por dónde hiciera clic.
 *
 * Ya no se generan. Los que quedan guardados se dejan de mostrar con esta
 * función: el archivo sigue intacto en la base por si hay que volver atrás,
 * pero el cliente ve un solo recibo por pago.
 */
export function isLegacyStoredReceiptDoc(docName?: string | null): boolean {
  // Se exige el fragmento de id al final (los 6 primeros caracteres del uuid del
  // comprobante) porque es la firma de los archivos que generaba el portal. Sin
  // esa exigencia, un documento que postventa subiera a mano llamado
  // "Comprobante_Pago_Marzo.pdf" también desaparecería de la vista del cliente.
  return /^Comprobante_(Pago|Abono_Intereses)_[0-9a-f]{6}\.pdf$/i.test(docName || "");
}

/**
 * ¿Este comprobante cubre esa cuota? Una sola transferencia puede pagar un rango
 * ("12-15"), así que no basta con comparar el número.
 *
 * Vive acá y no en `lib/utils` porque `utils` arrastra Capacitor, que no puede
 * entrar en un server action.
 */
export function comprobanteCubreCuota(
  receipt: {
    nominal_installment_number?: number | null;
    nominal_installment_range?: string | null;
  },
  cuota: number
): boolean {
  if (receipt.nominal_installment_number === cuota) return true;
  if (receipt.nominal_installment_range) {
    const [desde, hasta] = String(receipt.nominal_installment_range).split("-").map(Number);
    if (Number.isFinite(desde) && Number.isFinite(hasta)) {
      return cuota >= desde && cuota <= hasta;
    }
  }
  return false;
}

/** Cómo se llama cada concepto dentro del nombre del archivo del recibo. */
const SCOPE_FILE_LABELS: Record<string, string> = {
  PIE: "pie",
  RESERVA: "reserva",
  GASTOS: "gastos_operacionales",
  MORA: "abono_intereses",
};

/**
 * Nombre del archivo del recibo oficial tal como le llega al cliente a su
 * carpeta de Descargas: "Recibo_cuota_12_lote_18.pdf".
 *
 * Lleva el concepto y el lote porque fuera del portal el archivo pierde todo su
 * contexto: un cliente con dos lotes y treinta cuotas pagadas necesita saber
 * cuál es cuál sin abrirlos uno por uno.
 */
export function buildOfficialReceiptFileName(receipt: {
  scope?: string | null;
  lotNumber?: string | number | null;
  nominal_installment_number?: number | null;
  nominal_installment_range?: string | null;
}): string {
  // El número de lote viene a veces ya con su prefijo ("L-18") y a veces pelado
  // ("18"); se normaliza para que el nombre no salga "lote_L-18".
  const lote = String(receipt.lotNumber ?? "")
    .trim()
    .replace(/^l[-\s_]*/i, "");
  const sufijoLote = lote ? `_lote_${lote}` : "";

  const etiquetaScope = receipt.scope ? SCOPE_FILE_LABELS[receipt.scope] : undefined;
  if (etiquetaScope) return `Recibo_${etiquetaScope}${sufijoLote}.pdf`;

  if (receipt.nominal_installment_range) {
    return `Recibo_cuotas_${receipt.nominal_installment_range}${sufijoLote}.pdf`;
  }
  if (receipt.nominal_installment_number) {
    return `Recibo_cuota_${receipt.nominal_installment_number}${sufijoLote}.pdf`;
  }
  return `Recibo_pago${sufijoLote}.pdf`;
}

/**
 * Título del recibo dentro del portal: lo que el cliente lee en la tarjeta y
 * por lo que se ordena la lista. A diferencia del nombre de archivo, acá sí van
 * mayúsculas y acentos.
 */
export function buildOfficialReceiptTitle(receipt: {
  scope?: string | null;
  nominal_installment_number?: number | null;
  nominal_installment_range?: string | null;
}): string {
  switch (receipt.scope) {
    case "PIE":
      return "Recibo de Pie";
    case "RESERVA":
      return "Recibo de Reserva";
    case "GASTOS":
      return "Recibo de Gastos Operacionales";
    case "MORA":
      return "Recibo de Abono de Intereses";
    default:
      if (receipt.nominal_installment_range)
        return `Recibo Cuotas ${receipt.nominal_installment_range}`;
      if (receipt.nominal_installment_number)
        return `Recibo Cuota ${String(receipt.nominal_installment_number).padStart(2, "0")}`;
      return "Recibo de Pago";
  }
}

/**
 * Clave con la que se ordenan los recibos por concepto, en el orden en que
 * ocurren de verdad: primero la reserva, después el pie, después las cuotas en
 * orden, y al final los cargos sueltos. Ordenar por el texto del título dejaba
 * la "Cuota 10" antes que la "Cuota 2".
 */
export function conceptSortKey(receipt: {
  scope?: string | null;
  nominal_installment_number?: number | null;
  nominal_installment_range?: string | null;
}): number {
  switch (receipt.scope) {
    case "RESERVA":
      return 0;
    case "PIE":
      return 1;
    case "GASTOS":
      return 900_000;
    case "MORA":
      return 900_001;
    default: {
      const desdeRango = receipt.nominal_installment_range?.match(/^(\d+)/);
      const numero = desdeRango
        ? parseInt(desdeRango[1], 10)
        : receipt.nominal_installment_number || 0;
      return 100 + numero;
    }
  }
}

/**
 * Fecha en que el cliente PAGÓ: la que ve en su historial, la que lleva impresa
 * su recibo oficial y la que le llega por WhatsApp.
 *
 * `paid_at` la declara postventa al aprobar, leyéndola de la transferencia.
 * Antes de que existiera, la única fecha disponible era `processed_at` — la de
 * aprobación —, que puede caer días después de que el cliente pagó: quien
 * transfería el último día de plazo y subía el comprobante a la mañana
 * siguiente aparecía pagando tarde. Los comprobantes viejos siguen cayendo ahí,
 * y los importados sin procesar, a la fecha de subida.
 */
export function fechaDePagoComprobante(
  r?: {
    paid_at?: Date | string | null;
    processed_at?: Date | string | null;
    created_at?: Date | string | null;
  } | null
): Date | null {
  const cruda = r?.paid_at || r?.processed_at || r?.created_at;
  if (!cruda) return null;
  const fecha = new Date(cruda);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
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


/**
 * Qué es realmente el archivo del comprobante.
 *
 * Antes esto se resolvía leyendo el mime que venía escrito en la data-URL, y
 * si no era uno de los cuatro conocidos (pdf/png/jpeg/webp) se asumía PDF.
 * Ese "se asumía PDF" era el problema: las fotos que el cliente sube desde un
 * iPhone llegan como image/heic, la pantalla las metía en un <img> (que el
 * navegador no sabe dibujar, salía el ícono de imagen rota) y al descargarlas
 * las bautizaba .pdf, así que la Vista Previa del Mac decía que el PDF estaba
 * dañado. El archivo siempre estuvo bien; era el envoltorio el que mentía.
 *
 * Ahora el formato se saca de los primeros bytes del archivo, que no mienten,
 * y el mime declarado queda solo como último recurso.
 */
export type ReceiptFormat = {
  /** Extensión real del archivo, sin punto. */
  ext: string;
  /** Mime real del archivo. */
  fileType: string;
  /** Cómo hay que mostrarlo: en un visor de PDF, en una imagen, o en ninguno. */
  kind: "pdf" | "image" | "other";
  /** ¿El navegador sabe dibujarlo? El HEIC del iPhone, por ejemplo, no. */
  previewable: boolean;
  /** URL lista para el <img>/<iframe>, con el mime ya corregido. "" si no hay archivo. */
  url: string;
};

const PDF_FORMAT = { ext: "pdf", fileType: "application/pdf", kind: "pdf" as const, previewable: true };

/** Firmas de archivo, en el orden en que conviene probarlas. */
function sniffMagicBytes(bytes: Uint8Array): Omit<ReceiptFormat, "url"> | null {
  if (bytes.length < 4) return null;
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...Array.from(bytes.slice(from, to)));

  if (ascii(0, 4) === "%PDF") return PDF_FORMAT;
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG")
    return { ext: "png", fileType: "image/png", kind: "image", previewable: true };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { ext: "jpg", fileType: "image/jpeg", kind: "image", previewable: true };
  if (ascii(0, 3) === "GIF")
    return { ext: "gif", fileType: "image/gif", kind: "image", previewable: true };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return { ext: "webp", fileType: "image/webp", kind: "image", previewable: true };

  // Familia ISO-BMFF: acá caen las fotos del iPhone (HEIC/HEIF) y el AVIF.
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12).toLowerCase();
    if (brand.startsWith("avif") || brand.startsWith("avis"))
      return { ext: "avif", fileType: "image/avif", kind: "image", previewable: true };
    // El HEIC solo lo abre el sistema operativo, ningún navegador lo dibuja:
    // se marca como imagen pero NO previsualizable, para ofrecer la descarga.
    return { ext: "heic", fileType: "image/heic", kind: "image", previewable: false };
  }

  if (bytes[0] === 0x50 && bytes[1] === 0x4b)
    return {
      ext: "docx",
      fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      kind: "other",
      previewable: false,
    };

  return null;
}

/** Decodifica los primeros bytes de un base64, sirviendo igual en el server y en el navegador. */
function decodeBase64Head(payload: string, byteCount = 24): Uint8Array | null {
  const clean = payload.replace(/\s/g, "").slice(0, Math.ceil(byteCount / 3) * 4);
  if (clean.length < 4) return null;
  try {
    if (typeof atob === "function") {
      const bin = atob(clean);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(clean, "base64"));
  } catch {
    return null;
  }
}

/** El mime tal como venía escrito en la data-URL, cuando los bytes no dicen nada. */
function formatFromDeclaredMime(mime: string): Omit<ReceiptFormat, "url"> | null {
  const m = (mime || "").toLowerCase();
  if (!m) return null;
  if (m.includes("pdf")) return PDF_FORMAT;
  if (m.includes("png")) return { ext: "png", fileType: "image/png", kind: "image", previewable: true };
  if (m.includes("jpeg") || m.includes("jpg"))
    return { ext: "jpg", fileType: "image/jpeg", kind: "image", previewable: true };
  if (m.includes("webp")) return { ext: "webp", fileType: "image/webp", kind: "image", previewable: true };
  if (m.includes("gif")) return { ext: "gif", fileType: "image/gif", kind: "image", previewable: true };
  if (m.includes("avif")) return { ext: "avif", fileType: "image/avif", kind: "image", previewable: true };
  if (m.includes("heic") || m.includes("heif"))
    return { ext: "heic", fileType: "image/heic", kind: "image", previewable: false };
  return null;
}

/** Formato deducido de la extensión, para los comprobantes guardados como URL y no como archivo. */
function formatFromExtension(path: string): Omit<ReceiptFormat, "url"> | null {
  const clean = path.split("?")[0].toLowerCase();
  if (clean.endsWith(".pdf")) return PDF_FORMAT;
  if (clean.endsWith(".png")) return { ext: "png", fileType: "image/png", kind: "image", previewable: true };
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg"))
    return { ext: "jpg", fileType: "image/jpeg", kind: "image", previewable: true };
  if (clean.endsWith(".webp")) return { ext: "webp", fileType: "image/webp", kind: "image", previewable: true };
  if (clean.endsWith(".gif")) return { ext: "gif", fileType: "image/gif", kind: "image", previewable: true };
  if (clean.endsWith(".avif")) return { ext: "avif", fileType: "image/avif", kind: "image", previewable: true };
  if (clean.endsWith(".heic") || clean.endsWith(".heif"))
    return { ext: "heic", fileType: "image/heic", kind: "image", previewable: false };
  return null;
}

/** Cuando no se pudo reconocer nada: se descarga tal cual, sin inventarle extensión. */
const UNKNOWN_FORMAT: Omit<ReceiptFormat, "url"> = {
  ext: "bin",
  fileType: "application/octet-stream",
  kind: "other",
  previewable: false,
};

/**
 * Resuelve formato y URL mostrable de un comprobante, venga como venga:
 * data-URL (con el mime bien o mal puesto), base64 pelado sin encabezado, o
 * una URL http del puente de Lomas.
 */
export function receiptFormat(receiptUrl?: string | null): ReceiptFormat {
  if (!receiptHasFile(receiptUrl)) {
    return { ...PDF_FORMAT, kind: "other", previewable: false, url: "" };
  }
  const raw = (receiptUrl as string).trim();

  // Comprobante guardado como link (puente de Lomas, storage externo).
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("/")) {
    const guess = formatFromExtension(raw) || PDF_FORMAT;
    return { ...guess, url: raw };
  }

  const isDataUrl = raw.startsWith("data:");
  const commaAt = raw.indexOf(",");
  const payload = commaAt > -1 ? raw.slice(commaAt + 1) : raw;
  const semiAt = raw.indexOf(";");
  const declaredMime = isDataUrl
    ? raw.slice(5, semiAt > -1 && (commaAt === -1 || semiAt < commaAt) ? semiAt : Math.max(commaAt, 5))
    : "";

  const head = decodeBase64Head(payload);
  const format =
    (head && sniffMagicBytes(head)) || formatFromDeclaredMime(declaredMime) || UNKNOWN_FORMAT;

  // Se rearma siempre la data-URL con el mime real: así el <img>/<iframe>
  // recibe lo que corresponde aunque lo guardado viniera sin encabezado.
  return { ...format, url: `data:${format.fileType};base64,${payload}` };
}

/** Extensión y mime del comprobante, deducidos de sus bytes reales. */
export function receiptFileType(receiptUrl?: string | null): { ext: string; fileType: string } {
  const { ext, fileType } = receiptFormat(receiptUrl);
  return { ext, fileType };
}
