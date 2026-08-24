"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle, Search, Download, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import { getEmailHistory, getEmailMessageHtml } from "@/actions/email";
import { cn, downloadCsv } from "@/lib/utils";

const STATUS_FILTERS = [
  { id: "ALL", label: "Todos" },
  { id: "SENT", label: "Enviados" },
  { id: "FAILED", label: "Fallidos" },
];

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

/** Historial de todo lo enviado desde el compositor. Solo lectura. */
export default function EmailHistory({ projectSlug }: { projectSlug: string }) {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [preview, setPreview] = useState<{ row: any; html: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEmailHistory({ projectSlug, status, search, page });
      if ((res as any).error) {
        setError((res as any).error);
        setData(null);
      } else {
        setData(res);
      }
    } catch (err) {
      console.error("Error cargando el historial de correo:", err);
      setError("No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  }, [projectSlug, status, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [projectSlug, status, search]);

  const openPreview = async (row: any) => {
    setPreview({ row, html: null });
    try {
      const res = await getEmailMessageHtml(row.id);
      if ((res as any).error) {
        toast.error((res as any).error);
        setPreview(null);
        return;
      }
      setPreview({ row, html: (res as any).html });
    } catch (err) {
      console.error("Error cargando el correo:", err);
      toast.error("No se pudo cargar el correo");
      setPreview(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await getEmailHistory({ projectSlug, status, search, forExport: true });
      if ((res as any).error) {
        toast.error((res as any).error);
        return;
      }
      const rows = (res as any).rows || [];
      if (rows.length === 0) {
        toast.error("No hay correos que exportar con estos filtros");
        return;
      }

      const headers = ["Fecha", "Cliente", "Proyecto", "Correo", "Buzón", "Asunto", "Estado", "Detalle del error", "Enviado por"];
      const body = rows.map((r: any) => [
        formatDateTime(r.created_at),
        r.client_name || "",
        r.projectName || r.project_slug || "",
        r.to_email || "",
        r.buzon || "",
        r.subject || "",
        r.status === "SENT" ? "Enviado" : "Falló",
        r.error || "",
        r.sent_by || "",
      ]);

      const csv =
        "﻿" +
        [headers, ...body].map((line) => line.map((v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");

      await downloadCsv(csv, `Correos_enviados_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`${rows.length} correos exportados`);
    } catch (err) {
      console.error("Error exportando el historial de correo:", err);
      toast.error("No se pudo exportar el historial");
    } finally {
      setExporting(false);
    }
  };

  const stats = data?.stats;
  const rows = data?.rows || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        {[
          { label: "Enviados", value: stats?.sent ?? 0 },
          { label: "Fallidos", value: stats?.failed ?? 0 },
          { label: "Total", value: stats?.total ?? 0 },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{c.label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

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
            placeholder="Buscar por cliente, correo o asunto..."
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

        <div className="flex bg-slate-50 border border-slate-200 rounded-xl p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer",
                status === f.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
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
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-slate-500" />}
          Exportar CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="text-sm font-bold text-red-700">{error}</p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Proyecto</th>
                <th className="px-6 py-4">Asunto</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
              {loading && (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-600 mx-auto" />
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((row: any) => (
                  <tr
                    key={row.id}
                    onClick={() => openPreview(row)}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                    title="Ver el correo tal como se envió"
                  >
                    <td className="px-6 py-3.5">
                      <p className="font-bold text-slate-800 uppercase text-xs">{row.client_name}</p>
                      <p className="text-[10px] font-medium text-slate-400">{row.to_email}</p>
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 font-medium text-xs">{row.projectName}</td>
                    <td className="px-6 py-3.5 text-slate-600 font-medium text-xs max-w-xs truncate">{row.subject}</td>
                    <td className="px-6 py-3.5 text-slate-500 font-medium text-xs tabular-nums whitespace-nowrap">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {row.status === "SENT" ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          Enviado
                        </span>
                      ) : (
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
                ))}

              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {search || status !== "ALL" ? "Ningún correo con estos filtros" : "Todavía no se ha enviado ningún correo"}
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
              {page * (data?.pageSize || 50) + 1}–{page * (data?.pageSize || 50) + rows.length} de {stats?.total ?? 0}
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

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 uppercase truncate">{preview.row.client_name}</p>
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate">
                  {preview.row.subject} · {formatDateTime(preview.row.created_at)}
                </p>
              </div>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto bg-slate-100">
              {preview.html === null ? (
                <Loader2 className="w-5 h-5 animate-spin text-brand-600 mx-auto my-10" />
              ) : (
                <iframe title="Vista previa del correo" srcDoc={preview.html} className="w-full h-[60vh] bg-white" sandbox="" />
              )}
            </div>

            {preview.row.status === "FAILED" && preview.row.error && (
              <div className="p-4 bg-red-50 border-t border-red-200">
                <p className="text-xs font-semibold text-red-700">{preview.row.error}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
