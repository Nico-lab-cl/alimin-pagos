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
    { key: "ALL", label: "Historial Completo", icon: null, count: data?.data?.length || 0, color: "rgba(255,255,255,0.4)" },
    { key: "LATE", label: "Mora Crítica", icon: AlertTriangle, count: data?.stats?.late || 0, color: "#f87171" },
    { key: "GRACE", label: "Días de Gracia", icon: Clock, count: data?.stats?.grace || 0, color: "var(--warning)" },
    { key: "UPCOMING", label: "Próximos Vencimientos", icon: Bell, count: data?.stats?.upcoming || 0, color: "#818cf8" },
    { key: "OK", label: "Situación Normal", icon: CheckCircle, count: data?.stats?.ok || 0, color: "var(--success)" },
  ];

  const totalPages = Math.ceil(clients.length / itemsPerPage);
  const paginatedClients = clients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-12 animate-fade-in px-4">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/20">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <p className="subtitle-responsive text-red-400">Security & Risk</p>
          </div>
          <h1 className="title-responsive">
            Centro de <span className="text-white/20">Alertas</span>
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative group w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-accent transition-colors" />
            <input
              type="text"
              placeholder="FILTRAR CLIENTE..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
            />
          </div>
          
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-white/[0.08] transition-all min-w-[200px]"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1.5rem center", backgroundSize: "1rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-[#0c1a1a]">{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Filters Deck */}
      <div className="flex flex-wrap gap-4">
        {filterButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key as FilterStatus)}
            className={`
              group relative flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500
              ${filter === btn.key 
                ? "bg-white/10 border-white/20 text-white shadow-2xl" 
                : "bg-white/5 border-white/5 text-white/30 hover:text-white/60 hover:bg-white/[0.08]"}
              border
            `}
          >
            {btn.icon && <btn.icon className="w-4 h-4" style={{ color: filter === btn.key ? btn.color : "inherit" }} />}
            <span>{btn.label}</span>
            <span className="px-2 py-0.5 rounded-lg bg-black/40 text-[9px] font-black" style={{ color: btn.color }}>{btn.count}</span>
            {filter === btn.key && <div className="absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-accent to-transparent" />}
          </button>
        ))}
      </div>

      {/* List Section */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent" />
          <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Analizando Cartera...</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {paginatedClients.map((client: any, idx: number) => (
            <div
              key={client.id}
              className="group relative rounded-[2rem] p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center gap-6 sm:gap-8 glass-card animate-slide-up"
              style={{ 
                animationDelay: `${idx * 40}ms`,
                animationFillMode: "both"
              }}
            >
              <div className="flex items-center gap-4 sm:gap-6 flex-1 min-w-0">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[1rem] sm:rounded-[1.5rem] bg-white/5 border border-white/10 flex items-center justify-center text-lg sm:text-xl font-black text-white group-hover:scale-110 transition-transform duration-500 shadow-2xl">
                  {client.clientName?.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tighter uppercase italic group-hover:text-accent transition-colors truncate">
                    {client.clientName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                      <Zap className="w-3.5 h-3.5 text-accent" />
                      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/60">Lote {client.lotNumber}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-white/20 uppercase tracking-widest">
                      <span>{client.paidCuotas}/{client.totalCuotas}</span>
                      <div className="w-1 h-1 rounded-full bg-white/10" />
                      <span>{formatCLP(client.valor_cuota)}/m</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between lg:justify-end gap-6 flex-shrink-0">
                {/* Financial Status */}
                <div className="grid gap-1 text-left sm:text-right">
                  <p className={`text-lg sm:text-xl font-black tracking-tight ${client.penaltyAmount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {client.penaltyAmount > 0 ? `+${formatCLP(client.penaltyAmount)}` : "Al Día"}
                  </p>
                  <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] opacity-20">
                    {client.penaltyAmount > 0 ? `${client.lateDays} Días Mora` : "Sin Recargos"}
                  </p>
                </div>

                <div className="w-px h-10 bg-white/5 hidden lg:block" />

                {/* Date Status */}
                <div className="grid gap-1 text-right hidden sm:grid">
                  <p className="text-sm sm:text-base font-black text-white/80">
                    {client.nextDueDate ? formatDate(client.nextDueDate) : "No Definido"}
                  </p>
                  <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] opacity-20">Próxima Fecha</p>
                </div>

                {/* Status Badge */}
                <div
                  className={`
                    px-4 sm:px-6 py-2 sm:py-3 rounded-2xl text-[8px] sm:text-[10px] font-black tracking-[0.2em] border shadow-2xl
                    ${client.status === "LATE" ? "bg-red-500/10 text-red-400 border-red-500/20"
                      : client.status === "GRACE" ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                      : client.status === "UPCOMING" ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}
                  `}
                >
                  {client.status === "LATE" ? "MORA"
                    : client.status === "GRACE" ? "GRACIA"
                    : client.status === "UPCOMING" ? "VENCE"
                    : "AL DÍA"}
                </div>

                <button className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-accent hover:text-[#061010] transition-all">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}

          {clients.length === 0 && (
            <div className="py-40 text-center border-2 border-dashed border-white/5 rounded-[3rem] glass-card">
              <Bell className="w-16 h-16 mx-auto mb-6 opacity-5" />
              <p className="text-sm font-black uppercase tracking-[0.3em] opacity-20">Sin alertas activas bajo este criterio</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-8">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-20">
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, clients.length)} de {clients.length} Alertas
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center rotate-180 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="px-4 text-xs font-black text-white/50">{currentPage} / {totalPages}</div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
