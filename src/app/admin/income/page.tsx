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
  BarChart3,
  Search,
  Filter,
  Download
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  Cell
} from "recharts";

export default function IncomeAnalyticsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Filters for detailed view
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState<string>("all");

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

  const filteredRecords = useMemo(() => {
    if (!data?.detailedRecords) return [];
    return data.detailedRecords.filter((rec: any) => {
      const matchesSearch = rec.clientName.toLowerCase().includes(search.toLowerCase()) || 
                           rec.lotNumber.toLowerCase().includes(search.toLowerCase());
      const matchesMonth = filterMonth === "all" || rec.monthKey === filterMonth;
      return matchesSearch && matchesMonth;
    });
  }, [data, search, filterMonth]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-accent" />
        <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Analizando Ingresos...</p>
      </div>
    );
  }

  const stats = [
    { label: "Recaudación Total", value: formatCLP(data?.grandTotal?.total || 0), icon: TrendingUp, color: "text-emerald-400", glow: "shadow-emerald-500/20" },
    { label: "Total Cuotas", value: formatCLP(data?.grandTotal?.cuotas || 0), icon: Wallet, color: "text-blue-400", glow: "shadow-blue-500/20" },
    { label: "Intereses (Mora)", value: formatCLP(data?.grandTotal?.penalty || 0), icon: Zap, color: "text-red-400", glow: "shadow-red-500/20" },
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
    <div className="space-y-12 animate-fade-in px-4">
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
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-white/[0.08] transition-all min-w-[240px] shadow-2xl focus:border-accent/50"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23d4a84b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='3' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1.5rem center", backgroundSize: "0.8rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-[#0c1a1a] text-white">PROYECTO: {p.name.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-8">
        {stats.map((s, i) => (
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
            <h3 className="text-3xl font-black tracking-tighter uppercase italic text-glow">Evolución Mensual</h3>
            <p className="label-premium mt-2">Comparativa de Cuotas vs Intereses</p>
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
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
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
        </div>
      </div>

      {/* Detailed Table */}
      <div className="rounded-[3.5rem] p-12 glass-card">
        <div className="flex flex-col lg:flex-row items-center justify-between mb-12 gap-8">
          <div>
            <h3 className="text-3xl font-black tracking-tighter uppercase italic text-glow">Libro de Ingresos</h3>
            <p className="label-premium mt-2">Detalle cronológico de todos los pagos recibidos</p>
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

            <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 min-w-[200px]">
              <Calendar className="w-4 h-4 text-accent/60" />
              <select 
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="flex-1 bg-transparent border-none text-white font-black text-[10px] outline-none uppercase tracking-widest"
              >
                <option value="all" className="bg-[#0c1a1a]">TODOS LOS MESES</option>
                {data?.monthlyData?.map((m: any) => (
                  <option key={m.key} value={m.key} className="bg-[#0c1a1a]">{m.label.toUpperCase()}</option>
                ))}
              </select>
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
              {filteredRecords.length > 0 ? filteredRecords.map((rec: any) => (
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
                      {rec.lotStage} {rec.lotNumber}
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
           <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Mostrando {filteredRecords.length} transacciones</p>
           <button 
             onClick={() => {
                // Future CSV export logic
             }}
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
