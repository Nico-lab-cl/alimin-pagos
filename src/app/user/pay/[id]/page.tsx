"use client";
import { useEffect, useState, use } from "react";
import { getUserLots, uploadPaymentReceipt } from "@/actions/user";
import { formatCLP } from "@/lib/utils";
import { 
  Home as HomeIcon, 
  CreditCard, 
  Upload, 
  CheckCircle, 
  Loader2, 
  Calendar, 
  ArrowLeft, 
  Copy, 
  ShieldCheck, 
  Building2, 
  ArrowRight,
  FileCheck,
  AlertTriangle,
  X,
  ShieldAlert
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

  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);

  useEffect(() => {
    getUserLots().then((result) => {
      const found = (result.lots || []).find((l: any) => l.reservationId === id);
      if (found) {
        setLot(found);
      }
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (lot) {
      if (lot.upcomingInstallments && lot.upcomingInstallments.length > 0) {
        const overdueCount = lot.upcomingInstallments.filter((c: any) => c.isOverdue || c.hasPenalty).length;
        const mandatoryCount = Math.max(1, overdueCount);
        if (installmentsCount < mandatoryCount) {
          setInstallmentsCount(mandatoryCount);
        }
      }
    }
  }, [lot, installmentsCount]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande (máximo 10MB)");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      toast.success(`${label} copiado al portapapeles`);
    } catch (err) {
      toast.error("No se pudo copiar al portapapeles");
    }
  };

  const getAmount = () => {
    if (!lot) return 0;
    if (lot.upcomingInstallments && lot.upcomingInstallments.length > 0) {
      return lot.upcomingInstallments.slice(0, installmentsCount).reduce((acc: number, curr: any) => acc + curr.amount, 0);
    }
    return (lot.valor_cuota || 0) * installmentsCount;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptBase64) {
      toast.error("Por favor, sube una imagen o archivo del comprobante");
      return;
    }

    setUploading(true);
    const amount = getAmount();
    const result = await uploadPaymentReceipt({
      reservationId: id,
      amount,
      scope: "INSTALLMENT",
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

  const formatDateMockup = (dateInput: any) => {
    if (!dateInput) return "—";
    const date = new Date(dateInput);
    const day = String(date.getDate()).padStart(2, '0');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-450">Preparando Consola de Pago...</p>
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="text-center py-40 bg-white border border-slate-150 rounded-3xl max-w-md mx-auto shadow-sm">
        <p className="text-slate-400 font-bold uppercase tracking-wider">Lote no encontrado</p>
        <Link href="/user" className="text-blue-600 font-bold mt-4 inline-block hover:underline">Volver al Portal</Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto py-24 text-center bg-white border border-slate-150 rounded-3xl shadow-sm px-6">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-8 shadow-sm">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="text-3xl font-extrabold text-blue-800 tracking-tight mb-4">Comprobante Enviado</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed mb-8">
          Tu comprobante ha sido ingresado al sistema. Revisaremos y confirmaremos tu pago en menos de 24 horas.
        </p>
        <Link href="/user" className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 shadow-sm">
          Volver a Mis Activos
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const overdueCount = lot.upcomingInstallments?.filter((c: any) => c.isOverdue || c.hasPenalty).length || 0;
  const mandatoryCount = Math.max(1, overdueCount);

  // Breakdown Calculations
  const selectedInstallments = lot.upcomingInstallments?.slice(0, installmentsCount) || [];
  const baseAmount = selectedInstallments.reduce((acc: number, c: any) => acc + (c.baseAmount || c.amount), 0);
  const penaltyAmount = selectedInstallments.reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0);
  const totalAmount = baseAmount + penaltyAmount;

  // Split penalty into displays matching mockup style
  const adminCharge = 5000;
  const interestCharge = Math.max(0, penaltyAmount - adminCharge);
  const displayAdminCharge = penaltyAmount >= adminCharge ? adminCharge : penaltyAmount;

  // Default copyable BCI Bank Details (Mockup standard)
  const bankName = lot.bank?.name || "Banco BCI";
  const bankType = lot.bank?.type || "Corriente";
  const bankAccount = lot.bank?.account || "12345678";
  const bankHolder = lot.bank?.holder || "Alimin SpA";
  const bankRut = lot.bank?.rut || "76.543.210-1";
  const bankEmail = lot.bank?.email || "inmobiliaria@aliminspa.cl";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Button */}
      <Link href="/user" className="flex items-center gap-2 text-slate-400 hover:text-slate-700 transition-all w-fit group text-xs font-bold uppercase tracking-wider">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        <span>Volver a Mis Activos</span>
      </Link>

      {/* Property Header Card */}
      <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
            <HomeIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">{lot.projectName} - Lote {lot.lotNumber}</h3>
            <p className="text-xs text-slate-500 font-medium">
              {lot.lotStage ? `Departamento ${lot.lotStage}` : "Terreno Residencial"}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
          lot.isUpToDate ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-655"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${lot.isUpToDate ? "bg-emerald-500" : "bg-orange-500"}`} />
          {lot.isUpToDate ? "Al día" : "Pago Pendiente"}
        </span>
      </div>

      <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-4">
        <div>
          <label htmlFor="installmentsSelect" className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            Selecciona la cantidad de cuotas a pagar:
          </label>
          <div className="relative">
            <select
              id="installmentsSelect"
              value={installmentsCount}
              onChange={(e) => setInstallmentsCount(Number(e.target.value))}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 font-bold focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 focus:outline-none cursor-pointer appearance-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 1rem center",
                backgroundSize: "1.25rem"
              }}
            >
              {Array.from(
                { length: Math.min(12, lot.upcomingInstallments?.length || 1) - mandatoryCount + 1 },
                (_, i) => {
                  const q = mandatoryCount + i;
                  const selectedObjects = lot.upcomingInstallments?.slice(0, q) || [];
                  
                  // Filter out historical debt / Cuota 0 to get real cuotas count and base amount
                  const realCuotas = selectedObjects.filter((c: any) => c.number > 0);
                  const realCuotasCount = realCuotas.length;
                  const realCuotasBaseAmount = realCuotas.reduce((acc: number, c: any) => acc + (c.baseAmount || c.amount), 0);
                  
                  return (
                    <option key={q} value={q} className="font-bold text-slate-800 bg-white">
                      {realCuotasCount === 1 ? "1 Cuota" : `${realCuotasCount} Cuotas`} ({formatCLP(realCuotasBaseAmount)})
                    </option>
                  );
                }
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Mora Warn Box */}
      {penaltyAmount > 0 && (
        <div className="space-y-3">
          <div className="p-5 rounded-2xl bg-orange-50/50 border border-orange-100 text-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-orange-655 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <span>Tienes un saldo de mora pendiente</span>
            </div>

            {/* List of overdue installments */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                Cuotas Vencidas (Mora de {formatCLP(lot.dailyPenalty || 1500)}/día)
              </p>
              {selectedInstallments.filter((cuota: any) => cuota.hasPenalty || cuota.penaltyAmount > 0).map((cuota: any, idx: number) => {
                if (cuota.isHistorical) {
                  return (
                    <div key={idx} className="p-4 bg-red-50/30 border border-red-100/60 rounded-xl flex items-center justify-between shadow-sm">
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {cuota.monthName.toUpperCase()}
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1">
                          Cargos acumulados previos
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-extrabold text-red-650">
                          {formatCLP(cuota.penaltyAmount)}
                        </p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-wider">
                          Mora acumulada
                        </p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={idx} className="p-4 bg-red-50/30 border border-red-100/60 rounded-xl flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Cuota {cuota.number} - {cuota.monthName.toUpperCase()}
                      </p>
                      <p className="text-[10px] text-slate-400 font-semibold mt-1">
                        Venció el {formatDateMockup(cuota.dueDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-extrabold text-red-650">
                        {formatCLP(cuota.penaltyAmount)}
                      </p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-wider">
                        {cuota.lateDays} días de atraso
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Subtotal Mora */}
            <div className="pt-3 border-t border-orange-100 flex justify-between items-center font-bold text-sm">
              <span className="text-slate-700">Subtotal mora</span>
              <span className="text-slate-800">{formatCLP(penaltyAmount)}</span>
            </div>
          </div>

          {/* Importante Button */}
          <button
            type="button"
            onClick={() => setShowLegalModal(true)}
            className="w-full py-3 px-4 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200/60 text-orange-700 text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
          >
            <AlertTriangle className="w-4 h-4 text-orange-655" />
            IMPORTANTE: INFORMACIÓN LEGAL SOBRE EL PAGO DE MORAS
          </button>
        </div>
      )}

      {/* Summary Box */}
      <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-3">
        {/* Selected Real Cuotas */}
        {selectedInstallments.filter((c: any) => c.number > 0).map((cuota: any, idx: number) => (
          <div key={idx} className="flex justify-between text-xs font-medium text-slate-500">
            <span>Cuota {cuota.number} de {lot.totalCuotas}</span>
            <span className="font-bold text-slate-800">{formatCLP(cuota.baseAmount || cuota.amount)}</span>
          </div>
        ))}
        
        {/* Intereses de Mora (Auto Penalty of selected real cuotas) */}
        {selectedInstallments.filter((c: any) => c.number > 0).reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0) > 0 && (
          <div className="flex justify-between text-xs font-medium text-slate-500">
            <span>Intereses de Mora (Cuotas Vencidas)</span>
            <span className="font-bold text-red-650">
              {formatCLP(selectedInstallments.filter((c: any) => c.number > 0).reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0))}
            </span>
          </div>
        )}

        {/* Mora Histórica (Historical/Manual penalty) */}
        {(selectedInstallments.find((c: any) => c.number === 0 || c.isHistorical)?.amount || 0) > 0 && (
          <div className="flex justify-between text-xs font-medium text-slate-500">
            <span>Intereses Anteriores (Mora Histórica)</span>
            <span className="font-bold text-red-650">
              {formatCLP(selectedInstallments.find((c: any) => c.number === 0 || c.isHistorical)?.amount || 0)}
            </span>
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 flex justify-between items-center font-bold">
          <span className="text-xs text-slate-700">TOTAL A PAGAR</span>
          <span className="text-lg text-blue-700 font-extrabold tracking-tight">{formatCLP(totalAmount)}</span>
        </div>
      </div>

      {/* Bank Transfer Box */}
      <div className="bg-[#f0f7ff]/40 border border-blue-100 rounded-2xl p-5 space-y-4">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Realiza tu transferencia a estos datos</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: "BANCO", value: bankName },
            { label: "TIPO DE CUENTA", value: `${bankType} #${bankAccount}` },
            { label: "RUT", value: bankRut },
            { label: "NOMBRE", value: bankHolder }
          ].map((item, i) => (
            <div key={i} className="bg-white border border-slate-150 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</span>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{item.value}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(item.value, item.label)}
                className="w-9 h-9 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-150 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                title="Copiar"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="text-xs font-bold text-blue-650 flex items-center gap-1.5 pl-1">
          <span>ℹ</span>
          <span>Transfiere exactamente el monto indicado para facilitar la conciliación</span>
        </div>
      </div>

      {/* Receipt File Upload */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type="file"
            id="receipt"
            accept="image/*,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`
              flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 bg-white
              ${receiptBase64 ? 'border-blue-600' : 'border-slate-200 hover:border-blue-300'}
              ${dragActive ? 'border-blue-600 bg-blue-50/5' : ''}
            `}
          >
            <label htmlFor="receipt" className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
              {receiptBase64 ? (
                <div className="text-center animate-fade-in">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4 border border-emerald-250">
                    <FileCheck className="w-7 h-7 text-emerald-600" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">Comprobante Cargado</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">(Haz clic o arrastra para reemplazar)</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-200 text-slate-400">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">Arrastra tu archivo o haz clic aquí</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">Soporta PDF, JPG, PNG (máx. 5MB)</p>
                </div>
              )}
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={uploading || !receiptBase64}
          className={`
            w-full py-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all duration-300 shadow-sm
            ${receiptBase64 
              ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] cursor-pointer' 
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
          `}
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Enviando Comprobante...</span>
            </>
          ) : (
            <span>Enviar Comprobante de Pago</span>
          )}
        </button>
      </form>

      <p className="text-[10px] text-slate-400 font-bold text-center uppercase tracking-wide">
        🕒 El equipo revisará y confirmará tu pago en menos de 24 horas
      </p>

      {/* Legal Modal */}
      {showLegalModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-white border border-slate-250 rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-2xl relative space-y-6">
            <button
              onClick={() => setShowLegalModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-450 hover:bg-slate-50 hover:text-slate-700 transition-all cursor-pointer border border-transparent hover:border-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-orange-655 font-bold border-b border-slate-100 pb-4">
              <ShieldAlert className="w-6 h-6 text-orange-600" />
              <h3 className="text-base md:text-lg font-black uppercase tracking-tight text-slate-800">Aspectos Legales Importantes</h3>
            </div>

            <div className="space-y-5 overflow-y-auto max-h-[350px] pr-2 text-slate-700 text-xs md:text-sm font-semibold leading-relaxed">
              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                <h4 className="font-extrabold text-slate-800 text-xs md:text-sm">
                  Artículo 1559 del Código Civil: Intereses moratorios
                </h4>
                <p className="text-slate-600 text-[11px] md:text-xs font-medium">
                  Establece que los intereses moratorios siguen corriendo hasta el pago íntegro de la obligación. Si el pago no incluye los intereses, la obligación no está extinguida y los intereses continuúan devengándose.
                </p>
              </div>

              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                <h4 className="font-extrabold text-slate-800 text-xs md:text-sm">
                  Artículo 1595 del Código Civil: Imputación del pago
                </h4>
                <p className="text-slate-600 text-[11px] md:text-xs font-medium">
                  Cuando hay capital e intereses, el pago se imputa primero a los intereses y luego al capital. Esto significa que si alguien paga solo la cuota sin los intereses, esta cubriendo los intereses.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowLegalModal(false)}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
