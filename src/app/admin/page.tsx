"use client";

import { useEffect, useState } from "react";
import { getAdminProjects, getFullPostventaData } from "@/actions/postventa";
import { formatCLP } from "@/lib/utils";
import { 
  Loader2, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Users, 
  Building2,
  ChevronRight,
  Zap,
  ArrowUpRight,
  Calendar,
  Wallet
} from "lucide-react";
import Link from "next/link";

export default function AdminDashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-accent" />
        <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Analizando Cartera...</p>
      </div>
    );
  }

  // Calculate high-level metrics
  const totalRecau = (data?.data || []).reduce((acc: number, curr: any) => acc + curr.totalPaid, 0);
  const totalMora = (data?.data || []).reduce((acc: number, curr: any) => acc + curr.penaltyAmount, 0);
  const totalPend = (data?.data || []).reduce((acc: number, curr: any) => acc + curr.pendingBalance, 0);

  const stats = [
    { label: "Recaudación Total", value: formatCLP(totalRecau), icon: TrendingUp, color: "text-emerald-400", glow: "shadow-emerald-500/20" },
    { label: "Mora Acumulada", value: formatCLP(totalMora), icon: AlertTriangle, color: "text-red-400", glow: "shadow-red-500/20" },
    { label: "Saldo por Cobrar", value: formatCLP(totalPend), icon: Wallet, color: "text-blue-400", glow: "shadow-blue-500/20" },
    { label: "Clientes Activos", value: data?.stats?.total || 0, icon: Users, color: "text-accent", glow: "shadow-accent/20" },
  ];

  return (
    <div className="space-y-12 animate-fade-in px-4">
      {/* Welcome & Project Selector */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/20">
              <Zap className="w-5 h-5 text-accent" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-accent">Control Panel v2.0</p>
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
            Dashboard <span className="text-white/20">Postventa</span>
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3 shadow-inner">
            <Calendar className="w-4 h-4 text-accent/60" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Periodo: <span className="text-white">Abril 2026</span></span>
          </div>
          
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

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
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
            
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>
        ))}
      </div>

      {/* Bottom Layout: Distribution & Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 pb-10">
        {/* Health Chart Box */}
        <div className="lg:col-span-2 rounded-[3.5rem] p-12 glass-card">
          <div className="flex items-center justify-between mb-16">
            <div>
              <h3 className="text-3xl font-black tracking-tighter uppercase italic text-glow">Cartera Recaudación</h3>
              <p className="label-premium mt-2">Análisis de estados vigentes y rendimiento</p>
            </div>
            <Link href="/admin/alerts" className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:btn-metallic-gold transition-all">Ver Alertas Críticas</Link>
          </div>

          <div className="space-y-10">
            {[
              { label: "Mora Crítica", count: data?.stats?.late || 0, color: "#ff4d4d", percent: data?.stats?.total ? (data.stats.late / data.stats.total) * 100 : 0 },
              { label: "En Período Gracia", count: data?.stats?.grace || 0, color: "#fbbf24", percent: data?.stats?.total ? (data.stats.grace / data.stats.total) * 100 : 0 },
              { label: "Por Vencer (5 días)", count: data?.stats?.upcoming || 0, color: "#818cf8", percent: data?.stats?.total ? (data.stats.upcoming / data.stats.total) * 100 : 0 },
              { label: "Al Día", count: data?.stats?.ok || 0, color: "#10b981", percent: data?.stats?.total ? (data.stats.ok / data.stats.total) * 100 : 0 },
            ].map((st, i) => (
              <div key={st.label} className="group animate-fade-in" style={{ animationDelay: `${500 + i * 100}ms`, animationFillMode: "both" }}>
                <div className="flex items-center justify-between mb-4">
                  <span className="label-premium opacity-30 group-hover:opacity-100 transition-opacity">{st.label}</span>
                  <span className="text-base font-black" style={{ color: st.color }}>{st.count} <span className="text-[11px] opacity-30 ml-2 uppercase">Unidades</span></span>
                </div>
                <div className="h-4 rounded-full bg-white/5 overflow-hidden border border-white/5 p-1 shadow-inner">
                  <div 
                    className="h-full rounded-full transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]" 
                    style={{ 
                      width: `${st.percent}%`, 
                      background: st.color,
                      boxShadow: `0 0 25px ${st.color}44`
                    }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions Sidebar inside Dashboard */}
        <div className="space-y-8">
          <div className="rounded-[3.5rem] p-10 glass-card border-accent/20">
            <div className="flex items-center gap-5 mb-10">
              <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/30 shadow-2xl">
                <CheckCircle className="w-7 h-7 text-accent" />
              </div>
              <div>
                <h4 className="text-lg font-black italic uppercase tracking-tighter">Acciones</h4>
                <p className="label-premium">Operaciones Rápidas</p>
              </div>
            </div>
            
            <div className="grid gap-4">
              <Link href="/admin/receipts" className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-accent/40 group transition-all duration-500">
                <div className="flex items-center gap-4">
                  <div className="w-2.5 h-2.5 rounded-full bg-accent animate-glow" />
                  <span className="text-[11px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">Aprobar Pagos</span>
                </div>
                <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </Link>
              
              <Link href="/admin/clients" className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-accent/40 group transition-all duration-500">
                <div className="flex items-center gap-4">
                  <Users className="w-5 h-5 opacity-30 group-hover:opacity-100 group-hover:text-accent transition-all" />
                  <span className="text-[11px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">Base Clientes</span>
                </div>
                <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </Link>
            </div>
          </div>

          <div className="rounded-[3.5rem] p-10 btn-metallic-gold relative overflow-hidden group shadow-[0_30px_60px_rgba(182,139,47,0.3)] min-h-[300px] flex flex-col justify-end">
            <Zap className="absolute top-[-10%] left-[-10%] w-48 h-48 opacity-10 group-hover:scale-125 group-hover:rotate-12 transition-transform duration-1000" />
            <div className="relative z-10">
              <h4 className="text-2xl font-black uppercase italic leading-none mb-4">Optimizar Recaudación</h4>
              <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed opacity-60 mb-8">Revisa las alertas automáticas para prevenir moras críticas en el cierre de mes.</p>
              <button className="w-full py-5 bg-[#061010] text-accent rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl hover:bg-black transition-all">Comenzar Audit</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
