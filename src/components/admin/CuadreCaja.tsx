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
  Pencil,
  Search,
  X,
} from "lucide-react";
import { downloadCsv } from "@/lib/utils";
import {
  previsualizarCorreccionCuadre,
  aplicarCorreccionCuadre,
  previsualizarPiesSinReserva,
  corregirPiesSinReserva,
} from "@/actions/cuadre";
import { aplicarCambios, cuadrarPlan, leerTramos } from "@/lib/cuadrePlan";
import type { CambiosPlan, EstadoCuadre, FichaPlan, ResultadoCuadre } from "@/lib/cuadrePlan";

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
  ficha: FichaPlan;
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

type ListaMasiva = Extract<Awaited<ReturnType<typeof previsualizarPiesSinReserva>>, { ok: true }>["filas"];

type Previa = Extract<Awaited<ReturnType<typeof previsualizarCorreccionCuadre>>, { ok: true }>;

const ESTADOS: EstadoCuadre[] = ["DESCUADRA", "REVISAR", "CUADRA"];

const LECTURA: Record<ResultadoCuadre["lectura"], string> = {
  BRUTO: "Pie con la reserva adentro",
  NETO: "Pie guardado sin la reserva",
  SIN_RESERVA: "Sin reserva",
  NO_CIERRA: "No cierra de ninguna forma",
};

