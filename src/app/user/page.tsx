"use client";

import { useEffect, useState } from "react";
import { getUserLots, getUserNotifications, markNotificationAsRead } from "@/actions/user";
import { formatCLP, formatDate } from "@/lib/utils";
import {
  MapPin,
  Calendar,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  CreditCard,
  ArrowRight,
  Ruler,
  Zap,
  Building2,
  ShieldCheck,
  ChevronRight
} from "lucide-react";
import Link from "next/link";

export default function UserDashboard() {
  const [data, setData] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getUserLots(),
      getUserNotifications()
    ]).then(([lotsResult, notificationsResult]) => {
      setData(lotsResult);
      if (notificationsResult.success) {
        setNotifications(notificationsResult.notifications || []);
      }
      setLoading(false);
    });
  }, []);

  const handleMarkAsRead = async (id: string) => {
    await markNotificationAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const unreadNotifications = notifications.filter(n => !n.read);


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-accent" />
        <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Consolidando Activos...</p>
      </div>
    );
  }

  if (data?.error || !data?.lots?.length) {
    return (
      <div className="text-center py-40 rounded-[3rem] border border-white/5 glass-card animate-fade-in max-w-2xl mx-auto">
        <Building2 className="w-20 h-20 mx-auto mb-8 opacity-10" />
        <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase mb-4">Sin Propiedades</h2>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/30 max-w-sm mx-auto leading-relaxed">
          Todavía no tienes terrenos vinculados a tu cuenta. Si esto es un error, contacta a postventa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-16 animate-fade-in">
      {/* Welcome Title */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-px bg-accent" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Resumen de Inversiones</p>
        </div>
        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase leading-none italic">
          Mis <span className="text-white/20">Activos</span>
        </h2>
      </div>

      {/* Notifications Section */}
      {unreadNotifications.length > 0 && (
        <div className="space-y-4 animate-slide-up">
          {unreadNotifications.map((n) => (
            <div 
              key={n.id}
              className="relative p-8 rounded-[2.5rem] bg-red-400/5 border border-red-400/20 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden group hover:bg-red-400/10 transition-all duration-500"
            >
              <div className="flex items-center gap-6 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-red-400/20 flex items-center justify-center border border-red-400/30 shadow-2xl">
                  <AlertTriangle className="w-7 h-7 text-red-400" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-white uppercase italic tracking-tighter mb-1">{n.title}</h4>
                  <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest leading-relaxed max-w-xl">
                    {n.message}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => handleMarkAsRead(n.id)}
                className="relative z-10 px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-all active:scale-95 whitespace-nowrap"
              >
                Entendido
              </button>
              
              {/* Background Glow */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-red-400/5 rounded-full blur-[80px] pointer-events-none group-hover:bg-red-400/10 transition-all" />
            </div>
          ))}
        </div>
      )}


      {/* Lot Cards Grid */}
      <div className="grid gap-12">
        {data.lots.map((lot: any, idx: number) => (
          <div
            key={lot.reservationId}
            className="group relative rounded-[3rem] overflow-hidden glass-card animate-slide-up bg-white/[0.01]"
            style={{ animationDelay: `${idx * 150}ms`, animationFillMode: "both" }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Left Column: Property Visual & Basic Info */}
              <div className="lg:col-span-5 p-6 md:p-12 relative overflow-hidden border-b lg:border-b-0 lg:border-r border-white/5">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="mb-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent mb-2">{lot.projectName}</p>
                    <h3 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase italic leading-none mb-4">
                      Lote <span className="group-hover:text-accent transition-colors">#{lot.lotNumber}</span>
                    </h3>
                    <div className="flex items-center gap-4">
                      {lot.lotStage && (
                        <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-widest text-white/50">ETAPA {lot.lotStage}</span>
                      )}
                      {lot.area_m2 && (
                        <div className="flex items-center gap-2 text-[10px] font-black text-white uppercase tracking-widest opacity-30">
                          <Ruler className="w-3.5 h-3.5" />
                          <span>{lot.area_m2} m²</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto space-y-6">
                    <div className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 border border-white/5 group-hover:border-accent/40 transition-all duration-700 backdrop-blur-md">
                      <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5 text-[#061010]" />
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Estado Contractual</p>
                        <p className="text-xs font-black uppercase tracking-widest text-white">Vigente & Verificado</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Decorative Elements */}
                <Zap className="absolute -bottom-10 -left-10 w-64 h-64 text-white/[0.02] group-hover:text-accent/[0.05] group-hover:scale-110 transition-all duration-1000" />
              </div>

              {/* Right Column: Financials & Actions */}
              <div className="lg:col-span-7 p-6 md:p-12 space-y-10">
                {/* Visual Progress Bar */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-4 h-4 text-accent" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Progreso de Adquisición</span>
                    </div>
                    <span className="text-lg font-black italic text-white leading-none">
                      {lot.acquisitionProgress}%
                    </span>
                  </div>
                  <div className="h-4 rounded-full bg-white/5 border border-white/5 overflow-hidden p-1">
                    <div 
                      className="h-full rounded-full transition-all duration-[2s] ease-out shadow-[0_0_20px_rgba(212,168,75,0.4)]"
                      style={{ 
                        width: `${Math.min(100, lot.acquisitionProgress)}%`,
                        background: 'linear-gradient(90deg, #d4a84b 0%, #e0be72 50%, #b88e35 100%)'
                      }}
                    />
                  </div>
                </div>

                {/* Financial Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <div className="rounded-2xl p-5 md:p-6 bg-white/[0.02] border border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-20 mb-2">Total Invertido</p>
                    <p className="text-2xl font-black text-emerald-400 tracking-tighter">{formatCLP(lot.totalPaid)}</p>
                  </div>
                  <div className="rounded-2xl p-5 md:p-6 bg-white/[0.02] border border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-20 mb-2">Compromiso Total</p>
                    <p className="text-2xl font-black text-white/90 tracking-tighter">{formatCLP(lot.totalToPay)}</p>
                  </div>
                  <div className="rounded-2xl p-5 md:p-6 bg-white/[0.02] border border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-20 mb-2">Cuotas Pagadas</p>
                    <p className="text-2xl font-black text-white tracking-tighter italic">
                      {lot.paidCuotas} <span className="text-xs opacity-20 not-italic ml-1">/ {lot.totalCuotas}</span>
                    </p>
                  </div>
                  <div className="rounded-2xl p-5 md:p-6 bg-white/[0.02] border border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-20 mb-2">Saldo Remanente</p>
                    <p className={`text-2xl font-black tracking-tighter ${lot.pendingBalance > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                      {formatCLP(lot.pendingBalance)}
                    </p>
                  </div>
                </div>

                {/* Status Dashboard & Action */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-8 pt-6 border-t border-white/5">
                  <div className="flex flex-wrap gap-4">
                    {lot.penaltyAmount > 0 && !lot.isMoraFrozen && (
                      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-[10px] font-black uppercase tracking-widest animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Interés Acumulado: {formatCLP(lot.penaltyAmount)} ({lot.lateDays} {lot.lateDays === 1 ? "día" : "días"} × {formatCLP(lot.dailyPenalty)}/día)
                      </div>
                    )}
                    {lot.isMoraFrozen && (
                      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-400/10 border border-blue-400/20 text-blue-400 text-[10px] font-black uppercase tracking-widest">
                        <Clock className="w-3.5 h-3.5" />
                        Mora Congelada por Administración
                      </div>
                    )}
                    {lot.nextDueDate && (
                      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/50">
                        <Calendar className="w-3.5 h-3.5" />
                        Próximo Pago: {formatDate(lot.nextDueDate)} 
                        {lot.nextInstallmentNumber && ` (CUOTA ${lot.nextInstallmentNumber} - ${lot.nextInstallmentMonth})`}
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/user/pay/${lot.reservationId}`}
                    className="w-full sm:w-auto min-w-[220px] py-5 rounded-2xl btn-metallic-gold text-[10px] flex items-center justify-center gap-4 active:scale-95 group/btn"
                  >
                    <CreditCard className="w-5 h-5 transition-transform group-hover/btn:-rotate-12" />
                    Ejecutar Pago
                    <ArrowRight className="w-5 h-5 transition-transform group-hover/btn:translate-x-1" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
