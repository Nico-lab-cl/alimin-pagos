import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getNominalInstallmentAmount, getInstallmentDueDate } from "@/lib/financials";
import { SCOPE_LABELS, esAbonoDeIntereses, fechaDePagoComprobante } from "@/lib/receiptDocs";
import { auditarFicha, cuotasQueCubre, resumirNumeros } from "@/lib/auditoriaComprobantes";
import RevisionComprobantes from "@/components/admin/RevisionComprobantes";

/**
 * Revisión de Comprobantes. SOLO LECTURA: no escribe nada.
 *
 * Cruza, para cada ficha de la cartera, lo que dice el contador de cuotas contra
 * lo que dicen los comprobantes y contra lo que dice la caja. La lógica de los
 * cuatro chequeos vive en `lib/auditoriaComprobantes` para poder probarla sin
 * base de datos; acá solo se juntan los datos y se dibuja.
 *
 * Se acota a los proyectos de la cuenta que entra (allowedProjects): cada equipo
 * de postventa ve su propia cartera y nunca la de otro proyecto.
 *
 * Ruta: /admin/diagnostico-comprobantes  (requiere sesión ADMIN)
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

export default async function DiagnosticoComprobantesPage() {
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
      installments_paid: true,
      project_id: true,
      installment_ranges: true,
      installment_start_date: true,
      due_day: true,
      lot: { select: { number: true, stage: true, cuotas: true, valor_cuota: true } },
      receipts: {
        orderBy: { created_at: "desc" },
        // receipt_url queda FUERA a propósito: guarda la imagen entera en base64
        // y traerla para toda la cartera revienta la memoria de la página. Si el
        // comprobante tiene archivo se resuelve aparte, con un booleano.
        select: {
          id: true,
          amount_clp: true,
          status: true,
          scope: true,
          installments_count: true,
          nominal_installment_number: true,
          nominal_installment_range: true,
          created_at: true,
          paid_at: true,
          processed_at: true,
        },
      },
    },
  });

  // Qué comprobantes tienen un archivo real detrás, sin traer el base64.
  const archivoPorComprobante = new Map<string, boolean>();
  const filasArchivo = await prisma.$queryRaw<{ id: string; tiene_archivo: boolean }[]>`
    SELECT pr.id::text AS id,
           (pr.receipt_url IS NOT NULL
            AND length(pr.receipt_url) > 0
            AND pr.receipt_url NOT IN ('LEGACY_SYNC', 'CONDONACION_ADMIN', 'SIN_RESPALDO')) AS tiene_archivo
    FROM pagos.payment_receipts pr
  `;
  for (const f of filasArchivo) archivoPorComprobante.set(f.id, f.tiene_archivo);

  // La caja: lo que el historial financiero registró como cuotas.
  //
  // OJO con qué es esto y qué no. NO alimenta el "Total Pagado" ni el saldo del
  // cliente: esos se calculan recorriendo `installments_paid` contra el valor
  // pactado de cada cuota (ver `totalPaid` en actions/user.ts). Esta tabla
  // alimenta el REPORTE DE RECAUDACIÓN del proyecto (ver recauAgg en
  // actions/postventa.ts). Que a una ficha le falten filas acá no le mueve el
  // saldo al cliente; le quita plata al reporte.
  const cajaPorReserva = new Map<string, number>();
  const sumas = await prisma.financialLedger.groupBy({
    by: ["reservation_id"],
    // CUOTA y PENALTY juntas: un pago de cuota con mora encima deja una fila de
    // cada una, y el comprobante guarda la suma de las dos.
    where: { category: { in: ["CUOTA", "PENALTY"] } },
    _sum: { amount_clp: true },
  });
  for (const s of sumas) cajaPorReserva.set(s.reservation_id, s._sum.amount_clp || 0);

  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.name]));
  const slugProyecto = new Map(proyectos.map((p) => [p.id, p.slug]));

  const filas = reservas.map((res) => {
    const vencimientoDe = (n: number) => {
      if (!n || !res.installment_start_date) return "—";
      return fmt(getInstallmentDueDate(res.installment_start_date, n, res.due_day || undefined));
    };

    const valorDeCuota = (n: number) =>
      getNominalInstallmentAmount(res.installment_ranges, n, res.lot?.valor_cuota || 0);

    const auditoria = auditarFicha({
      cuotasContadas: res.installments_paid || 0,
      comprobantes: res.receipts as any,
      valorDeCuota,
      // Sin filas de caja no se puede comparar nada: la ficha viene de la
      // planilla. Se manda NULL y el chequeo se saltea, en vez de pintar de rojo
      // a media cartera por algo que es esperable en el historial migrado.
      caja: cajaPorReserva.has(res.id) ? cajaPorReserva.get(res.id)! : null,
    });

    return {
      id: res.id,
      cliente: `${res.name || ""} ${res.last_name || ""}`.trim() || "Sin nombre",
      rut: res.rut || "Sin RUT",
      proyecto: nombreProyecto.get(res.project_id) || "—",
      proyectoSlug: slugProyecto.get(res.project_id) || "",
      lote: `${res.lot?.number ?? "—"}${res.lot?.stage ? ` · ${res.lot.stage}` : ""}`,
      severidad: auditoria.severidad,
      cuotasContadas: auditoria.cuotasContadas,
      totalCuotas: res.lot?.cuotas || 0,
      cuotasConRespaldo: auditoria.cuotasConRespaldo,
      recibidoEnCuotas: auditoria.recibidoEnCuotas,
      recibidoConMora: auditoria.recibidoConMora,
      pactadoDeCuotasCubiertas: auditoria.pactadoDeCuotasCubiertas,
      caja: auditoria.caja,
      // El vencimiento pactado de la ultima cuota contada y el de la ultima que
      // tiene comprobante. Puestos uno al lado del otro, un desfase se ve sin
      // tener que abrir nada.
      ultimaConComprobante: auditoria.ultimaConComprobante,
      ultimoComprobanteEtiqueta: auditoria.ultimoComprobanteEtiqueta,
      vencimientoUltimaContada: vencimientoDe(auditoria.cuotasContadas),
      vencimientoUltimoComprobante: vencimientoDe(auditoria.ultimaConComprobante),
      hallazgos: auditoria.hallazgos,
      comprobantes: res.receipts.map((r) => {
        const cubre = cuotasQueCubre(r as any);
        return {
          id: r.id,
          monto: r.amount_clp,
          estado: r.status || "—",
          concepto: esAbonoDeIntereses(r as any)
            ? SCOPE_LABELS.MORA
            : SCOPE_LABELS[r.scope] || r.scope,
          cubre: cubre.length === 0 ? "—" : cubre.length === 1 ? `Cuota ${cubre[0]}` : `Cuotas ${resumirNumeros(cubre)}`,
          fecha: fmt(fechaDePagoComprobante(r as any)),
          tieneArchivo: archivoPorComprobante.get(r.id) ?? false,
        };
      }),
    };
  });

  // Los rojos primero, después los ámbar, y dentro de cada grupo el que tiene
  // más cuotas sin respaldo: es el orden en que conviene atacarlos.
  const peso = { ROJO: 0, AMBAR: 1, VERDE: 2 } as const;
  filas.sort(
    (a, b) =>
      peso[a.severidad] - peso[b.severidad] ||
      b.hallazgos.length - a.hallazgos.length ||
      a.cliente.localeCompare(b.cliente, "es")
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Control de cartera
        </p>
        <h1 className="text-2xl font-extrabold text-brand-800 tracking-tight">
          Revisión de Comprobantes
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Por cada cliente se cruzan cuatro cosas: que cada cuota contada tenga un
          comprobante que la cubra, que ningún comprobante se pise con otro, que la plata
          recibida coincida con lo pactado por esas cuotas, y que la caja diga lo mismo
          que los comprobantes. Es solo lectura: acá no se modifica nada.
        </p>
      </div>

      <RevisionComprobantes filas={filas as any} />
    </div>
  );
}
