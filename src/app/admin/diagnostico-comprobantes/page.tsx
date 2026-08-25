import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCLP } from "@/lib/utils";

// Diagnostico de SOLO LECTURA. No escribe nada: reproduce exactamente el mismo
// cruce con el que el portal del cliente decide si una cuota pagada muestra el
// boton de descarga o el texto "No disponible" (src/app/user/page.tsx), y pone
// al lado los comprobantes que SI existen en la base, con su estado y su numero
// nominal, para poder ver por que no se estan cruzando.
//
// Ruta: /admin/diagnostico-comprobantes  (requiere sesion ADMIN, no esta en el menu)

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

/**
 * Cruce EXACTO que hace el portal del cliente: nominal_installment_number igual,
 * o el rango partido por "-" cuyos EXTREMOS incluyan la cuota. Ojo: se replica
 * con su limitacion incluida (un rango "4-6" no matchea la cuota 5, porque
 * split solo deja los extremos), para que el diagnostico refleje lo que el
 * cliente realmente ve y no lo que deberia ver.
 */
function matcheaComoElPortal(r: any, cuota: number): boolean {
  if (r.nominal_installment_number === cuota) return true;
  if (r.nominal_installment_range) {
    return r.nominal_installment_range.split("-").map(Number).includes(cuota);
  }
  return false;
}

/** Cruce correcto: un rango "4-6" cubre 4, 5 y 6. */
function matcheaPorRangoReal(r: any, cuota: number): boolean {
  if (r.nominal_installment_number === cuota) return true;
  if (r.nominal_installment_range) {
    const [desde, hasta] = r.nominal_installment_range.split("-").map(Number);
    if (Number.isFinite(desde) && Number.isFinite(hasta)) {
      return cuota >= desde && cuota <= hasta;
    }
  }
  return false;
}

