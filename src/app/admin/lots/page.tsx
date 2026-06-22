"use client";

import { useEffect, useState, useMemo } from "react";
import { getAdminProjects, getAdminLots, updateLot } from "@/actions/postventa";
import { formatCLP } from "@/lib/utils";
import { 
  Loader2, Search, Map as MapIcon, Layers, ChevronRight, Zap, Filter, 
  LayoutGrid, List, Plus, MoreVertical, UserPlus, ShieldAlert, CheckCircle2 
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { useSearch } from "@/context/SearchContext";
import CreateLotModal from "@/components/admin/CreateLotModal";
import AssignOwnerModal from "@/components/admin/AssignOwnerModal";

export default function AdminLotsPage() {
  const { search, setSearch } = useSearch();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"ALL" | "SOLD" | "AVAILABLE" | "TEST">("ALL");
  const itemsPerPage = 12;

  // Modals
  const [isCreateLotOpen, setIsCreateLotOpen] = useState(false);
  const [assignOwnerLot, setAssignOwnerLot] = useState<any>(null);

  const isTestLot = (l: any) => {
    return l.assignedClient?.toLowerCase().includes("nicolas cabrera") ||
           l.assignedClient?.toLowerCase().includes("nicolas");
  };

  const fetchLots = async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const result: any = await getAdminLots(selectedProject);
      setLots(result.lots || []);
    } catch (e) {
      toast.error("Error al cargar lotes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAdminProjects().then((result) => {
      if (result.projects?.length) {
        setProjects(result.projects);
        setSelectedProject(result.projects[0].slug);
      }
    });
  }, []);

  useEffect(() => {
    fetchLots();
    setCurrentPage(1);
  }, [selectedProject]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeTab]);

  const handleStatusToggle = async (lot: any, newStatus: string) => {
    const res = await updateLot(lot.id, { status: newStatus });
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(`Estado del lote ${lot.number} actualizado a ${newStatus}`);
      fetchLots();
    }
  };

  // Stats calculation (logical mapping: sold = has client, available = no client)
  const stats = useMemo(() => {
    const nonTestLots = lots.filter(l => !isTestLot(l));
    return {
      total: nonTestLots.length,
      sold: nonTestLots.filter(l => !!l.assignedClient).length,
      available: nonTestLots.filter(l => !l.assignedClient).length,
      test: lots.filter(l => isTestLot(l)).length,
    };
  }, [lots]);

  const filteredLots = useMemo(() => {
    return lots.filter(l => {
      const matchesSearch = !search ||
        l.number.toLowerCase().includes(search.toLowerCase()) ||
        (l.stage && l.stage.toString().includes(search)) ||
        (l.assignedClient && l.assignedClient.toLowerCase().includes(search.toLowerCase()));

      const hasOwner = !!l.assignedClient;
      const isTest = isTestLot(l);

      if (activeTab === "TEST") {
        if (!isTest) return false;
      } else {
        if (isTest) return false;
        if (activeTab === "SOLD" && !hasOwner) return false;
        if (activeTab === "AVAILABLE" && hasOwner) return false;
      }

      return matchesSearch;
    });
  }, [lots, search, activeTab]);

  const totalPages = Math.ceil(filteredLots.length / itemsPerPage);
  const paginatedLots = useMemo(() => {
    return filteredLots.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredLots, currentPage]);

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 font-sans">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b border-[#E2E8F0] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Activos Reales</p>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-[#191c1e] font-headline-lg">Catálogo de Lotes</h2>
          <p className="text-sm text-[#64748B] mt-1">Control catastral y estado de adjudicación de las parcelas.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]/50" />
            <input
              type="text"
              placeholder="Buscar lote o dueño..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10 focus:outline-none transition-all placeholder:text-[#64748B]/40 text-[#191c1e]"
            />
          </div>

          {/* Project selector */}
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#191c1e] font-medium focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10 focus:outline-none cursor-pointer hover:bg-slate-50 transition-all min-w-[200px]"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "1rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-white text-[#191c1e]">{p.name}</option>
            ))}
          </select>

          {/* Layout Grid / List View Toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200/60 shrink-0">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "p-1.5 rounded-md transition-all cursor-pointer",
                view === "grid" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
              title="Vista Cuadrícula"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "p-1.5 rounded-md transition-all cursor-pointer",
                view === "list" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
              title="Vista Lista"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* New Lot Button */}
          <button 
            onClick={() => setIsCreateLotOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Lote</span>
          </button>
        </div>
      </div>

      {/* Tabs and Counts */}
      {!loading && lots.length > 0 && (
        <div className="flex overflow-x-auto pb-2 mb-6 border-b border-[#E2E8F0] hide-scrollbar gap-2">
          {/* Tab: Todos */}
          <button
            onClick={() => setActiveTab("ALL")}
            className={`px-4 py-2 text-xs font-semibold tracking-wider whitespace-nowrap transition-all border-b-2 cursor-pointer ${
              activeTab === "ALL" 
                ? "border-[#1D4ED8] text-[#1D4ED8] font-bold" 
                : "border-transparent text-[#64748B] hover:text-[#1D4ED8]"
            }`}
          >
            Todos los Lotes
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === "ALL" ? "bg-[#1D4ED8]/10 text-[#1D4ED8]" : "bg-slate-100 text-slate-650"
            }`}>
              {stats.total}
            </span>
          </button>

          {/* Tab: Vendidos */}
          <button
            onClick={() => setActiveTab("SOLD")}
            className={`px-4 py-2 text-xs font-semibold tracking-wider whitespace-nowrap transition-all border-b-2 cursor-pointer ${
              activeTab === "SOLD" 
                ? "border-red-500 text-red-500 font-bold" 
                : "border-transparent text-[#64748B] hover:text-red-500"
            }`}
          >
            Vendidos
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === "SOLD" ? "bg-red-50 text-red-550 border border-red-100" : "bg-slate-100 text-slate-655"
            }`}>
              {stats.sold}
            </span>
          </button>
          
          {/* Tab: Disponibles */}
          <button
            onClick={() => setActiveTab("AVAILABLE")}
            className={`px-4 py-2 text-xs font-semibold tracking-wider whitespace-nowrap transition-all border-b-2 cursor-pointer ${
              activeTab === "AVAILABLE" 
                ? "border-emerald-600 text-emerald-600 font-bold" 
                : "border-transparent text-[#64748B] hover:text-emerald-600"
            }`}
          >
            Disponibles
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === "AVAILABLE" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-100 text-slate-655"
            }`}>
              {stats.available}
            </span>
          </button>

          {/* Tab: Pruebas */}
          {stats.test > 0 && (
            <button
              onClick={() => setActiveTab("TEST")}
              className={`px-4 py-2 text-xs font-semibold tracking-wider whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                activeTab === "TEST" 
                  ? "border-indigo-600 text-indigo-600 font-bold" 
                  : "border-transparent text-[#64748B] hover:text-indigo-650"
              }`}
            >
              Pruebas
              <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
                activeTab === "TEST" ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "bg-slate-100 text-slate-655"
              }`}>
                {stats.test}
              </span>
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#64748B] opacity-65">Analizando Inventario...</p>
        </div>
      ) : (
        <>
          {view === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {paginatedLots.map((lot, i) => {
                const hasOwner = !!lot.assignedClient;
                const badgeStyle = hasOwner 
                  ? "bg-red-50 text-red-650 border-red-150"
                  : "bg-emerald-50 text-emerald-600 border-emerald-150";
                const dotColor = hasOwner ? "bg-red-500" : "bg-emerald-500";
                const badgeText = hasOwner ? "Vendido" : "Disponible";

                return (
                  <div
                    key={lot.id}
                    className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-350 transition-all duration-300 flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Unidad Catastral</p>
                          <h3 className="text-2xl font-bold text-slate-800 tracking-tight leading-none">Lote {lot.number}</h3>
                        </div>

                        {/* Action Menu */}
                        <div className="relative group/menu">
                          <button className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-all cursor-pointer">
                            <MoreVertical className="w-4 h-4 text-slate-500" />
                          </button>
                          
                          {/* Dropdown Menu */}
                          <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-xl p-1 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all duration-150 shadow-lg z-50 origin-top-right scale-95 group-hover/menu:scale-100">
                            {!hasOwner && (
                              <>
                                <button 
                                  onClick={() => setAssignOwnerLot(lot)}
                                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <UserPlus className="w-3.5 h-3.5 text-blue-600" /> Asignar Dueño
                                </button>
                                <button 
                                  onClick={() => handleStatusToggle(lot, 'reserved')}
                                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors mt-0.5 cursor-pointer"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Marcar Pacto
                                </button>
                              </>
                            )}
                            {hasOwner && (
                              <div className="px-3 py-2 text-[10px] font-bold text-slate-400 text-center border-t border-slate-100 mt-1 uppercase">
                                Dueño Activo
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="mb-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                          badgeStyle
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
                          {badgeText}
                        </span>
                      </div>

                      {/* Details grid */}
                      <div className="grid grid-cols-2 gap-4 py-3 border-t border-slate-100 mb-4 text-xs">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Etapa</p>
                          <p className="font-bold text-slate-700">{lot.stage ? `Etapa ${lot.stage}` : "—"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Superficie</p>
                          <p className="font-bold text-slate-700">{lot.area_m2 ? `${lot.area_m2} m²` : "—"}</p>
                        </div>
                      </div>

                      {/* Owner Section */}
                      {lot.assignedClient ? (
                        <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-150">
                          <p className="text-[9px] font-bold text-slate-450 uppercase tracking-wider mb-1">Cliente Adjudicado</p>
                          <p className="text-xs font-bold text-slate-800 uppercase truncate">{lot.assignedClient}</p>
                          {lot.assignmentStatus === 'ARCHIVED' && (
                            <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5 block tracking-wider">Histórico</span>
                          )}
                        </div>
                      ) : (
                        <div className="mb-4 p-3 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                          <UserPlus className="w-4 h-4 text-slate-350" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sin Adjudicar</p>
                        </div>
                      )}
                    </div>

                    {/* Price & Go Detail */}
                    <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-100">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Valuación</p>
                        <p className="text-lg font-bold text-blue-600 tracking-tight">{formatCLP(lot.price_total_clp)}</p>
                      </div>
                      <button className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all cursor-pointer">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lote / Unidad</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Etapa</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Superficie</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Propietario</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Valuación</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm text-slate-800">
                    {paginatedLots.map((lot) => {
                      const hasOwner = !!lot.assignedClient;
                      const badgeStyle = hasOwner 
                        ? "bg-red-50 text-red-650 border-red-150"
                        : "bg-emerald-50 text-emerald-600 border-emerald-150";
                      const dotColor = hasOwner ? "bg-red-500" : "bg-emerald-500";
                      const badgeText = hasOwner ? "Vendido" : "Disponible";

                      return (
                        <tr key={lot.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-800">Lote {lot.number}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-slate-600">{lot.stage ? `Etapa ${lot.stage}` : "—"}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-slate-600">{lot.area_m2 ? `${lot.area_m2} m²` : "—"}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                              badgeStyle
                            )}>
                              <div className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
                              {badgeText}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {lot.assignedClient ? (
                              <div>
                                <span className="font-bold text-slate-700 uppercase">{lot.assignedClient}</span>
                                {lot.assignmentStatus === 'ARCHIVED' && (
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider ml-2">(Histórico)</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 font-semibold italic">Sin Propietario</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-blue-600">
                            {formatCLP(lot.price_total_clp)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              {!hasOwner && (
                                <>
                                  <button
                                    onClick={() => setAssignOwnerLot(lot)}
                                    className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer"
                                    title="Asignar Dueño"
                                  >
                                    <UserPlus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleStatusToggle(lot, 'reserved')}
                                    className="p-1.5 rounded bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-250 transition-all cursor-pointer"
                                    title="Marcar Pacto"
                                  >
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filteredLots.length === 0 && (
            <div className="col-span-full py-40 text-center border border-[#E2E8F0] rounded-2xl bg-white shadow-sm">
              <Layers className="w-16 h-16 mx-auto mb-4 text-slate-350 opacity-50" />
              <p className="text-sm font-semibold uppercase tracking-wider text-[#64748B]">Búsqueda sin resultados en este proyecto</p>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="border-t border-[#E2E8F0] bg-slate-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-[#64748B]">
                Mostrando <span className="text-[#1D4ED8] font-bold">{((currentPage - 1) * itemsPerPage) + 1}</span> a <span className="text-slate-600 font-bold">{Math.min(currentPage * itemsPerPage, filteredLots.length)}</span> de <span className="text-slate-650 font-bold">{filteredLots.length}</span> Lotes
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  Anterior
                </button>
                <div className="px-3 text-xs font-bold text-slate-500">Página {currentPage} de {totalPages}</div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {isCreateLotOpen && (
        <CreateLotModal 
          projectSlug={selectedProject} 
          onClose={() => setIsCreateLotOpen(false)} 
          onSuccess={() => {
            setIsCreateLotOpen(false);
            toast.success("Lote creado exitosamente");
            fetchLots();
          }} 
        />
      )}

      {assignOwnerLot && (
        <AssignOwnerModal 
          lot={assignOwnerLot} 
          projectSlug={selectedProject} 
          onClose={() => setAssignOwnerLot(null)} 
          onSuccess={() => {
            setAssignOwnerLot(null);
            fetchLots();
          }} 
        />
      )}
    </div>
  );
}
