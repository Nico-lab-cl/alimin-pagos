"use client";

import { useEffect, useState } from "react";
import { getFullPostventaData } from "@/actions/postventa";
import { formatCLP, formatDate } from "@/lib/utils";
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
  ShieldAlert,
  Download
} from "lucide-react";

export default function LegalDashboardPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  
  // Filtering & Pagination State
  const [projectFilter, setProjectFilter] = useState<"ALL" | "arena-y-sol" | "libertad-y-alegria">("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const handleSignOut = () => signOut({ callbackUrl: "/login" });

  const exportAllToExcel = (clientsList: any[]) => {
    const listToExport = selectedClientIds.length > 0
      ? clientsList.filter((c: any) => selectedClientIds.includes(c.id))
      : clientsList;
    
    const headers = [
      "Nombre Cliente",
      "Proyecto",
      "Lote",
      "RUT",
      "Email",
      "Telefono",
      "Mora Total",
      "Cuotas Pagadas",
      "Cuotas Totales",
      "Proximo Vencimiento"
    ];
    
    const rows = listToExport.map(c => [
      c.clientName || "",
      c.projectName || "",
      c.lotNumber || "",
      c.rut || "",
      c.clientEmail || "",
      c.clientPhone || "",
      c.penaltyAmount || 0,
      c.paidCuotas || 0,
      c.totalCuotas || 0,
      c.nextDueDate ? new Date(c.nextDueDate).toLocaleDateString("es-CL") : "No Definido"
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(row => row.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Morosos_Contactos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportIndividualToExcel = (client: any) => {
    const headers = ["Campo", "Valor"];
    const rows = [
      ["Nombre Completo", client.clientName || ""],
      ["RUT", client.rut || ""],
      ["Email", client.clientEmail || ""],
      ["Telefono", client.clientPhone || ""],
      ["Proyecto", client.projectName || ""],
      ["Lote", client.lotNumber || ""],
      ["Etapa", client.lotStage || ""],
      ["Mora Total", client.penaltyAmount || 0],
      ["Cuotas Pagadas", `${client.paidCuotas} de ${client.totalCuotas}`],
      ["Valor Cuota", client.valor_cuota || 0],
      ["Proxima Fecha de Vencimiento", client.nextDueDate ? new Date(client.nextDueDate).toLocaleDateString("es-CL") : "No Definido"],
      ["Nacionalidad", client.nationality || ""],
      ["Estado Civil", client.marital_status || ""],
      ["Profesion", client.profession || ""],
      ["Direccion", `${client.address_street || ""} ${client.address_number || ""}, ${client.address_commune || ""}, ${client.address_region || ""}`.trim()],
      ["Observacion", client.observation || ""]
    ];

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(row => row.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Ficha_${client.clientName?.replace(/\s+/g, '_')}_${client.lotNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
        c.rut?.toLowerCase().includes(search.toLowerCase()) ||
        c.lotNumber?.toString().includes(search)
    );

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / itemsPerPage));
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
    setSelectedClientIds([]);
  }, [search, projectFilter]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans relative overflow-x-hidden">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center p-1.5 shadow-sm">
              <img src="/logo.png" alt="Alimin Logo" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-800 leading-none">Alimin</h1>
              <p className="text-[9px] font-black text-slate-400 tracking-[0.25em] uppercase mt-0.5">Consola Legal</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Estado:</span>
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase tracking-widest border border-emerald-100 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Operativo
              </span>
            </div>

            <div className="w-px h-6 bg-slate-200 hidden md:block" />

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-750 uppercase tracking-[0.1em] leading-none mb-0.5">
                  Alimin legal
                </p>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                  Acceso Restringido
                </p>
              </div>

              <button
                onClick={handleSignOut}
                className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-red-650 hover:bg-red-50 hover:border-red-250 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer shadow-sm"
                title="Cerrar Sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="uppercase tracking-wider">Salir</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 md:px-12 py-8 space-y-8 animate-fade-in">
        {/* Header Title Section */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center border border-red-100">
                <Scale className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-500">Riesgo & Mora Legal</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 uppercase">
              Centro de Alertas
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl font-medium">
              Esta consola muestra a los clientes con mora crítica de los proyectos **Arena y Sol** y **Libertad y Alegría**. La información es estrictamente confidencial y de solo lectura.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
            <button
              onClick={() => exportAllToExcel(filteredClients)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider border border-slate-200 shadow-sm transition-all w-full sm:w-auto justify-center cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0 text-slate-500" />
              <span>{selectedClientIds.length > 0 ? `Exportar (${selectedClientIds.length})` : "Exportar Contactos"}</span>
            </button>

            <div className="relative group w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder="Filtrar cliente, lote o proyecto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-500 transition-all shadow-sm"
              />
            </div>

            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shrink-0 w-full sm:w-auto justify-between sm:justify-start shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Morosos:</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-red-50 text-red-650 text-xs font-bold border border-red-100">
                {totalCount}
              </span>
            </div>
          </div>
        </div>

        {/* Filters Tabs Deck */}
        <div className="flex overflow-x-auto pb-1 border-b border-slate-200/80 gap-4">
          <button
            onClick={() => { setProjectFilter("ALL"); setCurrentPage(1); }}
            className={`
              group relative flex items-center gap-2 pb-3 px-1 text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer
              ${projectFilter === "ALL" 
                ? "text-blue-600 border-b-2 border-blue-600 font-bold" 
                : "text-slate-400 hover:text-slate-650 border-b-2 border-transparent"}
            `}
          >
            <span>Todos los Proyectos</span>
            <span className={`px-2 py-0.5 rounded-lg text-[9px] ${
              projectFilter === "ALL" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
            }`}>{totalCount}</span>
          </button>

          <button
            onClick={() => { setProjectFilter("arena-y-sol"); setCurrentPage(1); }}
            className={`
              group relative flex items-center gap-2 pb-3 px-1 text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer
              ${projectFilter === "arena-y-sol" 
                ? "text-blue-600 border-b-2 border-blue-600 font-bold" 
                : "text-slate-400 hover:text-slate-650 border-b-2 border-transparent"}
            `}
          >
            <span>Arena y Sol</span>
            <span className={`px-2 py-0.5 rounded-lg text-[9px] ${
              projectFilter === "arena-y-sol" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
            }`}>{arenaCount}</span>
          </button>

          <button
            onClick={() => { setProjectFilter("libertad-y-alegria"); setCurrentPage(1); }}
            className={`
              group relative flex items-center gap-2 pb-3 px-1 text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer
              ${projectFilter === "libertad-y-alegria" 
                ? "text-blue-600 border-b-2 border-blue-600 font-bold" 
                : "text-slate-400 hover:text-slate-650 border-b-2 border-transparent"}
            `}
          >
            <span>Libertad y Alegría</span>
            <span className={`px-2 py-0.5 rounded-lg text-[9px] ${
              projectFilter === "libertad-y-alegria" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
            }`}>{libertadCount}</span>
          </button>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 opacity-60">Analizando Carteras Morosas...</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={filteredClients.length > 0 && filteredClients.every((c: any) => selectedClientIds.includes(c.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedClientIds(filteredClients.map((c: any) => c.id));
                          } else {
                            setSelectedClientIds([]);
                          }
                        }}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">RUT</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lote</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Progreso</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Desglose de Mora</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Atraso</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Saldo Mora</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
                  {paginatedClients.map((client: any) => (
                    <tr 
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 text-center w-12" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedClientIds.includes(client.id)}
                          onChange={(e) => {
                            setSelectedClientIds(prev =>
                              prev.includes(client.id) ? prev.filter(id => id !== client.id) : [...prev, client.id]
                            );
                          }}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-bold text-slate-800 uppercase group-hover:text-blue-600 transition-colors leading-snug">
                            {client.clientName}
                          </div>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100">
                            {client.projectName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-600">
                        {client.rut || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wide">
                          Lote {client.lotNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <span className="text-xs font-bold text-slate-700">{client.paidCuotas}/{client.totalCuotas} Cuotas</span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">{formatCLP(client.valor_cuota)}/mes</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        {client.overdueInstallments?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(client.penalty_mode === "FIXED" || client.penalty_mode === "MIXED") && client.manual_penalty > 0 && (
                              <span className="text-[9px] font-bold uppercase bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">
                                Fija: {formatCLP(client.manual_penalty)}
                              </span>
                            )}
                            {client.overdueInstallments.slice(0, 3).map((inst: any) => (
                              <span key={inst.number} className="text-[9px] font-semibold bg-red-50 text-red-650 px-1.5 py-0.5 rounded border border-red-100">
                                C{inst.number}: {inst.lateDays}d
                              </span>
                            ))}
                            {client.overdueInstallments.length > 3 && (
                              <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                                +{client.overdueInstallments.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-450 italic">Sin desglose</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-2 py-0.5 rounded bg-red-50 text-red-650 font-bold text-xs border border-red-100">
                          {client.lateDays} d
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-bold text-red-600 text-base">
                          +{formatCLP(client.penaltyAmount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => exportIndividualToExcel(client)}
                            className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 text-slate-450 hover:text-emerald-600 transition-all shadow-sm cursor-pointer"
                            title="Exportar Ficha (Excel)"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          
                          <button 
                            onClick={() => setSelectedClient(client)}
                            className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-200 text-slate-455 hover:text-blue-600 transition-all shadow-sm cursor-pointer"
                            title="Ver Expediente Completo (Solo Lectura)"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  
                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-20 text-center text-sm font-semibold text-slate-400 uppercase tracking-widest">
                        Sin clientes en mora bajo este criterio
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200/80 pt-4 mt-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredClients.length)} de {filteredClients.length} Morosos
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <div className="px-3 text-xs font-bold text-slate-500">{currentPage} / {totalPages}</div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Desglose de Mora */}
      {selectedClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Desglose de Mora</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">
                  {selectedClient.clientName} • LOTE {selectedClient.lotNumber}
                </p>
              </div>
              <button 
                onClick={() => setSelectedClient(null)}
                className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer font-bold text-sm"
              >
                ✕
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar text-slate-700">
              {/* Resumen de Mora Total */}
              <div className="bg-red-50/70 border border-red-100 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-[10px] text-red-650/70 font-bold uppercase tracking-wider mb-1">Total Multa Vigente</p>
                  <p className="text-2xl font-black text-red-650">+{formatCLP(selectedClient.penaltyAmount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-red-650/70 font-bold uppercase tracking-wider mb-1">Atraso Contable</p>
                  <p className="text-lg font-bold text-red-600">{selectedClient.lateDays} Días</p>
                </div>
              </div>

              {/* Detalle Lote e Info General */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Información del Contrato</h4>
                <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-700">
                  <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-xs">
                    <span className="block text-[9px] text-slate-400 uppercase tracking-wider mb-1">Proyecto</span>
                    <span className="text-slate-800 uppercase">{selectedClient.projectName}</span>
                  </div>
                  <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-xs">
                    <span className="block text-[9px] text-slate-400 uppercase tracking-wider mb-1">Unidad Catastral</span>
                    <span className="text-slate-800 uppercase">Lote {selectedClient.lotNumber}</span>
                  </div>
                  <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-xs">
                    <span className="block text-[9px] text-slate-400 uppercase tracking-wider mb-1">Cuotas Pagadas</span>
                    <span className="text-slate-800">{selectedClient.paidCuotas} de {selectedClient.totalCuotas}</span>
                  </div>
                  <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-xs">
                    <span className="block text-[9px] text-slate-400 uppercase tracking-wider mb-1">Valor de la Cuota</span>
                    <span className="text-slate-800">{formatCLP(selectedClient.valor_cuota)}/mes</span>
                  </div>
                </div>
              </div>

              {/* Mora Histórica Fija */}
              {(selectedClient.penalty_mode === "FIXED" || selectedClient.penalty_mode === "MIXED") && selectedClient.manual_penalty > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-600">
                    <ShieldAlert className="w-4 h-4" />
                    <h4 className="text-[10px] font-bold uppercase tracking-wider">Mora Histórica (Acuerdo Fijo)</h4>
                  </div>
                  <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-3">
                    <p className="text-[10px] font-semibold text-amber-700/80 leading-normal uppercase tracking-wide">
                      El cliente tiene un monto de penalización fijo acordado y configurado manualmente. Este monto se suma al total de la deuda.
                    </p>
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-250 rounded-xl px-4 py-3 shadow-xs">
                      <span className="text-[10px] font-bold text-amber-850 uppercase tracking-wider">Monto Fijo Pactado</span>
                      <span className="text-sm font-bold text-amber-700">{formatCLP(selectedClient.manual_penalty)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Desglose de Cuotas Vencidas */}
              {selectedClient.overdueInstallments && selectedClient.overdueInstallments.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-red-500">
                    <AlertTriangle className="w-4 h-4" />
                    <h4 className="text-[10px] font-bold uppercase tracking-wider">Detalle de Cuotas Vencidas (Mora Diaria)</h4>
                  </div>
                  <div className="space-y-2">
                    {selectedClient.overdueInstallments.map((inst: any) => (
                      <div key={inst.number} className="bg-slate-50/50 border border-slate-150 rounded-2xl p-4 flex items-center justify-between hover:bg-slate-50 transition-colors shadow-xs">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Cuota {inst.number}</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">{inst.monthName}</span>
                          </div>
                          <p className="text-[10px] text-red-500 font-semibold uppercase tracking-wide">
                            Venció el {formatDate(inst.dueDate)}
                          </p>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1.5">
                          <span className="text-sm font-bold text-red-650">+{formatCLP(inst.penaltyAmount)}</span>
                          <span className="text-[8px] font-bold text-red-650 bg-red-50 px-2 py-0.5 rounded border border-red-100 uppercase tracking-wider">
                            {inst.lateDays} {inst.lateDays === 1 ? 'día' : 'días'} de atraso
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button 
                onClick={() => setSelectedClient(null)}
                className="px-6 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-xs border border-slate-250"
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
