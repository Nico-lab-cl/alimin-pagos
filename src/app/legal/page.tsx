"use client";

import { useEffect, useState } from "react";
import { getFullPostventaData } from "@/actions/postventa";
import { formatCLP, formatDate } from "@/lib/utils";
import ClientDetailModal from "@/components/admin/ClientDetailModal";
import { signOut, useSession } from "next-auth/react";
import {
  Loader2,
  AlertTriangle,
  Clock,
  Search,
  ChevronRight,
  User,
  Zap,
  Scale,
  LogOut,
  Bell,
  Activity,
  ShieldAlert
} from "lucide-react";

export default function LegalDashboardPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  
  // Filtering & Pagination State
  const [projectFilter, setProjectFilter] = useState<"ALL" | "arena-y-sol" | "libertad-y-alegria">("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const handleSignOut = () => signOut({ callbackUrl: "/login" });

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [arenaResult, libertadResult] = await Promise.all([
          getFullPostventaData({ projectSlug: "arena-y-sol" }),
          getFullPostventaData({ projectSlug: "libertad-y-alegria" }),
        ]);

        const arenaClients = (arenaResult.data || []).map((c: any) => ({
          ...c,
          projectName: "Arena y Sol",
          projectSlug: "arena-y-sol"
        }));

        const libertadClients = (libertadResult.data || []).map((c: any) => ({
          ...c,
          projectName: "Libertad y Alegría",
          projectSlug: "libertad-y-alegria"
        }));

        const combined = [...arenaClients, ...libertadClients];
        
        // Filter: only real clients in LATE status or with penaltyAmount > 0 (excluding test accounts)
        const morosos = combined.filter((c: any) => {
          const isTest = c.clientName?.toLowerCase().includes("nicolas cabrera") || 
                         c.clientEmail?.toLowerCase().includes("nicolas") ||
                         c.clientName?.toLowerCase().includes("prueba");
          return (c.status === "LATE" || c.penaltyAmount > 0) && !isTest;
        });
        
        // Sort by penaltyAmount desc (critical first)
        morosos.sort((a, b) => b.penaltyAmount - a.penaltyAmount);

        setClients(morosos);
      } catch (err) {
        console.error("Error loading legal dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const totalCount = clients.length;
  const arenaCount = clients.filter((c: any) => c.projectSlug === "arena-y-sol").length;
  const libertadCount = clients.filter((c: any) => c.projectSlug === "libertad-y-alegria").length;

  const filteredClients = clients
    .filter((c: any) => projectFilter === "ALL" || c.projectSlug === projectFilter)
    .filter(
      (c: any) =>
        !search ||
        c.clientName?.toLowerCase().includes(search.toLowerCase()) ||
        c.lotNumber?.toString().includes(search)
    );

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, projectFilter]);

  return (
    <div className="min-h-screen bg-[#061010] text-white font-outfit relative overflow-x-hidden">
      {/* Premium Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden emerald-mesh opacity-50 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/5 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 py-8 pb-24 space-y-12">
        {/* Top Header */}
        <header className="flex items-center justify-between border-b border-white/5 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-[0_10px_40px_rgba(212,168,75,0.2)]">
              <img src="/logo.png" alt="Alimin Logo" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase leading-none italic text-glow">Alimin</h1>
              <p className="text-[9px] font-black text-accent tracking-[0.3em] uppercase mt-1 opacity-60">Consola Legal</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Estado:</span>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest border border-emerald-500/20 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Operativo
              </span>
            </div>

            <div className="w-px h-6 bg-white/10 hidden md:block" />

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black truncate uppercase tracking-[0.15em] leading-none mb-1">
                  {session?.user?.name || "Abogado Legal"}
                </p>
                <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest">
                  Acceso Restringido
                </p>
              </div>

              <button
                onClick={handleSignOut}
                className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-red-400 hover:bg-red-400/5 hover:border-red-400/15 transition-all flex items-center gap-2"
                title="Cerrar Sesión"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </header>

        {/* Header Section */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mt-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/20">
                <Scale className="w-5 h-5 text-red-400" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-red-400">Riesgo & Mora Legal</p>
            </div>
            <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
              Centro de <span className="text-white/20">alertas</span>
            </h1>
            <p className="text-xs text-white/40 mt-3 max-w-xl font-medium uppercase tracking-wide leading-relaxed">
              Esta consola muestra a los clientes con mora crítica de los proyectos **Arena y Sol** y **Libertad y Alegría**. La información es estrictamente confidencial y de solo lectura.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
            <div className="relative group w-full sm:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-accent transition-colors" />
              <input
                type="text"
                placeholder="FILTRAR CLIENTE, LOTE O PROYECTO..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
              />
            </div>

            <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/5 border border-white/5 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Total Morosos:</span>
              <span className="px-3 py-1 rounded-xl bg-red-500/10 text-red-400 text-sm font-black border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                {totalCount}
              </span>
            </div>
          </div>
        </div>

        {/* Filters Deck */}
        <div className="flex flex-wrap gap-4 mt-6">
          <button
            onClick={() => { setProjectFilter("ALL"); setCurrentPage(1); }}
            className={`
              group relative flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500
              ${projectFilter === "ALL" 
                ? "bg-white/10 border-white/20 text-white shadow-2xl" 
                : "bg-white/5 border-white/5 text-white/30 hover:text-white/60 hover:bg-white/[0.08]"}
              border
            `}
          >
            <span>Todos los Proyectos</span>
            <span className="px-2 py-0.5 rounded-lg bg-black/40 text-[9px] font-black text-white/60">{totalCount}</span>
            {projectFilter === "ALL" && <div className="absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-accent to-transparent" />}
          </button>

          <button
            onClick={() => { setProjectFilter("arena-y-sol"); setCurrentPage(1); }}
            className={`
              group relative flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500
              ${projectFilter === "arena-y-sol" 
                ? "bg-blue-500/10 border-blue-500/20 text-white shadow-2xl" 
                : "bg-white/5 border-white/5 text-white/30 hover:text-white/60 hover:bg-white/[0.08]"}
              border
            `}
          >
            <span>Arena y Sol</span>
            <span className="px-2 py-0.5 rounded-lg bg-black/40 text-[9px] font-black text-blue-400">{arenaCount}</span>
            {projectFilter === "arena-y-sol" && <div className="absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-blue-400 to-transparent" />}
          </button>

          <button
            onClick={() => { setProjectFilter("libertad-y-alegria"); setCurrentPage(1); }}
            className={`
              group relative flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500
              ${projectFilter === "libertad-y-alegria" 
                ? "bg-amber-500/10 border-amber-500/20 text-white shadow-2xl" 
                : "bg-white/5 border-white/5 text-white/30 hover:text-white/60 hover:bg-white/[0.08]"}
              border
            `}
          >
            <span>Libertad y Alegría</span>
            <span className="px-2 py-0.5 rounded-lg bg-black/40 text-[9px] font-black text-amber-400">{libertadCount}</span>
            {projectFilter === "libertad-y-alegria" && <div className="absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent" />}
          </button>
        </div>

        {/* List Section */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-accent" />
            <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20 font-bold">Analizando Carteras Morosas...</p>
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
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[1rem] sm:rounded-[1.5rem] bg-white/5 border border-white/10 flex items-center justify-center text-lg sm:text-xl font-black text-white group-hover:scale-110 transition-transform duration-500 shadow-2xl shrink-0">
                    {client.clientName?.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl sm:text-2xl font-black text-white tracking-tighter uppercase italic group-hover:text-accent transition-colors">
                        {client.clientName}
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[8px] font-black text-blue-400 uppercase tracking-widest whitespace-nowrap">
                        {client.projectName}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2.5">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                        <Zap className="w-3.5 h-3.5 text-accent" />
                        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/60">Lote {client.lotNumber}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-white/20 uppercase tracking-widest">
                        <span>{client.paidCuotas}/{client.totalCuotas} Cuotas</span>
                        <div className="w-1 h-1 rounded-full bg-white/10" />
                        <span>{formatCLP(client.valor_cuota)}/m</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between lg:justify-end gap-6 flex-shrink-0">
                  {/* Financial Status */}
                  <div className="grid gap-1 text-left sm:text-right">
                    <p className="text-lg sm:text-xl font-black tracking-tight text-red-400">
                      +{formatCLP(client.penaltyAmount)}
                    </p>
                    {client.overdueInstallments?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
                        {(client.penalty_mode === "FIXED" || client.penalty_mode === "MIXED") && client.manual_penalty > 0 && (
                          <span className="text-[7px] font-black uppercase tracking-widest bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-md border border-orange-500/20">
                            Fija: {formatCLP(client.manual_penalty)}
                          </span>
                        )}
                        {client.overdueInstallments.map((inst: any) => (
                          <span key={inst.number} className="text-[7px] font-black uppercase tracking-widest bg-red-500/10 text-red-400/80 px-2 py-0.5 rounded-md border border-red-500/10">
                            C{inst.number}: {inst.lateDays}d
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] opacity-20">
                        {client.lateDays} Días Mora
                      </p>
                    )}
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
                  <div className="px-4 sm:px-6 py-2 sm:py-3 rounded-2xl text-[8px] sm:text-[10px] font-black tracking-[0.2em] bg-red-500/10 text-red-400 border border-red-500/20 shadow-2xl">
                    MORA
                  </div>

                  <button 
                    onClick={() => setSelectedClient(client)}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-accent hover:text-[#061010] transition-all"
                    title="Ver Expediente Completo (Solo Lectura)"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}

            {filteredClients.length === 0 && (
              <div className="py-40 text-center border-2 border-dashed border-white/5 rounded-[3rem] glass-card">
                <ShieldAlert className="w-16 h-16 mx-auto mb-6 opacity-5" />
                <p className="text-sm font-black uppercase tracking-[0.3em] opacity-20">Sin clientes en mora bajo este criterio</p>
              </div>
            )}
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-8">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-20">
              Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredClients.length)} de {filteredClients.length} Morosos
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

      {/* Modal Detalle Cliente (ReadOnly Mode) */}
      {selectedClient && (
        <ClientDetailModal
          selectedClient={selectedClient}
          onClose={() => setSelectedClient(null)}
          onUpdate={() => {}} // No actualiza nada en modo lectura
          projectSlug={selectedClient.projectSlug}
          isReadOnly={true}
        />
      )}
    </div>
  );
}
