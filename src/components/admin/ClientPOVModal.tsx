"use client";
import { useEffect, useState } from "react";
import { getClientPOV } from "@/actions/postventa";
import { uploadPaymentReceipt } from "@/actions/user";
import { formatCLP, getDownloadFilename, downloadDocument } from "@/lib/utils";
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
  ShieldAlert
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
        className="relative w-full max-w-5xl h-[95vh] max-h-[95vh] overflow-hidden rounded-[2.5rem] border border-slate-200 bg-slate-50 shadow-2xl animate-slide-up flex flex-col"
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
  const [selectedCuotas, setSelectedCuotas] = useState<number[]>([]);
  const [simulatedFile, setSimulatedFile] = useState<string | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);

  useEffect(() => {
    if (data.upcomingInstallments) {
      const overdueCount = data.upcomingInstallments.filter((c: any) => c.isOverdue || c.hasPenalty).length;
      const mandatoryCount = Math.max(1, overdueCount);
      setSelectedCuotas(data.upcomingInstallments.slice(0, mandatoryCount).map((c: any) => c.number));
    }
  }, [data.upcomingInstallments]);

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

  const totalAmount = data.upcomingInstallments
    ? data.upcomingInstallments
        .filter((c: any) => selectedCuotas.includes(c.number))
        .reduce((acc: number, curr: any) => acc + curr.amount, 0)
    : data.valor_cuota;

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
      installmentsCount: selectedCuotas.length,
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

  const selectedObjects = data.upcomingInstallments?.filter((c: any) => selectedCuotas.includes(c.number)) || [];
  const baseAmount = selectedObjects.reduce((acc: number, c: any) => acc + (c.baseAmount || c.amount), 0);
  const penaltyAmount = selectedObjects.reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0);
  const totalPayable = baseAmount + penaltyAmount;

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

  const overdueCount = data.upcomingInstallments?.filter((c: any) => c.isOverdue || c.hasPenalty).length || 0;
  const mandatoryCount = Math.max(1, overdueCount);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
          data.isUpToDate && !data.isLate ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-655"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${data.isUpToDate && !data.isLate ? "bg-emerald-500" : "bg-orange-500"}`} />
          {data.isUpToDate && !data.isLate ? "Al día" : "Pago Pendiente"}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div>
          <label htmlFor="installmentsSelectPOV" className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            Selecciona la cantidad de cuotas a pagar:
          </label>
          <div className="relative">
            <select
              id="installmentsSelectPOV"
              value={selectedCuotas.length}
              onChange={(e) => {
                const q = Number(e.target.value);
                const newSelected = data.upcomingInstallments?.slice(0, q).map((c: any) => c.number) || [];
                setSelectedCuotas(newSelected);
              }}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-855 font-bold focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 focus:outline-none cursor-pointer appearance-none animate-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
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
                    <option key={q} value={q} className="font-bold text-slate-850 bg-white">
                      {realCuotasCount === 1 ? "1 Cuota" : `${realCuotasCount} Cuotas`} ({formatCLP(realCuotasBaseAmount)})
                    </option>
                  );
                }
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Mora Box */}
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
                Cuotas Vencidas (Mora de {formatCLP(data.dailyPenalty || 1500)}/día)
              </p>
              {selectedObjects.filter((cuota: any) => cuota.hasPenalty || cuota.penaltyAmount > 0).map((cuota: any, idx: number) => {
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
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        {/* Selected Real Cuotas */}
        {selectedObjects.filter((c: any) => c.number > 0).map((cuota: any, idx: number) => (
          <div key={idx} className="flex justify-between text-xs font-medium text-slate-500">
            <span>Cuota {cuota.number} de {data.totalCuotas}</span>
            <span className="font-bold text-slate-850">{formatCLP(cuota.baseAmount || cuota.amount)}</span>
          </div>
        ))}
        
        {/* Intereses de Mora (Auto Penalty of selected real cuotas) */}
        {selectedObjects.filter((c: any) => c.number > 0).reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0) > 0 && (
          <div className="flex justify-between text-xs font-medium text-slate-500">
            <span>Intereses de Mora (Cuotas Vencidas)</span>
            <span className="font-bold text-red-650">
              {formatCLP(selectedObjects.filter((c: any) => c.number > 0).reduce((acc: number, c: any) => acc + (c.penaltyAmount || 0), 0))}
            </span>
          </div>
        )}

        {/* Mora Histórica (Historical/Manual penalty) */}
        {(selectedObjects.find((c: any) => c.number === 0 || c.isHistorical)?.amount || 0) > 0 && (
          <div className="flex justify-between text-xs font-medium text-slate-500">
            <span>Intereses Anteriores (Mora Histórica)</span>
            <span className="font-bold text-red-650">
              {formatCLP(selectedObjects.find((c: any) => c.number === 0 || c.isHistorical)?.amount || 0)}
            </span>
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 flex justify-between items-center font-bold">
          <span className="text-xs text-slate-700">TOTAL A PAGAR</span>
          <span className="text-lg text-blue-700 font-extrabold tracking-tight">{formatCLP(totalPayable)}</span>
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

      {/* Legal Modal */}
      {showLegalModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-fade-in text-left">
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
