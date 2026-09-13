import { readFile } from "fs/promises";
import path from "path";

/**
 * Carga el logo del recibo como data-URL para @react-pdf.
 *
 * El recibo se arma en el servidor, así que el logo se lee del disco y no por
 * HTTP: pedírselo a nuestra propia URL desde dentro del contenedor es frágil
 * (depende de cómo quedó resuelto el host en EasyPanel) y ya nos dejó recibos
 * sin logo. Leyéndolo del sistema de archivos no hay red de por medio.
 *
 * El resultado queda en caché porque el archivo no cambia entre despliegues y
 * un recibo se emite en cada descarga.
 */
const cache = new Map<string, string | null>();

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function loadReceiptLogo(logoFile: string): Promise<string | undefined> {
  if (!logoFile) return undefined;
  if (cache.has(logoFile)) return cache.get(logoFile) ?? undefined;

  try {
    // Solo se sirven archivos de `public/`: el nombre viene de nuestra propia
    // tabla de identidad, pero igual se le corta cualquier intento de subir de
    // carpeta antes de tocar el disco.
    const safeName = path.basename(logoFile);
    const ext = path.extname(safeName).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      cache.set(logoFile, null);
      return undefined;
    }

    const bytes = await readFile(path.join(process.cwd(), "public", safeName));
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    cache.set(logoFile, dataUrl);
    return dataUrl;
  } catch {
    // Sin logo el recibo sale con el nombre del proyecto en texto. Es preferible
    // a no poder emitirlo.
    cache.set(logoFile, null);
    return undefined;
  }
}
