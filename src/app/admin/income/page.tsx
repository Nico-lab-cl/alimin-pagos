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
        <Loader2 className="w-10 h-10 animate-spin text-accent" />
        <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Analizando Ingresos...</p>
      </div>
    );
  }

  const statsList = [
    { label: "Recaudación Total", value: formatCLP(filteredData.stats?.total || 0), icon: TrendingUp, color: "text-emerald-400", glow: "shadow-emerald-500/20" },
    { label: "Total Cuotas", value: formatCLP(filteredData.stats?.cuotas || 0), icon: Wallet, color: "text-blue-400", glow: "shadow-blue-500/20" },
    { label: "Intereses (Mora)", value: formatCLP(filteredData.stats?.penalty || 0), icon: Zap, color: "text-red-400", glow: "shadow-red-500/20" },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-panel p-4 border border-white/10 shadow-2xl backdrop-blur-xl rounded-2xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">{label}</p>
          <div className="space-y-2">
            {payload.map((p: any) => (
              <div key={p.name} className="flex items-center justify-between gap-8">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-[10px] font-bold uppercase text-white/60">{p.name === "cuotas" ? "Cuotas" : "Intereses"}:</span>
                </div>
                <span className="text-[11px] font-black text-white">{formatCLP(p.value)}</span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-white/5 flex items-center justify-between gap-8">
              <span className="text-[10px] font-bold uppercase text-accent">Total:</span>
              <span className="text-[11px] font-black text-accent">{formatCLP(payload.reduce((acc: number, p: any) => acc + p.value, 0))}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-12 animate-fade-in px-4 relative">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/20">
              <TrendingUp className="w-5 h-5 text-accent" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-accent">Financial Intelligence</p>
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
            Análisis de <span className="text-white/20">Ingresos</span>
          </h1>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Date Filter (HubSpot Style) */}
          <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 relative group h-14">
            <Calendar className="w-4 h-4 text-accent/60" />
            <select 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              className="flex-1 bg-transparent border-none text-white font-black text-[10px] outline-none uppercase tracking-widest cursor-pointer appearance-none pr-8 h-full"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='rgba(255,255,255,0.4)'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right center", backgroundSize: "1rem" }}
            >
              <option value="all" className="bg-[#0c1a1a]">Todo el tiempo</option>
              <option value="today" className="bg-[#0c1a1a]">Hoy</option>
              <option value="yesterday" className="bg-[#0c1a1a]">Ayer</option>
              <option value="this_week" className="bg-[#0c1a1a]">Esta semana</option>
              <option value="this_month" className="bg-[#0c1a1a]">Este mes</option>
              <option value="custom" className="bg-[#0c1a1a]">Personalizado</option>
            </select>
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-white/[0.08] transition-all min-w-[240px] shadow-2xl focus:border-accent/50 h-14"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23d4a84b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='3' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1.5rem center", backgroundSize: "0.8rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-[#0c1a1a] text-white">PROYECTO: {p.name.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom Date Range Picker (Visible only if 'custom' is selected) */}
      {dateFilter === "custom" && (
        <div className="flex flex-col sm:flex-row items-center justify-end gap-4 animate-fade-in -mt-6">
          <div className="flex items-center gap-3">
             <span className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-2">Desde:</span>
             <DatePicker 
               date={customStart}
               onChange={setCustomStart}
               className="w-[160px]"
             />
          </div>
          <div className="flex items-center gap-3">
             <span className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-2">Hasta:</span>
             <DatePicker 
               date={customEnd}
               onChange={setCustomEnd}
               className="w-[160px]"
             />
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-8">
        {statsList.map((s, i) => (
          <div
            key={s.label}
            className="group relative rounded-[3rem] p-10 glass-card animate-slide-up"
            style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
          >
            <div className="flex items-start justify-between mb-10">
              <div className={`w-16 h-16 rounded-[1.5rem] bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-all duration-700 shadow-2xl ${s.glow}`}>
                <s.icon className={`w-7 h-7 ${s.color}`} />
              </div>
              <ArrowUpRight className="w-6 h-6 text-white/5 group-hover:text-accent transition-all duration-500" />
            </div>
            <p className="label-premium opacity-50 group-hover:opacity-100 transition-opacity mb-2">{s.label}</p>
            <p className="text-4xl font-black text-white tracking-tighter group-hover:translate-x-1 transition-transform">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="rounded-[3.5rem] p-12 glass-card overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-between mb-16 gap-6">
          <div>
            <h3 className="text-3xl font-black tracking-tighter uppercase italic text-glow">Evolución en el tiempo</h3>
            <p className="label-premium mt-2">Comparativa según filtro aplicado</p>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-6 px-8 py-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Cuotas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Intereses</span>
                </div>
             </div>
          </div>
        </div>

        <div className="h-[400px] w-full">
          {filteredData.chart.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredData.chart} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#ffffff30', fontSize: 10, fontWeight: 900 }}
                  dy={15}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#ffffff30', fontSize: 10, fontWeight: 900 }}
                  tickFormatter={(val) => `$${(val / 1000000).toFixed(0)}M`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="cuotas" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} barSize={40} />
                <Bar dataKey="penalty" stackId="a" fill="#ef4444" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center opacity-30">
              <Filter className="w-12 h-12 mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">No hay datos en este rango</p>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Table */}
      <div className="rounded-[3.5rem] p-12 glass-card">
        <div className="flex flex-col lg:flex-row items-center justify-between mb-12 gap-8">
          <div>
            <h3 className="text-3xl font-black tracking-tighter uppercase italic text-glow">Libro de Ingresos</h3>
            <p className="label-premium mt-2">Detalle cronológico de los pagos</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
            <div className="relative flex-1 lg:flex-none lg:min-w-[300px]">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input 
                type="text" 
                placeholder="BUSCAR CLIENTE O LOTE..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-14 pr-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[2rem] border border-white/5">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5">
                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.3em] text-white/30 border-b border-white/5">Fecha</th>
                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.3em] text-white/30 border-b border-white/5">Cliente</th>
                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.3em] text-white/30 border-b border-white/5">Lote</th>
                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.3em] text-white/30 border-b border-white/5">Categoría</th>
                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[0.3em] text-white/30 border-b border-white/5 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {filteredData.records.length > 0 ? filteredData.records.map((rec: any) => (
                <tr key={rec.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-8 py-6">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white transition-colors">
                      {new Date(rec.paidAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-black uppercase tracking-tight text-white group-hover:text-accent transition-colors">{rec.clientName}</span>
                      <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1">{rec.description || 'Sin descripción'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="inline-flex px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60">
                      {rec.lotStage ? `${rec.lotStage} ` : ''}{rec.lotNumber}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className={`
                      inline-flex px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border
                      ${rec.category === 'CUOTA' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                        'bg-red-500/10 text-red-400 border-red-500/20'}
                    `}>
                      {rec.category === 'CUOTA' ? 'Cuota' : 'Interés'}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <span className="text-sm font-black text-white">{formatCLP(rec.amount)}</span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/10 italic">No se encontraron registros de ingresos</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="mt-10 flex items-center justify-between px-8">
           <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Mostrando {filteredData.records.length} transacciones</p>
           <button 
             className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-accent hover:border-accent hover:text-[#061010] transition-all"
           >
             <Download className="w-4 h-4" />
             Exportar Reporte
           </button>
        </div>
      </div>
    </div>
  );
}
