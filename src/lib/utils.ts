import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

      const a = document.createElement("a");
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}download=true`;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    
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
    
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("Error downloading file:", error);
    window.open(url, "_blank");
  }
}

