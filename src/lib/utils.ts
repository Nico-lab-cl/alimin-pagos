import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { receiptFormat } from "@/lib/receiptDocs";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a CLP amount with thousands separator and $ sign.
 */
export function formatCLP(amount: number | null | undefined): string {
  if (amount == null) return "$0";
  return "$" + amount.toLocaleString("es-CL");
}

/**
 * Format a date to a human-readable Chilean format.
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Santiago"
  });
}

/**
 * Format a date with time.
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Mes y año de una fecha, en formato "Agosto 2026".
 */
export function formatMonthYear(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value || "";
  const year = parts.find((p) => p.type === "year")?.value || "";
  if (!month || !year) return "";
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`;
}

/**
 * Etiqueta de la(s) cuota(s) que cubre un pago: número de cuota + mes y año.
 *   "Cuota 3 - Agosto 2026"
 *   "Cuotas 3-6 - Agosto 2026 a Noviembre 2026"
 * Espera solo cuotas reales (sin la fila de mora histórica, que no tiene número).
 */
export function formatInstallmentsLabel(
  cuotas: { number: number; dueDate?: string | Date | null }[]
): string {
  if (!cuotas.length) return "";

  const first = cuotas[0];
  const last = cuotas[cuotas.length - 1];
  const numbers = cuotas.length === 1 ? `Cuota ${first.number}` : `Cuotas ${first.number}-${last.number}`;

  const firstPeriod = formatMonthYear(first.dueDate);
  if (!firstPeriod) return numbers;
  if (cuotas.length === 1) return `${numbers} - ${firstPeriod}`;

  const lastPeriod = formatMonthYear(last.dueDate);
  return lastPeriod && lastPeriod !== firstPeriod
    ? `${numbers} - ${firstPeriod} a ${lastPeriod}`
    : `${numbers} - ${firstPeriod}`;
}

/**
 * Extract initials from a name.
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Resolves the appropriate filename and extension for downloading a document.
 */
export function getDownloadFilename(doc: any): string {
  let name = doc.name || "documento";
  if (
    name.toLowerCase().endsWith(".pdf") ||
    name.toLowerCase().endsWith(".png") ||
    name.toLowerCase().endsWith(".jpg") ||
    name.toLowerCase().endsWith(".jpeg") ||
    name.toLowerCase().endsWith(".docx") ||
    name.toLowerCase().endsWith(".xlsx")
  ) {
    return name;
  }
  const fileType = doc.fileType || doc.file_type || "";
  if (fileType.includes("pdf")) return `${name}.pdf`;
  if (fileType.includes("png")) return `${name}.png`;
  if (fileType.includes("jpeg") || fileType.includes("jpg")) return `${name}.jpg`;
  if (fileType.includes("word") || fileType.includes("officedocument.word")) return `${name}.docx`;
  if (fileType.includes("sheet") || fileType.includes("officedocument.spreadsheet")) return `${name}.xlsx`;

  const nameLower = name.toLowerCase();
  if (
    nameLower.includes("contrato") ||
    nameLower.includes("promesa") ||
    nameLower.includes("comprobante") ||
    nameLower.includes("certificado")
  ) {
    return `${name}.pdf`;
  }
  return `${name}.pdf`;
}

/** Extensiones que ya vienen puestas en el nombre y no hay que volver a agregar. */
const KNOWN_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp", "gif", "avif", "heic", "heif", "docx", "xlsx"];

/**
 * Nombre con el que se baja el respaldo de un pago.
 *
 * La extensión sale de los bytes reales del archivo (ver receiptFormat), no del
 * mime declarado: antes cualquier formato que no fuera pdf/png/jpg/webp se
 * bajaba igual como ".pdf", y una foto de iPhone guardada así no la abría
 * ningún visor —el Mac avisaba que el PDF estaba dañado.
 */
export function getReceiptDownloadFilename(url: string | null | undefined, receiptId: string): string {
  const prefix = `comprobante_${receiptId}`;
  if (!url) return `${prefix}.pdf`;
  return `${prefix}.${receiptFormat(url).ext}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Entrega un archivo al usuario.
 *
 * En el navegador usa el truco clasico del <a download>. Dentro de la app Android
 * eso no sirve: el WebView ignora por completo las URLs blob:, el boton no hace nada
 * y no aparece ningun error. Ahi el archivo se escribe en el almacenamiento de la app
 * y se abre la hoja de compartir del sistema, para guardarlo o enviarlo desde el celular.
 */
export async function deliverFile(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;

  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
    });
    await Share.share({ title: filename, files: [uri] });
    return;
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/**
 * ¿Este cliente compró al contado?
 *
 * Hay dos formas de serlo y las dos cuentan:
 *   1) El lote quedó con 0 cuotas pactadas (pago de una sola vez).
 *   2) Postventa lo marcó con el botón "AL CONTADO" de la ficha, que deja la
 *      reserva en status COMPLETED (ver toggleAlContado).
 *
 * Sin esta distinción todos ellos se ven "AL DÍA" en el exportable, mezclados
 * con los que sí están pagando cuotas al día. Es solo una etiqueta de lectura:
 * no toca ningún cálculo de saldo, pie ni mora.
 */
