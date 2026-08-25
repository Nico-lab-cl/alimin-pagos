"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Download,
  FileSpreadsheet,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { getPaymentNoticeHistory, getPaymentNoticeMessage } from "@/actions/whatsapp";
import { PAYMENT_CATEGORIES, PAYMENT_CATEGORY_LABELS } from "@/lib/whatsappTemplates";
import { cn, downloadCsv } from "@/lib/utils";
import { PAYMENT_CATEGORY_STYLES } from "./categoryStyles";

/**
 * Historial de los avisos que salieron solos al aprobar o registrar un pago.
 *
 * Es una vista de lectura: aca no se envia nada ni se reintenta nada a mano. Lo
 * que muestra es a quien se le aviso, de que pago, por cuanto y si el mensaje
 * llego a salir. Las filas rojas son lo unico accionable, y casi siempre
 * significan un telefono mal escrito en la ficha del cliente.
 *
 * Los mensajes de cobranza no aparecen aca: esos viven en el panel y se envian a
 * mano desde la pestana de envio.
 */

const STATUS_FILTERS = [
  { id: "ALL", label: "Todos" },
  { id: "SENT", label: "Enviados" },
  { id: "QUEUED", label: "En cola" },
  { id: "FAILED", label: "Fallidos" },
];

function formatCLP(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return `$${Math.round(Number(amount) || 0).toLocaleString("es-CL")}`;
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function WhatsappPaymentHistory({ projectSlug }: { projectSlug: string }) {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(0);
  /** Lo que se está escribiendo, separado de lo que ya se buscó. */
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  /** Aviso abierto para leer el texto completo tal como le llegó al cliente. */
  const [preview, setPreview] = useState<{ row: any; message: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPaymentNoticeHistory({ projectSlug, category, status, search, page });
      if ((res as any).error) {
        setError((res as any).error);
        setData(null);
      } else {
        setData(res);
      }
    } catch (err) {
      console.error("Error cargando el historial de avisos:", err);
      setError("No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  }, [projectSlug, category, status, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Cualquier cambio de filtro vuelve a la primera página: quedarse en la
  // página 4 de un filtro que ahora tiene 12 filas deja la tabla en blanco.
  useEffect(() => {
    setPage(0);
  }, [projectSlug, category, status, search]);

  const openPreview = async (row: any) => {
    setPreview({ row, message: null });
    try {
      const res = await getPaymentNoticeMessage(row.id);
      if ((res as any).error) {
        toast.error((res as any).error);
        setPreview(null);
        return;
      }
      setPreview({ row, message: (res as any).message });
    } catch (err) {
      console.error("Error cargando el texto del aviso:", err);
      toast.error("No se pudo cargar el mensaje");
      setPreview(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await getPaymentNoticeHistory({
        projectSlug,
        category,
        status,
        search,
        forExport: true,
      });
      if ((res as any).error) {
        toast.error((res as any).error);
        return;
      }

      const rows = (res as any).rows || [];
      if (rows.length === 0) {
        toast.error("No hay avisos que exportar con estos filtros");
        return;
      }

      const headers = [
        "Fecha",
        "Cliente",
        "RUT",
        "Proyecto",
        "Lote",
        "Tipo de aviso",
        "Concepto",
        "Monto",
        "Teléfono",
        "Estado",
        "Detalle del error",
        "Instancia",
        "Aprobado/registrado por",
      ];

      const body = rows.map((r: any) => [
        formatDateTime(r.created_at),
        r.client_name || "",
        r.rut || "",
        r.projectName || r.project_slug || "",
        r.lot_label || "",
        PAYMENT_CATEGORY_LABELS[r.category as keyof typeof PAYMENT_CATEGORY_LABELS] || r.category,
        r.notice_concept || "",
        r.notice_amount ?? "",
        r.phone ? `+${r.phone}` : "",
        r.status === "SENT" ? "Enviado" : r.status === "FAILED" ? "Falló" : "En cola",
        r.error || "",
        r.instance || "",
        r.sent_by || "",
      ]);

      // BOM al principio para que Excel en Windows abra las tildes bien.
      const csv =
        "﻿" +
        [headers, ...body]
          .map((line) =>
            line.map((v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")
          )
          .join("\n");

      await downloadCsv(csv, `Avisos_de_pago_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`${rows.length} avisos exportados`);
    } catch (err) {
      console.error("Error exportando el historial:", err);
      toast.error("No se pudo exportar el historial");
    } finally {
      setExporting(false);
    }
  };

  const stats = data?.stats;
  const rows = data?.rows || [];

  return (
    <div className="space-y-6">
      {/* Que es esta pantalla */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-3">
        <Zap className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs font-semibold text-slate-600 leading-relaxed">
          Avisos que salieron automáticamente al aprobar un comprobante en la bandeja de pagos. Empiezan a
          contarse desde que se activó el módulo: los pagos anteriores no generaron ningún
          mensaje.
        </p>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: "Enviados",
            value: stats?.sent ?? 0,
            hint: stats?.lastSentAt ? `Último: ${formatDateTime(stats.lastSentAt)}` : "Sin envíos aún",
          },
          { label: "En cola", value: stats?.queued ?? 0, hint: "Esperando su turno de salida" },
          { label: "Fallidos", value: stats?.failed ?? 0, hint: "Revisar teléfono en la ficha" },
          { label: "Total", value: stats?.total ?? 0, hint: "Con los filtros aplicados" },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"
          >
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {card.label}
            </p>
            <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums">{card.value}</p>
            <p className="text-[10px] font-semibold text-slate-400 mt-1">{card.hint}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
          }}
          className="relative flex-1 min-w-56"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por cliente, RUT, lote o teléfono..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 py-2 text-xs font-medium text-slate-800 outline-none focus:border-brand-500 transition-all"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition-all uppercase"
        >
          <option value="ALL">Todos los tipos</option>
          {PAYMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PAYMENT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>

        <div className="flex bg-slate-50 border border-slate-200 rounded-xl p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer",
                status === f.id
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={exportCsv}
          disabled={exporting || !rows.length}
          className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 text-slate-500" />
          )}
          Exportar CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="text-sm font-bold text-red-700">{error}</p>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Proyecto</th>
                <th className="px-6 py-4">Lote</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Concepto</th>
                <th className="px-6 py-4 text-right">Monto</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-600 mx-auto" />
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((row: any) => {
                  const style =
                    PAYMENT_CATEGORY_STYLES[
                      row.category as keyof typeof PAYMENT_CATEGORY_STYLES
                    ];
                  const queued = row.status === "QUEUED" || row.status === "SENDING";

                  return (
                    <tr
                      key={row.id}
                      onClick={() => openPreview(row)}
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                      title="Ver el mensaje que se le envió"
                    >
                      <td className="px-6 py-3.5">
                        <p className="font-bold text-slate-800 uppercase text-xs">
                          {row.client_name}
                        </p>
                        <p className="text-[10px] font-medium text-slate-400 tabular-nums">
                          {row.rut || "Sin RUT"} · +{row.phone}
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 font-medium text-xs">
                        {row.projectName}
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 font-medium text-xs tabular-nums">
                        {row.lot_label || "—"}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap",
                            style?.bg,
                            style?.border,
                            style?.text
                          )}
                        >
                          {PAYMENT_CATEGORY_LABELS[
                            row.category as keyof typeof PAYMENT_CATEGORY_LABELS
                          ] || row.category}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-600 font-medium text-xs">
                        {row.notice_concept || "—"}
                      </td>
                      <td className="px-6 py-3.5 text-right font-bold text-slate-800 text-xs tabular-nums">
                        {formatCLP(row.notice_amount)}
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 font-medium text-xs tabular-nums whitespace-nowrap">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {row.status === "SENT" && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            Enviado
                          </span>
                        )}
                        {queued && (
                          <span
                            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700"
                            title={
                              row.attempts > 0
                                ? `Reintentando (${row.attempts} intentos)`
                                : "Esperando su turno de salida"
                            }
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            En cola
                          </span>
                        )}
                        {row.status === "FAILED" && (
                          <span
                            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-700"
                            title={row.error || "Error desconocido"}
                          >
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            Falló
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {search || category !== "ALL" || status !== "ALL"
                        ? "Ningún aviso con estos filtros"
                        : "Todavía no se ha enviado ningún aviso de pago"}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(page > 0 || data?.hasMore) && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider tabular-nums">
              {page * (data?.pageSize || 50) + 1}–{page * (data?.pageSize || 50) + rows.length} de{" "}
              {stats?.total ?? 0}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!data?.hasMore || loading}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Texto tal como le llegó al cliente */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-800 uppercase">
                  {preview.row.client_name}
                </p>
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                  {preview.row.notice_concept} · {formatCLP(preview.row.notice_amount)} ·{" "}
                  {formatDateTime(preview.row.created_at)}
                </p>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {preview.message === null ? (
                <Loader2 className="w-5 h-5 animate-spin text-brand-600 mx-auto my-6" />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  {preview.message}
                </pre>
              )}

              {preview.row.status === "FAILED" && preview.row.error && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-[11px] font-bold text-red-700 uppercase tracking-wider mb-1">
                    No se pudo enviar
                  </p>
                  <p className="text-xs font-semibold text-red-700/90 leading-relaxed">
                    {preview.row.error}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
