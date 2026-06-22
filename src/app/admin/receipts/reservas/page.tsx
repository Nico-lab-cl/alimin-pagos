"use client";

import { useEffect, useState } from "react";
import { getAdminProjects, getProjectReservations } from "@/actions/postventa";
import { formatCLP, formatDate } from "@/lib/utils";
import { useSearch } from "@/context/SearchContext";
import {
  Loader2, User, Phone, Mail, MapPin, Calendar,
  ChevronRight, BookOpen, X, FileSignature,
  Shield, Clock, CheckCircle2, AlertTriangle
} from "lucide-react";

type ReservationStatus = "active" | "COMPLETED" | "cancelled" | string;

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  active: { label: "Activa", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2 },
  COMPLETED: { label: "Completada", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: Shield },
  cancelled: { label: "Cancelada", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: AlertTriangle },
};

function getStatusInfo(status: ReservationStatus) {
  return statusConfig[status] || { label: status, color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", icon: Clock };
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
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100 shadow-sm">
              <BookOpen className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
              Gestión de Reservas
            </p>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight leading-none">
            Reservas <span className="text-slate-400 font-medium">del Proyecto</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Stats pills */}
          <div className="flex items-center gap-2 mr-1">
            <span className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm">
              {stats.total} Total
            </span>
            <span className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider text-emerald-700 shadow-sm">
              {stats.active} Activas
            </span>
            <span className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-[10px] font-bold uppercase tracking-wider text-blue-700 shadow-sm">
              {stats.completed} Completadas
            </span>
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-700 outline-none cursor-pointer hover:bg-slate-50/80 transition-all shadow-sm min-w-[150px]"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.8rem center", backgroundSize: "0.6rem" }}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="COMPLETED">Completadas</option>
          </select>

          {/* Project selector */}
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-700 outline-none cursor-pointer hover:bg-slate-50/80 transition-all min-w-[180px] shadow-sm"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.8rem center", backgroundSize: "0.6rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Cargando Reservas...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-32 rounded-2xl border border-slate-200 bg-white shadow-sm animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-6 border border-slate-100">
            <BookOpen className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">Sin Reservas</h3>
          <p className="text-xs font-medium text-slate-400 max-w-xs mx-auto">
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
                className="group relative rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm cursor-pointer hover:shadow-md hover:border-blue-300 transition-all duration-350 animate-slide-up"
                style={{ animationDelay: `${idx * 45}ms`, animationFillMode: "both" }}
              >
                <div className="p-6 space-y-5">
                  {/* Client header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/60 text-slate-550 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors duration-300">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-800 tracking-tight truncate group-hover:text-blue-900 transition-colors">
                          {res.fullName}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-blue-600">
                            Lote {res.lotNumber}
                          </span>
                          {res.lotStage && (
                            <>
                              <div className="w-1 h-1 rounded-full bg-slate-300" />
                              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                                {res.lotStage}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${si.bg} ${si.border} flex-shrink-0`}>
                      <StatusIcon className={`w-3 h-3 ${si.color}`} />
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${si.color}`}>{si.label}</span>
                    </div>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-slate-50/50 border border-slate-100">
                      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Rut</p>
                      <p className="text-xs font-semibold text-slate-700 truncate">{res.rut || "—"}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50/50 border border-slate-100">
                      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Asesor</p>
                      <p className="text-xs font-semibold text-slate-700 truncate">{res.advisor || "Sin asignar"}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50/50 border border-slate-100">
                      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Reserva</p>
                      <p className="text-xs font-bold text-blue-600">{formatCLP(res.reservation_price)}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50/50 border border-slate-100">
                      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Cuotas</p>
                      <p className="text-xs font-semibold text-slate-700">{res.installments_paid} pagadas</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatDate(res.created_at)}
                    </div>
                    <div className="flex items-center gap-0.5 text-xs font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Ver Detalle</span>
                      <ChevronRight className="w-4 h-4" />
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
        <div className="flex items-center justify-between border-t border-slate-100 pt-6 mt-4">
          <p className="text-xs font-medium text-slate-400">
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filtered.length)} de {filtered.length} Reservas
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center rotate-180 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <ChevronRight className="w-4 h-4 text-slate-650" />
            </button>
            <div className="px-3 text-xs font-bold text-slate-600">{currentPage} / {totalPages}</div>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <ChevronRight className="w-4 h-4 text-slate-650" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailReservation && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setDetailReservation(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-slide-up overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <FileSignature className="w-4 h-4 text-blue-600" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Detalle de Reserva</p>
                </div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight leading-none">
                  {detailReservation.fullName}
                </h2>
              </div>
              <button
                onClick={() => setDetailReservation(null)}
                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-550 hover:bg-slate-200 hover:text-slate-800 flex items-center justify-center transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              {/* Status banner */}
              {(() => {
                const si = getStatusInfo(detailReservation.status);
                const StatusIcon = si.icon;
                return (
                  <div className={`flex items-center gap-3 p-4 rounded-xl ${si.bg} ${si.border} border`}>
                    <StatusIcon className={`w-5 h-5 ${si.color}`} />
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wider ${si.color}`}>{si.label}</p>
                      <p className="text-[10px] font-medium text-slate-400 mt-0.5">Estado actual de la reserva en el sistema</p>
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
                  <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50/50 border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-450 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{item.label}</p>
                      <p className="text-xs font-semibold text-slate-700 truncate">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Financial summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4.5 rounded-xl bg-blue-50 border border-blue-100 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-blue-800 mb-1">Monto Reserva</p>
                  <p className="text-lg font-bold text-blue-900 tracking-tight">{formatCLP(detailReservation.reservation_price)}</p>
                </div>
                <div className="p-4.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Pie</p>
                  <p className="text-lg font-bold text-slate-700 tracking-tight">{formatCLP(detailReservation.pie)}</p>
                </div>
                <div className="p-4.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Precio Lote</p>
                  <p className="text-lg font-bold text-slate-700 tracking-tight">{formatCLP(detailReservation.lotPrice)}</p>
                </div>
              </div>

              {/* Observation / Notes */}
              {(detailReservation.observation || detailReservation.notes) && (
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-150">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-2">Observaciones</p>
                  <p className="text-xs text-slate-650 leading-relaxed whitespace-pre-wrap font-medium">
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