function clp(n: number | null | undefined): string {
  if (n == null) return "—";
  const signo = n < 0 ? "-" : "";
  return `${signo}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
}


export default function CuadreCaja({ filas }: { filas: Fila[] }) {
  const [proyecto, setProyecto] = useState("todos");
  const [estado, setEstado] = useState<"TODOS" | EstadoCuadre>("TODOS");
  const [query, setQuery] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);
  const [verImpacto, setVerImpacto] = useState(false);
  const [verPies, setVerPies] = useState(false);
  const [masiva, setMasiva] = useState<ListaMasiva | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const verMasiva = async () => {
    setTrabajando(true);
    const res = await previsualizarPiesSinReserva();
    setTrabajando(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.filas.length === 0) {
      toast.info("No hay fichas que cumplan las tres condiciones.");
      return;
    }
    setMasiva(res.filas);
  };

  const confirmarMasiva = async () => {
    if (!masiva) return;
    setTrabajando(true);
    const res = await corregirPiesSinReserva(masiva.map((f) => f.id));
    setTrabajando(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      `${res.corregidas} fichas corregidas${res.saltadas.length ? `; ${res.saltadas.length} saltadas porque cambiaron: ${res.saltadas.join(", ")}` : ""}`
    );
    window.location.reload();
  };

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

  // Pies que cerrarían el plan si las cuotas están bien cargadas. Es SOLO una
  // lista: cada uno se corrige abriendo su ficha, con su vista previa. Subir el
  // pie es dar esa plata por recibida, así que no hay arreglo masivo.
  const piesParaRevisar = useMemo(
    () =>
      delProyecto
        .filter((f) => f.resultado.correccionPie)
        .map((f) => ({ ...f, baja: f.resultado.correccionPie!.pieNuevo - f.resultado.pie }))
        .sort((a, b) =>
          a.resultado.correccionPie!.tipo === b.resultado.correccionPie!.tipo
            ? Math.abs(a.baja) - Math.abs(b.baja)
            : a.resultado.correccionPie!.tipo === "RESERVA_AFUERA"
              ? -1
              : 1
        ),
    [delProyecto]
  );

  const abrirFicha = (f: Fila) => {
    setEstado("TODOS");
    setQuery(f.rut !== "Sin RUT" ? f.rut : f.cliente);
    setPagina(1);
    setAbierta(f.id);
  };

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

      {/* Pies para revisar */}
      {piesParaRevisar.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => setVerPies(!verPies)}
            className="w-full text-left px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-slate-50/60"
          >
            <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">
                Pies para revisar ({piesParaRevisar.length}): el plan cierra si las cuotas están bien y el pie se corrige
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Pie calculado = valor total − cuotas pactadas, con la reserva adentro. Subir el pie es dar esa plata por
                recibida: antes de corregir, confirma con el contrato y los pagos que el cliente pagó ese pie. Se corrigen de a
                uno desde su ficha, con vista previa.
              </p>
            </div>
            {verPies ? (
              <ChevronDown className="w-4 h-4 text-slate-400 mt-0.5" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5" />
            )}
          </button>
          {verPies && (
            <div className="border-t border-slate-100 px-5 py-4 bg-amber-50/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-xs text-slate-600 flex-1">
                  <span className="font-bold text-slate-900">Corrección automática de los pies anotados sin la reserva.</span>{" "}
                  Solo entra la ficha donde al pie le falta exactamente la reserva, el plan cierra exacto con el pie corregido y lo
                  que le falta pagar coincide al peso con sus cuotas pendientes. Quedan fuera los lotes con dos fichas. Cada
                  corrección queda en la ficha y en Auditoría.
                </p>
                {!masiva && (
                  <button
                    onClick={verMasiva}
                    disabled={trabajando}
                    className="h-9 px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {trabajando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    Ver cuáles se corrigen
                  </button>
                )}
              </div>
              {masiva && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-[420px]">
                    <table className="w-full text-left border-collapse min-w-[860px]">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="border-b border-slate-100">
                          <th className={th}>Cliente</th>
                          <th className={th}>Lote</th>
                          <th className={`${th} text-right`}>Pie</th>
                          <th className={`${th} text-right`}>Reserva</th>
                          <th className={`${th} text-right`}>Saldo que ve el cliente</th>
                          <th className={`${th} text-right`}>Saldo en el panel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {masiva.map((f) => (
                          <tr key={f.id}>
                            <td className={`${td} font-bold text-slate-900`}>
                              {f.cliente}
                              <span className="block text-[10px] font-bold text-slate-400">{f.proyecto}</span>
                            </td>
                            <td className={td}>{f.lote}</td>
                            <td className={`${td} text-right`}>
                              {clp(f.pieAntes)} → <span className="font-bold">{clp(f.pieDespues)}</span>
                            </td>
                            <td className={`${td} text-right`}>{clp(f.reserva)}</td>
                            <td className={`${td} text-right`}>
                              {clp(f.portalAntes)} → <span className="font-bold">{clp(f.portalDespues)}</span>
                            </td>
                            <td className={`${td} text-right`}>
                              {clp(f.panelAntes)} → <span className="font-bold">{clp(f.panelDespues)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 border-t border-slate-100">
                    <p className="text-xs text-slate-600 flex-1">
                      {masiva.length} fichas. El saldo que ven los clientes baja en total{" "}
                      <span className="font-bold">{clp(masiva.reduce((s, f) => s + f.portalAntes - f.portalDespues, 0))}</span>
                      : es la reserva que ya pagaron y su portal no contaba. La mora no cambia.
                    </p>
                    <button
                      onClick={() => setMasiva(null)}
                      className="h-9 px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmarMasiva}
                      disabled={trabajando}
                      className="h-9 px-4 rounded-xl bg-brand-700 text-white text-xs font-bold hover:bg-brand-800 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {trabajando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Corregir {masiva.length} fichas
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {verPies && (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    <th className={th}>Cliente</th>
                    <th className={th}>Lote</th>
                    <th className={th}>Por qué</th>
                    <th className={`${th} text-right`}>Pie hoy</th>
                    <th className={`${th} text-right`}>Pie calculado</th>
                    <th className={`${th} text-right`}>Paga aparte</th>
                    <th className={`${th} text-right`}>Saldo del cliente</th>
                    <th className={th}>Comprobante de pie</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {piesParaRevisar.map((f) => {
                    const c = f.resultado.correccionPie!;
                    return (
                      <tr key={f.id}>
                        <td className={`${td} font-bold text-slate-900`}>
                          {f.cliente}
                          <span className="block text-[10px] font-bold text-slate-400">
                            {f.rut} · {f.proyecto}
                          </span>
                        </td>
                        <td className={td}>{f.lote}</td>
                        <td className={`${td} text-xs`}>
                          {c.tipo === "RESERVA_AFUERA" ? (
                            <span className="text-amber-700 font-semibold">Pie anotado sin la reserva</span>
                          ) : (
                            <span className="text-slate-600">Total − cuotas</span>
                          )}
                        </td>
                        <td className={`${td} text-right`}>{clp(f.resultado.pie)}</td>
                        <td className={`${td} text-right font-bold text-slate-900`}>{clp(c.pieNuevo)}</td>
                        <td className={`${td} text-right`}>{clp(c.pieNetoNuevo)}</td>
                        <td className={`${td} text-right font-bold ${f.baja > 0 ? "text-red-600" : "text-slate-700"}`}>
                          {f.baja > 0 ? "baja " : "sube "}
                          {clp(Math.abs(f.baja))}
                        </td>
                        <td className={`${td} text-xs`}>
                          {f.resultado.pieConComprobantes !== null ? (
                            clp(f.resultado.pieConComprobantes)
                          ) : (
                            <span className="text-slate-400">sin comprobante</span>
                          )}
                        </td>
                        <td className={`${td} text-right`}>
                          <button
                            onClick={() => abrirFicha(f)}
                            className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            Abrir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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

function Linea({ signo, etiqueta, nota, valor, fuerte }: { signo?: string; etiqueta: string; nota?: string; valor: number; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <span className="w-4 text-sm font-bold text-slate-400 text-center">{signo}</span>
      <span className="flex-1 text-sm text-slate-600">
        {etiqueta}
        {nota && <span className="ml-2 text-[11px] text-slate-400">{nota}</span>}
      </span>
      <span className={`text-sm tabular-nums ${fuerte ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}>
        {clp(valor)}
      </span>
    </div>
  );
}

