"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Search,
} from "lucide-react";
import { downloadCsv, formatCLP } from "@/lib/utils";

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
  severidad: "ROJO" | "AMBAR" | "VERDE";
  cuotasContadas: number;
  totalCuotas: number;
  cuotasConRespaldo: number;
  recibidoEnCuotas: number;
  pactadoDeCuotasCubiertas: number;
  caja: number | null;
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
  ROJO: {
    punto: "bg-red-500",
    chip: "bg-red-50 text-red-700 border-red-200",
    etiqueta: "Descuadra",
  },
  AMBAR: {
    punto: "bg-amber-400",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    etiqueta: "Sin respaldo",
  },
  VERDE: {
    punto: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    etiqueta: "Cuadrado",
  },
} as const;

export default function RevisionComprobantes({ filas }: { filas: Fila[] }) {
  const [proyecto, setProyecto] = useState("todos");
  const [estado, setEstado] = useState<"TODOS" | "ROJO" | "AMBAR" | "VERDE">("TODOS");
  const [query, setQuery] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);

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

  // El conteo es sobre el proyecto elegido, no sobre lo que quedó en pantalla:
  // si no, al filtrar por "Descuadra" el resumen diría que el 100% descuadra.
  const delProyecto = useMemo(
    () => filas.filter((f) => proyecto === "todos" || f.proyecto === proyecto),
    [filas, proyecto]
  );
  const conteo = {
    ROJO: delProyecto.filter((f) => f.severidad === "ROJO").length,
    AMBAR: delProyecto.filter((f) => f.severidad === "AMBAR").length,
    VERDE: delProyecto.filter((f) => f.severidad === "VERDE").length,
  };

  const exportar = async () => {
    const headers = [
      "Estado",
      "Cliente",
      "RUT",
      "Proyecto",
      "Lote",
      "Cuotas contadas",
      "Cuotas con respaldo",
      "Recibido en cuotas",
      "Pactado de esas cuotas",
      "Caja",
      "Hallazgos",
    ];
    const rows = visibles.map((f) => [
      ESTILO[f.severidad].etiqueta,
      f.cliente,
      f.rut,
      f.proyecto,
      f.lote,
      f.cuotasContadas,
      f.cuotasConRespaldo,
      f.recibidoEnCuotas,
      f.pactadoDeCuotasCubiertas,
      f.caja ?? "",
      f.hallazgos.map((h) => `${h.chequeo}: ${h.titulo}`).join(" | "),
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(["ROJO", "AMBAR", "VERDE"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setEstado(estado === s ? "TODOS" : s)}
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
            <p className="text-[11px] text-slate-500 mt-0.5">
              {s === "ROJO"
                ? "Las cuotas y los comprobantes no dicen lo mismo"
                : s === "AMBAR"
                  ? "Falta el respaldo, pero nada se contradice"
                  : "Cuotas, comprobantes y caja coinciden"}
            </p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <select
          value={proyecto}
          onChange={(e) => setProyecto(e.target.value)}
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
            onChange={(e) => setQuery(e.target.value)}
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
                <th className={`${th} text-right`}>Recibido</th>
                <th className={th}>Qué pasa</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-xs text-slate-400">
                    Ningún cliente coincide con el filtro.
                  </td>
                </tr>
              )}
              {visibles.map((f) => {
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
                      <td className={`${td} text-right font-bold`}>
                        {formatCLP(f.recibidoEnCuotas)}
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
                        <td colSpan={8} className="px-6 py-5">
                          <div className="space-y-4">
                            {/* Hallazgos */}
                            {f.hallazgos.length > 0 && (
                              <div className="space-y-2">
                                {f.hallazgos.map((h, i) => (
                                  <div
                                    key={i}
                                    className={`p-3 rounded-xl border text-xs leading-relaxed ${
                                      h.severidad === "ROJO"
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

                            {/* Las cuentas, para poder verificarlas a mano */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              {[
                                ["Cuotas contadas", String(f.cuotasContadas)],
                                ["Cuotas con respaldo", String(f.cuotasConRespaldo)],
                                ["Recibido en cuotas", formatCLP(f.recibidoEnCuotas)],
                                ["Pactado de esas cuotas", formatCLP(f.pactadoDeCuotasCubiertas)],
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
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
