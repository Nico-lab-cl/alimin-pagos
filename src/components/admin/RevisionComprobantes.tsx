"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Upload,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Search,
} from "lucide-react";
import { downloadCsv, formatCLP } from "@/lib/utils";
import ModalDocumentosCliente from "@/components/admin/ModalDocumentosCliente";

/**
 * Revisión de Comprobantes: la cartera completa, un semáforo por cliente.
 *
 * Antes esta pantalla mostraba SOLO los clientes con problemas. Eso permitía
 * saber cuántos estaban rotos, pero no afirmar que el resto estuviera sano:
 * simplemente no aparecían. Ahora salen todos, los rojos primero.
 */

type Fila = {
  id: string;
  cliente: string;
  rut: string;
  proyecto: string;
  proyectoSlug: string;
  lote: string;
  severidad: "FALTAN" | "COMPLETO";
  cuotasContadas: number;
  totalCuotas: number;
  cuotasConRespaldo: number;
  ultimaConComprobante: number;
  ultimoComprobanteEtiqueta: string;
  vencimientoUltimaContada: string;
  vencimientoUltimoComprobante: string;
  hallazgos: { severidad: string; chequeo: string; titulo: string; detalle: string }[];
  comprobantes: {
    id: string;
    monto: number;
    estado: string;
    concepto: string;
    cubre: string;
    fecha: string;
    tieneArchivo: boolean;
  }[];
};

const ESTILO = {
  FALTAN: {
    punto: "bg-amber-400",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    etiqueta: "Faltan comprobantes",
    ayuda: "Tienen cuotas pagadas sin el respaldo cargado",
  },
  COMPLETO: {
    punto: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    etiqueta: "Completo",
    ayuda: "Cada cuota pagada tiene su comprobante",
  },
} as const;

const ESTADOS = ["FALTAN", "COMPLETO"] as const;