type CuotaHueca = {
  numero: number;
  causa: string;
  detalle: string;
};

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
      installments_paid: true,
      project_id: true,
      lot: { select: { number: true, stage: true, cuotas: true } },
      receipts: {
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          amount_clp: true,
          status: true,
          scope: true,
          installments_count: true,
          nominal_installment_number: true,
          nominal_installment_range: true,
          created_at: true,
        },
      },
      documents: { select: { name: true } },
    },
  });

  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.name]));

  const filas = reservas.map((res) => {
    const pagadas = res.installments_paid || 0;
    const aprobados = res.receipts.filter((r) => r.status === "APPROVED");
    const nombresDocs = res.documents.map((d) => (d.name || "").toLowerCase());

    const huecas: CuotaHueca[] = [];
    for (let i = 1; i <= pagadas; i++) {
      if (aprobados.some((r) => matcheaComoElPortal(r, i))) continue;

      // La cuota no muestra comprobante. Ahora se busca POR QUE.
      const porRangoReal = aprobados.find((r) => matcheaPorRangoReal(r, i));
      if (porRangoReal) {
        huecas.push({
          numero: i,
          causa: "Rango intermedio",
          detalle: `El comprobante ${porRangoReal.id.slice(0, 8)} cubre el rango ${porRangoReal.nominal_installment_range}, pero el portal solo cruza los extremos del rango.`,
        });
        continue;
      }

      const pendiente = res.receipts.find(
        (r) => r.status !== "APPROVED" && matcheaPorRangoReal(r, i)
      );
      if (pendiente) {
        huecas.push({
          numero: i,
          causa: `Comprobante en estado ${pendiente.status}`,
          detalle: `Existe el comprobante ${pendiente.id.slice(0, 8)} de ${formatCLP(pendiente.amount_clp)} del ${fmt(pendiente.created_at)}, pero el portal solo muestra los APPROVED.`,
        });
        continue;
      }

      const sinNumero = res.receipts.filter(
        (r) =>
          r.scope !== "PIE" &&
          r.nominal_installment_number == null &&
          !r.nominal_installment_range
      );
      if (sinNumero.length > 0) {
        huecas.push({
          numero: i,
          causa: "Comprobante sin numero de cuota",
          detalle: `Hay ${sinNumero.length} comprobante(s) de cuota sin nominal_installment_number, asi que no se pueden asignar a ninguna fila del historial.`,
        });
        continue;
      }

      const huerfanos = aprobados.filter(
        (r) => r.scope !== "PIE" && (r.nominal_installment_number || 0) > pagadas
      );
      if (huerfanos.length > 0) {
        huecas.push({
          numero: i,
          causa: "Numeracion corrida",
          detalle: `Hay comprobante(s) aprobados apuntando a la cuota ${huerfanos
            .map((r) => r.nominal_installment_number)
            .join(", ")}, mayor que las ${pagadas} cuotas contadas como pagadas.`,
        });
        continue;
      }

      huecas.push({
        numero: i,
        causa: "Sin comprobante",
        detalle:
          "No existe ningun PaymentReceipt para esta cuota: la cuota se sumo sin adjuntar archivo (pago manual sin comprobante, o edicion directa de Cuotas Pagadas).",
      });
    }

    // El PDF oficial que emite el sistema se guarda como Comprobante_Pago_<6 hex>.pdf
    const aprobadosSinPdf = aprobados.filter(
      (r) =>
        r.scope !== "PIE" &&
        !nombresDocs.some((n) =>
          n.includes(`comprobante_pago_${r.id.slice(0, 6).toLowerCase()}`)
        )
    );

    return {
      id: res.id,
      proyecto: nombreProyecto.get(res.project_id) || "—",
      cliente: `${res.name || ""} ${res.last_name || ""}`.trim() || "Sin nombre",
      lote: `${res.lot?.number ?? "—"}${res.lot?.stage ? ` · Etapa ${res.lot.stage}` : ""}`,
      pagadas,
      totalCuotas: res.lot?.cuotas || 0,
      receipts: res.receipts,
      huecas,
      aprobadosSinPdf,
    };
  });

  const conHuecos = filas
    .filter((f) => f.huecas.length > 0)
    .sort((a, b) => b.huecas.length - a.huecas.length);

  const porCausa = new Map<string, number>();
  for (const f of conHuecos) {
    for (const h of f.huecas) porCausa.set(h.causa, (porCausa.get(h.causa) || 0) + 1);
  }

  const totalHuecas = conHuecos.reduce((acc, f) => acc + f.huecas.length, 0);
  const sinPdfOficial = filas.filter((f) => f.aprobadosSinPdf.length > 0);

  return (
    <div className="space-y-8 pb-16">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-800 tracking-tight">
          Diagnóstico de comprobantes por cuota
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Solo lectura · no modifica ningún dato · {filas.length} reservas revisadas
        </p>
        <p className="text-xs text-slate-400 mt-2 max-w-3xl leading-relaxed">
          Lista las cuotas que el cliente ve como <b>&quot;Pagado&quot;</b> pero sin botón de
          descarga (&quot;No disponible&quot;), y para cada una explica por qué no se cruza con
          ningún comprobante.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Cuotas sin comprobante
          </p>
          <p className="text-3xl font-extrabold text-red-600 mt-1">{totalHuecas}</p>
          <p className="text-[11px] text-slate-500 mt-1">en {conHuecos.length} cliente(s)</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Causas encontradas
          </p>
          <div className="mt-2 space-y-1">
            {porCausa.size === 0 && <p className="text-xs text-slate-400">—</p>}
            {[...porCausa.entries()].map(([causa, n]) => (
              <p key={causa} className="text-[11px] font-semibold text-slate-600">
                {causa}: <span className="font-extrabold text-slate-800">{n}</span>
              </p>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Aprobados sin PDF oficial
          </p>
          <p className="text-3xl font-extrabold text-amber-600 mt-1">
            {sinPdfOficial.reduce((a, f) => a + f.aprobadosSinPdf.length, 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            en {sinPdfOficial.length} cliente(s) · solo pueden bajar su propio archivo
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {conHuecos.length === 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-sm font-bold text-emerald-800">
            Ninguna cuota pagada quedó sin comprobante.
          </div>
        )}

        {conHuecos.map((f) => (
          <div key={f.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-extrabold text-slate-800">{f.cliente}</span>
              <span className="text-xs font-bold text-slate-500">Lote {f.lote}</span>
              <span className="text-[11px] font-semibold text-slate-400">{f.proyecto}</span>
              <span className="text-[11px] font-semibold text-slate-400 ml-auto">
                {f.pagadas} de {f.totalCuotas} cuotas pagadas · {f.receipts.length} comprobante(s)
                en base
              </span>
            </div>

            <div className="px-5 py-4 space-y-2">
              {f.huecas.map((h) => (
                <div key={h.numero} className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-extrabold text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-0.5">
                    Cuota #{String(h.numero).padStart(2, "0")}
                  </span>
                  <span className="text-xs font-bold text-slate-700">{h.causa}</span>
                  <span className="text-[11px] text-slate-500 basis-full">{h.detalle}</span>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 overflow-x-auto">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Comprobantes en la base
              </p>
              {f.receipts.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Ninguno.</p>
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead className="text-slate-400 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="pr-4 py-1">ID</th>
                      <th className="pr-4 py-1">Estado</th>
                      <th className="pr-4 py-1">Tipo</th>
                      <th className="pr-4 py-1">Cuota nominal</th>
                      <th className="pr-4 py-1">Rango</th>
                      <th className="pr-4 py-1">Cant.</th>
                      <th className="pr-4 py-1">Monto</th>
                      <th className="pr-4 py-1">Subido</th>
                      <th className="pr-4 py-1">PDF oficial</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700 font-semibold">
                    {f.receipts.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="pr-4 py-1 font-mono">{r.id.slice(0, 8)}</td>
                        <td
                          className={`pr-4 py-1 font-extrabold ${
                            r.status === "APPROVED" ? "text-emerald-700" : "text-amber-700"
                          }`}
                        >
                          {r.status}
                        </td>
                        <td className="pr-4 py-1">{r.scope}</td>
                        <td className="pr-4 py-1">{r.nominal_installment_number ?? "—"}</td>
                        <td className="pr-4 py-1">{r.nominal_installment_range ?? "—"}</td>
                        <td className="pr-4 py-1">{r.installments_count ?? 1}</td>
                        <td className="pr-4 py-1">{formatCLP(r.amount_clp)}</td>
                        <td className="pr-4 py-1">{fmt(r.created_at)}</td>
                        <td className="pr-4 py-1">
                          {f.aprobadosSinPdf.some((x) => x.id === r.id) ? "falta" : "ok"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
