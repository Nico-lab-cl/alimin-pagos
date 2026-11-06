import { cargarTerrenosDelUsuario } from "@/lib/terrenosCliente";
import { falla, noAutorizado, respuesta, usuarioDeLaPeticion } from "@/lib/movil/http";

/**
 * Todo lo que la app necesita para el Inicio, Pagos y Documentos: los mismos
 * datos que ve el cliente en /user, calculados con el mismo codigo.
 */
export async function GET(request: Request) {
  const usuario = await usuarioDeLaPeticion(request);
  if (!usuario) return noAutorizado();

  const resultado = await cargarTerrenosDelUsuario(usuario.id);
  if ("error" in resultado && resultado.error) return falla(500, "error_servidor", resultado.error);

  type Recibo = { receipt_url?: string | null } & Record<string, unknown>;
  const lots = (resultado.lots || []).map((lot: { receipts?: Recibo[] } & Record<string, unknown>) => ({
    ...lot,
    // El comprobante viene como data-URL completa (pueden ser varios MB): la
    // app lo baja aparte desde la URL del documento cuando el cliente lo abre.
    receipts: (lot.receipts || []).map(({ receipt_url, ...r }) => ({
      ...r,
      hasFile: !!receipt_url,
    })),
  }));

  return respuesta({ user: usuario, lots });
}
