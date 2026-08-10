import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

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

/**
 * Resolves the appropriate filename for a receipt download, appending the correct extension.
 */
export function getReceiptDownloadFilename(url: string | null | undefined, receiptId: string): string {
  const prefix = `comprobante_${receiptId}`;
  if (!url) return `${prefix}.pdf`;
  if (url.startsWith("data:")) {
    const parts = url.split(";");
    if (parts.length > 0) {
      const mime = parts[0].split(":")[1] || "";
      if (mime.includes("pdf")) return `${prefix}.pdf`;
      if (mime.includes("png")) return `${prefix}.png`;
      if (mime.includes("jpeg") || mime.includes("jpg")) return `${prefix}.jpg`;
      if (mime.includes("webp")) return `${prefix}.webp`;
    }
  } else {
    const cleanUrl = url.split("?")[0].toLowerCase();
    if (cleanUrl.endsWith(".pdf")) return `${prefix}.pdf`;
    if (cleanUrl.endsWith(".png")) return `${prefix}.png`;
    if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) return `${prefix}.jpg`;
    if (cleanUrl.endsWith(".webp")) return `${prefix}.webp`;
  }
  return `${prefix}.pdf`; // default fallback
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
 * Entrega un CSV ya armado. El contenido debe traer su propio BOM si se abre en Excel.
 */
export async function downloadCsv(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  await deliverFile(blob, filename);
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
      let extension = "pdf"; // fallback

      const parts = url.split(";");
      if (parts.length > 0) {
        const mime = parts[0].split(":")[1] || "";
        if (mime.includes("pdf")) extension = "pdf";
        else if (mime.includes("png")) extension = "png";
        else if (mime.includes("jpeg") || mime.includes("jpg")) extension = "jpg";
        else if (mime.includes("webp")) extension = "webp";
        else if (mime.includes("word") || mime.includes("officedocument.word")) extension = "docx";
        else if (mime.includes("sheet") || mime.includes("officedocument.spreadsheet")) extension = "xlsx";
      }

      let finalName = prefix;
      if (!finalName.toLowerCase().endsWith(`.${extension}`)) {
        finalName = `${finalName}.${extension}`;
      }

      const dataBlob = await (await fetch(url)).blob();
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

