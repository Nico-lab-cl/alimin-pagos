"use client";

import { useEffect, useState, use } from "react";
import { getUserLots, uploadPaymentReceipt } from "@/actions/user";
import { formatCLP } from "@/lib/utils";
import { 
  Building2, 
  CreditCard, 
  Upload, 
  CheckCircle, 
  Loader2, 
  Calendar, 
  ArrowLeft, 
  Zap, 
  Copy, 
  Info,
  ShieldCheck,
  Building,
  ArrowRight,
  ChevronRight,
  FileCheck
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [lot, setLot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [paymentType, setPaymentType] = useState<"PIE" | "INSTALLMENT">("INSTALLMENT");
  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [amount, setAmount] = useState(0);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);

  useEffect(() => {
    getUserLots().then((result) => {
      const found = (result.lots || []).find((l: any) => l.reservationId === id);
      if (found) {
        setLot(found);
        setAmount(found.valor_cuota);
        // Default to PIE if it's pending and valor_cuota is not the priority
        if (found.pieStatus !== "PAID") {
          setPaymentType("PIE");
          setAmount(found.pieAmount || 0);
        }
      }
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (lot) {
      if (paymentType === "PIE") {
        setAmount(lot.pieAmount || 0);
      } else if (lot.upcomingInstallments && lot.upcomingInstallments.length > 0) {
        const sum = lot.upcomingInstallments.slice(0, installmentsCount).reduce((acc: number, curr: any) => acc + curr.amount, 0);
        setAmount(sum);
      } else {
        setAmount((lot.valor_cuota || 0) * installmentsCount);
      }
    }
  }, [paymentType, installmentsCount, lot]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("El archivo es demasiado grande (máximo 10MB)");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptBase64) {
      toast.error("Por favor, sube una imagen o archivo del comprobante");
      return;
    }

    setUploading(true);
    const result = await uploadPaymentReceipt({
      reservationId: id,
      amount,
      scope: paymentType,
      receiptBase64,
      installmentsCount,
    });

    if (result.success) {
      setSuccess(true);
      toast.success("Comprobante enviado exitosamente");
      setTimeout(() => router.push("/user"), 3000);
    } else {
      toast.error(result.error || "Ocurrió un error al subir el comprobante");
    }
    setUploading(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-accent" />
        <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Preparando Consola de Pago...</p>
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="text-center py-40">
        <p className="text-white/40 uppercase font-black tracking-widest">Activo no encontrado</p>
        <Link href="/user" className="text-accent mt-4 inline-block font-black uppercase tracking-widest border-b border-accent/20">Volver al Portal</Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto py-32 text-center animate-fade-in">
        <div className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-10 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
          <CheckCircle className="w-12 h-12 text-emerald-500" />
        </div>
        <h2 className="text-5xl font-black text-white italic tracking-tighter uppercase mb-6 leading-none">Pago <span className="text-emerald-500">Recibido</span></h2>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/30 max-w-sm mx-auto leading-relaxed mb-12">
          Tu comprobante ha sido ingresado al sistema de auditoría. Serás notificado una vez que la validación sea procesada (máximo 24 hrs hábiles).
        </p>
        <Link href="/user" className="px-10 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white/10 transition-all flex items-center gap-4 justify-center w-fit mx-auto">
          Volver a Mis Activos
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 animate-fade-in">
      {/* Back Button */}
      <Link href="/user" className="flex items-center gap-3 text-white/40 hover:text-white transition-all w-fit group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Cancelar Operación</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left: Configuration & Details */}
        <div className="space-y-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Zap className="w-5 h-5 text-accent animate-pulse" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Pasarela de Verificación</p>
            </div>
            <h2 className="text-6xl font-black text-white tracking-tighter uppercase italic leading-none mb-4">
              Cargar <span className="text-white/20">Pago</span>
            </h2>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/30 leading-relaxed">
              Propiedad en <span className="text-white/60">{lot.projectName}</span> — Lote <span className="text-accent">#{lot.lotNumber}</span>
            </p>
          </div>

          <div className="rounded-[2.5rem] glass-panel p-10 space-y-10">
            {/* Type Selector */}
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/20">Propósito del Abono</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setPaymentType("INSTALLMENT")}
                  className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${paymentType === "INSTALLMENT" ? "bg-accent text-[#061010] shadow-[0_10px_25px_rgba(212,168,75,0.3)]" : "bg-white/5 text-white/40 hover:bg-white/10"}`}
                >
                  Cuota Mensual
                </button>
                <button
                  onClick={() => setPaymentType("PIE")}
                  className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${paymentType === "PIE" ? "bg-accent text-[#061010] shadow-[0_10px_25px_rgba(212,168,75,0.3)]" : "bg-white/5 text-white/40 hover:bg-white/10"}`}
                >
                  Abono al Pie
                </button>
              </div>
            </div>

            {/* Installments List */}
            {paymentType === "INSTALLMENT" && lot.upcomingInstallments && lot.upcomingInstallments.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/20">Selecciona las Cuotas a Pagar</label>
                  <span className="text-xl font-black text-white italic tracking-tighter">{installmentsCount} {installmentsCount === 1 ? 'Cuota' : 'Cuotas'}</span>
                </div>
                <div className="grid gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {lot.upcomingInstallments.map((cuota: any, idx: number) => {
                    const isSelected = idx < installmentsCount;
                    return (
                      <button
                        key={cuota.number}
                        type="button"
                        onClick={() => {
                          if (idx + 1 === installmentsCount) {
                            setInstallmentsCount(idx);
                          } else {
                            setInstallmentsCount(idx + 1);
                          }
                        }}
                        className={`flex items-center justify-between p-6 rounded-2xl border transition-all cursor-pointer ${
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
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1 text-white/40">
                              Cuota {cuota.number}
                            </p>
                            <p className="text-sm font-black italic">{cuota.monthName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-black tracking-tighter ${isSelected ? "text-accent" : "text-white/80"}`}>
                            {formatCLP(cuota.amount)}
                          </p>
                          {cuota.hasPenalty && (
                            <div className="mt-1 flex flex-col items-end">
                              <p className="text-[8px] font-bold uppercase text-red-400 tracking-widest bg-red-500/10 px-2 py-0.5 rounded-full">Incluye Mora ({cuota.lateDays} {cuota.lateDays === 1 ? 'Día' : 'Días'})</p>
                              <p className="text-[8px] font-bold uppercase text-white/40 tracking-widest mt-1">Interés Diario: {formatCLP(cuota.dailyPenalty)}</p>
                              <p className="text-[8px] font-bold uppercase text-white/40 tracking-widest">Interés Total: {formatCLP(cuota.penaltyAmount)}</p>
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Fallback Slider (If no upcomingInstallments for some reason) */}
            {paymentType === "INSTALLMENT" && (!lot.upcomingInstallments || lot.upcomingInstallments.length === 0) && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/20">Cantidad de Cuotas</label>
                  <span className="text-xl font-black text-white italic tracking-tighter">{installmentsCount} {installmentsCount === 1 ? 'Cuota' : 'Cuotas'}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={installmentsCount}
                  onChange={(e) => setInstallmentsCount(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/5 appearance-none cursor-pointer rounded-full accent-accent"
                />
              </div>
            )}

            {/* Summary Box */}
            <div className="p-8 rounded-[2rem] bg-white/[0.03] border border-white/5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Cálculo de Transacción</span>
                <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[9px] font-black text-accent uppercase tracking-widest">CLP</div>
              </div>
              <p className="text-5xl font-black text-white tracking-tighter italic text-glow">
                {formatCLP(amount)}
              </p>
              
              {/* Detailed Breakdown */}
              <div className="pt-3 border-t border-white/5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">
                    Abono Base ({paymentType === "PIE" ? "Pie" : `${installmentsCount}x Cuotas`})
                  </span>
                  <span className="text-sm font-black text-white/60">
                    {formatCLP(
                      paymentType === "PIE" 
                        ? (lot.pieAmount || 0)
                        : lot.upcomingInstallments
                            .slice(0, installmentsCount)
                            .reduce((acc: number, c: any) => acc + (c.baseAmount || c.amount), 0)
                    )}
                  </span>
                </div>
                
                {paymentType === "INSTALLMENT" && lot.upcomingInstallments.slice(0, installmentsCount).some((c: any) => c.hasPenalty) && (
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-red-400/60">Intereses y Mora Acumulada</span>
                    <span className="text-sm font-black text-red-400">
                      + {formatCLP(
                        lot.upcomingInstallments
                          .slice(0, installmentsCount)
                          .reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0)
                      )}
                    </span>
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-white/5 flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-emerald-400 opacity-50" />
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.15em]">Operación Protegida & Cifrada</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Bank Details & Upload */}
        <div className="space-y-8">
          {/* Bank Info */}
          <div className="rounded-[2.5rem] bg-white/[0.02] border border-white/5 p-10 space-y-8 relative overflow-hidden group">
            <Building className="absolute -bottom-10 -right-10 w-48 h-48 opacity-5 text-white group-hover:scale-110 transition-transform duration-1000" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center border border-accent/20">
                  <Building2 className="w-5 h-5 text-accent" />
                </div>
                <h3 className="text-xl font-black italic tracking-tighter uppercase text-white/80">Datos de Transferencia</h3>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  const dataToCopy = `Institución: ${lot.bank?.name}\nTipo Cuenta: ${lot.bank?.type}\nNº Cuenta: ${lot.bank?.account}\nRUT Receptor: ${lot.bank?.rut}\nEmail Destino: ${lot.bank?.email}`;
                  navigator.clipboard.writeText(dataToCopy);
                  toast.success("Todos los datos bancarios copiados");
                }}
                className="px-4 py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-accent text-[9px] uppercase font-black tracking-widest hover:bg-accent hover:text-black transition-all flex items-center gap-2 w-fit"
              >
                <Copy className="w-3.5 h-3.5" /> Copiar Todo
              </button>
            </div>

            <div className="grid gap-4">
              {[
                { label: "Institución", value: lot.bank?.name, copy: true },
                { label: "Tipo Cuenta", value: lot.bank?.type, copy: true },
                { label: "Nº Cuenta", value: lot.bank?.account, copy: true },
                { label: "RUT Receptor", value: lot.bank?.rut, copy: true },
                { label: "Email Destino", value: lot.bank?.email, copy: true },
              ].map((item, i) => item.value && (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/5 group/row">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">{item.label}</p>
                    <p className="text-sm font-black text-white italic group-hover/row:text-accent transition-colors">{item.value}</p>
                  </div>
                  {item.copy ? (
                    <button 
                      type="button"
                      onClick={(e) => { e.preventDefault(); handleCopy(item.value, item.label); }}
                      className="p-3 rounded-xl bg-white/5 text-white/30 hover:bg-accent hover:text-black transition-all"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  ) : (
                    <button 
                      type="button"
                      onClick={(e) => { e.preventDefault(); handleCopy(item.value, item.label); }}
                      className="p-3 rounded-xl bg-white/5 text-white/30 hover:bg-white/10 hover:text-white transition-all opacity-0 group-hover/row:opacity-100 focus:opacity-100"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Upload Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <input
                type="file"
                id="receipt"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="receipt"
                className={`
                  flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-[2.5rem] cursor-pointer transition-all duration-500
                  ${receiptBase64 ? 'border-accent bg-accent/[0.03]' : 'border-white/10 hover:border-accent/40 bg-white/[0.02]'}
                `}
              >
                {receiptBase64 ? (
                  <div className="text-center animate-fade-in">
                    <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center mx-auto mb-6 shadow-2xl">
                      <FileCheck className="w-10 h-10 text-[#061010]" />
                    </div>
                    <p className="text-xs font-black text-accent uppercase tracking-widest leading-none">Comprobante Cargado</p>
                    <p className="text-[10px] text-white/20 mt-3 font-bold uppercase tracking-widest">(Toca para reemplazar)</p>
                  </div>
                ) : (
                  <div className="text-center opacity-40 group-hover:opacity-100 transition-opacity">
                    <Upload className="w-12 h-12 mx-auto mb-6 animate-float" />
                    <p className="text-xs font-black text-white uppercase tracking-widest leading-none">Subir Comprobante</p>
                    <p className="text-[9px] text-white/30 mt-3 font-bold uppercase tracking-widest">JPG, PNG o PDF (Max 10MB)</p>
                  </div>
                )}
              </label>
            </div>

            <button
              type="submit"
              disabled={uploading || !receiptBase64}
              className={`
                w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] flex items-center justify-center gap-4 transition-all duration-500 relative overflow-hidden
                ${receiptBase64 
                  ? 'bg-white text-black hover:bg-accent hover:shadow-[0_20px_40px_rgba(212,168,75,0.3)] hover:-translate-y-1' 
                  : 'bg-white/5 text-white/10 cursor-not-allowed border border-white/5'}
              `}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  Confirmar & Finalizar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
