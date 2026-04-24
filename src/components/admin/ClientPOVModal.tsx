"use client";

import { useEffect, useState } from "react";
import { getClientPOV } from "@/actions/postventa";
import { formatCLP } from "@/lib/utils";
import {
  X,
  Loader2,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle,
  CreditCard,
  Ruler,
  ShieldCheck,
  Zap,
  Building2,
  Building,
  FileText,
  Download,
  Copy,
  Eye,
  Monitor,
  Calendar,
  Upload,
} from "lucide-react";

interface ClientPOVModalProps {
  reservationId: string;
  clientName: string;
  onClose: () => void;
}

export default function ClientPOVModal({ reservationId, clientName, onClose }: ClientPOVModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "payment" | "documents">("dashboard");

  useEffect(() => {
    setLoading(true);
    setError("");
    getClientPOV(reservationId)
      .then((result) => {
        if (result.error) {
          setError(result.error);
        } else {
          setData(result.data);
        }
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [reservationId]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[95vh] overflow-hidden rounded-[2.5rem] border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.8)] animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "linear-gradient(180deg, #071414 0%, #040e0e 100%)" }}
      >
        {/* Simulated Client Top Bar */}
        <div className="sticky top-0 z-20 border-b border-white/5" style={{ background: "rgba(6,16,16,0.95)", backdropFilter: "blur(20px)" }}>
          {/* POV Warning Banner */}
          <div className="bg-gradient-to-r from-violet-500/20 via-purple-500/10 to-violet-500/20 border-b border-violet-500/20 px-6 py-2 flex items-center justify-center gap-3">
            <Eye className="w-3.5 h-3.5 text-violet-400" />
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-violet-300">
              Vista Previa — Simulación del Portal del Cliente
            </p>
            <Monitor className="w-3.5 h-3.5 text-violet-400" />
          </div>

          {/* Simulated Navbar */}
          <div className="px-8 py-5 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="relative">
                <div className="absolute inset-0 bg-accent/20 rounded-xl blur-xl" />
                <div className="relative w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shadow-lg p-1.5">
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tighter uppercase leading-none text-white italic">Alimin</h1>
                <p className="text-[8px] font-black text-accent tracking-[0.4em] uppercase mt-0.5 opacity-60">Portal de Inversión</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Tabs */}
              <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/5">
                {[
                  { key: "dashboard" as const, label: "Dashboard" },
                  { key: "payment" as const, label: "Pago" },
                  { key: "documents" as const, label: "Documentos" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      activeTab === tab.key
                        ? "bg-accent text-[#061010] shadow-[0_0_15px_rgba(212,168,75,0.3)]"
                        : "text-white/30 hover:text-white/60"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20">Titular</span>
                <span className="text-[10px] font-black text-white italic truncate max-w-[120px] uppercase tracking-tighter leading-none">{clientName}</span>
              </div>

              <button
                onClick={onClose}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 md:p-12">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-accent" />
              <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Cargando Vista del Cliente...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <AlertTriangle className="w-10 h-10 text-red-400 opacity-40" />
              <p className="text-xs font-black uppercase tracking-[0.3em] text-red-400">{error}</p>
            </div>
          ) : data ? (
            <>
              {activeTab === "dashboard" && <DashboardView data={data} onTabChange={setActiveTab} />}
              {activeTab === "payment" && <PaymentView data={data} />}
              {activeTab === "documents" && <DocumentsView data={data} />}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── DASHBOARD VIEW ──────────────────── */
function DashboardView({ data, onTabChange }: { data: any; onTabChange: (tab: "dashboard" | "payment" | "documents") => void }) {
  const formatDate = (d: string | Date) => {
    const date = new Date(d);
    return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-px bg-accent" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Resumen de Inversiones</p>
        </div>
        <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none italic">
          Mis <span className="text-white/20">Activos</span>
        </h2>
      </div>

      {/* Lot Card */}
      <div className="rounded-[2.5rem] overflow-hidden glass-card bg-white/[0.01]">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left: Property Info */}
          <div className="lg:col-span-5 p-8 md:p-10 relative overflow-hidden border-b lg:border-b-0 lg:border-r border-white/5">
            <div className="relative z-10 h-full flex flex-col">
              <div className="mb-8">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent mb-2">{data.projectName}</p>
                <h3 className="text-4xl font-black text-white tracking-tighter uppercase italic leading-none mb-3">
                  Lote <span className="text-accent">#{data.lotNumber}</span>
                </h3>
                <div className="flex items-center gap-4">
                  {data.lotStage && (
                    <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-widest text-white/50">
                      ETAPA {data.lotStage}
                    </span>
                  )}
                  {data.area_m2 && (
                    <div className="flex items-center gap-2 text-[10px] font-black text-white uppercase tracking-widest opacity-30">
                      <Ruler className="w-3.5 h-3.5" />
                      <span>{data.area_m2} m²</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-auto">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md">
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
            <Zap className="absolute -bottom-10 -left-10 w-48 h-48 text-white/[0.02]" />
          </div>

          {/* Right: Financials */}
          <div className="lg:col-span-7 p-8 md:p-10 space-y-8">
            {/* Progress Bar */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-accent" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Progreso de Adquisición</span>
                </div>
                <span className="text-lg font-black italic text-white leading-none">
                  {data.acquisitionProgress}%
                </span>
              </div>
              <div className="h-4 rounded-full bg-white/5 border border-white/5 overflow-hidden p-1">
                <div
                  className="h-full rounded-full transition-all duration-[2s] ease-out shadow-[0_0_20px_rgba(212,168,75,0.4)]"
                  style={{
                    width: `${Math.min(100, data.acquisitionProgress)}%`,
                    background: "linear-gradient(90deg, #d4a84b 0%, #e0be72 50%, #b88e35 100%)",
                  }}
                />
              </div>
            </div>

            {/* Financial Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl p-5 bg-white/[0.02] border border-white/5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-20 mb-2">Total Invertido</p>
                <p className="text-xl font-black text-emerald-400 tracking-tighter">{formatCLP(data.totalPaid)}</p>
              </div>
              <div className="rounded-2xl p-5 bg-white/[0.02] border border-white/5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-20 mb-2">Compromiso Total</p>
                <p className="text-xl font-black text-white/90 tracking-tighter">{formatCLP(data.totalToPay)}</p>
              </div>
              <div className="rounded-2xl p-5 bg-white/[0.02] border border-white/5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-20 mb-2">Cuotas Pagadas</p>
                <p className="text-xl font-black text-white tracking-tighter italic">
                  {data.paidCuotas} <span className="text-xs opacity-20 not-italic ml-1">/ {data.totalCuotas}</span>
                </p>
              </div>
              <div className="rounded-2xl p-5 bg-white/[0.02] border border-white/5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-20 mb-2">Saldo Remanente</p>
                <p className={`text-xl font-black tracking-tighter ${data.pendingBalance > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                  {formatCLP(data.pendingBalance)}
                </p>
              </div>
            </div>

            {/* Status & CTA */}
            <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-white/5">
              {data.isLate && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-[10px] font-black uppercase tracking-widest animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Interés Acumulado: {formatCLP(data.penaltyAmount)} ({data.lateDays} {data.lateDays === 1 ? "día" : "días"} × {formatCLP(data.dailyPenalty)}/día)
                </div>
              )}
              {data.isMoraFrozen && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-400/10 border border-blue-400/20 text-blue-400 text-[10px] font-black uppercase tracking-widest">
                  <Clock className="w-3.5 h-3.5" />
                  Mora Congelada por Administración
                </div>
              )}
              {data.isUpToDate && !data.isLate && !data.isMoraFrozen && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Al Día
                </div>
              )}
              {data.nextDueDate && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/50">
                  <Calendar className="w-3.5 h-3.5" />
                  Próximo Pago: {formatDate(data.nextDueDate)}
                </div>
              )}

              {/* Simulated CTA */}
              <div className="ml-auto">
                <button 
                  onClick={() => onTabChange("payment")}
                  className="px-6 py-3 rounded-2xl btn-metallic-gold text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all active:scale-95 shadow-[0_10px_20px_rgba(212,168,75,0.2)]"
                >
                  <CreditCard className="w-4 h-4" />
                  Ejecutar Pago
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── PAYMENT VIEW ──────────────────── */
function PaymentView({ data }: { data: any }) {
  const [selectedCuotas, setSelectedCuotas] = useState<number[]>([data.nextInstallmentNumber || 0]);
  const [simulatedFile, setSimulatedFile] = useState<string | null>(null);

  const totalAmount = data.upcomingInstallments
    ? data.upcomingInstallments
        .filter((c: any) => selectedCuotas.includes(c.number))
        .reduce((acc: number, curr: any) => acc + curr.amount, 0)
    : data.valor_cuota;
  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Zap className="w-5 h-5 text-accent" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Pasarela de Verificación</p>
        </div>
        <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic leading-none mb-3">
          Cargar <span className="text-white/20">Pago</span>
        </h2>
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/30 leading-relaxed">
          Propiedad en <span className="text-white/60">{data.projectName}</span> — Lote <span className="text-accent">#{data.lotNumber}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Upcoming Installments */}
        <div className="rounded-[2rem] glass-panel p-8 space-y-6">
          <label className="text-[10px] font-black uppercase tracking-widest text-white/20">Cuotas Próximas del Cliente</label>

          {data.upcomingInstallments && data.upcomingInstallments.length > 0 ? (
            <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2">
              {data.upcomingInstallments.map((cuota: any, idx: number) => {
                const isSelected = selectedCuotas.includes(cuota.number);
                return (
                  <button
                    key={cuota.number}
                    type="button"
                    onClick={() => {
                      const isLastSelected = idx + 1 === selectedCuotas.length;
                      let newSelected;
                      if (isLastSelected) {
                        newSelected = data.upcomingInstallments
                          .slice(0, idx)
                          .map((c: any) => c.number);
                      } else {
                        newSelected = data.upcomingInstallments
                          .slice(0, idx + 1)
                          .map((c: any) => c.number);
                      }
                      setSelectedCuotas(newSelected);
                    }}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      isSelected
                        ? "bg-accent/10 border-accent/40 text-white shadow-[0_0_15px_rgba(212,168,75,0.1)]"
                        : "bg-white/[0.02] border-white/5 text-white/50 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${isSelected ? "bg-accent border-accent text-[#061010]" : "border-white/20"}`}>
                        {isSelected && <CheckCircle className="w-4 h-4" />}
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1 text-white/40">Cuota {cuota.number}</p>
                        <p className="text-sm font-black italic">{cuota.monthName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-black tracking-tighter ${isSelected ? "text-accent" : "text-white/80"}`}>
                        {formatCLP(cuota.amount)}
                      </p>
                      {cuota.hasPenalty && (
                        <div className="mt-1 flex flex-col items-end">
                          <p className="text-[8px] font-bold uppercase text-red-400 tracking-widest bg-red-500/10 px-2 py-0.5 rounded-full">
                            Incluye Mora ({cuota.lateDays} {cuota.lateDays === 1 ? "Día" : "Días"})
                          </p>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <CheckCircle className="w-10 h-10 mx-auto mb-4 text-emerald-400 opacity-30" />
              <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Sin cuotas pendientes</p>
            </div>
          )}

          {/* Summary Box */}
          <div className="p-6 rounded-[1.5rem] bg-white/[0.03] border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Resumen de Pago</span>
              <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[9px] font-black text-accent uppercase tracking-widest">CLP</div>
            </div>
            <p className="text-4xl font-black text-white tracking-tighter italic">
              {formatCLP(totalAmount)}
            </p>
            
            <div className="pt-3 border-t border-white/5 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Total Cuotas Base ({selectedCuotas.length})</span>
                <span className="text-sm font-black text-white/60">
                  {formatCLP(
                    data.upcomingInstallments
                      ? data.upcomingInstallments
                          .filter((c: any) => selectedCuotas.includes(c.number))
                          .reduce((acc: number, curr: any) => acc + (curr.baseAmount || curr.amount), 0)
                      : 0
                  )}
                </span>
              </div>
              
              {data.upcomingInstallments?.some((c: any) => selectedCuotas.includes(c.number) && c.hasPenalty) && (
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-red-400/60">Total Intereses Acumulados</span>
                  <span className="text-sm font-black text-red-400">
                    + {formatCLP(
                      data.upcomingInstallments
                        .filter((c: any) => selectedCuotas.includes(c.number))
                        .reduce((acc: number, curr: any) => acc + (curr.penaltyAmount || 0), 0)
                    )}
                  </span>
                </div>
              )}
            </div>
            
            <div className="pt-3 border-t border-white/5 flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400 opacity-50" />
              <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.15em]">Simulación de Pago Protegida</p>
            </div>
          </div>
        </div>

        {/* Right: Bank Info */}
        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white/[0.02] border border-white/5 p-8 space-y-6 relative overflow-hidden">
            <Building className="absolute -bottom-10 -right-10 w-40 h-40 opacity-5 text-white" />

            <div className="flex items-center gap-4 mb-4 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center border border-accent/20">
                <Building2 className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-lg font-black italic tracking-tighter uppercase text-white/80">Datos de Transferencia</h3>
            </div>

            <div className="grid gap-3 relative z-10">
              {[
                { label: "Institución", value: data.bank?.name },
                { label: "Tipo Cuenta", value: data.bank?.type },
                { label: "Nº Cuenta", value: data.bank?.account },
                { label: "Titular", value: data.bank?.holder },
                { label: "RUT Receptor", value: data.bank?.rut },
                { label: "Email Destino", value: data.bank?.email },
              ].map(
                (item, i) =>
                  item.value && (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/5 group/row">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-0.5">{item.label}</p>
                        <p className="text-sm font-black text-white italic group-hover/row:text-accent transition-colors">{item.value}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-white/5 text-white/20 opacity-0 group-hover/row:opacity-100 transition-all">
                        <Copy className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  )
              )}
            </div>
          </div>

          {/* Simulated Upload Area */}
          <div className="relative">
            <input 
              type="file" 
              id="sim-upload" 
              className="hidden" 
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 10 * 1024 * 1024) {
                    alert("El archivo es demasiado grande (máximo 10MB)");
                    return;
                  }
                  setSimulatedFile(file.name);
                }
              }}
            />
            <label 
              htmlFor="sim-upload"
              className={`flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-[2rem] cursor-pointer transition-all duration-500 ${simulatedFile ? 'border-accent bg-accent/[0.03]' : 'border-white/10 hover:border-accent/40 bg-white/[0.02]'}`}
            >
              {simulatedFile ? (
                <div className="text-center animate-fade-in">
                  <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mx-auto mb-4 shadow-xl">
                    <CheckCircle className="w-8 h-8 text-[#061010]" />
                  </div>
                  <p className="text-[10px] font-black text-accent uppercase tracking-widest leading-none">Comprobante Cargado</p>
                  <p className="text-[8px] text-white/40 mt-2 font-bold truncate max-w-[200px] italic">{simulatedFile}</p>
                </div>
              ) : (
                <div className="text-center opacity-40 hover:opacity-100 transition-opacity">
                  <Upload className="w-10 h-10 mx-auto mb-4" />
                  <p className="text-xs font-black text-white uppercase tracking-widest leading-none">Subir Comprobante</p>
                  <p className="text-[9px] text-white/30 mt-3 font-bold uppercase tracking-widest">JPG, PNG o PDF (Max 10MB)</p>
                </div>
              )}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── DOCUMENTS VIEW ──────────────────── */
function DocumentsView({ data }: { data: any }) {
  const hasDocs = data.documents && data.documents.length > 0;

  return (
    <div className="space-y-12">
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-px bg-accent" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Archivo Digital</p>
        </div>
        <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none italic">
          Centro de <span className="text-white/20">Documentos</span>
        </h2>
      </div>

      {!hasDocs ? (
        <div className="text-center py-24 rounded-[2.5rem] border border-white/5 glass-card max-w-xl mx-auto">
          <FileText className="w-16 h-16 mx-auto mb-6 opacity-10" />
          <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase mb-3">Sin Archivos</h3>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/30 max-w-sm mx-auto leading-relaxed">
            No se han cargado documentos para esta propiedad en el servidor todavía.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {data.documents.map((doc: any, idx: number) => (
            <div
              key={idx}
              className="group relative rounded-[2rem] p-6 glass-card bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-500 overflow-hidden"
            >
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center transition-transform group-hover:scale-110 duration-500">
                    <FileText className="w-5 h-5 text-accent" />
                  </div>
                  <a
                    href={doc.url}
                    download
                    className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-accent hover:text-[#061010] hover:shadow-[0_0_20px_rgba(212,168,75,0.4)] transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
                <div className="flex-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-accent mb-1.5 block">{doc.category || "General"}</span>
                  <h4 className="text-lg font-black text-white italic tracking-tighter leading-tight">{doc.name}</h4>
                </div>
                {doc.uploadedAt && (
                  <div className="mt-6 pt-4 border-t border-white/5 opacity-30 group-hover:opacity-100 transition-opacity">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em]">
                      Cargado: {new Date(doc.uploadedAt).toLocaleDateString("es-CL")}
                    </p>
                  </div>
                )}
              </div>
              <Zap className="absolute -bottom-6 -right-6 w-24 h-24 text-white/[0.01] group-hover:text-accent/[0.04] transition-all duration-1000" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
