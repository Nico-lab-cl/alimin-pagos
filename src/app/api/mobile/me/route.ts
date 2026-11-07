import { prisma } from "@/lib/prisma";
import { cargarTerrenosDelUsuario } from "@/lib/terrenosCliente";
import { reglasDePago, totalParaItems, type CuotaPorPagar } from "@/lib/planDePago";
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
  type Lote = { reservationId?: string; receipts?: Recibo[]; upcomingInstallments?: CuotaPorPagar[] } & Record<string, unknown>;
  const lotes: Lote[] = resultado.lots || [];

  // Comprobantes que el cliente envio y postventa aun no aprueba (o rechazo hace
  // poco), para que la app muestre "En revision" / "Rechazado". Solo de las
  // reservas que ya son del cliente; sin el archivo.
  const reservas = lotes.map((l) => l.reservationId).filter((id): id is string => !!id);
  const hace60Dias = new Date(Date.now() - 60 * 86_400_000);
  const enCurso = reservas.length
    ? await prisma.paymentReceipt.findMany({
        where: {
          reservation_id: { in: reservas },
          OR: [{ status: "PENDING" }, { status: "REJECTED", created_at: { gte: hace60Dias } }],
        },
        select: {
          id: true, reservation_id: true, amount_clp: true, status: true, scope: true, created_at: true,
          paid_at: true, processed_at: true, installments_count: true,
          nominal_installment_number: true, nominal_installment_range: true, rejection_reason: true,
        },
        orderBy: { created_at: "desc" },
      })
    : [];

  const lots = lotes.map((lot) => {
    const cuotas = lot.upcomingInstallments || [];
    const reglas = reglasDePago(cuotas);
    return {
      ...lot,
      pendientes: enCurso.filter((r) => r.reservation_id === lot.reservationId),
      // El comprobante viene como data-URL completa (pueden ser varios MB): la
      // app lo baja aparte desde la URL del documento cuando el cliente lo abre.
      receipts: (lot.receipts || []).map(({ receipt_url, ...r }) => ({
        ...r,
        hasFile: !!receipt_url,
      })),
      // Lo minimo para quedar al dia, con la misma regla que /user/pay/[id].
      pago: {
        ...reglas,
        minimo: totalParaItems(cuotas, reglas.minimoItems),
        // Vencidas pero todavia en gracia: no entran al minimo, se ofrecen sin multa.
        cuotasEnGracia: cuotas
          .filter((c) => c.number > 0 && c.isOverdue && !c.hasPenalty)
          .map((c) => ({ number: c.number, dueDate: c.dueDate, multaDesde: c.interestStartDate, amount: c.baseAmount ?? c.amount })),
      },
    };
  });

  return respuesta({ user: usuario, lots });
}
