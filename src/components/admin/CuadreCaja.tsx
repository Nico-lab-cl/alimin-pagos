"use client";

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Info,
  Lightbulb,
  Loader2,
  Search,
} from "lucide-react";
import { downloadCsv } from "@/lib/utils";
import { previsualizarCorreccionCuadre, aplicarCorreccionCuadre } from "@/actions/cuadre";
import type { CampoCorregible, EstadoCuadre, ResultadoCuadre } from "@/lib/cuadrePlan";

/**
 * Cuadre de Caja: la cartera completa, un semáforo por lote.
 *
 * Igual que la Revisión de Comprobantes salen TODOS, los rojos primero: si solo
 * aparecieran los descuadrados no se podría afirmar que el resto está sano.
 */

type Fila = {
  id: string;
  cliente: string;
  rut: string;
  proyecto: string;
  proyectoSlug: string;
  lote: string;
  terminado: boolean;
  multilote: boolean;
  resultado: ResultadoCuadre;
  panelSinReservaAparte: number | null;
};

const ESTILO: Record<EstadoCuadre, { punto: string; chip: string; etiqueta: string; ayuda: string }> = {
  DESCUADRA: {
    punto: "bg-red-500",
    chip: "bg-red-50 text-red-700 border-red-200",
    etiqueta: "Descuadra",
    ayuda: "Pie + cuotas no da el valor total",
  },
  REVISAR: {
    punto: "bg-amber-400",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    etiqueta: "Revisar",
    ayuda: "Cierra, pero hay datos que no calzan",
  },
  CUADRA: {
    punto: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    etiqueta: "Cuadra",
    ayuda: "Cierra exacto y todo coincide",
  },
};

type Previa = Extract<Awaited<ReturnType<typeof previsualizarCorreccionCuadre>>, { ok: true }>;

const ESTADOS: EstadoCuadre[] = ["DESCUADRA", "REVISAR", "CUADRA"];

const LECTURA: Record<ResultadoCuadre["lectura"], string> = {
  BRUTO: "Pie con la reserva adentro",
  NETO: "Pie guardado sin la reserva",
  SIN_RESERVA: "Sin reserva",
  NO_CIERRA: "No cierra de ninguna forma",
};

const CAMPOS: { campo: CampoCorregible; etiqueta: string; ayuda: string }[] = [
  { campo: "pie", etiqueta: "Pie", ayuda: "Con la reserva adentro. Se guarda en la ficha y en el lote." },
  { campo: "reserva_ficha", etiqueta: "Reserva (ficha)", ayuda: "La que se ve en la ficha del cliente." },
  { campo: "reserva_lote", etiqueta: "Reserva (lote)", ayuda: "La que usa el saldo del panel de Lomas." },
  { campo: "ultima_cuota", etiqueta: "Última cuota", ayuda: "Solo manda si ningún tramo cubre la última cuota." },
  { campo: "valor_total", etiqueta: "Valor total", ayuda: "Precio del lote. Es del lote, no de la ficha." },
  { campo: "valor_cuota", etiqueta: "Valor cuota", ayuda: "El de las cuotas que no caen en un tramo." },
];

