"use client";

import { useEffect, useState, useMemo } from "react";
import { getAdminProjects, getIncomeAnalytics } from "@/actions/postventa";
import { formatCLP } from "@/lib/utils";
import { 
  Loader2, 
  TrendingUp, 
  ArrowUpRight, 
  Calendar,
  Wallet,
  Zap,
  Search,
  Download,
  Filter
} from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
} from "recharts";

type DateFilter = "all" | "today" | "yesterday" | "this_week" | "this_month" | "custom";

export default function IncomeAnalyticsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

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
      getIncomeAnalytics(selectedProject).then((res) => {
        if (!res.error) {
          setData(res);
        }
        setLoading(false);
      });
    }
  }, [selectedProject]);

  const filteredData = useMemo(() => {
    if (!data?.detailedRecords) return { records: [], stats: null, chart: [] };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)); // Monday
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const cStart = customStart ? new Date(customStart + "T00:00:00") : null;
    const cEnd = customEnd ? new Date(customEnd + "T23:59:59") : null;

    let records = data.detailedRecords.filter((rec: any) => {
      // 1. Text search
      const matchesSearch = rec.clientName.toLowerCase().includes(search.toLowerCase()) || 
                           rec.lotNumber.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      // 2. Date filter
      const paidAt = new Date(rec.paidAt);
      const paidDate = new Date(paidAt.getFullYear(), paidAt.getMonth(), paidAt.getDate());

      switch (dateFilter) {
        case "today":
          return paidDate.getTime() === today.getTime();
        case "yesterday":
          return paidDate.getTime() === yesterday.getTime();
        case "this_week":
          return paidDate.getTime() >= startOfWeek.getTime();
        case "this_month":
          return paidDate.getTime() >= startOfMonth.getTime();
        case "custom":
          if (cStart && paidDate.getTime() < cStart.getTime()) return false;
          if (cEnd && paidDate.getTime() > cEnd.getTime()) return false;
          return true;
        default:
          return true; // "all"
      }
    });

    // Compute stats
    let totalCuotas = 0;
    let totalPenalty = 0;
    
    // Determine grouping logic: by day or by month
    let groupBy = "day";
    if (dateFilter === "all") {
      groupBy = "month";
    } else if (dateFilter === "custom" && cStart && cEnd) {
      const diffTime = Math.abs(cEnd.getTime() - cStart.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      if (diffDays > 60) groupBy = "month";
    }

    const chartMap = new Map<string, any>();
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    records.forEach((rec: any) => {
      const paidAt = new Date(rec.paidAt);
      const year = paidAt.getFullYear();
      const month = paidAt.getMonth();
      const day = paidAt.getDate();
      
      let key = "";
      let label = "";

      if (groupBy === "month") {
        key = `${year}-${String(month + 1).padStart(2, "0")}`;
        label = `${monthNames[month]} ${year}`;
      } else {
        key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        label = `${day} ${monthNames[month]}`;
      }
      
      if (rec.category === "CUOTA") totalCuotas += rec.amount;
      if (rec.category === "PENALTY") totalPenalty += rec.amount;

      if (!chartMap.has(key)) {
        chartMap.set(key, {
          key, year, month: month + 1, day, label,
          cuotas: 0, penalty: 0
        });
      }
      const bucket = chartMap.get(key)!;
      if (rec.category === "CUOTA") bucket.cuotas += rec.amount;
      if (rec.category === "PENALTY") bucket.penalty += rec.amount;
    });

    const chart = Array.from(chartMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.month !== b.month) return a.month - b.month;
      if (groupBy === "day") return a.day - b.day;
      return 0;
    });

    return {
      records,
      stats: { total: totalCuotas + totalPenalty, cuotas: totalCuotas, penalty: totalPenalty },
      chart
    };
  }, [data, search, dateFilter, customStart, customEnd]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#64748B] opacity-65">Analizando Ingresos...</p>
      </div>
    );
  }

  const statsList = [
    { label: "Recaudación Total", value: formatCLP(filteredData.stats?.total || 0), icon: TrendingUp, color: "text-emerald-700", iconBg: "bg-emerald-50 border-emerald-200" },
    { label: "Total Cuotas", value: formatCLP(filteredData.stats?.cuotas || 0), icon: Wallet, color: "text-brand-600", iconBg: "bg-brand-50 border-brand-200" },
    { label: "Intereses (Mora)", value: formatCLP(filteredData.stats?.penalty || 0), icon: Zap, color: "text-red-700", iconBg: "bg-red-50 border-red-200" },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-slate-200 shadow-lg rounded-xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-3">{label}</p>
          <div className="space-y-2">
            {payload.map((p: any) => (
              <div key={p.name} className="flex items-center justify-between gap-8">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-[10px] font-semibold uppercase text-slate-600">{p.name === "cuotas" ? "Cuotas" : "Intereses"}:</span>
                </div>
                <span className="text-[11px] font-bold text-slate-800 tabular-nums">{formatCLP(p.value)}</span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-[#E2E8F0] flex items-center justify-between gap-8">
              <span className="text-[10px] font-bold uppercase text-brand-600">Total:</span>
              <span className="text-[11px] font-bold text-brand-600 tabular-nums">{formatCLP(payload.reduce((acc: number, p: any) => acc + p.value, 0))}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="animate-fade-in px-4 relative">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-brand-600" />
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Inteligencia Financiera</p>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-[#191c1e] font-headline-lg">Análisis de Ingresos</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
          {/* Date Filter */}
          <div className="flex items-center gap-2 px-3 bg-white border border-[#E2E8F0] rounded-lg focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/10 transition-all w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-[#64748B]/60 shrink-0" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              className="flex-1 bg-transparent border-none text-[#191c1e] font-medium text-sm outline-none cursor-pointer appearance-none pr-8 py-2"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right center", backgroundSize: "1rem" }}
            >
              <option value="all" className="bg-white">Todo el tiempo</option>
              <option value="today" className="bg-white">Hoy</option>
              <option value="yesterday" className="bg-white">Ayer</option>
              <option value="this_week" className="bg-white">Esta semana</option>
              <option value="this_month" className="bg-white">Este mes</option>
              <option value="custom" className="bg-white">Personalizado</option>
            </select>
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#191c1e] font-medium focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10 focus:outline-none cursor-pointer hover:bg-slate-50 transition-all min-w-[200px]"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "1rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-white text-[#191c1e]">{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom Date Range Picker (Visible only if 'custom' is selected) */}
      {dateFilter === "custom" && (
        <div className="flex flex-col sm:flex-row items-center justify-end gap-4 animate-fade-in mb-8">
          <div className="flex items-center gap-3">
             <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mt-2">Desde:</span>
             <DatePicker
               date={customStart}
               onChange={setCustomStart}
               className="w-[160px]"
               lightMode={true}
             />
          </div>
          <div className="flex items-center gap-3">
             <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mt-2">Hasta:</span>
             <DatePicker
               date={customEnd}
               onChange={setCustomEnd}
               className="w-[160px]"
               lightMode={true}
             />
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6 mb-8">
        {statsList.map((s, i) => (
          <div
            key={s.label}
            className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300 animate-slide-up"
            style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
          >
            <div className="flex items-start justify-between mb-6">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${s.iconBg}`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <ArrowUpRight className="w-5 h-5 text-slate-300 group-hover:text-brand-600 transition-colors duration-300" />
            </div>
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-3xl font-bold text-slate-800 tracking-tight tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm overflow-hidden mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-slate-800">Evolución en el tiempo</h3>
            <p className="text-sm text-[#64748B] mt-1">Comparativa según filtro aplicado</p>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-5 px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Cuotas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Intereses</span>
                </div>
             </div>
          </div>
        </div>

        <div className="h-[400px] w-full">
          {filteredData.chart.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredData.chart} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 10, fontWeight: 600 }}
                  dy={15}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 10, fontWeight: 600 }}
                  tickFormatter={(val) => `$${(val / 1000000).toFixed(0)}M`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                <Bar dataKey="cuotas" stackId="a" fill="#4ba646" radius={[0, 0, 0, 0]} barSize={40} />
                <Bar dataKey="penalty" stackId="a" fill="#ef4444" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center">
              <Filter className="w-12 h-12 mb-4 text-slate-300" />
              <p className="text-sm font-semibold text-[#64748B]">No hay datos en este rango</p>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-6 border-b border-[#E2E8F0]">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-slate-800">Libro de Ingresos</h3>
            <p className="text-sm text-[#64748B] mt-1">Detalle cronológico de los pagos</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            <div className="relative flex-1 lg:flex-none lg:min-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]/50" />
              <input
                type="text"
                placeholder="Buscar cliente o lote..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10 focus:outline-none transition-all placeholder:text-[#64748B]/40 text-[#191c1e]"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">Fecha</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">Cliente</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">Lote</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">Categoría</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0] text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filteredData.records.length > 0 ? filteredData.records.map((rec: any) => (
                <tr key={rec.id} className="group hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3">
                    <span className="text-xs font-medium text-slate-600 tabular-nums whitespace-nowrap">
                      {new Date(rec.paidAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-800">{rec.clientName}</span>
                      <span className="text-xs text-[#64748B] mt-0.5">{rec.description || 'Sin descripción'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="inline-flex px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">
                      {rec.lotStage ? `${rec.lotStage} ` : ''}{rec.lotNumber}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className={`
                      inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border
                      ${rec.category === 'CUOTA' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                        'bg-red-50 text-red-700 border-red-200'}
                    `}>
                      {rec.category === 'CUOTA' ? 'Cuota' : 'Interés'}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-sm font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatCLP(rec.amount)}</span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <p className="text-sm font-semibold text-[#64748B]">No se encontraron registros de ingresos</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-4 p-6 border-t border-[#E2E8F0]">
           <p className="text-xs font-medium text-[#64748B]">Mostrando {filteredData.records.length} transacciones</p>
           <button
             className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer shadow-sm"
           >
             <Download className="w-4 h-4 text-slate-500" />
             Exportar Reporte
           </button>
        </div>
      </div>
    </div>
  );
}
