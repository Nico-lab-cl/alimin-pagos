import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { detectarFichasFantasma } from "@/lib/fichasDuplicadas";
import {
  cuadrarPlan,
  fichaPlanDesdeReserva,
  saldoPanelLomasSinReservaAparte,
  LOMAS_SLUG,
} from "@/lib/cuadrePlan";
import CuadreCaja from "@/components/admin/CuadreCaja";

/**
 * Cuadre de Caja: ¿cierra el plan de pago de cada lote con su valor total?
 *
 * pie (reserva incluida) + cuotas pactadas = valor total, exacto al peso. La
 * lógica vive en `lib/cuadrePlan` para poder probarla sin base de datos; acá
 * solo se juntan los datos y se dibuja.
 *
 * Entran las fichas con cuotas, activas y terminadas. Las al contado no (no
 * tienen plan que cuadrar), ni las fichas fantasma del puente Lomas, que
 * repetirían el lote. Los intereses quedan fuera a propósito.
 *
 * La única escritura sale de `actions/cuadre`, y siempre pasa por una vista
 * previa del saldo antes de guardar.
 *
 * Ruta: /admin/cuadre-caja  (requiere sesión ADMIN)
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function CuadreCajaPage() {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <p className="text-sm font-bold text-red-600">No autorizado</p>
      </div>
    );
  }

  const whereProyecto: any = { status: "ACTIVE" };
  if (user.allowedProjects && Array.isArray(user.allowedProjects)) {
    whereProyecto.slug = { in: user.allowedProjects };
  }
  const proyectos = await prisma.project.findMany({
    where: whereProyecto,
    select: { id: true, name: true, slug: true },
  });

  const reservas = await prisma.reservation.findMany({
    where: {
      project_id: { in: proyectos.map((p) => p.id) },
      status: { in: ["active", "COMPLETED"] },
    },
    select: {
      id: true,
      name: true,
      last_name: true,
      rut: true,
      email: true,
      user_id: true,
      status: true,
      project_id: true,
      lot_id: true,
      is_multilote: true,
      installment_ranges: true,
      last_installment_value: true,
      pie: true,
      pie_status: true,
      reservation_price: true,
      installments_paid: true,
      extra_paid_amount: true,
      pending_amount: true,
      lot: {
        select: {
          number: true,
          stage: true,
          price_total_clp: true,
          cuotas: true,
          valor_cuota: true,
          last_installment_amount: true,
          pie: true,
          reservation_amount_clp: true,
        },
      },
      // Solo reserva y pie: son los únicos comprobantes que entran al cuadre.
      // receipt_url queda fuera, guarda el archivo entero en base64.
      receipts: {
        where: { status: "APPROVED", scope: { in: ["RESERVA", "PIE"] } },
        select: { scope: true, amount_clp: true, status: true },
      },
    },
  });

  const fantasmas = detectarFichasFantasma(
    reservas.map((r) => ({
      id: r.id,
      lotId: r.lot_id,
      rut: r.rut,
      clientEmail: r.email,
      buyer: { id: r.user_id },
      paidCuotas: r.installments_paid,
      internalStatus: r.status,
    }))
  );

  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.name]));
  const slugProyecto = new Map(proyectos.map((p) => [p.id, p.slug]));

  const filas = reservas
    .filter((r) => !fantasmas.has(r.id) && (r.lot?.cuotas || 0) > 0)
    .map((r) => {
      const slug = slugProyecto.get(r.project_id) || "";
      const ficha = fichaPlanDesdeReserva(r as any, slug);
      const resultado = cuadrarPlan(ficha);
      return {
        id: r.id,
        cliente: `${r.name || ""} ${r.last_name || ""}`.trim() || "Sin nombre",
        rut: r.rut || "Sin RUT",
        proyecto: nombreProyecto.get(r.project_id) || "—",
        proyectoSlug: slug,
        lote: `${r.lot?.number ?? "—"}${r.lot?.stage ? ` · ${r.lot.stage}` : ""}`,
        terminado: r.status === "COMPLETED",
        multilote: !!r.is_multilote,
        resultado,
        // Solo Lomas: cuánto le cambiaría el saldo del panel si deja de sumar la
        // reserva aparte del pie. Se mide acá, antes de tocar la fórmula.
        panelSinReservaAparte: slug === LOMAS_SLUG ? saldoPanelLomasSinReservaAparte(ficha) : null,
      };
    });

  const peso = { DESCUADRA: 0, REVISAR: 1, CUADRA: 2 } as const;
  filas.sort(
    (a, b) =>
      peso[a.resultado.estado] - peso[b.resultado.estado] ||
      Math.abs(b.resultado.diferencia) - Math.abs(a.resultado.diferencia) ||
      a.cliente.localeCompare(b.cliente, "es")
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Control de cartera</p>
        <h1 className="text-2xl font-extrabold text-brand-800 tracking-tight">Cuadre de Caja</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Si el plan de pago de cada lote cierra con su valor total:{" "}
          <span className="font-bold text-slate-700">pie (con la reserva adentro) + cuotas pactadas = valor total</span>,
          exacto al peso. La reserva es parte de pago del pie. Los intereses no entran. Las correcciones muestran antes de
          guardar cómo queda el saldo del cliente.
        </p>
      </div>

      <CuadreCaja filas={filas as any} />
    </div>
  );
}
