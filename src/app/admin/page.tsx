"use client";

import { useEffect, useState } from "react";
import { getAdminProjects, getFullPostventaData, getProjectLedgerStats } from "@/actions/postventa";
import { formatCLP } from "@/lib/utils";
import { 
  Loader2, 
  AlertTriangle, 
  Clock, 
  Users, 
  ChevronRight,
  Calendar,
  Building2,
  Plus,
  ListFilter,
  MoreVertical,
  Download
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSearch } from "@/context/SearchContext";

export default function AdminDashboard() {
  const { search } = useSearch();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [ledgerStats, setLedgerStats] = useState<any>({ revenue: 0, penalty: 0 });
  const [loading, setLoading] = useState(true);
  
  const [filterMonth, setFilterMonth] = useState<number>(0);
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());

  // Table pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

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
      Promise.all([
        getFullPostventaData({ projectSlug: selectedProject }),
        getProjectLedgerStats(selectedProject, filterMonth === 0 ? undefined : filterMonth, filterYear)
      ]).then(([fullData, ledger]) => {
        setData(fullData);
        if (!ledger.error) setLedgerStats(ledger);
        setLoading(false);
      });
    }
  }, [selectedProject, filterMonth, filterYear]);

  // Reset page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Analizando Cartera...</p>
      </div>
    );
  }

  const clientsList = data?.data || [];
  const totalPend = clientsList.reduce((acc: number, curr: any) => acc + curr.pendingBalance, 0);

  const filteredClients = clientsList.filter((c: any) => {
    if (!search) return true;
    const query = search.toLowerCase();
    return (
      c.clientName?.toLowerCase().includes(query) ||
      c.rut?.toLowerCase().includes(query) ||
      (c.lotNumber && c.lotNumber.toString().includes(query))
    );
  });

  // Pagination math
  const totalPages = Math.max(1, Math.ceil(filteredClients.length / itemsPerPage));
  const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getLotReference = (c: any) => {
    if (selectedProject?.includes("casablanca")) return `VDC-L${c.lotNumber}`;
    if (selectedProject?.includes("arenas") || selectedProject?.includes("arena")) return `AYS-L${c.lotNumber}`;
    return `L-${c.lotNumber}`;
  };

  const handleExportCSV = () => {
    const headers = ["Cliente", "RUT", "Email", "Lote", "Cuotas Pagadas", "Total Cuotas", "Estado", "Saldo Pendiente"];
    const rows = clientsList.map((c: any) => [
      c.clientName || "",
      c.rut || "",
      c.clientEmail || "",
      c.lotNumber || "",
      c.paidCuotas || 0,
      c.totalCuotas || 0,
      c.status || "",
      c.pendingBalance || 0
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(";"), ...rows.map((e: any) => e.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `actividad_cartera_${selectedProject}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = [
    { 
      label: "Recaudación Total (YTD)", 
      value: formatCLP(ledgerStats.revenue), 
      icon: Building2, 
      iconColor: "text-slate-700", 
      iconBg: "bg-slate-50",
      subtext: "↗ +12.5% vs mes anterior",
      subtextClass: "text-emerald-600"
    },
    { 
      label: "Deuda Vencida (Mora)", 
      value: formatCLP(ledgerStats.penalty), 
      icon: AlertTriangle, 
      iconColor: "text-red-500", 
      iconBg: "bg-red-50",
      subtext: "↗ +2.1% vs mes anterior",
      subtextClass: "text-red-600"
    },
    { 
      label: "Saldo por Cobrar", 
      value: formatCLP(totalPend), 
      icon: Clock, 
      iconColor: "text-slate-700", 
      iconBg: "bg-slate-50",
      subtext: `En ${clientsList.length} lotes activos`,
      subtextClass: "text-slate-500"
    },
    { 
      label: "Clientes Activos", 
      value: data?.stats?.total || 0, 
      icon: Users, 
      iconColor: "text-slate-700", 
      iconBg: "bg-slate-50",
      subtext: "↗ +5 nuevos esta semana",
      subtextClass: "text-emerald-600"
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome & Global Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight leading-none mb-1">
            Panel de Control
          </h1>
          <p className="text-xs text-slate-500 font-medium">Resumen general y métricas clave</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3 py-2 rounded-xl bg-white border border-slate-200 flex items-center gap-2 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select 
              value={`${filterMonth}-${filterYear}`} 
              onChange={(e) => {
                const [m, y] = e.target.value.split("-").map(Number);
                setFilterMonth(m);
                setFilterYear(y);
              }}
              className="bg-transparent border-none text-slate-700 font-bold text-[10px] outline-none uppercase cursor-pointer"
            >
              <option value={`0-${filterYear}`}>Histórico Total</option>
              <option value={`1-${filterYear}`}>Ene {filterYear}</option>
              <option value={`2-${filterYear}`}>Feb {filterYear}</option>
              <option value={`3-${filterYear}`}>Mar {filterYear}</option>
              <option value={`4-${filterYear}`}>Abr {filterYear}</option>
              <option value={`5-${filterYear}`}>May {filterYear}</option>
              <option value={`6-${filterYear}`}>Jun {filterYear}</option>
              <option value={`7-${filterYear}`}>Jul {filterYear}</option>
              <option value={`8-${filterYear}`}>Ago {filterYear}</option>
              <option value={`9-${filterYear}`}>Sep {filterYear}</option>
              <option value={`10-${filterYear}`}>Oct {filterYear}</option>
              <option value={`11-${filterYear}`}>Nov {filterYear}</option>
              <option value={`12-${filterYear}`}>Dic {filterYear}</option>
            </select>
          </div>
          
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-bold uppercase tracking-wider outline-none cursor-pointer hover:bg-slate-50 transition-all min-w-[180px] shadow-sm focus:border-blue-500"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.8rem center", backgroundSize: "0.6rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>PROYECTO: {p.name.toUpperCase()}</option>
            ))}
          </select>

          <button 
            onClick={handleExportCSV}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>

          <Link 
            href="/admin/clients" 
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo Pago
          </Link>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="relative rounded-2xl p-6 bg-white border border-slate-100 shadow-sm transition-all hover:shadow-md animate-slide-up"
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</span>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border border-slate-100", s.iconBg)}>
                <s.icon className={cn("w-5 h-5", s.iconColor)} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-800 tracking-tight mb-2">{s.value}</p>
            <p className={cn("text-[10px] font-semibold", s.subtextClass)}>{s.subtext}</p>
          </div>
        ))}
      </div>

      {/* Actividad Reciente de Cartera Card */}
      <div className="rounded-2xl bg-white border border-slate-150/80 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Actividad Reciente de Cartera</h3>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600 transition-all">
              <ListFilter className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600 transition-all">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombre del Cliente</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Referencia de Lote</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progreso de Cuotas</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Saldo Pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm text-slate-800">
              {paginatedClients.length > 0 ? (
                paginatedClients.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-xs font-bold text-slate-800 uppercase leading-none mb-1">{c.clientName}</p>
                        <p className="text-[10px] text-slate-400 font-medium lowercase">{c.clientEmail}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <span className="inline-block px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wide">
                          {getLotReference(c)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 min-w-[150px]">
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex-1 border border-slate-200/60 p-0.5">
                          <div 
                            className="h-full bg-blue-600 rounded-full transition-all duration-300" 
                            style={{ 
                              width: c.totalCuotas > 0 ? `${(c.paidCuotas / c.totalCuotas) * 100}%` : '0%'
                            }} 
                          />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold">{c.totalCuotas > 0 ? Math.round((c.paidCuotas / c.totalCuotas) * 100) : 0}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {c.status === "LATE" ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-100 flex items-center gap-1.5 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          Mora
                        </span>
                      ) : c.status === "GRACE" ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100 flex items-center gap-1.5 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Gracia
                        </span>
                      ) : c.status === "CONTADO" ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-1.5 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Contado
                        </span>
                      ) : c.status === "CONGELADO" ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-200 flex items-center gap-1.5 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          Congelado
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-1.5 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Al Día
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-xs font-bold text-slate-800">{formatCLP(c.pendingBalance)}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    No se encontraron clientes que coincidan con la búsqueda
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-6 border-t border-slate-100 gap-4">
          <span className="text-xs text-slate-500 font-semibold">
            Mostrando {filteredClients.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} a {Math.min(currentPage * itemsPerPage, filteredClients.length)} de {filteredClients.length} entradas
          </span>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-650 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Anterior
            </button>
            {Array.from({ length: totalPages }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentPage(idx + 1)}
                className={cn(
                  "w-8 h-8 rounded-lg text-xs font-bold transition-colors",
                  currentPage === idx + 1 
                    ? "bg-slate-100 text-slate-800" 
                    : "border border-transparent text-slate-600 hover:bg-slate-50"
                )}
              >
                {idx + 1}
              </button>
            ))}
            <button 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-650 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