/**
 * El desplegable: una sola cuenta, pie + cuotas pagadas + cuotas restantes +
 * última cuota = valor del lote, y un aviso si no da. Todo lo demás (reserva en
 * sus tres fuentes, saldos) se ve al editar.
 */
function Detalle({ fila }: { fila: Fila }) {
  const r = fila.resultado;
  const d = r.desglose;
  const [editando, setEditando] = useState(false);
  const cuadra = d.suma === r.valorTotal;
  const diferencia = r.valorTotal - d.suma;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 whitespace-normal">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <Linea etiqueta="Pie" nota={r.reserva.usada > 0 ? `reserva ${clp(r.reserva.usada)} incluida` : undefined} valor={d.pie} />
        <Linea signo="+" etiqueta={`${d.pagadas.cantidad} cuotas pagadas`} valor={d.pagadas.monto} />
        <Linea signo="+" etiqueta={`${d.restantes.cantidad} cuotas restantes`} valor={d.restantes.monto} />
        <Linea
          signo="+"
          etiqueta={`Última cuota (N° ${d.ultima.numero})`}
          nota={d.ultima.pagada ? "pagada" : undefined}
          valor={d.ultima.monto}
        />
        <div className="border-t border-slate-200 my-1.5" />
        <Linea signo="=" etiqueta="Suma" valor={d.suma} fuerte />
        <Linea etiqueta="Valor del lote" valor={r.valorTotal} fuerte />
      </div>

      <div className="space-y-3">
        {cuadra ? (
          <div className="p-3 rounded-xl border bg-emerald-50/60 border-emerald-100 text-emerald-800 text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Cuadra: la suma da exacto el valor del lote.
          </div>
        ) : (
          <div className="p-3 rounded-xl border bg-red-50/60 border-red-100 text-red-800 text-sm">
            <p className="font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {diferencia > 0 ? `Faltan ${clp(diferencia)}` : `Sobran ${clp(-diferencia)}`} para el valor del lote
            </p>
            {r.lectura === "NETO" && <p className="text-xs mt-1">Es exactamente la reserva: el pie está anotado sin ella.</p>}
          </div>
        )}
        {/* Otros avisos, una línea cada uno. El de la suma ya está arriba. */}
        {r.hallazgos
          .filter((h) => !/^(Faltan|Sobran) /.test(h.titulo) && h.titulo !== "El pie está guardado sin la reserva")
          .map((h, i) => (
            <p key={i} className="text-xs text-amber-800 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2 flex gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {h.titulo}
            </p>
          ))}
        <button
          onClick={() => setEditando(true)}
          className="h-10 px-4 rounded-xl bg-brand-700 text-white text-xs font-bold hover:bg-brand-800 flex items-center gap-2 cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5" />
          Editar valores
        </button>
      </div>

      {editando && <EditarValores fila={fila} cerrar={() => setEditando(false)} />}
    </div>
  );
}

/**
 * Ventana para editar pie, reserva y cuotas (pedido de postventa: nada más). La cuenta se rehace
 * mientras se escribe, con la misma lógica que la tabla; el guardado pasa por la
 * vista previa del servidor (saldos antes y después) y se confirma aparte.
 */
