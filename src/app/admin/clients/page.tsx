"use client";

import { useEffect, useState } from "react";
import { getAdminProjects, getFullPostventaData } from "@/actions/postventa";
import { formatCLP, formatDate } from "@/lib/utils";
import { Loader2, Search, User, Mail, ChevronRight, MapPin, Hash, Target, Phone, Users } from "lucide-react";

export default function ClientsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState("ALL");
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

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedStage, selectedProject]);

  const rawClients = data?.data || [];
  const uniqueStages: string[] = Array.from(new Set(rawClients.map((c: any) => c.lotStage).filter(Boolean)));
  
  const stageCounts = uniqueStages.reduce((acc: any, stage: string) => {
    acc[stage] = rawClients.filter((c: any) => c.lotStage === stage).length;
    return acc;
  }, {});

  const filteredClients = rawClients.filter((c: any) => {
    const matchesSearch = !search ||
      c.clientName?.toLowerCase().includes(search.toLowerCase()) ||
      c.clientEmail?.toLowerCase().includes(search.toLowerCase()) ||
      c.lotNumber?.toString().toUpperCase().includes(search.toUpperCase());
    
    // lotStage is stored in DB. Could be undefined occasionally for Lomas.
    const matchesStage = selectedStage === "ALL" || (c.lotStage && c.lotStage.toString().toUpperCase() === selectedStage.toUpperCase());
    
    return matchesSearch && matchesStage;
  });

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-12 animate-fade-in px-4">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-400">Database & CRM</p>
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
            Directorio <span className="text-white/20">Clientes</span>
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative group w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="text"
              placeholder="BUSCAR EXPEDIENTE..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none focus:border-blue-400/40 focus:ring-1 focus:ring-blue-400/20 transition-all"
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
        </div>
      </div>

      {/* Tabs and Counts */}
      {!loading && rawClients.length > 0 && uniqueStages.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 animate-fade-in">
          <button
            onClick={() => setSelectedStage("ALL")}
            className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${selectedStage === "ALL" ? "bg-accent/10 border-accent/40 text-accent shadow-[0_0_15px_rgba(212,168,75,0.2)]" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
          >
            Todos ({rawClients.length})
          </button>
          {uniqueStages.map((stage) => (
            <button
              key={stage}
              onClick={() => setSelectedStage(stage)}
              className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${selectedStage === stage.toString().toUpperCase() || selectedStage === stage ? "bg-accent/10 border-accent/40 text-accent shadow-[0_0_15px_rgba(212,168,75,0.2)]" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
            >
              Etapa {stage} ({stageCounts[stage]})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent" />
          <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Analizando Base de Datos...</p>
        </div>
      ) : (
        <div className="rounded-[3rem] overflow-hidden border border-white/5 glass-card animate-slide-up">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Expediente Cliente</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-center">Propiedad</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Salud Financiera</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Cierre Contractual</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-right">Saldo Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedClients.map((c: any) => (
                  <tr 
                    key={c.id} 
                    className="group hover:bg-white/[0.02] transition-colors cursor-default"
                  >
                    <td className="px-8 py-7">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-blue-400 group-hover:text-[#061010] group-hover:shadow-[0_0_20px_rgba(96,165,250,0.4)] transition-all duration-500">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-black text-white italic tracking-tighter group-hover:text-blue-400 transition-colors truncate uppercase leading-none mb-1">{c.clientName}</p>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{c.rut || "SIN RUT"}</span>
                            <div className="w-1 h-1 rounded-full bg-white/5" />
                            <span className="text-[10px] font-bold text-white/20 lowercase tracking-tight opacity-40 group-hover:opacity-80 transition-opacity">{c.clientEmail}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div className="flex flex-col items-center">
                        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 group-hover:border-accent/40 transition-colors">
                          <Hash className="w-3.5 h-3.5 text-accent" />
                          <span className="text-xs font-black text-white">Lote {c.lotNumber}</span>
                        </div>
                        {c.lotStage && <p className="text-[9px] font-black text-white/20 mt-2 uppercase tracking-widest">Etapa {c.lotStage}</p>}
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div className="space-y-3 min-w-[160px]">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                          <span className="opacity-20">{c.paidCuotas}/{c.totalCuotas} Cuotas</span>
                          <span className="text-accent">{Math.round((c.paidCuotas / c.totalCuotas) * 100)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                          <div 
                            className="h-full bg-accent group-hover:brightness-125 transition-all duration-1000" 
                            style={{ 
                              width: `${(c.paidCuotas / c.totalCuotas) * 100}%`,
                              boxShadow: "0 0 15px rgba(212,168,75,0.4)"
                            }} 
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div
                        className={`
                          inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl text-[10px] font-black tracking-widest border
                          ${c.status === "LATE" ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : c.status === "GRACE" ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                            : c.status === "UPCOMING" ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}
                        `}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse`} style={{ 
                          background: c.status === "LATE" ? "#f87171" : c.status === "GRACE" ? "var(--warning)" : "var(--success)" 
                        }} />
                        {c.status === "LATE" ? "MORA" : c.status === "GRACE" ? "GRACIA" : c.status === "UPCOMING" ? "AVISO" : "AL DÍA"}
                      </div>
                    </td>
                    <td className="px-8 py-7 text-right">
                      <p className="text-xl font-black text-white italic tracking-tighter group-hover:text-accent transition-colors">{formatCLP(c.pendingBalance)}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-20 mt-1">SVALOR ESTIMADO</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {paginatedClients.length === 0 && (
            <div className="text-center py-40 flex flex-col items-center justify-center">
              <Target className="w-16 h-16 mb-6 opacity-5" />
              <p className="text-sm font-black uppercase tracking-[0.3em] opacity-20">Búsqueda sin resultados en este proyecto</p>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="border-t border-white/5 bg-white/[0.02] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                Mostrando página <span className="text-accent">{currentPage}</span> de <span className="text-white/60">{totalPages}</span>
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Anterior
                </button>
                <div className="hidden sm:flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black transition-all ${currentPage === page ? "bg-accent/20 text-accent border border-accent/40 shadow-[0_0_10px_rgba(212,168,75,0.2)]" : "text-white/40 hover:text-white/80 hover:bg-white/5"}`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
