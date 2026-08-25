import { getAdminProjects, getFullPostventaData } from "@/actions/postventa";
import {
  getInstallmentDueDate,
  getChileToday,
  getSantiagoUTCDate,
} from "@/lib/financials";
import { formatCLP } from "@/lib/utils";

// Diagnostico de SOLO LECTURA. No escribe nada: llama a getFullPostventaData
// (la misma funcion que alimenta la bandeja y la ficha del cliente) y marca las
// filas donde el estado mostrado no cuadra con las fechas reales.
//
// Se apoya a proposito en getFullPostventaData en vez de recalcular la mora por
// su cuenta: si el diagnostico usara su propia formula, podria "no encontrar"
// justo el caso que la UI si esta mostrando mal.
//
// Ruta: /admin/diagnostico-mora  (requiere sesion ADMIN, no esta en el menu)

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MS_DIA = 1000 * 60 * 60 * 24;

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = getSantiagoUTCDate(new Date(d));
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

function mismoDia(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

type Fila = {
  proyecto: string;
  cliente: string;
  lote: string;
  cuota: string;
  estado: string;
  mora: number;
  diasVencidos: number | null;
  graceDays: number;
  vencMostrado: Date | null;
  vencUsadoPorMora: Date | null;
  debtStart: any;
  debtEnd: any;
  nextPaymentDate: any;
  penaltyMode: string;
  manualPenalty: number;
  congelado: boolean;
  sinFechaInicio: boolean;
  // Banderas
  graciaFantasma: boolean;
  fechaDesalineada: boolean;
  debtEndPasado: boolean;
};

export default async function DiagnosticoMoraPage() {
  const hoy = getChileToday();
  const proyectosRes = await getAdminProjects();

  if (proyectosRes.error) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <p className="text-sm font-bold text-red-600">{proyectosRes.error}</p>
      </div>
    );
  }

  const filas: Fila[] = [];
  const erroresProyecto: string[] = [];

  for (const proyecto of proyectosRes.projects || []) {
    const res = await getFullPostventaData({ projectSlug: proyecto.slug });
    // getFullPostventaData devuelve una union (exito | error): el campo error
    // solo existe en una de las ramas, por eso se lee sin estrechar el tipo.
    const errorProyecto = (res as { error?: string }).error;
    if (errorProyecto) {
      erroresProyecto.push(`${proyecto.name}: ${errorProyecto}`);
      continue;
    }

    for (const c of (res.data || []) as any[]) {
      const paid = c.paidCuotas ?? 0;
      const total = c.totalCuotas ?? 0;

      // Fuera: contado, terminados y los que ya no tienen cuotas por vencer.
      if (c.internalStatus === "COMPLETED" || total === 0 || paid >= total) continue;

      const graceDays = c.grace_days ?? 5;
      const dueDay = c.due_day ?? 5;

      // Lo que la ficha muestra como vencimiento (prioriza next_payment_date).
      const vencMostrado = c.nextDueDate
        ? getSantiagoUTCDate(new Date(c.nextDueDate))
        : null;

      // Lo que el calculo de mora realmente usa: siempre recalculado desde
      // installment_start_date, ignorando el override next_payment_date.
      const vencUsadoPorMora = c.installment_start_date
        ? getInstallmentDueDate(c.installment_start_date, paid + 1, dueDay)
        : null;

      const diasVencidos = vencMostrado
        ? Math.floor((hoy.getTime() - vencMostrado.getTime()) / MS_DIA)
        : null;

      const congelado = !!(c.mora_frozen || c.mora_status === "CONGELADO");
      const mora = c.penaltyAmount ?? 0;

      // A) La ficha dice "EN GRACIA" pero la gracia ya se agoto hace dias.
      const graciaFantasma =
        c.status === "GRACE" && diasVencidos !== null && diasVencidos > graceDays;

      // B) El vencimiento que se muestra no es el que se usa para cobrar mora.
      const fechaDesalineada =
        !!vencMostrado &&
        !!vencUsadoPorMora &&
        !mismoDia(vencMostrado, vencUsadoPorMora);

      // C) debt_end_date en el pasado congela el interes en $0 para siempre.
      const debtEndPasado = c.debt_end_date
        ? getSantiagoUTCDate(new Date(c.debt_end_date)) < hoy
        : false;

      if (!graciaFantasma && !fechaDesalineada && !(debtEndPasado && mora === 0))
        continue;

      filas.push({
        proyecto: proyecto.name,
        cliente: c.clientName || c.name,
        lote: `${c.lotNumber ?? "—"}${c.lotStage ? ` · Etapa ${c.lotStage}` : ""}`,
        cuota: `${paid + 1} / ${total}`,
        estado: c.status,
        mora,
        diasVencidos,
        graceDays,
        vencMostrado,
        vencUsadoPorMora,
        debtStart: c.debt_start_date,
        debtEnd: c.debt_end_date,
        nextPaymentDate: c.next_payment_date,
        penaltyMode: c.penalty_mode || "AUTO",
        manualPenalty: c.manual_penalty || 0,
        congelado,
        sinFechaInicio: !c.installment_start_date,
        graciaFantasma,
        fechaDesalineada,
        debtEndPasado,
      });
    }
  }

  const grupoA = filas.filter((f) => f.graciaFantasma);
  const grupoB = filas.filter((f) => f.fechaDesalineada);
  const grupoC = filas.filter((f) => f.debtEndPasado && f.mora === 0);

  return (
    <div className="space-y-8 pb-16">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-800 tracking-tight">
          Diagnóstico de mora y estado &quot;En gracia&quot;
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Solo lectura · no modifica ningún dato · corrido el {fmt(hoy)}
        </p>
      </div>

      {erroresProyecto.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs font-semibold text-amber-800">
          <p className="font-bold mb-1">Proyectos que no se pudieron revisar:</p>
          {erroresProyecto.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tarjeta
          titulo="Gracia fantasma"
          valor={grupoA.length}
          detalle="Dicen EN GRACIA pero la gracia ya venció"
          tono="red"
        />
        <Tarjeta
          titulo="Fecha desalineada"
          valor={grupoB.length}
          detalle="El vencimiento mostrado no es el que cobra mora"
          tono="amber"
        />
        <Tarjeta
          titulo="Mora tope en el pasado"
          valor={grupoC.length}
          detalle="debt_end_date deja el interés clavado en $0"
          tono="slate"
        />
      </div>

      <Seccion
        titulo="A · Gracia fantasma"
        explicacion="La cuota venció hace más días que los de gracia, la mora calculada es $0 y por eso el badge sigue diciendo EN GRACIA. Estos son los clientes con el mismo síntoma que Franco Baeza."
        filas={grupoA}
      />

      <Seccion
        titulo="B · Vencimiento mostrado ≠ vencimiento que cobra mora"
        explicacion="La ficha muestra next_payment_date, pero el cálculo de mora recalcula el vencimiento desde installment_start_date e ignora ese override. Cuando difieren, se cobra mora sobre una fecha distinta a la que ve postventa."
        filas={grupoB}
      />

      <Seccion
        titulo="C · debt_end_date en el pasado con mora $0"
        explicacion="debt_end_date topa el día hasta el cual se cuenta interés. Si quedó en una fecha ya pasada, el interés no vuelve a crecer nunca, aunque el cliente siga sin pagar."
        filas={grupoC}
      />

      {filas.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center">
          <p className="text-sm font-bold text-slate-500">
            Ningún cliente quedó marcado. El estado mostrado cuadra con las fechas en
            todos los proyectos revisados.
          </p>
        </div>
      )}
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  tono,
}: {
  titulo: string;
  valor: number;
  detalle: string;
  tono: "red" | "amber" | "slate";
}) {
  const color =
    tono === "red"
      ? "text-red-600"
      : tono === "amber"
        ? "text-amber-600"
        : "text-slate-700";
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
        {titulo}
      </span>
      <span className={`text-3xl font-black ${color}`}>{valor}</span>
      <p className="text-xs text-slate-500 font-medium mt-1 leading-snug">{detalle}</p>
    </div>
  );
}