function clp(n: number | null | undefined): string {
  if (n == null) return "—";
  const signo = n < 0 ? "-" : "";
  return `${signo}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
}

function valorActual(r: ResultadoCuadre, campo: CampoCorregible): number {
  switch (campo) {
    case "pie":
      return r.pie;
    case "reserva_ficha":
      return r.reserva.ficha;
    case "reserva_lote":
      return r.reserva.lote;
    case "ultima_cuota":
      return r.ultimaCuota;
    case "valor_total":
      return r.valorTotal;
    case "valor_cuota":
      return r.valorCuota;
  }
}

export default function CuadreCaja({ filas }: { filas: Fila[] }) {
  const [proyecto, setProyecto] = useState("todos");
  const [estado, setEstado] = useState<"TODOS" | EstadoCuadre>("TODOS");
  const [query, setQuery] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);
  const [verImpacto, setVerImpacto] = useState(false);

  const proyectos = useMemo(() => [...new Set(filas.map((f) => f.proyecto))].sort(), [filas]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filas.filter((f) => {
      if (proyecto !== "todos" && f.proyecto !== proyecto) return false;
      if (estado !== "TODOS" && f.resultado.estado !== estado) return false;
      if (!q) return true;
      return [f.cliente, f.rut, f.lote, f.proyecto].some((c) => String(c || "").toLowerCase().includes(q));
    });
  }, [filas, proyecto, estado, query]);

  // Todo filtro vuelve a la página 1: con la 7 abierta, un filtro más chico
  // dejaba la tabla vacía sin decir por qué.
  const filtrar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPagina(1);
  };
  const elegirProyecto = filtrar(setProyecto);
  const elegirEstado = filtrar(setEstado);
  const elegirQuery = filtrar(setQuery);
  const elegirPorPagina = filtrar(setPorPagina);

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const desde = (paginaSegura - 1) * porPagina;
  const enPagina = useMemo(() => visibles.slice(desde, desde + porPagina), [visibles, desde, porPagina]);

  const delProyecto = useMemo(
    () => filas.filter((f) => proyecto === "todos" || f.proyecto === proyecto),
    [filas, proyecto]
  );
  const conteo = Object.fromEntries(
    ESTADOS.map((s) => [s, delProyecto.filter((f) => f.resultado.estado === s).length])
  ) as Record<EstadoCuadre, number>;

  const porProyecto = useMemo(
    () =>
      proyectos.map((p) => {
        const lista = filas.filter((f) => f.proyecto === p);
        return {
          nombre: p,
          total: lista.length,
          ...(Object.fromEntries(ESTADOS.map((s) => [s, lista.filter((f) => f.resultado.estado === s).length])) as Record<
            EstadoCuadre,
            number
          >),
        };
      }),
    [filas, proyectos]
  );

  // Lomas: a quién le cambia el saldo del panel si deja de sumar la reserva
  // aparte del pie. Es la medición previa al cambio de fórmula.
  const impactoLomas = useMemo(
    () =>
      filas
        .filter((f) => f.panelSinReservaAparte !== null && f.panelSinReservaAparte !== f.resultado.saldoPanel)
        .map((f) => ({ ...f, cambio: (f.panelSinReservaAparte as number) - f.resultado.saldoPanel }))
        .sort((a, b) => Math.abs(b.cambio) - Math.abs(a.cambio)),
    [filas]
  );
  const impactoNetos = impactoLomas.filter((f) => f.resultado.lectura === "NETO").length;

  const exportar = async () => {
    const headers = [
      "Estado",
      "Cliente",
      "RUT",
      "Proyecto",
      "Lote",
      "Terminado",
      "Valor total",
      "Pie guardado",
      "Como esta el pie",
      "Reserva usada",
      "Reserva de",
      "Reserva ficha",
      "Reserva lote",
      "Reserva comprobante",
      "Pie neto",
      "Cuotas",
      "Valor cuota",
      "Ultima cuota",
      "Suma cuotas",
      "Suma plan",
      "Diferencia",
      "Cuotas pagadas",
      "Pagado segun regla",
      "Saldo segun regla",
      "Saldo portal cliente",
      "Saldo panel",
      "Ultima cuota que cierra",
      "Que pasa",
    ];
    const rows = visibles.map((f) => {
      const r = f.resultado;
      return [
        ESTILO[r.estado].etiqueta,
        f.cliente,
        f.rut,
        f.proyecto,
        f.lote,
        f.terminado ? "Si" : "No",
        r.valorTotal,
        r.pie,
        LECTURA[r.lectura],
        r.reserva.usada,
        r.reserva.usadaDe,
        r.reserva.ficha,
        r.reserva.lote,
        r.reserva.comprobante ?? "",
        r.pieNeto,
        r.cuotas,
        r.valorCuota,
        r.ultimaCuota,
        r.sumaCuotas,
        r.sumaPlan,
        r.diferencia,
        r.cuotasPagadas,
        r.pagadoSegunRegla,
        r.saldoSegunRegla,
        r.saldoPortal,
        r.saldoPanel,
        r.ultimaCuotaQueCierra ?? "",
        r.hallazgos.map((h) => h.titulo).join(" | "),
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    await downloadCsv(csv, `cuadre_caja_${proyecto}.csv`);
  };

  const th = "px-4 py-3 text-[10px] font-black text-slate-400 tracking-wider uppercase whitespace-nowrap";
  const td = "px-4 py-3 text-sm text-slate-700 whitespace-nowrap";

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ESTADOS.map((s) => (
          <button
            key={s}
            onClick={() => elegirEstado(estado === s ? "TODOS" : s)}
            className={`text-left p-4 rounded-2xl border transition-all cursor-pointer bg-white ${
              estado === s ? "border-slate-800 shadow-sm" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${ESTILO[s].punto}`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{ESTILO[s].etiqueta}</span>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 mt-1.5">{conteo[s]}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{ESTILO[s].ayuda}</p>
          </button>
        ))}
      </div>

      {porProyecto.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100">
                <th className={th}>Proyecto</th>
                <th className={`${th} text-center`}>Lotes</th>
                {ESTADOS.map((s) => (
                  <th key={s} className={`${th} text-center`}>
                    {ESTILO[s].etiqueta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {porProyecto.map((p) => {
                const activo = proyecto === p.nombre;
                return (
                  <tr
                    key={p.nombre}
                    onClick={() => elegirProyecto(activo ? "todos" : p.nombre)}
                    className={`cursor-pointer transition-colors ${activo ? "bg-brand-50/60" : "hover:bg-slate-50/40"}`}
                  >
                    <td className={`${td} font-bold text-slate-900`}>{p.nombre}</td>
                    <td className={`${td} text-center text-slate-500`}>{p.total}</td>
                    {ESTADOS.map((s) => (
                      <td key={s} className={`${td} text-center`}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${ESTILO[s].punto}`} />
                          <span className="font-bold text-slate-900">{p[s]}</span>
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Impacto del cambio de fórmula en Lomas */}
      {impactoLomas.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => setVerImpacto(!verImpacto)}
            className="w-full text-left px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-amber-50/40"
          >
            <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">
                Lomas del Mar: el panel suma la reserva aparte del pie ({impactoLomas.length} fichas cambian)
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                El portal del cliente ya cuenta pie + cuotas. El panel, y con él el {"{saldo}"} de WhatsApp y correo, suma
                además la reserva. Esta es la medición antes de corregir esa fórmula: todavía no se cambió nada.
                {impactoNetos > 0 &&
                  ` ${impactoNetos} de ellas tienen el pie guardado sin la reserva: hay que corregirles el pie primero, o su saldo en el panel subiría.`}
              </p>
            </div>
            {verImpacto ? (
              <ChevronDown className="w-4 h-4 text-slate-400 mt-0.5" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5" />
            )}
          </button>
          {verImpacto && (
            <div className="overflow-x-auto border-t border-amber-100">
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    <th className={th}>Cliente</th>
                    <th className={th}>Lote</th>
                    <th className={th}>Pie</th>
                    <th className={`${th} text-right`}>Panel hoy</th>
                    <th className={`${th} text-right`}>Panel corregido</th>
                    <th className={`${th} text-right`}>Cambio</th>
                    <th className={`${th} text-right`}>Portal del cliente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {impactoLomas.map((f) => (
                    <tr key={f.id}>
                      <td className={`${td} font-bold text-slate-900`}>
                        {f.cliente}
                        <span className="block text-[10px] font-bold text-slate-400">{f.rut}</span>
                      </td>
                      <td className={td}>{f.lote}</td>
                      <td className={`${td} text-xs`}>
                        <span className={f.resultado.lectura === "NETO" ? "font-bold text-red-600" : "text-slate-600"}>
                          {LECTURA[f.resultado.lectura]}
                        </span>
                      </td>
                      <td className={`${td} text-right`}>{clp(f.resultado.saldoPanel)}</td>
                      <td className={`${td} text-right font-bold`}>{clp(f.panelSinReservaAparte)}</td>
                      <td className={`${td} text-right font-bold ${f.cambio > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {f.cambio > 0 ? "+" : ""}
                        {clp(f.cambio)}
                      </td>
                      <td className={`${td} text-right text-slate-500`}>{clp(f.resultado.saldoPortal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <select
          value={proyecto}
          onChange={(e) => elegirProyecto(e.target.value)}
          className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 outline-none focus:border-brand-400"
        >
          <option value="todos">Todos los proyectos</option>
          {proyectos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => elegirQuery(e.target.value)}
            placeholder="Buscar cliente, RUT o lote..."
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-brand-400"
          />
        </div>

        <button
          onClick={exportar}
          className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar ({visibles.length})
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100">
                <th className={th}>Estado</th>
                <th className={th}>Cliente</th>
                <th className={th}>Lote</th>
                <th className={`${th} text-right`}>Valor total</th>
                <th className={`${th} text-right`}>Pie</th>
                <th className={`${th} text-right`}>Cuotas</th>
                <th className={`${th} text-right`}>Diferencia</th>
                <th className={th}>Qué pasa</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enPagina.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-xs text-slate-400">
                    Ningún lote coincide con el filtro.
                  </td>
                </tr>
              )}
              {enPagina.map((f) => {
                const r = f.resultado;
                const est = ESTILO[r.estado];
                const abierto = abierta === f.id;
                return (
                  <Fragment key={f.id}>
                    <tr
                      className="hover:bg-slate-50/40 transition-colors cursor-pointer"
                      onClick={() => setAbierta(abierto ? null : f.id)}
                    >
                      <td className={td}>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${est.chip}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${est.punto}`} />
                          {est.etiqueta}
                        </span>
                      </td>
                      <td className={`${td} font-bold text-slate-900`}>
                        {f.cliente}
                        <span className="block text-[10px] font-bold text-slate-400">
                          {f.rut} · {f.proyecto}
                          {f.terminado && " · Terminado"}
                          {f.multilote && " · Multilote"}
                        </span>
                      </td>
                      <td className={td}>{f.lote}</td>
                      <td className={`${td} text-right font-bold text-slate-900`}>{clp(r.valorTotal)}</td>
                      <td className={`${td} text-right`}>
                        {clp(r.pie)}
                        {r.reserva.usada > 0 && (
                          <span className="block text-[10px] font-bold text-slate-400">reserva {clp(r.reserva.usada)}</span>
                        )}
                      </td>
                      <td className={`${td} text-right`}>
                        {clp(r.sumaCuotas)}
                        <span className="block text-[10px] font-bold text-slate-400">
                          {r.cuotas} cuotas · {r.cuotasPagadas} pagadas
                        </span>
                      </td>
                      <td className={`${td} text-right font-bold`}>
                        {r.diferencia === 0 ? (
                          <span className="text-emerald-600">$0</span>
                        ) : (
                          <span className={r.lectura === "NETO" ? "text-amber-600" : "text-red-600"}>
                            {r.diferencia > 0 ? "falta " : "sobra "}
                            {clp(Math.abs(r.diferencia))}
                          </span>
                        )}
                      </td>
                      <td className={`${td} max-w-[280px] truncate text-xs`}>
                        {r.hallazgos.length === 0 ? (
                          <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Cierra exacto
                          </span>
                        ) : (
                          <span className="text-slate-600">
                            {r.hallazgos[0].titulo}
                            {r.hallazgos.length > 1 && ` (+${r.hallazgos.length - 1})`}
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-right`}>
                        {abierto ? (
                          <ChevronDown className="w-4 h-4 text-slate-400 inline" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400 inline" />
                        )}
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={9} className="px-6 py-5">
                          <Detalle fila={f} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginado */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              {visibles.length === 0 ? 0 : desde + 1}–{Math.min(desde + porPagina, visibles.length)} de {visibles.length}
            </span>
            <select
              value={porPagina}
              onChange={(e) => elegirPorPagina(Number(e.target.value))}
              className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n} por página
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPagina(Math.max(1, paginaSegura - 1))}
              disabled={paginaSegura <= 1}
              className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-600 px-2">
              {paginaSegura} / {totalPaginas}
            </span>
            <button
              onClick={() => setPagina(Math.min(totalPaginas, paginaSegura + 1))}
              disabled={paginaSegura >= totalPaginas}
              className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Renglon({ etiqueta, valor, fuerte, nota }: { etiqueta: string; valor: string; fuerte?: boolean; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-xs text-slate-500">
        {etiqueta}
        {nota && <span className="block text-[10px] text-slate-400">{nota}</span>}
      </span>
      <span className={`text-sm tabular-nums ${fuerte ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}>
        {valor}
      </span>
    </div>
  );
}

function Detalle({ fila }: { fila: Fila }) {
  const r = fila.resultado;
  const [campo, setCampo] = useState<CampoCorregible>(r.sugerencias[0]?.campo || "pie");
  const [valor, setValor] = useState<string>(String(r.sugerencias[0]?.valor ?? valorActual(r, r.sugerencias[0]?.campo || "pie")));
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [cargando, setCargando] = useState(false);

  const elegir = (c: CampoCorregible, v: number) => {
    setCampo(c);
    setValor(String(v));
    setPrevia(null);
  };

  const verPrevia = async () => {
    setCargando(true);
    const res = await previsualizarCorreccionCuadre(fila.id, { [campo]: Number(valor) });
    setCargando(false);
    if (!("ok" in res)) {
      toast.error(res.error);
      return;
    }
    setPrevia(res);
  };

  const guardar = async () => {
    setCargando(true);
    const res = await aplicarCorreccionCuadre(fila.id, { [campo]: Number(valor) });
    setCargando(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Corrección guardada y registrada en Auditoría");
    // La fila se arma en el servidor, así que hay que volver a pedirla.
    window.location.reload();
  };

  const tarjeta = "bg-white border border-slate-200 rounded-xl p-4";
  const titulo = "text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2";

  return (
    <div className="space-y-4 whitespace-normal">
      {r.hallazgos.length > 0 && (
        <div className="space-y-2">
          {r.hallazgos.map((h, i) => (
            <div
              key={i}
              className={`p-3 rounded-xl border text-xs leading-relaxed ${
                h.tipo === "DESCUADRA" ? "bg-red-50/60 border-red-100 text-red-800" : "bg-amber-50/60 border-amber-100 text-amber-800"
              }`}
            >
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {h.titulo}
              </p>
              <p className="mt-1 opacity-90">{h.detalle}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* El plan */}
        <div className={tarjeta}>
          <p className={titulo}>El plan</p>
          <Renglon etiqueta="Pie guardado" valor={clp(r.pie)} nota={LECTURA[r.lectura]} />
          {r.lectura === "NETO" && <Renglon etiqueta="+ Reserva (va dentro del pie)" valor={clp(r.reserva.usada)} />}
          <Renglon
            etiqueta={`${r.cuotas} cuotas pactadas`}
            valor={clp(r.sumaCuotas)}
            nota={r.tieneTramos ? "según sus tramos" : `${clp(r.valorCuota)} c/u`}
          />
          {r.ultimaCuota !== r.valorCuota && !r.tieneTramos && (
            <Renglon etiqueta="Última cuota" valor={clp(r.ultimaCuota)} nota="distinta al valor cuota" />
          )}
          <div className="border-t border-slate-100 my-1" />
          <Renglon etiqueta="Suma del plan" valor={clp(r.lectura === "NO_CIERRA" ? r.pie + r.sumaCuotas : r.sumaPlan)} fuerte />
          <Renglon etiqueta="Valor total del lote" valor={clp(r.valorTotal)} fuerte />
          <Renglon
            etiqueta="Diferencia"
            valor={r.diferencia === 0 || r.lectura === "NETO" ? "$0" : clp(r.diferencia)}
            fuerte
            nota={r.lectura === "NETO" ? "cierra solo sumando la reserva aparte" : undefined}
          />
        </div>

        {/* Pie y reserva */}
        <div className={tarjeta}>
          <p className={titulo}>Pie y reserva</p>
          <Renglon etiqueta="Reserva en la ficha" valor={r.reserva.ficha > 0 ? clp(r.reserva.ficha) : "—"} />
          <Renglon etiqueta="Reserva en el lote" valor={r.reserva.lote > 0 ? clp(r.reserva.lote) : "—"} />
          <Renglon
            etiqueta="Reserva con comprobante"
            valor={r.reserva.comprobante !== null ? clp(r.reserva.comprobante) : "sin comprobante"}
          />
          <p className="text-[10px] text-slate-400 py-1">
            {r.reserva.usadaDe === "ninguna"
              ? "No hay reserva cargada"
              : `Se cuadra con ${r.reserva.usadaDe === "ficha" ? "la de la ficha" : `la del ${r.reserva.usadaDe}`}`}
            {r.reserva.noCoinciden && <span className="font-bold text-amber-600"> · no coinciden</span>}
          </p>
          <div className="border-t border-slate-100 my-1" />
          <Renglon etiqueta="Pie con la reserva adentro" valor={clp(r.pieBruto)} />
          <Renglon etiqueta="Pie que paga aparte (neto)" valor={clp(r.pieNeto)} fuerte />
          <Renglon
            etiqueta="Comprobantes de pie"
            valor={r.pieConComprobantes !== null ? clp(r.pieConComprobantes) : "sin comprobante"}
          />
        </div>

        {/* Lo pagado y lo que falta */}
        <div className={tarjeta}>
          <p className={titulo}>Lo pagado y lo que falta</p>
          <Renglon etiqueta="Pagado según la regla" valor={clp(r.pagadoSegunRegla)} nota={`pie + ${r.cuotasPagadas} cuotas + extras`} />
          <Renglon etiqueta="Le falta según la regla" valor={clp(r.saldoSegunRegla)} fuerte />
          <Renglon etiqueta="Suman sus cuotas pendientes" valor={clp(r.cuotasPendientesSuman)} />
          {r.ultimaCuotaQueCierra !== null && (
            <Renglon
              etiqueta="Última cuota que cierra el total"
              valor={clp(r.ultimaCuotaQueCierra)}
              nota={r.ultimaCuotaQueCierra === r.ultimaCuota ? "coincide con la pactada" : `la pactada es ${clp(r.ultimaCuota)}`}
            />
          )}
          <div className="border-t border-slate-100 my-1" />
          <Renglon etiqueta="Saldo que ve el cliente" valor={clp(r.saldoPortal)} nota="en su portal" />
          <Renglon etiqueta="Saldo en el panel" valor={clp(r.saldoPanel)} nota="y en WhatsApp / correo" />
        </div>
      </div>

      {/* Corregir */}
      <div className={tarjeta}>
        <p className={titulo}>Corregir</p>

        {r.sugerencias.length > 0 && (
          <div className="space-y-1.5 mb-4">
            {r.sugerencias.map((s, i) => (
              <button
                key={i}
                onClick={() => elegir(s.campo, s.valor)}
                className={`w-full text-left p-2.5 rounded-lg border text-xs flex items-start gap-2 cursor-pointer transition-colors ${
                  campo === s.campo && Number(valor) === s.valor
                    ? "border-brand-400 bg-brand-50/60"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <Lightbulb className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.probable ? "text-amber-500" : "text-slate-300"}`} />
                <span className="flex-1">
                  <span className="font-bold text-slate-900">
                    {CAMPOS.find((c) => c.campo === s.campo)?.etiqueta} → {clp(s.valor)}
                  </span>
                  {s.probable && (
                    <span className="ml-2 text-[9px] font-black uppercase tracking-wider text-amber-600">más probable</span>
                  )}
                  <span className="block text-slate-500 mt-0.5">{s.motivo}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="flex-1">
            <span className="text-[10px] font-bold text-slate-500">Campo</span>
            <select
              value={campo}
              onChange={(e) => {
                const c = e.target.value as CampoCorregible;
                elegir(c, valorActual(r, c));
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700"
            >
              {CAMPOS.map((c) => (
                <option key={c.campo} value={c.campo}>
                  {c.etiqueta} (hoy {clp(valorActual(r, c.campo))})
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="text-[10px] font-bold text-slate-500">Nuevo monto</span>
            <input
              type="number"
              min={0}
              step={1}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setPrevia(null);
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 tabular-nums"
            />
          </label>
          <button
            onClick={verPrevia}
            disabled={cargando || valor === "" || Number(valor) === valorActual(r, campo)}
            className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
          >
            {cargando && !previa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            Ver cómo queda
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">{CAMPOS.find((c) => c.campo === campo)?.ayuda}</p>

        {previa && (
          <div className="mt-4 p-4 rounded-xl border border-brand-200 bg-brand-50/40 space-y-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="text-left py-1"></th>
                  <th className="text-right py-1">Antes</th>
                  <th className="text-right py-1">Después</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {previa.lineas.map((l) => (
                  <tr key={l.campo}>
                    <td className="py-1 text-slate-600">{l.etiqueta}</td>
                    <td className="py-1 text-right text-slate-500">{clp(l.antes)}</td>
                    <td className="py-1 text-right font-bold text-slate-900">{clp(l.despues)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1 text-slate-600">Cuadre</td>
                  <td className="py-1 text-right text-slate-500">
                    {ESTILO[previa.antes.estado].etiqueta} ({clp(previa.antes.diferencia)})
                  </td>
                  <td className="py-1 text-right font-bold text-slate-900">
                    {ESTILO[previa.despues.estado].etiqueta} ({clp(previa.despues.diferencia)})
                  </td>
                </tr>
                <tr>
                  <td className="py-1 text-slate-600">Saldo que ve el cliente</td>
                  <td className="py-1 text-right text-slate-500">{clp(previa.antes.saldoPortal)}</td>
                  <td className="py-1 text-right font-bold text-slate-900">{clp(previa.despues.saldoPortal)}</td>
                </tr>
                <tr>
                  <td className="py-1 text-slate-600">Saldo en el panel</td>
                  <td className="py-1 text-right text-slate-500">{clp(previa.antes.saldoPanel)}</td>
                  <td className="py-1 text-right font-bold text-slate-900">{clp(previa.despues.saldoPanel)}</td>
                </tr>
              </tbody>
            </table>
            {previa.despues.hallazgos.length > 0 && (
              <p className="text-xs text-amber-700">Después del cambio sigue pendiente: {previa.despues.hallazgos.join(" · ")}</p>
            )}
            <ul className="text-xs text-slate-600 space-y-1">
              {previa.avisos.map((a, i) => (
                <li key={i} className="flex gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                  {a}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPrevia(null)}
                className="h-9 px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={cargando}
                className="h-9 px-4 rounded-xl bg-brand-700 text-white text-xs font-bold hover:bg-brand-800 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {cargando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirmar y guardar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