export default function RevisionComprobantes({ filas }: { filas: Fila[] }) {
  const [proyecto, setProyecto] = useState("todos");
  const [estado, setEstado] = useState<"TODOS" | "FALTAN" | "COMPLETO">("TODOS");
  const [query, setQuery] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  // Paginado. La cartera entera en una sola tabla son cientos de filas: el
  // navegador las dibuja todas, la pagina se arrastra y el hallazgo que hay que
  // mirar queda a mil scrolls. Las tarjetas de arriba y el Excel siguen contando
  // TODO lo filtrado, no la pagina: el paginado es para leer, no para medir.
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);
  // Cliente cuyo modal de documentos esta abierto. Desde ahi se adjuntan los
  // comprobantes que esta misma pantalla acaba de senalar como faltantes.
  const [enModal, setEnModal] = useState<Fila | null>(null);

  const proyectos = useMemo(
    () => [...new Set(filas.map((f) => f.proyecto))].sort(),
    [filas]
  );

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filas.filter((f) => {
      if (proyecto !== "todos" && f.proyecto !== proyecto) return false;
      if (estado !== "TODOS" && f.severidad !== estado) return false;
      if (!q) return true;
      return [f.cliente, f.rut, f.lote, f.proyecto].some((c) =>
        String(c || "").toLowerCase().includes(q)
      );
    });
  }, [filas, proyecto, estado, query]);

  // Cambiar de filtro con la pagina 7 abierta dejaba la tabla vacia sin decir
  // por que, asi que TODO filtro vuelve al principio. Se hace en el mismo
  // handler y no en un efecto: un efecto que llama setState vuelve a renderizar
  // la tabla entera de gusto.
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
  const enPagina = useMemo(
    () => visibles.slice(desde, desde + porPagina),
    [visibles, desde, porPagina]
  );

  // El conteo es sobre el proyecto elegido, no sobre lo que quedó en pantalla:
  // si no, al filtrar por "Faltan comprobantes" el resumen diría que le faltan
  // al 100%.
  const delProyecto = useMemo(
    () => filas.filter((f) => proyecto === "todos" || f.proyecto === proyecto),
    [filas, proyecto]
  );
  const conteo = {
    FALTAN: delProyecto.filter((f) => f.severidad === "FALTAN").length,
    COMPLETO: delProyecto.filter((f) => f.severidad === "COMPLETO").length,
  };

  // Desglose por proyecto. Las tarjetas de arriba responden al filtro y muestran
  // un proyecto a la vez; esto deja ver los dos juntos y comparar, que es lo que
  // hace falta para decidir cual atacar primero.
  const porProyecto = useMemo(() => {
    const filasDe = (lista: Fila[]) => ({
      total: lista.length,
      FALTAN: lista.filter((f) => f.severidad === "FALTAN").length,
      COMPLETO: lista.filter((f) => f.severidad === "COMPLETO").length,
    });
    return proyectos.map((p) => ({
      nombre: p,
      ...filasDe(filas.filter((f) => f.proyecto === p)),
    }));
  }, [filas, proyectos]);

  const exportar = async () => {
    const headers = [
      "Estado",
      "Cliente",
      "RUT",
      "Proyecto",
      "Lote",
      "Cuotas contadas",
      "Cuotas con respaldo",
      "Pago hasta la cuota",
      "Vencimiento de esa cuota",
      "Ultimo comprobante (cuota)",
      "Vencimiento de esa cuota",
      "Comprobantes que faltan",
    ];
    const rows = visibles.map((f) => [
      ESTILO[f.severidad].etiqueta,
      f.cliente,
      f.rut,
      f.proyecto,
      f.lote,
      f.cuotasContadas,
      f.cuotasConRespaldo,
      f.cuotasContadas,
      f.vencimientoUltimaContada,
      f.ultimoComprobanteEtiqueta,
      f.vencimientoUltimoComprobante,
      f.hallazgos.map((h) => h.titulo).join(" | "),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    await downloadCsv(csv, `revision_comprobantes_${proyecto}.csv`);
  };

  const th = "px-4 py-3 text-[10px] font-black text-slate-400 tracking-wider uppercase whitespace-nowrap";
  const td = "px-4 py-3 text-sm text-slate-700 whitespace-nowrap";

  return (
    <div className="space-y-5">
      {/* Resumen del proyecto elegido */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ESTADOS.map((s) => (
          <button
            key={s}
            onClick={() => elegirEstado(estado === s ? "TODOS" : s)}
            className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
              estado === s ? "border-slate-800 shadow-sm" : "border-slate-200 hover:border-slate-300"
            } bg-white`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${ESTILO[s].punto}`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {ESTILO[s].etiqueta}
              </span>
            </div>
            <p className="text-3xl font-extrabold text-slate-900 mt-1.5">{conteo[s]}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{ESTILO[s].ayuda}</p>
          </button>
        ))}
      </div>

      {/* Desglose por proyecto. Solo tiene sentido si hay mas de uno. */}
      {porProyecto.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100">
                <th className={th}>Proyecto</th>
                <th className={`${th} text-center`}>Clientes</th>
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
                    className={`cursor-pointer transition-colors ${
                      activo ? "bg-brand-50/60" : "hover:bg-slate-50/40"
                    }`}
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
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100">
                <th className={th}>Estado</th>
                <th className={th}>Cliente</th>
                <th className={th}>Lote</th>
                <th className={`${th} text-center`}>Cuotas</th>
                <th className={`${th} text-center`}>Con respaldo</th>
                <th className={th}>Pagó hasta</th>
                <th className={th}>Último comprobante</th>
                <th className={th}>Qué pasa</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enPagina.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-xs text-slate-400">
                    Ningún cliente coincide con el filtro.
                  </td>
                </tr>
              )}
              {enPagina.map((f) => {
                const est = ESTILO[f.severidad];
                const abierto = abierta === f.id;
                return (
                  <>
                    <tr
                      key={f.id}
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
                        </span>
                      </td>
                      <td className={td}>{f.lote}</td>
                      <td className={`${td} text-center font-bold`}>
                        {f.cuotasContadas}
                        <span className="text-slate-400 font-medium"> / {f.totalCuotas}</span>
                      </td>
                      <td className={`${td} text-center`}>
                        <span
                          className={
                            f.cuotasConRespaldo < f.cuotasContadas
                              ? "font-bold text-red-600"
                              : "text-slate-500"
                          }
                        >
                          {f.cuotasConRespaldo}
                        </span>
                      </td>
                      <td className={td}>
                        <span className="font-bold text-slate-900">Cuota {f.cuotasContadas}</span>
                        <span className="block text-[10px] font-bold text-slate-400">
                          venció {f.vencimientoUltimaContada} · va en la {f.cuotasContadas + 1}
                        </span>
                      </td>
                      <td className={td}>
                        {f.ultimaConComprobante === 0 ? (
                          <span className="text-slate-300">Ninguno</span>
                        ) : (
                          <>
                            {/* Rojo solo cuando el comprobante va MAS ADELANTE que
                                la ficha: eso es una contradiccion. Que vaya atras
                                solo significa que faltan papeles, y de eso ya
                                informa la columna "Con respaldo". */}
                            <span className={f.ultimaConComprobante > f.cuotasContadas ? "font-bold text-red-600" : "font-bold text-slate-900"}>
                              {f.ultimoComprobanteEtiqueta}
                            </span>
                            <span className="block text-[10px] font-bold text-slate-400">venció {f.vencimientoUltimoComprobante}</span>
                          </>
                        )}
                      </td>
                      <td className={`${td} max-w-[280px] truncate text-xs`}>
                        {f.hallazgos.length === 0 ? (
                          <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Todo coincide
                          </span>
                        ) : (
                          <span className="text-slate-600">{f.hallazgos[0].titulo}</span>
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
                      <tr key={`${f.id}-detalle`} className="bg-slate-50/50">
                        <td colSpan={9} className="px-6 py-5">
                          <div className="space-y-4">
                            {/* Hallazgos */}
                            {f.hallazgos.length > 0 && (
                              <div className="space-y-2">
                                {f.hallazgos.map((h, i) => (
                                  <div
                                    key={i}
                                    className={`p-3 rounded-xl border text-xs leading-relaxed ${
                                      h.severidad === "FALTAN"
                                        ? "bg-red-50/60 border-red-100 text-red-800"
                                        : "bg-amber-50/60 border-amber-100 text-amber-800"
                                    }`}
                                  >
                                    <p className="font-bold flex items-center gap-1.5">
                                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                      {h.chequeo} — {h.titulo}
                                    </p>
                                    <p className="mt-1 opacity-90">{h.detalle}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* El conteo de papeles. Las cifras de plata -lo respaldado, lo
                                pactado, lo ingresado en caja- se sacaron junto con los
                                chequeos de descuadre: solo servian para justificarlos, y
                                el saldo del cliente no sale de acá. */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              {[
                                ["Cuotas contadas", String(f.cuotasContadas)],
                                ["Cuotas con respaldo", String(f.cuotasConRespaldo)],
                              ].map(([k, v]) => (
                                <div key={k} className="bg-white border border-slate-200 rounded-xl p-3">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    {k}
                                  </p>
                                  <p className="text-sm font-bold text-slate-900 mt-1">{v}</p>
                                </div>
                              ))}
                            </div>

                            {/* Comprobantes */}
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                Comprobantes de la ficha ({f.comprobantes.length})
                              </p>
                              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-400">
                                      <th className="px-3 py-2">Concepto</th>
                                      <th className="px-3 py-2">Cubre</th>
                                      <th className="px-3 py-2">Estado</th>
                                      <th className="px-3 py-2 text-right">Monto</th>
                                      <th className="px-3 py-2">Fecha</th>
                                      <th className="px-3 py-2">Archivos</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {f.comprobantes.map((c) => (
                                      <tr key={c.id}>
                                        <td className="px-3 py-2 font-semibold text-slate-700">
                                          {c.concepto}
                                        </td>
                                        <td className="px-3 py-2 text-slate-600">{c.cubre}</td>
                                        <td className="px-3 py-2">
                                          <span
                                            className={`font-bold ${
                                              c.estado === "APPROVED"
                                                ? "text-emerald-600"
                                                : c.estado === "REJECTED"
                                                  ? "text-red-500"
                                                  : "text-amber-600"
                                            }`}
                                          >
                                            {c.estado}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-bold text-slate-900">
                                          {formatCLP(c.monto)}
                                        </td>
                                        <td className="px-3 py-2 text-slate-500">{c.fecha}</td>
                                        <td className="px-3 py-2">
                                          <div className="flex items-center gap-2">
                                            {c.tieneArchivo && (
                                              <a
                                                href={`/api/documents/${c.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-brand-600 hover:underline font-bold"
                                                title="Lo que subió el cliente"
                                              >
                                                Transferencia
                                              </a>
                                            )}
                                            <a
                                              href={`/api/documents/official-${c.id}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="text-slate-500 hover:underline"
                                              title="El recibo que emitimos"
                                            >
                                              Recibo
                                            </a>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                    {f.comprobantes.length === 0 && (
                                      <tr>
                                        <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                                          Esta ficha no tiene ningún comprobante cargado.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEnModal(f); }}
                              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold cursor-pointer"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Subir comprobantes que faltan
                            </button>
                            <a
                              href={`/admin/clients?cliente=${f.id}&proyecto=${f.proyectoSlug}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-800"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Abrir la ficha de {f.cliente}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginado */}
        {visibles.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/40">
            <p className="text-[11px] font-bold text-slate-500">
              Mostrando {desde + 1}–{Math.min(desde + porPagina, visibles.length)} de{" "}
              {visibles.length} cliente{visibles.length === 1 ? "" : "s"}
            </p>

            <div className="flex items-center gap-2">
              <select
                value={porPagina}
                onChange={(e) => elegirPorPagina(Number(e.target.value))}
                className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 outline-none focus:border-brand-400 cursor-pointer"
              >
                {[25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n} por página
                  </option>
                ))}
              </select>

              <button
                onClick={() => setPagina(paginaSegura - 1)}
                disabled={paginaSegura <= 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
                aria-label="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-bold text-slate-600 tabular-nums px-1">
                {paginaSegura} / {totalPaginas}
              </span>
              <button
                onClick={() => setPagina(paginaSegura + 1)}
                disabled={paginaSegura >= totalPaginas}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
                aria-label="Página siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {enModal && (
        <ModalDocumentosCliente
          reservationId={enModal.id}
          nombre={enModal.cliente}
          onClose={() => setEnModal(null)}
          onCambio={() => window.location.reload()}
        />
      )}
    </div>
  );
}