function Seccion({
  titulo,
  explicacion,
  filas,
}: {
  titulo: string;
  explicacion: string;
  filas: Fila[];
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100">
        <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">
          {titulo}{" "}
          <span className="text-slate-400 font-bold">({filas.length})</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-3xl">
          {explicacion}
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="p-6 text-xs font-bold text-slate-400">
          Sin casos en esta categoría.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
              <tr>
                <Th>Cliente</Th>
                <Th>Proyecto</Th>
                <Th>Lote</Th>
                <Th>Cuota</Th>
                <Th>Estado</Th>
                <Th>Mora</Th>
                <Th>Venc. mostrado</Th>
                <Th>Venc. usado por mora</Th>
                <Th>Días venc.</Th>
                <Th>Gracia</Th>
                <Th>penalty_mode</Th>
                <Th>manual_penalty</Th>
                <Th>debt_start</Th>
                <Th>debt_end</Th>
                <Th>next_payment_date</Th>
                <Th>Congelado</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  <Td bold>{f.cliente}</Td>
                  <Td>{f.proyecto}</Td>
                  <Td>{f.lote}</Td>
                  <Td>{f.cuota}</Td>
                  <Td>{f.estado}</Td>
                  <Td>{formatCLP(f.mora)}</Td>
                  <Td>{fmt(f.vencMostrado)}</Td>
                  <Td
                    className={f.fechaDesalineada ? "text-red-600 font-bold" : ""}
                  >
                    {f.sinFechaInicio ? "sin fecha inicio" : fmt(f.vencUsadoPorMora)}
                  </Td>
                  <Td className={f.graciaFantasma ? "text-red-600 font-bold" : ""}>
                    {f.diasVencidos ?? "—"}
                  </Td>
                  <Td>{f.graceDays}</Td>
                  <Td>{f.penaltyMode}</Td>
                  <Td>{f.manualPenalty ? formatCLP(f.manualPenalty) : "—"}</Td>
                  <Td>{fmt(f.debtStart)}</Td>
                  <Td className={f.debtEndPasado ? "text-red-600 font-bold" : ""}>
                    {fmt(f.debtEnd)}
                  </Td>
                  <Td>{fmt(f.nextPaymentDate)}</Td>
                  <Td>{f.congelado ? "sí" : "no"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 text-left font-bold">{children}</th>;
}

function Td({
  children,
  bold,
  className = "",
}: {
  children: React.ReactNode;
  bold?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2.5 ${bold ? "font-bold text-slate-800" : "text-slate-600 font-medium"} ${className}`}
    >
      {children}
    </td>
  );
}