function EditarValores({ fila, cerrar }: { fila: Fila; cerrar: () => void }) {
  const f = fila.ficha;
  const r = fila.resultado;
  const tramos = useMemo(() => leerTramos(f.tramos), [f.tramos]);
  const ultimaEnTramo = tramos.some((t) => f.cuotas >= t.desde && f.cuotas <= t.hasta);
  const sinTramo = (k: number) => !tramos.some((t) => k >= t.desde && k <= t.hasta);
  let hayCuotasSinTramo = !ultimaEnTramo && !(f.ultimaCuotaFicha || f.ultimaCuotaLote);
  for (let k = 1; k < f.cuotas && !hayCuotasSinTramo; k++) if (sinTramo(k)) hayCuotasSinTramo = true;

  const [inicial] = useState(() => ({
    pie: String(r.pie),
    reserva: String(r.reserva.ficha || r.reserva.lote || 0),
    valor_cuota: String(f.valorCuota),
    ultima_cuota: String(r.ultimaCuota),
    tramos: tramos.map((t) => String(t.monto)),
  }));
  const [v, setV] = useState(inicial);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [cargando, setCargando] = useState(false);

  const n = (x: string) => Math.round(Number(x || 0));

  // Solo lo que cambió viaja al servidor.
  const cambios = useMemo(() => {
    const c: CambiosPlan = {};
    if (n(v.pie) !== n(inicial.pie)) c.pie = n(v.pie);
    if (n(v.reserva) !== n(inicial.reserva)) {
      // Una sola reserva: se escribe en la ficha y en el lote para que dejen
      // de decir cosas distintas.
      c.reserva_ficha = n(v.reserva);
      c.reserva_lote = n(v.reserva);
    }
    if (hayCuotasSinTramo && n(v.valor_cuota) !== n(inicial.valor_cuota)) c.valor_cuota = n(v.valor_cuota);
    if (!ultimaEnTramo && n(v.ultima_cuota) !== n(inicial.ultima_cuota)) c.ultima_cuota = n(v.ultima_cuota);
    if (v.tramos.some((m, i) => n(m) !== n(inicial.tramos[i]))) c.tramos = v.tramos.map(n);
    return c;
  }, [v, inicial, hayCuotasSinTramo, ultimaEnTramo]);
  const hayCambios = Object.keys(cambios).length > 0;
  const tocaCuotas = cambios.valor_cuota !== undefined || cambios.ultima_cuota !== undefined || cambios.tramos !== undefined;

  const vivo = useMemo(() => cuadrarPlan(aplicarCambios(f, cambios)), [f, cambios]);
  const vivoDif = vivo.valorTotal - vivo.desglose.suma;

  const set = (campo: "pie" | "reserva" | "valor_cuota" | "ultima_cuota", valor: string) => {
    setV((x) => ({ ...x, [campo]: valor }));
    setPrevia(null);
  };

  const revisar = async () => {
    setCargando(true);
    const res = await previsualizarCorreccionCuadre(fila.id, cambios);
    setCargando(false);
    if (!("ok" in res)) {
      toast.error(res.error);
      return;
    }
    setPrevia(res);
  };

  const guardar = async () => {
    setCargando(true);
    const res = await aplicarCorreccionCuadre(fila.id, cambios);
    setCargando(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Valores guardados y registrados en Auditoría");
    window.location.reload();
  };

  const input =
    "w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 tabular-nums outline-none focus:border-brand-400";
  const etiqueta = "text-[11px] font-bold text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={cerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Editar valores</p>
            <p className="text-lg font-extrabold text-slate-900">{fila.cliente}</p>
            <p className="text-xs text-slate-500">
              {fila.proyecto} · Lote {fila.lote} · {f.cuotas} cuotas, {f.installmentsPaid} pagadas
            </p>
          </div>
          <button onClick={cerrar} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label>
              <span className={etiqueta}>Pie (con la reserva adentro)</span>
              <input type="number" min={0} step={1} value={v.pie} onChange={(e) => set("pie", e.target.value)} className={input} />
            </label>
            <label>
              <span className={etiqueta}>Reserva</span>
              <input type="number" min={0} step={1} value={v.reserva} onChange={(e) => set("reserva", e.target.value)} className={input} />
            </label>
          </div>
          {r.reserva.usadaDe === "comprobante" && (
            <p className="text-[11px] text-slate-500">
              Esta reserva tiene comprobante por {clp(r.reserva.comprobante)}: el cuadre usa ese monto. Lo que escribas acá se
              guarda en la ficha y en el lote.
            </p>
          )}

          <div className="space-y-2">
            <p className={etiqueta}>Cuotas</p>
            {tramos.map((t, i) => (
              <label key={i} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm text-slate-600">
                  {t.desde === t.hasta ? `Cuota ${t.desde}` : `Cuotas ${t.desde}-${t.hasta}`}
                  {t.hasta > t.desde && <span className="block text-[10px] text-slate-400">{t.hasta - t.desde + 1} cuotas</span>}
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={v.tramos[i]}
                  onChange={(e) => {
                    const tr = [...v.tramos];
                    tr[i] = e.target.value;
                    setV((x) => ({ ...x, tramos: tr }));
                    setPrevia(null);
                  }}
                  className={input}
                />
              </label>
            ))}
            {hayCuotasSinTramo && (
              <label className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm text-slate-600">
                  {tramos.length > 0 ? "Cuotas sin tramo" : "Valor cuota"}
                  <span className="block text-[10px] text-slate-400">es del lote</span>
                </span>
                <input type="number" min={1} step={1} value={v.valor_cuota} onChange={(e) => set("valor_cuota", e.target.value)} className={input} />
              </label>
            )}
            {!ultimaEnTramo && (
              <label className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm text-slate-600">Última cuota (N° {f.cuotas})</span>
                <input type="number" min={1} step={1} value={v.ultima_cuota} onChange={(e) => set("ultima_cuota", e.target.value)} className={input} />
              </label>
            )}
          </div>

          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
              tocaCuotas ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-slate-50 border-slate-200 text-slate-600"
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <span className="font-bold">Ojo:</span> un valor modificado en las cuotas altera el comprobante emitido de las cuotas
              ya pagadas. El recibo oficial de esas cuotas va a salir con el valor nuevo.
            </span>
          </div>

          {/* La cuenta en vivo */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
            <Linea etiqueta="Pie" valor={vivo.desglose.pie} />
            <Linea signo="+" etiqueta={`${vivo.desglose.pagadas.cantidad} cuotas pagadas`} valor={vivo.desglose.pagadas.monto} />
            <Linea signo="+" etiqueta={`${vivo.desglose.restantes.cantidad} cuotas restantes`} valor={vivo.desglose.restantes.monto} />
            <Linea signo="+" etiqueta="Última cuota" valor={vivo.desglose.ultima.monto} />
            <div className="border-t border-slate-200 my-1" />
            <Linea signo="=" etiqueta="Suma" valor={vivo.desglose.suma} fuerte />
            <Linea etiqueta="Valor del lote" valor={vivo.valorTotal} fuerte />
            <p className={`text-sm font-bold py-1.5 ${vivoDif === 0 ? "text-emerald-600" : "text-red-600"}`}>
              {vivoDif === 0 ? "Cuadra" : vivoDif > 0 ? `Faltan ${clp(vivoDif)}` : `Sobran ${clp(-vivoDif)}`}
            </p>
          </div>

          {previa && (
            <div className="p-4 rounded-xl border border-brand-200 bg-brand-50/40 space-y-3">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="text-left py-1"></th>
                    <th className="text-right py-1">Antes</th>
                    <th className="text-right py-1">Después</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.lineas.map((l) => (
                    <tr key={l.campo}>
                      <td className="py-1 text-slate-600">{l.etiqueta}</td>
                      <td className="py-1 text-right text-slate-500">{clp(l.antes)}</td>
                      <td className="py-1 text-right font-bold text-slate-900">{clp(l.despues)}</td>
                    </tr>
                  ))}
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
              <ul className="text-xs text-slate-600 space-y-1">
                {previa.avisos.map((a, i) => (
                  <li key={i} className="flex gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 pb-5">
          <button onClick={cerrar} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 cursor-pointer">
            Cancelar
          </button>
          {!previa ? (
            <button
              onClick={revisar}
              disabled={!hayCambios || cargando}
              className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-40 cursor-pointer"
            >
              {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              Revisar cambios
            </button>
          ) : (
            <button
              onClick={guardar}
              disabled={cargando}
              className="h-10 px-4 rounded-xl bg-brand-700 text-white text-xs font-bold hover:bg-brand-800 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {cargando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirmar y guardar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
