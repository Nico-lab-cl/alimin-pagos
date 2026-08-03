"use client";

import { useEffect, useState } from "react";
import { getAuditLogs } from "@/actions/postventa";
import { formatDateTime } from "@/lib/utils";
import { ACTION_LABELS_ES, ORIGIN_LABELS } from "@/lib/auditLabels";
import {
  Loader2,
  History,
  Calendar,
  User,
  Bot,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border-emerald-100",
  UPDATE: "bg-brand-50 text-brand-600 border-brand-100",
  DELETE: "bg-red-50 text-red-600 border-red-100",
  LOGIN: "bg-slate-50 text-slate-600 border-slate-200",
  LOGOUT: "bg-slate-50 text-slate-600 border-slate-200",
  OTHER: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [entityGroups, setEntityGroups] = useState<{ key: string; label: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState<"all" | "MANUAL" | "AUTOMATICO">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  const [selectedLog, setSelectedLog] = useState<any>(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        entityGroup: entityFilter,
        origin: originFilter === "all" ? undefined : originFilter,
        page: currentPage,
        pageSize,
      });
      setLogs(res.logs || []);
      setTotal(res.total || 0);
      if (res.entityGroups?.length) setEntityGroups(res.entityGroups);
    } catch (err) {
      console.error("Error loading audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, entityFilter, originFilter, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, entityFilter, originFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setEntityFilter("all");
    setOriginFilter("all");
  };

  const OriginBadge = ({ origin, size = "sm" }: { origin: string; size?: "sm" | "md" }) => {
    const isManual = origin === "MANUAL";
    const px = size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-xs";
    return isManual ? (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full font-bold bg-brand-50 text-brand-600 border border-brand-100", px)}>
        <User className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} /> {ORIGIN_LABELS.MANUAL}
      </span>
    ) : (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full font-bold bg-violet-50 text-violet-600 border border-violet-100", px)}>
        <Bot className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} /> {ORIGIN_LABELS.AUTOMATICO}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center border border-brand-100">
            <History className="w-4 h-4 text-brand-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight leading-none">Auditoría</h1>
        </div>
        <p className="text-xs text-slate-500 font-medium ml-10">
          Historial de solo lectura de todas las acciones registradas en el sistema. No modifica ningún dato.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Desde</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500 transition-all"
              />
            </div>
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Hasta</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 outline-none focus:border-brand-500 transition-all"
              />
            </div>
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Nivel del cambio</label>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-brand-500 cursor-pointer transition-all"
            >
              <option value="all">Todos</option>
              {entityGroups.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Origen</label>
            <select
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-brand-500 cursor-pointer transition-all"
            >
              <option value="all">Todos</option>
              <option value="MANUAL">{ORIGIN_LABELS.MANUAL}</option>
              <option value="AUTOMATICO">{ORIGIN_LABELS.AUTOMATICO}</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Cargando auditoría...</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha y hora</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Origen</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Usuario</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Acción</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nivel</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detalle</th>
                  <th className="px-6 py-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm text-slate-800">
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 text-xs font-semibold text-slate-600 whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <OriginBadge origin={log.origin} />
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-600">
                        {log.origin === "MANUAL" ? (log.user_email || "—") : ORIGIN_LABELS.AUTOMATICO}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold border", ACTION_COLORS[log.action] || ACTION_COLORS.OTHER)}>
                          {ACTION_LABELS_ES[log.action] || log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-700">
                        {log.entityLabel}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                        {log.clientName || "—"}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 max-w-md truncate">
                        {log.details || "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      No hay registros de auditoría para estos filtros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between p-6 border-t border-slate-100 gap-4">
              <span className="text-xs text-slate-500 font-semibold">
                Mostrando {(currentPage - 1) * pageSize + 1} a {Math.min(currentPage * pageSize, total)} de {total} registros
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Anterior
                </button>
                <span className="px-3 text-xs font-bold text-slate-500">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">Detalle del registro</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">
                  {formatDateTime(selectedLog.created_at)}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <OriginBadge origin={selectedLog.origin} size="md" />

              {selectedLog.clientName && (
                <div className="bg-brand-50/50 border border-brand-100 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-brand-600 uppercase tracking-wider mb-1">Cliente afectado</p>
                  <p className="font-bold text-brand-800 text-sm">{selectedLog.clientName}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Acción</p>
                  <p className="font-bold text-slate-800">{ACTION_LABELS_ES[selectedLog.action] || selectedLog.action}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nivel del cambio</p>
                  <p className="font-bold text-slate-800">{selectedLog.entityLabel}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 col-span-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Usuario</p>
                  <p className="font-bold text-slate-800">
                    {selectedLog.origin === "MANUAL" ? (selectedLog.user_email || "—") : ORIGIN_LABELS.AUTOMATICO}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 col-span-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">ID técnico de referencia</p>
                  <p className="font-semibold text-slate-500 break-all text-[10px]">{selectedLog.entity_id || "—"}</p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Detalle completo</p>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedLog.details || "Sin detalle"}</p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
