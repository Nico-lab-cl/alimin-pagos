"use client";

import { useState, useEffect } from "react";
import { 
  Loader2, 
  Download, 
  Calendar, 
  Building2, 
  AlertTriangle, 
  Clock, 
  FileText, 
  ChevronRight, 
  MoreVertical,
  Plus
} from "lucide-react";
import { getFullPostventaData, getProjectLedgerStats, getAdminProjects } from "@/actions/postventa";
import { formatCLP } from "@/lib/utils";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("Este mes");
  const [selectedProject, setSelectedProject] = useState("ALL");
  const [projects, setProjects] = useState<any[]>([]);

  const [stats, setStats] = useState({
    revenue: 0,
    paidCuotas: 0,
    totalCuotas: 0,
    moraActiva: 0,
    moraClientesCount: 0,
    tasaCobro: 0,
    topDebtors: [] as any[],
    arenaRevenue: 0,
    libertadRevenue: 0,
    monthlyChart: [] as { month: string; value: number; percent: number }[],
  });

  const formatCLPMillion = (amount: number) => {
    return `$${(amount / 1000000).toFixed(1)}M`;
  };

  const getDateParams = (periodStr: string) => {
    const baseDate = new Date();
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth(); // 0-indexed (5 for June)
    
    let customStartDate: string | undefined;
    let customEndDate: string | undefined;
    let queryMonth: number | undefined;
    let queryYear: number | undefined;

    if (periodStr === "Este mes") {
      queryMonth = month + 1;
      queryYear = year;
    } else if (periodStr === "Mes anterior") {
      if (month === 0) {
        queryMonth = 12;
        queryYear = year - 1;
      } else {
        queryMonth = month;
        queryYear = year;
      }
    } else if (periodStr === "Este año") {
      customStartDate = `${year}-01-01`;
      customEndDate = `${year}-12-31`;
    }
    
    return { queryMonth, queryYear, customStartDate, customEndDate };
  };

  const getPeriodRangeText = () => {
    const baseDate = new Date();
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    
    const formatDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    if (period === "Este mes") {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return `${formatDate(start)} - ${formatDate(end)}`;
    } else if (period === "Mes anterior") {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return `${formatDate(start)} - ${formatDate(end)}`;
    } else if (period === "Este año") {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      return `${formatDate(start)} - ${formatDate(end)}`;
    } else {
      return "Histórico Total";
    }
  };

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      try {
        // Fetch projects
        const projRes = await getAdminProjects();
        if (projRes.projects) {
          setProjects(projRes.projects);
        }

        // Fetch client data
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

        // Filter combined clients based on selectedProject
        let combinedClients = [...arenaClients, ...libertadClients];
        if (selectedProject !== "ALL") {
          combinedClients = combinedClients.filter(c => c.projectSlug === selectedProject);
        }

        // 1. Fetch ledger stats based on date parameters and selected project
        const dateParams = getDateParams(period);
        let arenaRev = 0;
        let libertadRev = 0;
        
        if (selectedProject === "ALL" || selectedProject === "arena-y-sol") {
          const arenaLedger = await getProjectLedgerStats(
            "arena-y-sol",
            dateParams.queryMonth,
            dateParams.queryYear,
            dateParams.customStartDate,
            dateParams.customEndDate
          );
          arenaRev = (!arenaLedger.error && typeof arenaLedger.revenue === "number") ? arenaLedger.revenue : 0;
        }

        if (selectedProject === "ALL" || selectedProject === "libertad-y-alegria") {
          const libertadLedger = await getProjectLedgerStats(
            "libertad-y-alegria",
            dateParams.queryMonth,
            dateParams.queryYear,
            dateParams.customStartDate,
            dateParams.customEndDate
          );
          libertadRev = (!libertadLedger.error && typeof libertadLedger.revenue === "number") ? libertadLedger.revenue : 0;
        }

        const totalRevenue = arenaRev + libertadRev;

        // 2. Cuotas Cobradas
        const totalCuotas = combinedClients.reduce((acc, c) => acc + (c.totalCuotas || 0), 0);
        const paidCuotas = combinedClients.reduce((acc, c) => acc + (c.paidCuotas || 0), 0);

        // 3. Mora Activa
        const lateClients = combinedClients.filter(c => c.status === "LATE");
        const totalMoraAmount = lateClients.reduce((acc, c) => acc + (c.penaltyAmount || 0), 0);
        const moraClientesCount = lateClients.length;

        // 4. Tasa de Cobro
        const tasaCobro = totalCuotas > 0 ? (paidCuotas / totalCuotas) * 100 : 0;

        // 5. Top 5 Debtors
        const topDebtors = [...combinedClients]
          .filter(c => c.penaltyAmount > 0)
          .sort((a, b) => b.penaltyAmount - a.penaltyAmount)
          .slice(0, 5);

        // 6. Fetch monthly chart stats for ENE-JUN (months 1-6) of current year
        const currentYear = new Date().getFullYear();
        const monthsList = [1, 2, 3, 4, 5, 6];
        const monthlyStats = await Promise.all(
          monthsList.map(async (m) => {
            let monthRevenue = 0;
            if (selectedProject === "ALL" || selectedProject === "arena-y-sol") {
              const res = await getProjectLedgerStats("arena-y-sol", m, currentYear);
              monthRevenue += (!res.error && typeof res.revenue === "number") ? res.revenue : 0;
            }
            if (selectedProject === "ALL" || selectedProject === "libertad-y-alegria") {
              const res = await getProjectLedgerStats("libertad-y-alegria", m, currentYear);
              monthRevenue += (!res.error && typeof res.revenue === "number") ? res.revenue : 0;
            }
            return monthRevenue;
          })
        );
        
        const maxMonthly = Math.max(...monthlyStats, 1);
        const monthlyChart = [
          { month: "ENE", value: monthlyStats[0], percent: (monthlyStats[0] / maxMonthly) * 100 },
          { month: "FEB", value: monthlyStats[1], percent: (monthlyStats[1] / maxMonthly) * 100 },
          { month: "MAR", value: monthlyStats[2], percent: (monthlyStats[2] / maxMonthly) * 100 },
          { month: "ABR", value: monthlyStats[3], percent: (monthlyStats[3] / maxMonthly) * 100 },
          { month: "MAY", value: monthlyStats[4], percent: (monthlyStats[4] / maxMonthly) * 100 },
          { month: "JUN", value: monthlyStats[5], percent: (monthlyStats[5] / maxMonthly) * 100 },
        ];

        setStats({
          revenue: totalRevenue,
          paidCuotas,
          totalCuotas,
          moraActiva: totalMoraAmount,
          moraClientesCount,
          tasaCobro,
          topDebtors,
          arenaRevenue: arenaRev,
          libertadRevenue: libertadRev,
          monthlyChart,
        });
      } catch (error) {
        console.error("Error loading reports data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadReports();
  }, [period, selectedProject]);

  const handleExportExcel = () => {
    const headers = ["Cliente", "Proyecto", "Lote", "RUT", "Monto Pendiente", "Días en Mora", "Estado"];
    const rows = stats.topDebtors.map((d: any) => [
      d.clientName || "",
      d.projectName || "",
      `Lote ${d.lotNumber || ""}`,
      d.rut || "",
      d.pendingBalance || 0,
      d.lateDays || 0,
      d.lateDays > 90 ? "CRÍTICO" : d.lateDays > 30 ? "AVISO" : "MOROSO"
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(row => row.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_Deuda_Morosos_${selectedProject}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 opacity-60">Generando Informes y Análisis...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-slate-800 font-sans">
      {/* Title & Filters Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 pb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Informes y Análisis
          </h1>
          <span className="text-[9px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded shadow-xs">
            V2.0
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Project Selection */}
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition-all shadow-sm focus:border-blue-500 uppercase"
          >
            <option value="ALL">Todos los Proyectos</option>
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>

          {/* Period Selection */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition-all shadow-sm focus:border-blue-500"
          >
            <option value="Este mes">Este mes</option>
            <option value="Mes anterior">Mes anterior</option>
            <option value="Este año">Este año</option>
            <option value="Histórico">Histórico</option>
          </select>

          {/* Date Picker Range Display */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm text-xs font-semibold text-slate-600">
            <Calendar className="w-4 h-4 text-slate-450" />
            <span>{getPeriodRangeText()}</span>
          </div>

          {/* Export Buttons */}
          <button 
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Exportar Excel
          </button>

          <button 
            onClick={handleExportPDF}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Recaudación */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recaudación</span>
            <span className="text-[9px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
              Total del Mes
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
            {formatCLP(stats.revenue)}
          </p>
          <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
            <span className="text-emerald-600">↑ 12%</span>
            <span>vs mes anterior</span>
          </p>
        </div>

        {/* Card 2: Cuotas Cobradas */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cuotas Cobradas</span>
            <span className="text-[10px] font-bold text-blue-600">
              {stats.tasaCobro.toFixed(0)}%
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
            {stats.paidCuotas} <span className="text-sm font-medium text-slate-400">de {stats.totalCuotas}</span>
          </p>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4">
            <div className="bg-blue-650 h-1.5 rounded-full" style={{ width: `${stats.tasaCobro.toFixed(0)}%` }} />
          </div>
        </div>

        {/* Card 3: Mora Activa */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mora Activa</span>
            <span className="text-[9px] font-extrabold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded">
              {stats.moraClientesCount} clientes
            </span>
          </div>
          <p className="text-2xl font-bold text-red-600 tracking-tight mb-2">
            {formatCLP(stats.moraActiva)}
          </p>
          <p className="text-[10px] font-bold text-slate-400">
            En estado crítico
          </p>
        </div>

        {/* Card 4: Tasa de Cobro */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow relative flex justify-between items-start">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4">Tasa de Cobro</span>
            <p className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
              {stats.tasaCobro.toFixed(1)}%
            </p>
            <p className="text-[10px] font-bold text-slate-400">
              Objetivo: 90%
            </p>
          </div>
          <div className="relative w-12 h-12 flex items-center justify-center shrink-0 mt-1">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path className="text-slate-100" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path className="text-blue-600" strokeDasharray={`${stats.tasaCobro.toFixed(0)}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <span className="absolute text-[8px] font-extrabold text-blue-600 uppercase">OK</span>
          </div>
        </div>
      </div>

      {/* Charts Panel Section */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recaudación Monthly Bar Chart */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-800">Recaudación</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Ene - Jun 2026</p>
            </div>
            <div className="flex bg-slate-50 border border-slate-200 rounded-lg p-0.5">
              <button className="px-3 py-1 text-[10px] font-bold text-blue-650 bg-white border border-slate-200/50 shadow-xs rounded-md uppercase cursor-pointer">
                Mensual
              </button>
              <button className="px-3 py-1 text-[10px] font-bold text-slate-450 hover:text-slate-700 uppercase cursor-pointer">
                Diaria
              </button>
            </div>
          </div>

          <div className="h-60 w-full flex items-end justify-between px-4 pt-8 pb-2">
            {stats.monthlyChart.map((bar) => (
              <div key={bar.month} className="flex flex-col items-center gap-2 w-1/6 group/bar">
                <div className="relative w-10 sm:w-12 bg-blue-50 rounded-t-lg overflow-visible h-32 flex flex-col justify-end">
                  {/* Tooltip on hover */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold px-2 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-sm z-10">
                    {formatCLP(bar.value)}
                  </div>
                  
                  <div 
                    className="w-full bg-blue-600 hover:bg-blue-700 transition-all rounded-t-md relative" 
                    style={{ height: `${Math.max(bar.percent, 3)}%` }} 
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-blue-700 rounded-t-md" />
                  </div>
                </div>
                <span className="text-[10px] font-bold text-slate-400">{bar.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Project Metrics Progress Bar */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-800">Cobros por Proyecto</h3>
            </div>
            <button className="p-1 hover:bg-slate-50 border border-transparent rounded-lg text-slate-400 hover:text-slate-650 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-6 py-6 flex-1 flex flex-col justify-center">
            {/* Arena y Sol */}
            {(selectedProject === "ALL" || selectedProject === "arena-y-sol") && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Arena y Sol</span>
                  <span>{formatCLPMillion(stats.arenaRevenue)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3.5 flex overflow-hidden">
                  <div className="bg-blue-600 h-full" style={{ width: stats.arenaRevenue > 0 ? "65%" : "0%" }} />
                  <div className="bg-blue-300 h-full" style={{ width: stats.arenaRevenue > 0 ? "25%" : "0%" }} />
                </div>
              </div>
            )}

            {/* Libertad y Alegría */}
            {(selectedProject === "ALL" || selectedProject === "libertad-y-alegria") && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Libertad y Alegría</span>
                  <span>{formatCLPMillion(stats.libertadRevenue)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3.5 flex overflow-hidden">
                  <div className="bg-amber-600 h-full" style={{ width: stats.libertadRevenue > 0 ? "75%" : "0%" }} />
                  <div className="bg-amber-250 h-full" style={{ width: stats.libertadRevenue > 0 ? "15%" : "0%" }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span>Cobrado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-300" />
              <span>Proyectado</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 5 Debtors Table Section */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-6 border-b border-slate-150 bg-slate-50/50">
          <h3 className="text-base font-bold text-slate-800">Top 5 Clientes con Mayor Deuda</h3>
          <Link href="/admin/clients" className="text-xs font-bold text-blue-600 hover:text-blue-750 transition-colors">
            Ver reporte completo
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">Nombre</th>
                <th className="px-6 py-4">Proyecto</th>
                <th className="px-6 py-4 text-right">Monto Pendiente</th>
                <th className="px-6 py-4 text-center">Días en Mora</th>
                <th className="px-6 py-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-850">
              {stats.topDebtors.map((debtor: any) => (
                <tr key={debtor.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800 uppercase">{debtor.clientName}</td>
                  <td className="px-6 py-4 text-slate-500 font-medium">{debtor.projectName} - Lote {debtor.lotNumber}</td>
                  <td className="px-6 py-4 text-right font-bold text-slate-800">{formatCLP(debtor.pendingBalance)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                      debtor.lateDays > 90 ? "bg-red-50 text-red-650 border border-red-100" :
                      debtor.lateDays > 30 ? "bg-amber-50 text-amber-600 border border-amber-100" :
                      "bg-slate-100 text-slate-600 border border-slate-200"
                    )}>
                      {debtor.lateDays} días
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full animate-pulse",
                        debtor.lateDays > 90 ? "bg-red-500" :
                        debtor.lateDays > 30 ? "bg-amber-500" :
                        "bg-slate-400"
                      )} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {debtor.lateDays > 90 ? "CRÍTICO" :
                         debtor.lateDays > 30 ? "AVISO" :
                         "MOROSO"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}

              {stats.topDebtors.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    Sin clientes en mora registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
