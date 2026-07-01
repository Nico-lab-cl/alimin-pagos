"use client";
import { useEffect, useState, use } from "react";
import { getUserLots, uploadPaymentReceipt } from "@/actions/user";
import { formatCLP, cn } from "@/lib/utils";
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
  ShieldAlert,
  ChevronLeft,
  ChevronRight
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

  const [activeIdx, setActiveIdx] = useState(0);
  const [showingTotal, setShowingTotal] = useState(false);
  const [carouselStartIndex, setCarouselStartIndex] = useState(0);
  const [cardsToShow, setCardsToShow] = useState(3);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) {
        setCardsToShow(1);
      } else if (window.innerWidth < 1024) {
        setCardsToShow(2);
      } else {
        setCardsToShow(3);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
    if (lot && lot.upcomingInstallments && lot.upcomingInstallments.length > 0) {
      const hasHist = lot.upcomingInstallments.some((c: any) => c.number === 0 || c.isHistorical);
      const overdue = lot.upcomingInstallments.filter((c: any) => c.isOverdue || c.hasPenalty).length;
      const minCount = (hasHist ? 1 : 0) + Math.max(1, overdue);
      if (installmentsCount < minCount) {
        setInstallmentsCount(minCount);
      }
    }
  }, [lot]);

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
  const hasHistoricalItem = lot.upcomingInstallments?.some((c: any) => c.number === 0 || c.isHistorical) || false;
  const histOffset = hasHistoricalItem ? 1 : 0;
  // mandatoryCount = historical slot (if any) + all overdue cuotas (min 1 real cuota)
  const mandatoryCount = histOffset + Math.max(1, overdueCount);
  const maxInstallmentsCount = histOffset + (lot.upcomingInstallments?.filter((c: any) => c.number > 0).length || 1);

  // Breakdown Calculations
  const selectedInstallments = lot.upcomingInstallments?.slice(0, installmentsCount) || [];
  const realCuotasForCards = selectedInstallments.filter((c: any) => c.number > 0);
  const cuotasBaseSum = realCuotasForCards.reduce((acc: number, c: any) => acc + (c.baseAmount || c.amount), 0);
  const totalMoraCuotas = realCuotasForCards.reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0);
  const historicalMoraItem = selectedInstallments.find((c: any) => c.number === 0 || c.isHistorical);
  const moraHistorica = historicalMoraItem ? (historicalMoraItem.penaltyAmount || historicalMoraItem.amount || 0) : 0;

  const baseAmount = selectedInstallments.filter((c: any) => !c.isHistorical).reduce((acc: number, c: any) => acc + (c.baseAmount || c.amount), 0);
  const penaltyAmount = realCuotasForCards.reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0);
  const totalAmount = baseAmount + penaltyAmount + moraHistorica;

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

  const hasMoraOrPenalty = penaltyAmount > 0 || moraHistorica > 0;

  return (
    <div className={hasMoraOrPenalty ? "max-w-7xl mx-auto space-y-6 animate-fade-in" : "max-w-4xl mx-auto space-y-6 animate-fade-in"}>
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
          lot.isUpToDate && !hasMoraOrPenalty ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-655"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${lot.isUpToDate && !hasMoraOrPenalty ? "bg-emerald-500" : "bg-orange-500"}`} />
          {lot.isUpToDate && !hasMoraOrPenalty ? "Al día" : "Pago Pendiente"}
        </span>
      </div>

      {hasMoraOrPenalty ? (
        <div className="space-y-6">
          {/* Header titles */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800">Resumen de pago</h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              {lot.clientName || "Cliente"} · {overdueCount > 0 ? (overdueCount === 1 ? "1 cuota vencida" : `${overdueCount} cuotas vencidas`) : "Cuotas al día"}{moraHistorica > 0 ? " · Mora pendiente" : ""}
            </p>
          </div>

          {/* Cuotas Selector Dropdown */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-2">
            <label htmlFor="cuotasSelect" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Selecciona cuántas cuotas pagar{overdueCount > 0 ? ` (mínimo ${overdueCount} vencida${overdueCount > 1 ? 's' : ''})` : ''}
            </label>
            <div className="relative">
              <select
                id="cuotasSelect"
                value={installmentsCount}
                onChange={(e) => { setInstallmentsCount(Number(e.target.value)); setCarouselStartIndex(0); setActiveIdx(0); setShowingTotal(false); }}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 font-bold focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 focus:outline-none cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 1rem center",
                  backgroundSize: "1.25rem"
                }}
              >
                {Array.from(
                  { length: maxInstallmentsCount - mandatoryCount + 1 },
                  (_, i) => {
                    const q = mandatoryCount + i;
                    const selectedObjects = lot.upcomingInstallments?.slice(0, q) || [];
                    const realCuotas = selectedObjects.filter((c: any) => c.number > 0);
                    const realCount = realCuotas.length;
                    const realBase = realCuotas.reduce((acc: number, c: any) => acc + (c.baseAmount || c.amount), 0);
                    const realPenalty = realCuotas.reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0);
                    const hist = selectedObjects.find((c: any) => c.number === 0 || c.isHistorical);
                    const histMora = hist ? (hist.penaltyAmount || hist.amount || 0) : 0;
                    const total = realBase + realPenalty + histMora;
                    return (
                      <option key={q} value={q}>
                        {realCount} {realCount === 1 ? 'Cuota' : 'Cuotas'} — {formatCLP(total)}{histMora > 0 ? ' (incl. mora histórica)' : ''}
                      </option>
                    );
                  }
                )}
              </select>
            </div>
          </div>

          {/* Cards Section */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Cuotas seleccionadas</h4>
            
            {/* Grid container for Carousel + Pinned Suma Total */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Carousel on Left (9/12 cols) */}
              <div className="lg:col-span-9 relative flex items-center group bg-slate-50 border border-slate-150 rounded-2xl p-2 min-h-[135px]">
                {/* Carousel wrapper with overflow-hidden */}
                <div className="overflow-hidden w-full py-1 px-1">
                  <div 
                    className="flex transition-transform duration-300 ease-in-out gap-y-3"
                    style={{ 
                      transform: `translateX(-${carouselStartIndex * (100 / cardsToShow)}%)`,
                      width: `${(realCuotasForCards.length / cardsToShow) * 100}%`
                    }}
                  >
                    {realCuotasForCards.map((cuota: any, idx: number) => {
                      const isActive = !showingTotal && activeIdx === idx;
                      const isOverdue = cuota.lateDays > 0;
                      return (
                        <div 
                          key={cuota.number} 
                          className="flex-shrink-0 px-2"
                          style={{ width: `${100 / realCuotasForCards.length}%` }}
                        >
                          <div
                            onClick={() => {
                              setShowingTotal(false);
                              setActiveIdx(idx);
                            }}
                            className={cn(
                              "bg-white border rounded-2xl p-4 cursor-pointer transition-all hover:border-slate-350 shadow-sm flex flex-col justify-between h-full min-h-[110px] select-none",
                              isActive 
                                ? "border-emerald-500 ring-2 ring-emerald-500/20" 
                                : "border-slate-200"
                            )}
                          >
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Cuota {cuota.number} de {lot.totalCuotas}
                              </p>
                              <p className="text-lg font-bold text-slate-850 mt-1">
                                {formatCLP(cuota.baseAmount || cuota.amount)}
                              </p>
                            </div>
                            <div className="mt-2 flex items-center justify-between flex-wrap gap-1.5 pt-1">
                              <p className="text-[10px] font-bold text-slate-400">
                                Vence {formatDateMockup(cuota.interestStartDate || cuota.dueDate)}
                              </p>
                              {cuota.lateDays >= 90 ? (
                                <span className="bg-red-50 text-red-750 text-[9px] font-extrabold px-2 py-0.5 rounded-md border border-red-100 uppercase tracking-wider">
                                  +90 días
                                </span>
                              ) : isOverdue ? (
                                <span className="bg-orange-50 text-orange-700 text-[9px] font-extrabold px-2 py-0.5 rounded-md border border-orange-100 uppercase tracking-wider">
                                  Vencida
                                </span>
                              ) : (
                                <span className="bg-emerald-50 text-emerald-700 text-[9px] font-extrabold px-2 py-0.5 rounded-md border border-emerald-100 uppercase tracking-wider">
                                  Al día
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Left Arrow Button */}
                {realCuotasForCards.length > cardsToShow && carouselStartIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setCarouselStartIndex(prev => Math.max(0, prev - 1))}
                    className="absolute -left-4 z-10 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:scale-105 transition-all cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}

                {/* Right Arrow Button */}
                {realCuotasForCards.length > cardsToShow && (carouselStartIndex + cardsToShow < realCuotasForCards.length) && (
                  <button
                    type="button"
                    onClick={() => setCarouselStartIndex(prev => Math.min(realCuotasForCards.length - cardsToShow, prev + 1))}
                    className="absolute -right-4 z-10 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:scale-105 transition-all cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Pinned Suma Total on Right (3/12 cols) */}
              <div className="lg:col-span-3 flex">
                <div
                  onClick={() => setShowingTotal(true)}
                  className={cn(
                    "w-full bg-white border rounded-2xl p-4 cursor-pointer transition-all hover:border-slate-350 shadow-sm flex flex-col justify-between h-full min-h-[110px] select-none",
                    showingTotal 
                      ? "border-blue-600 ring-2 ring-blue-600/20" 
                      : "border-slate-200"
                  )}
                >
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Suma total</p>
                    <p className="text-lg font-bold text-emerald-650 mt-1">{formatCLP(totalAmount)}</p>
                  </div>
                  <div className="mt-2 pt-1">
                    <p className="text-[10px] font-bold text-slate-450 leading-snug">
                      {realCuotasForCards.length === 1 ? "1 cuota" : `${realCuotasForCards.length} cuotas`} + mora {moraHistorica > 0 ? "+ histórica" : ""}
                    </p>
                    <span className="inline-block mt-1 bg-blue-50 text-blue-700 text-[9px] font-extrabold px-2 py-0.5 rounded-md border border-blue-100 uppercase tracking-wider">
                      Ver desglose
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pagination dots under the carousel (only if multiple pages exist) */}
            {realCuotasForCards.length > cardsToShow && (
              <div className="flex justify-center gap-1.5 pt-1">
                {Array.from({ length: realCuotasForCards.length - cardsToShow + 1 }).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCarouselStartIndex(idx)}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all cursor-pointer border-0 p-0",
                      carouselStartIndex === idx ? "bg-slate-700 w-3" : "bg-slate-300"
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Details Panel & Summary Bar Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left side of details layout: details panel + summary bar + bank details + upload (7/12 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Details Panel */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm min-h-[260px]">
                {!showingTotal ? (
                  // Single Cuota Detail
                  (() => {
                    const c = realCuotasForCards[activeIdx];
                    if (!c) return null;
                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="text-sm font-bold text-slate-800">Cuota #{c.number} — detalle de cobro</p>
                          {c.lateDays >= 90 ? (
                            <span className="bg-red-50 text-red-750 text-[9px] font-bold px-2 py-0.5 rounded-md border border-red-100 uppercase tracking-wider">
                              +90 días
                            </span>
                          ) : c.lateDays > 0 ? (
                            <span className="bg-orange-50 text-orange-700 text-[9px] font-bold px-2 py-0.5 rounded-md border border-orange-100 uppercase tracking-wider">
                              Vencida
                            </span>
                          ) : (
                            <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-md border border-emerald-100 uppercase tracking-wider">
                              Al día
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Cuota base</span>
                            <p className="text-sm font-extrabold text-slate-800 mt-0.5">{formatCLP(c.baseAmount || c.amount)}</p>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Vencimiento</span>
                            <p className="text-sm font-extrabold text-slate-800 mt-0.5">{formatDateMockup(c.interestStartDate || c.dueDate)}</p>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Días de atraso</span>
                            <p className={cn("text-sm font-extrabold mt-0.5", c.lateDays > 0 ? "text-orange-655" : "text-slate-800")}>
                              {c.lateDays || 0} días
                            </p>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Multa diaria</span>
                            <p className="text-sm font-extrabold text-slate-800 mt-0.5">
                              {formatCLP(c.dailyPenalty || lot.dailyPenalty || 1500)} / día
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-4 space-y-2">
                          <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                            <span>Cuota base</span>
                            <span className="text-slate-800 font-extrabold">{formatCLP(c.baseAmount || c.amount)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                            <span>Interés mora ({c.lateDays || 0} días × {formatCLP(c.dailyPenalty || lot.dailyPenalty || 1500)})</span>
                            <span className="text-red-655 font-extrabold">{formatCLP(c.penaltyAmount || 0)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs font-bold text-slate-700 pt-3 border-t border-slate-50">
                            <span>Total cuota #{c.number}</span>
                            <span className="text-red-655 text-sm font-extrabold">{formatCLP((c.baseAmount || c.amount) + (c.penaltyAmount || 0))}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  // Suma Total Breakdown
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-sm font-bold text-slate-800">Desglose total a pagar</p>
                      <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-2 py-0.5 rounded-md border border-blue-100 uppercase tracking-wider">
                        {realCuotasForCards.length === 1 ? "1 cuota" : `${realCuotasForCards.length} cuotas`}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Cuotas base</span>
                      <div className="space-y-1.5">
                        {realCuotasForCards.map((c: any) => (
                          <div key={c.number} className="flex justify-between items-center text-xs font-semibold text-slate-500">
                            <span>Cuota #{c.number} ({formatDateMockup(c.interestStartDate || c.dueDate)})</span>
                            <span className="text-slate-800 font-extrabold">{formatCLP(c.baseAmount || c.amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center text-xs font-bold text-slate-805 pt-2 border-t border-slate-100">
                          <span>Subtotal cuotas</span>
                          <span className="font-extrabold">{formatCLP(cuotasBaseSum)}</span>
                        </div>
                      </div>
                    </div>

                    {totalMoraCuotas > 0 && (
                      <div className="pt-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Intereses de mora por cuota</span>
                        <div className="space-y-1.5">
                          {realCuotasForCards.filter((c: any) => c.penaltyAmount > 0).map((c: any) => (
                            <div key={c.number} className="flex justify-between items-center text-xs font-semibold text-slate-500">
                              <span>Mora cuota #{c.number} ({c.lateDays} días)</span>
                              <span className="text-red-655 font-extrabold">{formatCLP(c.penaltyAmount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between items-center text-xs font-bold text-slate-805 pt-2 border-t border-slate-100">
                            <span>Subtotal mora cuotas</span>
                            <span className="text-red-655 font-extrabold">{formatCLP(totalMoraCuotas)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {moraHistorica > 0 && (
                      <div className="pt-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Mora histórica</span>
                        <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                          <span>Intereses anteriores acumulados</span>
                          <span className="text-red-655 font-extrabold">{formatCLP(moraHistorica)}</span>
                        </div>
                      </div>
                    )}

                    <hr className="border-slate-100 my-4" />
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-sm font-bold text-slate-800">Total a pagar</span>
                      <span className="text-xl font-extrabold text-emerald-650">{formatCLP(totalAmount)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Summary Bar */}
              <div className="bg-slate-100 border border-slate-200 rounded-2xl p-5 flex flex-wrap justify-between items-center gap-4">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                    Cuotas ({realCuotasForCards.length} × {formatCLP(realCuotasForCards[0]?.baseAmount || 0)})
                  </p>
                  <p className="text-base font-extrabold text-slate-800 mt-0.5">{formatCLP(cuotasBaseSum)}</p>
                </div>
                {moraHistorica > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Mora histórica</p>
                    <p className="text-base font-extrabold text-slate-800 mt-0.5">{formatCLP(moraHistorica)}</p>
                  </div>
                )}
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total mora cuotas</p>
                  <p className="text-base font-extrabold text-slate-800 mt-0.5">{formatCLP(totalMoraCuotas)}</p>
                </div>
                <div className="border-l border-slate-200 pl-4">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total a pagar</p>
                  <p className="text-lg font-black text-emerald-600 mt-0.5">{formatCLP(totalAmount)}</p>
                </div>
              </div>
              
              <p className="text-[10px] text-slate-450 text-center font-bold">
                Haz clic en una cuota para ver su detalle · Haz clic en "Suma total" para el desglose completo
              </p>

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
                    <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</span>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">{item.value}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.value, item.label)}
                        className="w-9 h-9 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-150 flex items-center justify-center text-slate-400 hover:text-slate-655 transition-all cursor-pointer"
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
            </div>

            {/* Right side of details layout: Aspectos Legales Important (5/12 cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Legal Info Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                  <ShieldAlert className="w-4 h-4 text-blue-600" />
                  <span>Aspectos Legales Importantes</span>
                </div>
                
                <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed font-semibold">
                  <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-1.5 shadow-sm">
                    <h4 className="font-extrabold text-slate-800">Artículo 1559 del Código Civil: Intereses moratorios</h4>
                    <p className="font-medium text-slate-500">
                      Establece que los intereses moratorios siguen corriendo hasta el pago íntegro de la obligación. Si el pago no incluye los intereses, la obligación no está extinguida y los intereses continuúan devengándose.
                    </p>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-1.5 shadow-sm">
                    <h4 className="font-extrabold text-slate-800">Artículo 1595 del Código Civil: Imputación del pago</h4>
                    <p className="font-medium text-slate-500">
                      Cuando hay capital e intereses, el pago se imputa primero a los intereses y luego al capital. Esto significa que si alguien paga solo la cuota sin los intereses, está cubriendo los intereses.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Original Single Column Flow for No Mora (centered in max-w-4xl) */
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Selector */}
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

          {/* Summary Box */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-3">
            {/* Selected Real Cuotas */}
            {selectedInstallments.filter((c: any) => c.number > 0).map((cuota: any, idx: number) => (
              <div key={idx} className="flex justify-between text-xs font-medium text-slate-500">
                <span>Cuota {cuota.number} de {lot.totalCuotas}</span>
                <span className="font-bold text-slate-800">{formatCLP(cuota.baseAmount || cuota.amount)}</span>
              </div>
            ))}

            {moraHistorica > 0 && (
              <div className="flex justify-between text-xs font-medium text-red-600">
                <span>Mora histórica (acuerdo fijo)</span>
                <span className="font-bold">{formatCLP(moraHistorica)}</span>
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
                    className="w-9 h-9 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-150 flex items-center justify-center text-slate-400 hover:text-slate-650 transition-all cursor-pointer"
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

          <p className="text-[10px] text-slate-450 font-bold text-center uppercase tracking-wide">
            🕒 El equipo revisará y confirmará tu pago en menos de 24 horas
          </p>
        </div>
      )}
    </div>
  );
}
