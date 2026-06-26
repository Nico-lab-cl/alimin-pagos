"use client";
import { useEffect, useState } from "react";
import { getClientPOV } from "@/actions/postventa";
import { uploadPaymentReceipt } from "@/actions/user";
import { formatCLP, getDownloadFilename, downloadDocument, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  X,
  Loader2,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle,
  CheckCircle2,
  CreditCard,
  Ruler,
  ShieldCheck,
  Building2,
  FileText,
  Download,
  Copy,
  Eye,
  Monitor,
  Calendar,
  Upload,
  Compass,
  FileBadge,
  Mail,
  MessageSquare,
  Home,
  FileCheck,
  ArrowRight,
  ShieldAlert,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface ClientPOVModalProps {
  reservationId: string;
  clientName: string;
  onClose: () => void;
}

type TabType = "dashboard" | "payment" | "documents";

export default function ClientPOVModal({ reservationId, clientName, onClose }: ClientPOVModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

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
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${
          activeTab === "payment" && data?.upcomingInstallments?.some((c: any) => (c.penaltyAmount || 0) > 0)
            ? "max-w-7xl"
            : "max-w-5xl"
        } h-[95vh] max-h-[95vh] overflow-hidden rounded-[2.5rem] border border-slate-200 bg-slate-50 shadow-2xl animate-slide-up flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Simulated Client Top Bar */}
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm shrink-0">
          {/* POV Warning Banner */}
          <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-blue-500/10 border-b border-blue-500/15 px-6 py-2 flex items-center justify-center gap-3">
            <Eye className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-800">
              Vista Previa — Simulación del Portal del Cliente
            </p>
            <Monitor className="w-3.5 h-3.5 text-blue-600" />
          </div>

          {/* Simulated Navbar */}
          <div className="px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1.5 shadow-sm">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-slate-800 leading-none">Alimin</h1>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200/60">
                {(["dashboard", "payment", "documents"] as TabType[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeTab === tab
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {tab === "dashboard" ? "Dashboard" : tab === "payment" ? "Pago" : "Documentos"}
                  </button>
                ))}
              </div>

              <div className="hidden sm:flex items-center gap-2 border-l border-slate-200 pl-4">
                <span className="text-[10px] text-slate-500">
                  ¡Hola, <span className="font-semibold text-slate-850">{clientName}</span>!
                </span>
              </div>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:text-red-650 hover:border-red-200 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Cargando Vista...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
              <AlertTriangle className="w-10 h-10 text-red-550 opacity-40" />
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-500">{error}</p>
            </div>
          ) : data ? (
            <>
              {activeTab === "dashboard" && <DashboardView data={data} onTabChange={setActiveTab} />}
              {activeTab === "payment" && <PaymentView data={data} reservationId={reservationId} />}
              {activeTab === "documents" && <DocumentsView data={data} />}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── DASHBOARD VIEW ──────────────────── */
function DashboardView({ data, onTabChange }: { data: any; onTabChange: (tab: TabType) => void }) {
  const [historyPage, setHistoryPage] = useState(1);
  const formatDateMockup = (dateInput: any) => {
    if (!dateInput) return "—";
    const date = new Date(dateInput);
    const day = String(date.getDate()).padStart(2, '0');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Document selectors
  const contratoDoc = data.documents?.find((d: any) =>
    d.name?.toLowerCase().includes("contrato") || d.category?.toLowerCase().includes("contrato")
  );
  const certificadoDoc = data.documents?.find((d: any) =>
    d.name?.toLowerCase().includes("certificado") || d.category?.toLowerCase().includes("certificado")
  );
  const fichaDoc = data.documents?.find((d: any) =>
    d.name?.toLowerCase().includes("ficha") || d.name?.toLowerCase().includes("tecnica") || d.category?.toLowerCase().includes("ficha")
  );

  // Generate payment history
  const paymentHistory: any[] = [];
  
  // 1. Paid installments
  for (let i = data.paidCuotas; i >= 1; i--) {
    const matchingReceipt = data.receipts?.find((r: any) => 
      r.nominal_installment_number === i || 
      (r.nominal_installment_range && r.nominal_installment_range.split('-').map(Number).includes(i))
    );
    
    let payDate = new Date(data.nextDueDate || new Date());
    payDate.setMonth(payDate.getMonth() - (data.paidCuotas - i + 1));
    
    if (matchingReceipt) {
      payDate = new Date(matchingReceipt.created_at);
    }

    // Search for a matching digital receipt in data.documents
    let comprobanteDigital: string | null = null;
    if (matchingReceipt) {
      const systemDoc = data.documents?.find((d: any) => 
        d.name?.toLowerCase().includes(`comprobante_pago_${matchingReceipt.id.substring(0, 6).toLowerCase()}`)
      );
      if (systemDoc) {
        comprobanteDigital = `/api/documents/${systemDoc.id}`;
      }
    }

    paymentHistory.push({
      cuota: `Cuota #${String(i).padStart(2, '0')}`,
      fecha: formatDateMockup(payDate),
      monto: formatCLP(matchingReceipt?.amount_clp || data.valor_cuota),
      estado: "Pagado",
      comprobanteDigital,
      comprobanteCliente: matchingReceipt ? `/api/documents/${matchingReceipt.id}` : null,
    });
  }

  // 2. Next pending installment (if not fully paid)
  if (data.paidCuotas < data.totalCuotas) {
    const nextInstallment = data.upcomingInstallments?.find((c: any) => c.number === data.paidCuotas + 1);
    
    paymentHistory.push({
      cuota: `Cuota #${String(data.paidCuotas + 1).padStart(2, '0')}`,
      fecha: formatDateMockup(data.nextDueDate),
      monto: formatCLP(nextInstallment?.amount || data.valor_cuota),
      estado: "Pendiente",
      comprobante: null,
    });
  }

  return (
    <div className="space-y-6">
      {/* Top Row Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tu Propiedad */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tu Propiedad</span>
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <Home className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-blue-700 mb-1">{data.projectName} - Lote {data.lotNumber}</h3>
            <p className="text-xs text-slate-500 font-medium">
              {data.lotStage ? `Etapa ${data.lotStage}` : "Terreno Residencial"}
            </p>
          </div>

          <div className="mt-6">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              data.isUpToDate && !data.isLate 
                ? "bg-emerald-50 text-emerald-600" 
                : "bg-orange-50 text-orange-655"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${data.isUpToDate && !data.isLate ? "bg-emerald-500" : "bg-orange-500"}`} />
              {data.isUpToDate && !data.isLate ? "Al día" : "Pago Pendiente"}
            </span>
          </div>
        </div>

        {/* Estado de tu Plan */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1 space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estado de tu Plan</span>
            </div>
            
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-blue-600 tracking-tight">{data.acquisitionProgress}%</span>
              <span className="text-xs font-bold text-slate-450">{data.paidCuotas} de {data.totalCuotas} cuotas pagadas</span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-[1s]"
                style={{ width: `${data.acquisitionProgress}%` }}
              />
            </div>

            <p className="text-xs text-slate-500 italic">
              Vas por buen camino. Te quedan {data.totalCuotas - data.paidCuotas} cuotas.
            </p>
          </div>

          {/* Pay Next Installment Box */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 md:min-w-[280px] flex flex-col justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-blue-650 uppercase tracking-wider leading-none">
                {data.paidCuotas >= data.totalCuotas ? "Plan Completado" : `Próxima Cuota`}
              </p>
              {data.paidCuotas < data.totalCuotas && (
                <p className="text-xl font-extrabold text-blue-700 tracking-tight mt-1">
                  {formatCLP(data.upcomingInstallments?.find((c: any) => c.number === data.paidCuotas + 1)?.amount || data.valor_cuota)}
                </p>
              )}
            </div>

            {data.paidCuotas < data.totalCuotas && (
              <button
                onClick={() => onTabChange("payment")}
                className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-[#0f9f6e] hover:bg-[#0e8f62] text-white font-bold text-xs rounded-xl transition-all shadow-sm active:scale-98 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirmar Pago
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Historial de Pagos Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Historial de Pagos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-xs font-bold uppercase border-b border-slate-100">
                <th className="px-6 py-3.5 font-semibold">Cuota</th>
                <th className="px-6 py-3.5 font-semibold">Fecha</th>
                <th className="px-6 py-3.5 font-semibold">Monto</th>
                <th className="px-6 py-3.5 font-semibold">Estado</th>
                <th className="px-6 py-3.5 text-right sm:text-left font-semibold">Comprobante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-850">
              {paymentHistory.slice((historyPage - 1) * 5, historyPage * 5).map((item, idx) => {
                const isPaid = item.estado === "Pagado";
                return (
                  <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-3.5 font-bold text-slate-800">{item.cuota}</td>
                    <td className="px-6 py-3.5 text-slate-500 font-medium">{item.fecha}</td>
                    <td className="px-6 py-3.5 font-bold text-slate-800">{item.monto}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                        isPaid ? "text-emerald-600" : "text-amber-600"
                      }`}>
                        {isPaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                        {item.estado}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right sm:text-left">
                      {isPaid ? (
                        (item.comprobanteDigital || item.comprobanteCliente) ? (
                          <div className="flex items-center gap-2 justify-end sm:justify-start">
                            {item.comprobanteDigital && (
                              <button
                                onClick={() => downloadDocument(item.comprobanteDigital, `comprobante_digital_${item.cuota.replace('#', '')}.pdf`, "application/pdf")}
                                className="text-blue-655 hover:text-blue-800 transition-colors p-1.5 rounded-lg hover:bg-blue-50 inline-flex items-center justify-center cursor-pointer border border-blue-100 bg-blue-50/30"
                                title="Descargar Comprobante Digital (PDF)"
                              >
                                <FileText className="w-3.5 h-3.5 text-blue-600" />
                              </button>
                            )}
                            {item.comprobanteCliente && (
                              <button
                                onClick={() => downloadDocument(item.comprobanteCliente, `comprobante_cliente_${item.cuota.replace('#', '')}`)}
                                className="text-[#0f9f6e] hover:text-[#0e8f62] transition-colors p-1.5 rounded-lg hover:bg-emerald-50 inline-flex items-center justify-center cursor-pointer border border-emerald-100 bg-emerald-50/30"
                                title="Descargar Comprobante del Cliente"
                              >
                                <Download className="w-3.5 h-3.5 text-emerald-600" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No disponible</span>
                        )
                      ) : (
                        <span className="text-xs text-slate-450 italic font-medium">Próximamente</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {paymentHistory.length > 5 && (
          <div className="bg-slate-50/50 p-4 border-t border-slate-100 flex items-center justify-between gap-4">
            <button
              onClick={() => setHistoryPage(prev => Math.max(prev - 1, 1))}
              disabled={historyPage === 1}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-655 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all bg-white cursor-pointer"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500 font-bold">
              Página {historyPage} de {Math.ceil(paymentHistory.length / 5)}
            </span>
            <button
              onClick={() => setHistoryPage(prev => Math.min(prev + 1, Math.ceil(paymentHistory.length / 5)))}
              disabled={historyPage === Math.ceil(paymentHistory.length / 5)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-655 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all bg-white cursor-pointer"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* Documentos Importantes */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4">Documentos Importantes</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Contrato */}
          <div className="bg-slate-50/50 border border-slate-150 hover:border-blue-200 transition-all rounded-2xl p-5 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-3 shadow-sm">
              <FileText className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-slate-800 mb-1">Contrato de Compraventa</h4>
            {contratoDoc ? (
              <button
                onClick={() => downloadDocument(contratoDoc.url, contratoDoc.name, contratoDoc.fileType)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-2 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            ) : (
              <button
                onClick={() => onTabChange("documents")}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-2 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            )}
          </div>

          {/* Card 2: Certificado */}
          <div className="bg-slate-50/50 border border-slate-150 hover:border-blue-200 transition-all rounded-2xl p-5 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-3 shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-slate-800 mb-1">Certificado Cuotas al Día</h4>
            {certificadoDoc ? (
              <button
                onClick={() => downloadDocument(certificadoDoc.url, certificadoDoc.name, certificadoDoc.fileType)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-2 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            ) : (
              <button
                onClick={() => onTabChange("documents")}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-2 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            )}
          </div>

          {/* Card 3: Ficha */}
          <div className="bg-slate-50/50 border border-slate-150 hover:border-blue-200 transition-all rounded-2xl p-5 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-3 shadow-sm">
              <Compass className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-slate-800 mb-1">Ficha Técnica del Inmueble</h4>
            {fichaDoc ? (
              <button
                onClick={() => downloadDocument(fichaDoc.url, fichaDoc.name, fichaDoc.fileType)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-2 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            ) : (
              <button
                onClick={() => onTabChange("documents")}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-2 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            )}
          </div>
        </div>
      </div>


    </div>
  );
}

/* ──────────────────── PAYMENT VIEW ──────────────────── */
function PaymentView({ data, reservationId }: { data: any; reservationId: string }) {
  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [simulatedFile, setSimulatedFile] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

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

  const overdueCount = data.upcomingInstallments?.filter((c: any) => c.isOverdue || c.hasPenalty).length || 0;
  const mandatoryCount = Math.max(1, overdueCount);

  useEffect(() => {
    if (data.upcomingInstallments && data.upcomingInstallments.length > 0) {
      if (installmentsCount < mandatoryCount) {
        setInstallmentsCount(mandatoryCount);
      }
    }
  }, [data.upcomingInstallments, installmentsCount, mandatoryCount]);

  const handleCopy = async (text: string, label: string) => {
    if (!text) return;
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
      toast.success(`${label} copiado`);
    } catch (err) {
      toast.error("No se pudo copiar");
    }
  };

  const selectedInstallments = data.upcomingInstallments?.slice(0, installmentsCount) || [];
  const realCuotasForCards = selectedInstallments.filter((c: any) => c.number > 0);
  const cuotasBaseSum = realCuotasForCards.reduce((acc: number, c: any) => acc + (c.baseAmount || c.amount), 0);
  const totalMoraCuotas = realCuotasForCards.reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0);
  const historicalMoraItem = selectedInstallments.find((c: any) => c.number === 0 || c.isHistorical);
  const moraHistorica = historicalMoraItem ? (historicalMoraItem.penaltyAmount || historicalMoraItem.amount || 0) : 0;

  const baseAmount = selectedInstallments.filter((c: any) => !c.isHistorical).reduce((acc: number, c: any) => acc + (c.baseAmount || c.amount), 0);
  const penaltyAmount = selectedInstallments.reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0);
  const totalAmount = baseAmount + penaltyAmount;

  const handleSubmit = async () => {
    if (!receiptBase64) {
      toast.error("Por favor, sube un comprobante");
      return;
    }

    setUploading(true);
    const result = await uploadPaymentReceipt({
      reservationId,
      amount: totalAmount,
      scope: "INSTALLMENT",
      receiptBase64,
      installmentsCount,
    });

    if (result.success) {
      setSuccess(true);
      toast.success("Comprobante enviado exitosamente");
    } else {
      toast.error(result.error || "Error al subir comprobante");
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

  if (success) {
    return (
      <div className="py-20 text-center animate-fade-in bg-white border border-slate-200 rounded-3xl p-6 max-w-md mx-auto shadow-sm">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Comprobante Recibido</h3>
        <p className="text-xs text-slate-550 max-w-xs mx-auto leading-relaxed">
          El comprobante ha sido ingresado al sistema para su revisión en las próximas 24 horas.
        </p>
      </div>
    );
  }

  // Split penalty into displays matching mockup style
  const adminCharge = 5000;
  const interestCharge = Math.max(0, penaltyAmount - adminCharge);
  const displayAdminCharge = penaltyAmount >= adminCharge ? adminCharge : penaltyAmount;

  // Default copyable BCI Bank Details (Mockup standard)
  const bankName = data.bank?.name || "Banco BCI";
  const bankType = data.bank?.type || "Corriente";
  const bankAccount = data.bank?.account || "12345678";
  const bankHolder = data.bank?.holder || "Alimin SpA";
  const bankRut = data.bank?.rut || "76.543.210-1";
  const bankEmail = data.bank?.email || "inmobiliaria@aliminspa.cl";

  return (
    <div className={penaltyAmount > 0 ? "w-full space-y-6 animate-fade-in" : "max-w-3xl mx-auto space-y-6 animate-fade-in"}>
      {/* Property Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">{data.projectName} - Lote {data.lotNumber}</h3>
            <p className="text-xs text-slate-500 font-medium">
              {data.lotStage ? `Etapa ${data.lotStage}` : "Terreno Residencial"}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
          data.isUpToDate && penaltyAmount === 0 ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-655"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${data.isUpToDate && penaltyAmount === 0 ? "bg-emerald-500" : "bg-orange-500"}`} />
          {data.isUpToDate && penaltyAmount === 0 ? "Al día" : "Pago Pendiente"}
        </span>
      </div>

      {penaltyAmount > 0 ? (
        <div className="space-y-6 animate-fade-in">
          {/* Header titles */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800">Resumen de pago</h2>
            <p className="text-xs text-slate-550 font-semibold mt-1">
              {data.clientName || "Cliente"} · {overdueCount === 1 ? "1 cuota vencida" : `${overdueCount} cuotas vencidas`}
            </p>
          </div>

          {/* Cards Section */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Cuotas seleccionadas</h4>
            
            {/* Grid container for Carousel + Pinned Suma Total */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Carousel on Left (9/12 cols) */}
              <div className="lg:col-span-9 relative flex items-center group bg-slate-50 border border-slate-200 rounded-2xl p-2 min-h-[135px]">
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
                                Cuota {cuota.number} de {data.totalCuotas}
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
                                <span className="bg-red-50 text-red-755 text-[9px] font-extrabold px-2 py-0.5 rounded-md border border-red-100 uppercase tracking-wider">
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
                    <p className="text-lg font-bold text-emerald-655 mt-1">{formatCLP(totalAmount)}</p>
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
            {/* Left side of details layout: details panel + summary bar + bank details + simulated upload (7/12 cols) */}
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
                            <span className="bg-red-50 text-red-755 text-[9px] font-bold px-2 py-0.5 rounded-md border border-red-100 uppercase tracking-wider">
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
                              {formatCLP(c.dailyPenalty || data.dailyPenalty || 1500)} / día
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-4 space-y-2">
                          <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                            <span>Cuota base</span>
                            <span className="text-slate-800 font-extrabold">{formatCLP(c.baseAmount || c.amount)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                            <span>Interés mora ({c.lateDays || 0} días × {formatCLP(c.dailyPenalty || data.dailyPenalty || 1500)})</span>
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
                          <div className="flex justify-between items-center text-xs font-bold text-slate-850 pt-2 border-t border-slate-100">
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
                      <span className="text-xl font-extrabold text-emerald-655">{formatCLP(totalAmount)}</span>
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
                  <p className="text-lg font-black text-emerald-655 mt-0.5">{formatCLP(totalAmount)}</p>
                </div>
              </div>
              
              <p className="text-[10px] text-slate-450 text-center font-bold">
                Haz clic en una cuota para ver su detalle · Haz clic en "Suma total" para el desglose completo
              </p>

              {/* Bank Details */}
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

                <div className="text-xs font-bold text-blue-655 flex items-center gap-1.5 pl-1">
                  <span>ℹ</span>
                  <span>Transfiere exactamente el monto indicado para facilitar la conciliación</span>
                </div>
              </div>

              {/* Simulated Upload */}
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="file"
                    id="sim-receipt"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 10 * 1024 * 1024) {
                          toast.error("El archivo es demasiado grande (máximo 10MB)");
                          return;
                        }
                        setSimulatedFile(file.name);
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setReceiptBase64(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <label
                    htmlFor="sim-receipt"
                    className={`
                      flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 bg-white
                      ${receiptBase64 ? 'border-blue-600' : 'border-slate-200 hover:border-blue-300'}
                    `}
                  >
                    {receiptBase64 ? (
                      <div className="text-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3 border border-emerald-250 text-emerald-600">
                          <FileCheck className="w-6 h-6" />
                        </div>
                        <p className="text-xs font-bold text-slate-700">Comprobante Cargado</p>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">(Haz clic para reemplazar)</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3 border border-slate-200 text-slate-400 animate-pulse">
                          <Upload className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-slate-755">Arrastra tu archivo o haz clic aquí</p>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">Soporta PDF, JPG, PNG (máx. 5MB)</p>
                      </div>
                    )}
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={uploading || !receiptBase64}
                  className={`
                    w-full py-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all duration-300 shadow-sm
                    ${receiptBase64 
                      ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] cursor-pointer' 
                      : 'bg-slate-250 text-slate-400 cursor-not-allowed'}
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
              </div>

              <p className="text-[10px] text-slate-455 font-bold text-center uppercase tracking-wide">
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
        /* Original Single Column Flow for No Mora */
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Selector */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <label htmlFor="installmentsSelectPOV" className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Selecciona la cantidad de cuotas a pagar:
              </label>
              <div className="relative">
                <select
                  id="installmentsSelectPOV"
                  value={installmentsCount}
                  onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-855 font-bold focus:border-blue-650 focus:ring-2 focus:ring-blue-600/10 focus:outline-none cursor-pointer appearance-none animate-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2050/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 1rem center",
                    backgroundSize: "1.25rem"
                  }}
                >
                  {Array.from(
                    { length: Math.min(12, data.upcomingInstallments?.length || 1) - mandatoryCount + 1 },
                    (_, i) => {
                      const q = mandatoryCount + i;
                      const selectedObjects = data.upcomingInstallments?.slice(0, q) || [];
                      
                      // Filter out historical debt / Cuota 0 to get real cuotas count and base amount
                      const realCuotas = selectedObjects.filter((c: any) => c.number > 0);
                      const realCuotasCount = realCuotas.length;
                      const realCuotasBaseAmount = realCuotas.reduce((acc: number, c: any) => acc + (c.baseAmount || c.amount), 0);

                      return (
                        <option key={q} value={q} className="font-bold text-slate-855 bg-white">
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
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            {/* Selected Real Cuotas */}
            {selectedInstallments.filter((c: any) => c.number > 0).map((cuota: any, idx: number) => (
              <div key={idx} className="flex justify-between text-xs font-medium text-slate-500">
                <span>Cuota {cuota.number} de {data.totalCuotas}</span>
                <span className="font-bold text-slate-855">{formatCLP(cuota.baseAmount || cuota.amount)}</span>
              </div>
            ))}
            
            <div className="pt-3 border-t border-slate-100 flex justify-between items-center font-bold">
              <span className="text-xs text-slate-705 font-bold">TOTAL A PAGAR</span>
              <span className="text-lg text-blue-700 font-extrabold tracking-tight">{formatCLP(totalAmount)}</span>
            </div>
          </div>

          {/* Bank Details */}
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

            <div className="text-xs font-bold text-blue-655 flex items-center gap-1.5 pl-1">
              <span>ℹ</span>
              <span>Transfiere exactamente el monto indicado para facilitar la conciliación</span>
            </div>
          </div>

          {/* Simulated Upload */}
          <div className="space-y-4">
            <div className="relative">
              <input
                type="file"
                id="sim-receipt"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error("El archivo es demasiado grande (máximo 10MB)");
                      return;
                    }
                    setSimulatedFile(file.name);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setReceiptBase64(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
              <label
                htmlFor="sim-receipt"
                className={`
                  flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 bg-white
                  ${receiptBase64 ? 'border-blue-600' : 'border-slate-200 hover:border-blue-300'}
                `}
              >
                {receiptBase64 ? (
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3 border border-emerald-250 text-emerald-600">
                      <FileCheck className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">Comprobante Cargado</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">(Haz clic para reemplazar)</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3 border border-slate-200 text-slate-400 animate-pulse">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-750">Arrastra tu archivo o haz clic aquí</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">Soporta PDF, JPG, PNG (máx. 5MB)</p>
                  </div>
                )}
              </label>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={uploading || !receiptBase64}
              className={`
                w-full py-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all duration-300 shadow-sm
                ${receiptBase64 
                  ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99] cursor-pointer' 
                  : 'bg-slate-250 text-slate-400 cursor-not-allowed'}
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
          </div>

          <p className="text-[10px] text-slate-455 font-bold text-center uppercase tracking-wide">
            🕒 El equipo revisará y confirmará tu pago en menos de 24 horas
          </p>
        </div>
      )}
    </div>
  );
}


/* ──────────────────── DOCUMENTS VIEW ──────────────────── */
function DocumentsView({ data }: { data: any }) {
  const [activeCategory, setActiveCategory] = useState<string>("Todos");
  const hasDocs = data.documents && data.documents.length > 0;

  const getCategoryType = (doc: any) => {
    const name = doc.name?.toLowerCase() || "";
    const cat = doc.category?.toLowerCase() || "";
    if (name.includes("contrato") || name.includes("promesa") || cat.includes("contrato") || cat.includes("promesa")) {
      return "CONTRATO";
    }
    if (name.includes("certificado") || name.includes("inscripcion") || cat.includes("certificado") || cat.includes("inscripcion")) {
      return "CERTIFICADO";
    }
    if (name.includes("comprobante") || name.includes("recibo") || cat.includes("comprobante") || cat.includes("recibo") || name.includes("cuota")) {
      return "COMPROBANTE";
    }
    if (name.includes("ficha") || name.includes("tecnica") || name.includes("reglamento") || cat.includes("ficha") || cat.includes("tecnica") || cat.includes("reglamento")) {
      return "FICHA";
    }
    return "FICHA";
  };

  const getCategoryTheme = (categoryType: string) => {
    switch (categoryType) {
      case "CONTRATO":
        return {
          icon: FileText,
          iconColor: "text-blue-600",
          bgColor: "bg-blue-50/80 border-blue-100",
          badgeBg: "bg-blue-50 text-blue-650 border-blue-100",
          badgeText: "Contrato",
        };
      case "CERTIFICADO":
        return {
          icon: ShieldCheck,
          iconColor: "text-[#0f9f6e]",
          bgColor: "bg-[#f3faf7] border-[#def7ec]",
          badgeBg: "bg-emerald-50 text-emerald-600 border-emerald-100",
          badgeText: "Certificado",
        };
      case "COMPROBANTE":
        return {
          icon: FileBadge,
          iconColor: "text-orange-500",
          bgColor: "bg-orange-50/50 border-orange-100",
          badgeBg: "bg-orange-50 text-orange-655 border-orange-100",
          badgeText: "Comprobante",
        };
      case "FICHA":
      default:
        return {
          icon: Compass,
          iconColor: "text-slate-650",
          bgColor: "bg-slate-50 border-slate-100",
          badgeBg: "bg-slate-50 text-slate-500 border-slate-100",
          badgeText: "Ficha",
        };
    }
  };

  const filteredDocs = (data.documents || []).filter((doc: any) => {
    const type = getCategoryType(doc);
    if (activeCategory === "Todos") return true;
    if (activeCategory === "Contratos" && type === "CONTRATO") return true;
    if (activeCategory === "Certificados" && type === "CERTIFICADO") return true;
    if (activeCategory === "Comprobantes" && type === "COMPROBANTE") return true;
    if (activeCategory === "Fichas" && type === "FICHA") return true;
    return false;
  });

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div>
        <h2 className="text-xl font-extrabold text-blue-800 tracking-tight leading-none mb-1">Mis Documentos</h2>
        <p className="text-xs text-slate-500 font-medium">Todos tus documentos en un solo lugar</p>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {["Todos", "Contratos", "Certificados", "Comprobantes", "Fichas"].map((cat) => {
          const isActive = activeCategory === cat;
          const label = cat === "Comprobantes" ? "Comprobantes de Pago" : cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                isActive 
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm" 
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Documents Grid */}
      {!hasDocs || filteredDocs.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <h3 className="text-sm font-bold text-slate-700">Sin Documentos</h3>
          <p className="text-[11px] text-slate-450 mt-1 max-w-xs mx-auto">
            No se encontraron documentos en esta categoría para tu cuenta.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDocs.map((doc: any, idx: number) => {
            const type = getCategoryType(doc);
            const theme = getCategoryTheme(type);
            const Icon = theme.icon;

            return (
              <div 
                key={idx} 
                className="bg-white border border-slate-200 hover:border-blue-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-all group"
              >
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className={`w-16 h-16 rounded-2xl ${theme.bgColor} flex items-center justify-center border mb-2 group-hover:scale-105 transition-transform duration-300`}>
                    <Icon className={`w-8 h-8 ${theme.iconColor}`} />
                  </div>
                  
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest border ${theme.badgeBg}`}>
                    {theme.badgeText}
                  </span>
                </div>

                <div className="mt-3 flex-1 text-center">
                  <h4 className="text-xs font-bold text-slate-850 line-clamp-2 leading-tight">
                    {doc.name}
                  </h4>
                  <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-wide">
                    {doc.uploadedAt ? `Emitido ${new Date(doc.uploadedAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}` : "Emitido recientemente"}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button 
                    onClick={() => downloadDocument(doc.url, doc.name, doc.fileType)}
                    className="flex-1 h-10 rounded-xl border border-blue-600 hover:bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
