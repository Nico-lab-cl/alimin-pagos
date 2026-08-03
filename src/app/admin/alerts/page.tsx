"use client";

import { useEffect, useState } from "react";
import { getAdminProjects, getFullPostventaData } from "@/actions/postventa";
import { formatCLP, formatDate } from "@/lib/utils";
import {
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle,
  Bell,
  Search,
  Filter,
  ShieldAlert,
  ChevronRight,
  User,
  Zap,
} from "lucide-react";

type FilterStatus = "ALL" | "LATE" | "GRACE" | "UPCOMING" | "OK";

export default function AlertsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [search, setSearch] = useState("");
  const [selectedAlertClient, setSelectedAlertClient] = useState<any>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    getAdminProjects().then((result) => {
      if (result.projects?.length) {
        setProjects(result.projects);
        setSelectedProject(result.projects[0].slug);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedProject) {
      setLoading(true);
      getFullPostventaData({ projectSlug: selectedProject }).then((result) => {
        setData(result);
        setLoading(false);
      });
    }
  }, [selectedProject]);

  const clients = (data?.data || [])
    .filter((c: any) => filter === "ALL" || c.status === filter)
    .filter(
      (c: any) =>
        !search ||
        c.clientName?.toLowerCase().includes(search.toLowerCase()) ||
        c.lotNumber?.toString().includes(search)
    );

  const filterButtons = [
    { key: "ALL", label: "Historial Completo", icon: null, count: data?.data?.length || 0, color: "#64748B" },
    { key: "LATE", label: "Mora Crítica", icon: AlertTriangle, count: data?.stats?.late || 0, color: "#b91c1c" },
    { key: "GRACE", label: "Días de Gracia", icon: Clock, count: data?.stats?.grace || 0, color: "#b45309" },
    { key: "UPCOMING", label: "Próximos Vencimientos", icon: Bell, count: data?.stats?.upcoming || 0, color: "#4338ca" },
    { key: "OK", label: "Situación Normal", icon: CheckCircle, count: data?.stats?.ok || 0, color: "#047857" },
  ];

  const totalPages = Math.ceil(clients.length / itemsPerPage);
  const paginatedClients = clients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="animate-fade-in px-4">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Historial &amp; Cobranza</p>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-[#191c1e] font-headline-lg">Centro de Registros</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]/50" />
            <input
              type="text"
              placeholder="Buscar cliente o lote..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10 focus:outline-none transition-all placeholder:text-[#64748B]/40 text-[#191c1e]"
            />
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#191c1e] font-medium focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10 focus:outline-none cursor-pointer hover:bg-slate-50 transition-all min-w-[200px]"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "1rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-white text-[#191c1e]">{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Filters Deck */}
      <div className="flex overflow-x-auto pb-2 mb-6 border-b border-[#E2E8F0] hide-scrollbar gap-2">
        {filterButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key as FilterStatus)}
            className={`
              flex items-center gap-2 px-4 py-2 text-xs font-semibold tracking-wider whitespace-nowrap transition-all border-b-2 cursor-pointer
              ${filter === btn.key
                ? "font-bold"
                : "border-transparent text-[#64748B] hover:text-[#191c1e]"}
            `}
            style={filter === btn.key ? { borderBottomColor: btn.color, color: btn.color } : undefined}
          >
            {btn.icon && <btn.icon className="w-3.5 h-3.5" style={{ color: filter === btn.key ? btn.color : "inherit" }} />}
            <span>{btn.label}</span>
            <span
              className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={filter === btn.key
                ? { backgroundColor: `${btn.color}1a`, color: btn.color }
                : { backgroundColor: "#f1f5f9", color: "#475569" }}
            >
              {btn.count}
            </span>
          </button>
        ))}
      </div>

      {/* List Section */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#64748B] opacity-65">Analizando Cartera...</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {paginatedClients.map((client: any, idx: number) => (
            <div
              key={client.id}
              className="group relative rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300 flex flex-col lg:flex-row lg:items-center gap-5 sm:gap-8 animate-slide-up"
              style={{
                animationDelay: `${idx * 40}ms`,
                animationFillMode: "both"
              }}
            >
              <div className="flex items-center gap-4 sm:gap-5 flex-1 min-w-0">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-base sm:text-lg font-bold text-slate-700 shrink-0">
                  {client.clientName?.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight leading-tight truncate">
                    {client.clientName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
                      <Zap className="w-3 h-3 text-brand-600" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Lote {client.lotNumber}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">
                      <span>{client.paidCuotas}/{client.totalCuotas}</span>
                      <div className="w-1 h-1 rounded-full bg-slate-300" />
                      <span>{formatCLP(client.valor_cuota)}/m</span>
                    </div>
                  </div>
                  {/* Overdue Installments Breakdown Row */}
                  {client.penaltyAmount > 0 && client.overdueInstallments?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {(client.penalty_mode === "FIXED" || client.penalty_mode === "MIXED") && client.manual_penalty > 0 && (
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200">
                          Fija: {formatCLP(client.manual_penalty)}
                        </span>
                      )}
                      {client.overdueInstallments.map((inst: any) => (
                        <span key={inst.number} className="text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-700 px-2 py-0.5 rounded-md border border-red-200">
                          C{inst.number}: {inst.lateDays}d
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between lg:justify-end gap-5 sm:gap-6 flex-shrink-0">
                {/* Financial Status */}
                <div className="grid gap-0.5 text-left sm:text-right">
                  <p className={`text-lg sm:text-xl font-bold tracking-tight tabular-nums ${client.penaltyAmount > 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {client.penaltyAmount > 0 ? `+${formatCLP(client.penaltyAmount)}` : "Al Día"}
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[#64748B]">
                    {client.penaltyAmount > 0 ? `${client.lateDays} Días Mora` : "Sin Recargos"}
                  </p>
                </div>

                <div className="w-px h-10 bg-slate-200 hidden lg:block" />

                {/* Date Status */}
                <div className="grid gap-0.5 text-right hidden sm:grid">
                  <p className="text-sm sm:text-base font-semibold text-slate-800 tabular-nums">
                    {client.nextDueDate ? formatDate(client.nextDueDate) : "No Definido"}
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[#64748B]">Próxima Fecha</p>
                </div>

                {/* Status Badge */}
                <div
                  className={`
                    px-3 sm:px-4 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold tracking-wider uppercase border
                    ${client.status === "LATE" ? "bg-red-50 text-red-700 border-red-200"
                      : client.status === "GRACE" ? "bg-amber-50 text-amber-700 border-amber-200"
                      : client.status === "UPCOMING" ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"}
                  `}
                >
                  {client.status === "LATE" ? "MORA"
                    : client.status === "GRACE" ? "GRACIA"
                    : client.status === "UPCOMING" ? "VENCE"
                    : "AL DÍA"}
                </div>

                <button
                  onClick={() => {
                    if (client.status === "LATE") {
                      setSelectedAlertClient(client);
                    }
                  }}
                  className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-brand-600 hover:border-brand-600 hover:text-white transition-all cursor-pointer shadow-sm"
                  title={client.status === "LATE" ? "Ver Desglose de Mora" : "Ver Cliente"}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}

          {clients.length === 0 && (
            <div className="py-32 text-center border border-dashed border-slate-300 rounded-2xl bg-white">
              <Bell className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p className="text-sm font-semibold text-[#64748B]">Sin registros activos bajo este criterio</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-6 mt-8">
          <p className="text-xs font-medium text-[#64748B]">
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, clients.length)} de {clients.length} Registros
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center rotate-180 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="px-3 text-xs font-semibold text-slate-700 tabular-nums">{currentPage} / {totalPages}</div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedAlertClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl overflow-hidden shadow-xl relative flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-[#E2E8F0] flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">Desglose de Mora</h3>
                <p className="text-xs text-[#64748B] font-medium mt-0.5">{selectedAlertClient.clientName}</p>
              </div>
              <button
                onClick={() => setSelectedAlertClient(null)}
                className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
              {/* Resumen Total */}
              <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-[9px] text-red-700/80 font-bold uppercase tracking-wider mb-1">Total Multa Vigente</p>
                  <p className="text-2xl font-bold text-red-700 tabular-nums">{formatCLP(selectedAlertClient.penaltyAmount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-red-700/80 font-bold uppercase tracking-wider mb-1">Atraso Contable</p>
                  <p className="text-lg font-semibold text-red-700 tabular-nums">{selectedAlertClient.lateDays} Días</p>
                </div>
              </div>

              {/* Mora Histórica Fija */}
              {(selectedAlertClient.penalty_mode === "FIXED" || selectedAlertClient.penalty_mode === "MIXED") && selectedAlertClient.manual_penalty > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-700">
                    <ShieldAlert className="w-4 h-4" />
                    <h4 className="text-[10px] font-bold uppercase tracking-wider">Mora Histórica (Acuerdo Fijo)</h4>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-medium text-amber-900/80 mb-3 leading-relaxed">
                      El cliente tiene un monto fijo de penalización configurado manualmente en su estado financiero. Este monto se suma al total de la deuda.
                    </p>
                    <div className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-amber-200">
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Monto Fijo Pactado</span>
                      <span className="text-sm font-bold text-amber-700 tabular-nums">{formatCLP(selectedAlertClient.manual_penalty)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Desglose Cuotas */}
              {selectedAlertClient.overdueInstallments && selectedAlertClient.overdueInstallments.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="w-4 h-4" />
                    <h4 className="text-[10px] font-bold uppercase tracking-wider">Cuotas Vencidas (Mora Diaria)</h4>
                  </div>
                  <div className="space-y-2">
                    {selectedAlertClient.overdueInstallments.map((inst: any) => (
                      <div key={inst.number} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between hover:border-slate-300 transition-colors">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-800">Cuota {inst.number}</span>
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">{inst.monthName}</span>
                          </div>
                          <p className="text-[10px] text-red-700 font-semibold uppercase tracking-wider">
                            Venció el {formatDate(inst.interestStartDate || inst.dueDate)}
                          </p>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1.5">
                          <span className="text-sm font-bold text-red-700 tabular-nums">{formatCLP(inst.penaltyAmount)}</span>
                          <span className="text-[9px] font-bold text-red-700 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                            {inst.lateDays} {inst.lateDays === 1 ? 'día' : 'días'} de atraso
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#E2E8F0] bg-slate-50">
              <button
                onClick={() => setSelectedAlertClient(null)}
                className="w-full py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-sm"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
