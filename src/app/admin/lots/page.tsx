"use client";

import { useEffect, useState } from "react";
import { getAdminProjects, getAdminLots, updateLot } from "@/actions/postventa";
import { formatCLP } from "@/lib/utils";
import { Loader2, Search, Map as MapIcon, Layers, ChevronRight, Zap, Filter, LayoutGrid, List, Plus, MoreVertical, UserPlus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

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
  const itemsPerPage = 12;

  // Modals
  const [isCreateLotOpen, setIsCreateLotOpen] = useState(false);
  const [assignOwnerLot, setAssignOwnerLot] = useState<any>(null);

  const fetchLots = async () => {
    if (!selectedProject) return;
    setLoading(true);
    getAdminLots(selectedProject).then((result: any) => {
      setLots(result.lots || []);
      setLoading(false);
    });
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
  }, [selectedProject]);

  const handleStatusToggle = async (lot: any, newStatus: string) => {
    const res = await updateLot(lot.id, { status: newStatus });
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(`Estado del lote ${lot.number} actualizado a ${newStatus}`);
      fetchLots();
    }
  };

  const filteredLots = lots.filter(l => 
    l.number.toLowerCase().includes(search.toLowerCase()) ||
    l.stage?.toString().includes(search)
  );

  const totalPages = Math.ceil(filteredLots.length / itemsPerPage);
  const paginatedLots = filteredLots.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-12 animate-fade-in px-4 relative">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/20">
              <MapIcon className="w-5 h-5 text-accent" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-accent">Activos Reales</p>
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
            Inventario <span className="text-white/20">Lotes</span>
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative group w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-accent transition-colors" />
            <input
              type="text"
              placeholder="BUSCAR LOTE..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
            />
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-white/[0.08] transition-all min-w-[200px]"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1.5rem center", backgroundSize: "1rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-[#0c1a1a]">{p.name}</option>
            ))}
          </select>

          <button 
            onClick={() => setIsCreateLotOpen(true)}
            className="px-6 py-4 rounded-2xl btn-metallic-gold text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-[0_10px_30px_rgba(212,168,75,0.2)] hover:shadow-[0_10px_40px_rgba(212,168,75,0.4)] transition-all"
          >
            <Plus className="w-4 h-4" /> Nuevo Lote
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent" />
          <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Analizando Inventario...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {paginatedLots.map((lot, i) => (
            <div
              key={lot.id}
              className="group relative rounded-[2.5rem] p-8 glass-card animate-slide-up hover:border-accent/30 transition-all duration-500 overflow-visible"
              style={{ 
                animationDelay: `${i * 30}ms`,
                animationFillMode: "both"
              }}
            >
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-8 relative">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Unidad Catastral</p>
                    <h3 className="text-4xl font-black text-white group-hover:text-accent transition-colors tracking-tighter italic">#{lot.number}</h3>
                  </div>

                  <div className="group/menu relative">
                    <button className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                      <MoreVertical className="w-4 h-4 opacity-50" />
                    </button>
                    {/* Tooltip Menu */}
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#0c1a1a] border border-white/10 rounded-2xl p-2 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all duration-200 shadow-2xl z-50 origin-top-right scale-95 group-hover/menu:scale-100">
                      {lot.status === 'available' && (
                        <>
                          <button 
                            onClick={() => setAssignOwnerLot(lot)}
                            className="w-full text-left px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-2 transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Asignar Dueño
                          </button>
                          <button 
                            onClick={() => handleStatusToggle(lot, 'reserved')}
                            className="w-full text-left px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-orange-400 hover:bg-orange-500/10 flex items-center gap-2 transition-colors mt-1"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" /> Marcar Pacto
                          </button>
                        </>
                      )}
                      {lot.status !== 'available' && !lot.assignedClient && (
                        <button 
                          onClick={() => handleStatusToggle(lot, 'available')}
                          className="w-full text-left px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 flex items-center gap-2 transition-colors"
                        >
                          <Zap className="w-3.5 h-3.5" /> Marcar Libre
                        </button>
                      )}
                      {lot.assignedClient && (
                        <div className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-white/30 text-center border-t border-white/5 mt-1">
                          Posee Dueño Activo
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-8">
                  <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                    lot.status === 'available' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 
                    lot.status === 'reserved' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_0_10px_rgba(249,115,22,0.2)]' : 
                    'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full inline-block mr-2 animate-pulse ${
                      lot.status === 'available' ? 'bg-emerald-400' : lot.status === 'reserved' ? 'bg-orange-400' : 'bg-red-400'
                    }`} />
                    {lot.status === 'available' ? 'Libre' : lot.status === 'reserved' ? 'Pacto' : 'Vendido'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-6 pb-8 border-b border-white/5 mb-8">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-20 mb-1">Etapa</p>
                    <p className="text-base font-black text-white/90">{lot.stage || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-20 mb-1">Área</p>
                    <p className="text-base font-black text-white/90">{lot.area_m2 ? `${lot.area_m2} m²` : "—"}</p>
                  </div>
                </div>

                {lot.assignedClient ? (
                  <div className="mb-8 p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-20 mb-2">Cliente Asignado</p>
                    <p className="text-sm font-black text-white uppercase tracking-tighter truncate">{lot.assignedClient}</p>
                    {lot.assignmentStatus === 'ARCHIVED' && (
                      <span className="text-[8px] font-black text-white/20 uppercase mt-1 block tracking-[0.2em]">Registro Histórico</span>
                    )}
                  </div>
                ) : (
                  <div className="mb-8 p-4 rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                    <UserPlus className="w-5 h-5 text-white/20" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Sin Dueño Asignado</p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-20 mb-1">Valuación</p>
                    <p className="text-xl font-black text-accent tracking-tight">{formatCLP(lot.price_total_clp)}</p>
                  </div>
                  <button className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-accent group-hover:text-[#061010] group-hover:shadow-[0_0_20px_rgba(212,168,75,0.4)] transition-all">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Background Glow */}
              <Zap className="absolute -bottom-10 -right-10 w-40 h-40 text-white/[0.02] group-hover:text-accent/[0.05] group-hover:scale-110 transition-all duration-1000" />
            </div>
          ))}

          {filteredLots.length === 0 && (
            <div className="col-span-full py-40 text-center border-2 border-dashed border-white/5 rounded-[3rem] glass-card">
              <Layers className="w-16 h-16 mx-auto mb-6 opacity-5" />
              <p className="text-sm font-black uppercase tracking-[0.3em] opacity-20">Inventario vacío en esta selección</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-8">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-20">
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredLots.length)} de {filteredLots.length} Lotes
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