export function esAlContado(cliente: {
  totalCuotas?: number | null;
  status?: string | null;
  internalStatus?: string | null;
}): boolean {
  if ((cliente?.totalCuotas || 0) === 0) return true;
  return cliente?.internalStatus === "COMPLETED" || cliente?.status === "COMPLETED";
}

/**
 * Fecha para una celda de CSV, en dd-mm-aaaa y hora de Santiago.
 *
 * No usa formatDate porque "05 ago 2026" no lo ordena ni lo filtra Excel, y
 * porque una celda vacia es mejor que un "—" cuando el cliente simplemente no
 * tiene esa fecha (compro al contado o ya no le quedan cuotas).
 */
export function formatFechaCsv(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const partes = new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Santiago",
  }).formatToParts(d);
  const buscar = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${buscar("day")}-${buscar("month")}-${buscar("year")}`;
}

/**
 * Entrega un CSV ya armado. El contenido debe traer su propio BOM si se abre en Excel.
 */
export async function downloadCsv(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  await deliverFile(blob, filename);
}

/**
 * ¿Este comprobante cubre la cuota N?
 *
 * Un comprobante puede venir marcado con un número de cuota suelto
 * (nominal_installment_number) o con un rango ("4-6") cuando un solo pago
 * amortizó varias cuotas. El rango cubre TODAS las cuotas del intervalo, no
 * solo sus extremos: leerlo como lista de extremos dejaba las cuotas del medio
 * sin comprobante en el historial del cliente.
 */
export function comprobanteCubreCuota(
  receipt: { nominal_installment_number?: number | null; nominal_installment_range?: string | null },
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

/**
 * URL del recibo OFICIAL de una cuota pagada. Siempre existe: si hay un
 * comprobante detrás se emite desde él, y si no (pago manual sin archivo, cuota
 * migrada) se emite desde los datos de la reserva. El recibo lo emite Alimin,
 * así que no depende de que el cliente haya subido su transferencia.
 */
export function urlReciboOficial(
  reservationId: string,
  cuota: number,
  receiptId?: string | null
): string {
  return receiptId
    ? `/api/documents/official-${receiptId}`
    : `/api/documents/official-cuota-${reservationId}-${cuota}`;
}

/**
 * Unified document downloader that handles HTTP URLs and base64 data URIs.
 * It tries to extract the server-provided filename from Content-Disposition headers.
 */
export async function downloadDocument(url: string, fallbackName: string, fallbackFileType?: string) {
  if (typeof window === "undefined") return;

  try {
    if (url.startsWith("data:")) {
      const prefix = fallbackName || "documento";
      const declaredMime = url.split(";")[0].split(":")[1] || "";

      // Word y Excel son los dos un ZIP por dentro, asi que los bytes no
      // alcanzan para distinguirlos: ahi manda el mime declarado. Para todo lo
      // demas manda el archivo, porque el mime que trae el navegador del
      // cliente miente seguido (una foto de iPhone llegaba como PDF).
      const esOffice =
        declaredMime.includes("word") ||
        declaredMime.includes("officedocument.word") ||
        declaredMime.includes("sheet") ||
        declaredMime.includes("officedocument.spreadsheet");

      let extension: string;
      let fetchUrl = url;
      if (esOffice) {
        extension = declaredMime.includes("sheet") || declaredMime.includes("officedocument.spreadsheet")
          ? "xlsx"
          : "docx";
      } else {
        // Se baja por la data-URL ya corregida, para que el blob salga con el
        // mime que de verdad corresponde a los bytes.
        const formato = receiptFormat(url);
        extension = formato.ext;
        fetchUrl = formato.url || url;
      }

      // Si el nombre ya venia con extension propia (los documentos de la ficha
      // la traen), se respeta tal cual y no se le pega una segunda.
      const finalName = KNOWN_EXTENSIONS.some((e) => prefix.toLowerCase().endsWith(`.${e}`))
        ? prefix
        : `${prefix}.${extension}`;

      const dataBlob = await (await fetch(fetchUrl)).blob();
      await deliverFile(dataBlob, finalName);
      return;
    }

    const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}download=true`;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const blob = await res.blob();

    const disposition = res.headers.get("Content-Disposition") || "";
    let filename = "";
    
    const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/);
    if (utf8Match) {
      filename = decodeURIComponent(utf8Match[1]);
    } else {
      const match = disposition.match(/filename="?([^";\n]+)"?/);
      if (match) filename = match[1];
    }
    
    if (!filename) {
      filename = getDownloadFilename({ name: fallbackName, fileType: fallbackFileType });
    }

    await deliverFile(blob, filename);
  } catch (error) {
    console.error("Error downloading file:", error);
    // En la app abrir una pestana nueva tampoco descarga nada, asi que el error se propaga
    // para que la pantalla pueda avisarle al usuario en vez de fallar en silencio.
    if (Capacitor.isNativePlatform()) throw error;
    window.open(url, "_blank");
  }
}

