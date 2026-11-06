import { z } from "zod";
import { registrarComprobanteCliente } from "@/lib/comprobantesCliente";
import { falla, noAutorizado, respuesta, superaLimite, usuarioDeLaPeticion } from "@/lib/movil/http";

const MAX_BYTES = 10 * 1024 * 1024; // mismo limite que la pantalla de pago del portal
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

const Campos = z.object({
  reservationId: z.string().uuid(),
  amount: z.coerce.number().int().positive(),
  scope: z.enum(["PIE", "INSTALLMENT"]),
  installmentsCount: z.coerce.number().int().min(1).max(120).default(1),
});

/**
 * Comprobante de transferencia subido desde la app (multipart/form-data con
 * `file`). Queda PENDING igual que si lo subiera desde el portal: lo guarda la
 * misma funcion, como data-URL en payment_receipts.receipt_url.
 */
export async function POST(request: Request) {
  const usuario = await usuarioDeLaPeticion(request);
  if (!usuario) return noAutorizado();

  if (superaLimite(`receipt:${usuario.id}`, 10, 60 * 60 * 1000)) {
    return falla(429, "demasiados_intentos", "Subiste varios comprobantes seguidos. Si necesitas ayuda, escríbenos por WhatsApp.");
  }

  const form = await request.formData().catch(() => null);
  if (!form) return falla(400, "datos_invalidos", "No llegó el comprobante.");

  const campos = Campos.safeParse({
    reservationId: form.get("reservationId"),
    amount: form.get("amount"),
    scope: form.get("scope"),
    installmentsCount: form.get("installmentsCount") ?? undefined,
  });
  if (!campos.success) return falla(400, "datos_invalidos", "Faltan datos del pago.");

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return falla(400, "archivo_vacio", "El archivo llegó vacío. Vuelve a tomar la foto o elige el archivo de nuevo.");
  }
  if (file.size > MAX_BYTES) return falla(413, "archivo_grande", "El archivo pesa más de 10 MB.");
  if (!TIPOS.includes(file.type)) return falla(415, "tipo_no_soportado", "Sube una foto (JPG, PNG o HEIC) o un PDF.");

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const resultado = await registrarComprobanteCliente({
    userId: usuario.id,
    isAdmin: false,
    ...campos.data,
    receiptBase64: `data:${file.type};base64,${base64}`,
  });

  if (resultado.error) {
    return resultado.error === "Reserva no encontrada"
      ? falla(404, "reserva_no_encontrada", "No encontramos ese terreno en tu cuenta.")
      : falla(400, "no_se_pudo_subir", resultado.error);
  }
  return respuesta({ ok: true }, 201);
}
