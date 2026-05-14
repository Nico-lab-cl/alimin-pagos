"use client";

import { useEffect, useState } from "react";
import { getAdminProjects, getProjectReservations } from "@/actions/postventa";
import { formatCLP, formatDate } from "@/lib/utils";
import { useSearch } from "@/context/SearchContext";
import {
  Loader2, User, Phone, Mail, MapPin, Calendar,
  ChevronRight, BookOpen, Eye, X, FileSignature,
  Shield, Clock, CheckCircle2, AlertTriangle, Search
} from "lucide-react";

type ReservationStatus = "active" | "COMPLETED" | "cancelled" | string;

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  active: { label: "Activa", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle2 },
  COMPLETED: { label: "Completada", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20", icon: Shield },
  cancelled: { label: "Cancelada", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: AlertTriangle },
};

function getStatusInfo(status: ReservationStatus) {
  return statusConfig[status] || { label: status, color: "text-white/40", bg: "bg-white/5", border: "border-white/10", icon: Clock };
}

export default function ReservasPage() {
  const { search } = useSearch();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [detailReservation, setDetailReservation] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const itemsPerPage = 12;

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
      setCurrentPage(1);
      getProjectReservations(selectedProject).then((result) => {
        setReservations(result.reservations || []);
        setLoading(false);
      });
    }
  }, [selectedProject]);

  const filtered = reservations.filter((r) => {
    const matchesSearch =
      !search ||
      r.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      r.rut?.toLowerCase().includes(search.toLowerCase()) ||
      r.lotNumber?.toString().includes(search) ||
      r.advisor?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = {
    total: reservations.length,
    active: reservations.filter((r) => r.status === "active").length,
    completed: reservations.filter((r) => r.status === "COMPLETED").length,
  };

  return (
    <div className="space-y-10 animate-fade-in px-4">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/20">
              <BookOpen className="w-5 h-5 text-accent" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-accent">
              Gestión de Reservas
            </p>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase leading-none">
            Reservas <span className="text-white/20">del Proyecto</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Stats pills */}
          <div className="flex items-center gap-3 mr-2">
            <span className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50">
              {stats.total} Total
            </span>
            <span className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-400">
              {stats.active} Activas
            </span>
            <span className="px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-[10px] font-black uppercase tracking-widest text-sky-400">
              {stats.completed} Completadas
            </span>
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="px-5 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-white/[0.08] transition-all"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "0.8rem" }}
          >
            <option value="all" className="bg-[#0c1a1a]">Todos los estados</option>
            <option value="active" className="bg-[#0c1a1a]">Activas</option>
            <option value="COMPLETED" className="bg-[#0c1a1a]">Completadas</option>
          </select>

          {/* Project selector */}
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-6 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-white/[0.08] transition-all min-w-[200px]"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1.5rem center", backgroundSize: "1rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-[#0c1a1a]">{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent" />
          <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Cargando Reservas...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-40 rounded-[3rem] border border-white/5 glass-card animate-fade-in">
          <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-10 border border-white/10">
            <BookOpen className="w-12 h-12 text-white/10" />
          </div>
          <h3 className="text-3xl font-black text-white mb-3 italic tracking-tighter uppercase">Sin Reservas</h3>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-30 max-w-xs mx-auto">
            No se encontraron reservas para este proyecto con los filtros seleccionados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {paginated.map((res: any, idx: number) => {
            const si = getStatusInfo(res.status);
            const StatusIcon = si.icon;
            return (
              <div
                key={res.id}
                onClick={() => setDetailReservation(res)}
                className="group relative rounded-[2.5rem] overflow-hidden glass-card cursor-pointer hover:border-accent/20 transition-all duration-500 animate-slide-up"
                style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "both" }}
              >
                <div className="p-8 space-y-6">
                  {/* Client header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-accent group-hover:text-[#061010] group-hover:shadow-[0_0_25px_rgba(212,168,75,0.3)] transition-all duration-500">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-lg font-black text-white tracking-tighter uppercase leading-none italic group-hover:translate-x-0.5 transition-transform">
                          {res.fullName}
                        </h4>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-accent italic">
                            Lote {res.lotNumber}
                          </span>
                          {res.lotStage && (
                            <>
                              <div className="w-1 h-1 rounded-full bg-white/10" />
                              <span className="text-[9px] font-black uppercase tracking-widest opacity-30">
                                {res.lotStage}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${si.bg} ${si.border} border`}>
                      <StatusIcon className={`w-3 h-3 ${si.color}`} />
                      <span className={`text-[8px] font-black uppercase tracking-widest ${si.color}`}>{si.label}</span>
                    </div>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-20 mb-1">Rut</p>
                      <p className="text-xs font-black text-white/70 truncate">{res.rut || "—"}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-20 mb-1">Asesor</p>
                      <p className="text-xs font-black text-white/70 truncate">{res.advisor || "Sin asignar"}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-20 mb-1">Reserva</p>
                      <p className="text-xs font-black text-accent">{formatCLP(res.reservation_price)}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-20 mb-1">Cuotas</p>
                      <p className="text-xs font-black text-white/70">{res.installments_paid} pagadas</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest opacity-20">
                      <Calendar className="w-3 h-3" />
                      {formatDate(res.created_at)}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-black text-accent opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">
                      Ver Detalle <ChevronRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-20">
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filtered.length)} de {filtered.length} Reservas
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center rotate-180 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="px-4 text-xs font-black text-white/50">{currentPage} / {totalPages}</div>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailReservation && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in"
          onClick={() => setDetailReservation(null)}
        >
          <div
            className="bg-[#050C0C] border border-white/10 rounded-[3rem] w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-slide-up overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-10 py-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <FileSignature className="w-5 h-5 text-accent" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Detalle de Reserva</p>
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">
                  {detailReservation.fullName}
                </h2>
              </div>
              <button
                onClick={() => setDetailReservation(null)}
                className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
              {/* Status banner */}
              {(() => {
                const si = getStatusInfo(detailReservation.status);
                const StatusIcon = si.icon;
                return (
                  <div className={`flex items-center gap-4 p-5 rounded-2xl ${si.bg} ${si.border} border`}>
                    <StatusIcon className={`w-6 h-6 ${si.color}`} />
                    <div>
                      <p className={`text-sm font-black uppercase tracking-widest ${si.color}`}>{si.label}</p>
                      <p className="text-[10px] font-bold text-white/30 mt-0.5">Estado actual de la reserva</p>
                    </div>
                  </div>
                );
              })()}

              {/* Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Lote", value: `Lote ${detailReservation.lotNumber}${detailReservation.lotStage ? ` — ${detailReservation.lotStage}` : ""}`, icon: MapPin },
                  { label: "Asesor", value: detailReservation.advisor || "Sin asignar", icon: User },
                  { label: "RUT", value: detailReservation.rut || "—", icon: Shield },
                  { label: "Teléfono", value: detailReservation.phone || "—", icon: Phone },
                  { label: "Email", value: detailReservation.email || "—", icon: Mail },
                  { label: "Profesión", value: detailReservation.profession || "—", icon: User },
                  { label: "Nacionalidad", value: detailReservation.nationality || "—", icon: MapPin },
                  { label: "Estado Civil", value: detailReservation.marital_status || "—", icon: User },
                  { label: "Dirección", value: [detailReservation.address_street, detailReservation.address_commune, detailReservation.address_region].filter(Boolean).join(", ") || "—", icon: MapPin },
                  { label: "Fecha de Reserva", value: formatDate(detailReservation.created_at), icon: Calendar },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-4 h-4 text-white/20" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">{item.label}</p>
                      <p className="text-sm font-bold text-white/80 truncate">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Financial summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-accent/5 border border-accent/10 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-accent/60 mb-2">Monto Reserva</p>
                  <p className="text-xl font-black text-accent italic tracking-tighter">{formatCLP(detailReservation.reservation_price)}</p>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Pie</p>
                  <p className="text-xl font-black text-white/80 italic tracking-tighter">{formatCLP(detailReservation.pie)}</p>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">Precio Lote</p>
                  <p className="text-xl font-black text-white/80 italic tracking-tighter">{formatCLP(detailReservation.lotPrice)}</p>
                </div>
              </div>

              {/* Observation / Notes */}
              {(detailReservation.observation || detailReservation.notes) && (
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-3">Observaciones</p>
                  <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
                    {detailReservation.observation || detailReservation.notes}
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
