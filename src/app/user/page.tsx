"use client";
import { useEffect, useState } from "react";
import { getUserLots, getUserNotifications, markNotificationAsRead } from "@/actions/user";
import { formatCLP, getDownloadFilename, downloadDocument } from "@/lib/utils";
import {
  Home,
  CheckCircle2,
  Clock,
  Loader2,
  Download,
  ShieldCheck,
  FileText,
  Compass,
  MessageSquare,
  Mail,
  AlertTriangle,
  ExternalLink
} from "lucide-react";
import Link from "next/link";

export default function UserDashboard() {
  const [data, setData] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLotIndex, setActiveLotIndex] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);

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
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Cargando tu Portal...</p>
      </div>
    );
  }

  if (data?.error || !data?.lots?.length) {
    return (
      <div className="text-center py-24 bg-white border border-slate-100 rounded-3xl max-w-2xl mx-auto shadow-sm">
        <Home className="w-16 h-16 mx-auto mb-6 text-slate-300" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Sin Propiedades Activas</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
          No encontramos terrenos vinculados a tu cuenta. Si crees que esto es un error, por favor contacta al equipo de postventa.
        </p>
      </div>
    );
  }

  const lot = data.lots[activeLotIndex];

  // Document selectors
  const contratoDoc = lot.documents?.find((d: any) =>
    d.name?.toLowerCase().includes("contrato") || d.category?.toLowerCase().includes("contrato")
  );
  const certificadoDoc = lot.documents?.find((d: any) =>
    d.name?.toLowerCase().includes("certificado") || d.category?.toLowerCase().includes("certificado")
  );
  const fichaDoc = lot.documents?.find((d: any) =>
    d.name?.toLowerCase().includes("ficha") || d.name?.toLowerCase().includes("tecnica") || d.category?.toLowerCase().includes("ficha")
  );

  // Generate payment history
  const paymentHistory: any[] = [];
  
  // 1. Paid installments
  for (let i = lot.paidCuotas; i >= 1; i--) {
    const matchingReceipt = lot.receipts?.find((r: any) => 
      r.nominal_installment_number === i || 
      (r.nominal_installment_range && r.nominal_installment_range.split('-').map(Number).includes(i))
    );
    
    let payDate = new Date(lot.nextDueDate || new Date());
    payDate.setMonth(payDate.getMonth() - (lot.paidCuotas - i + 1));
    
    if (matchingReceipt) {
      payDate = new Date(matchingReceipt.created_at);
    }

    paymentHistory.push({
      cuota: `Cuota #${String(i).padStart(2, '0')}`,
      fecha: formatDateMockup(payDate),
      monto: formatCLP(matchingReceipt?.amount_clp || lot.valor_cuota),
      estado: "Pagado",
      comprobante: matchingReceipt?.receipt_url || null,
    });
  }

  // 2. Next pending installment (if not fully paid)
  if (lot.paidCuotas < lot.totalCuotas) {
    const nextInstallment = lot.upcomingInstallments?.find((c: any) => c.number === lot.paidCuotas + 1);
    
    paymentHistory.push({
      cuota: `Cuota #${String(lot.paidCuotas + 1).padStart(2, '0')}`,
      fecha: formatDateMockup(lot.nextDueDate),
      monto: formatCLP(nextInstallment?.amount || lot.valor_cuota),
      estado: "Pendiente",
      comprobante: null,
    });
  }

  const unreadNotifications = notifications.filter(n => !n.read);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Notifications Banner */}
      {unreadNotifications.length > 0 && (
        <div className="space-y-3">
          {unreadNotifications.map((n) => (
            <div 
              key={n.id}
              className="p-5 rounded-2xl bg-red-50 border border-red-100 flex items-start sm:items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-650 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{n.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                </div>
              </div>
              <button 
                onClick={() => handleMarkAsRead(n.id)}
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shrink-0 cursor-pointer"
              >
                Entendido
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lot selector if user owns more than one */}
      {data.lots.length > 1 && (
        <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm w-fit">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2">Seleccionar Terreno:</span>
          <div className="flex gap-2">
            {data.lots.map((l: any, idx: number) => (
              <button
                key={l.reservationId}
                onClick={() => setActiveLotIndex(idx)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeLotIndex === idx 
                    ? "bg-blue-600 text-white shadow-sm" 
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                Lote {l.lotNumber} ({l.projectName})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top Cards Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Tu Propiedad Card */}
        <div className="lg:col-span-4 bg-white border border-slate-150 rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-bold text-slate-450 uppercase tracking-widest">Tu Propiedad</span>
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <Home className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-blue-700 mb-1">{lot.projectName} - Lote {lot.lotNumber}</h3>
            <p className="text-xs text-slate-500 font-medium">
              {lot.lotStage ? `Departamento ${lot.lotStage}` : "Terreno Residencial"}
            </p>
          </div>

          <div className="mt-8">
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
              lot.isUpToDate 
                ? "bg-emerald-50 text-emerald-600" 
                : "bg-orange-50 text-orange-655"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${lot.isUpToDate ? "bg-emerald-500" : "bg-orange-500"}`} />
              {lot.isUpToDate ? "Al día" : "Pago Pendiente"}
            </span>
          </div>
        </div>

        {/* Estado de tu Plan Card */}
        <div className="lg:col-span-8 bg-white border border-slate-150 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1 space-y-4">
            <div>
              <span className="text-xs font-bold text-slate-450 uppercase tracking-widest">Estado de tu Plan</span>
            </div>
            
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-blue-600 tracking-tight">{lot.acquisitionProgress}%</span>
              <span className="text-sm font-semibold text-slate-550">{lot.paidCuotas} de {lot.totalCuotas} cuotas pagadas</span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-[1s]"
                style={{ width: `${lot.acquisitionProgress}%` }}
              />
            </div>

            <p className="text-xs text-slate-500 italic">
              Vas por buen camino. Te quedan {lot.totalCuotas - lot.paidCuotas} cuotas.
            </p>
          </div>

          {/* Pay Next Installment Box */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 md:min-w-[320px] flex flex-col justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold text-blue-650 uppercase tracking-wider">
                {lot.paidCuotas >= lot.totalCuotas ? "Plan Completado" : `Próxima Cuota: ${lot.nextInstallmentMonth || "N/A"}`}
              </p>
              {lot.paidCuotas < lot.totalCuotas && (
                <p className="text-2xl font-extrabold text-blue-700 tracking-tight mt-1">
                  {formatCLP(lot.upcomingInstallments?.find((c: any) => c.number === lot.paidCuotas + 1)?.amount || lot.valor_cuota)}
                </p>
              )}
            </div>

            {lot.paidCuotas < lot.totalCuotas && (
              <Link
                href={`/user/pay/${lot.reservationId}`}
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#0f9f6e] hover:bg-[#0e8f62] text-white font-bold text-sm rounded-xl transition-all shadow-sm active:scale-98 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Pago
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Historial de Pagos Table */}
      <div className="bg-white border border-slate-150 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Historial de Pagos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                <th className="px-6 py-4 font-semibold">Cuota</th>
                <th className="px-6 py-4 font-semibold">Fecha</th>
                <th className="px-6 py-4 font-semibold">Monto</th>
                <th className="px-6 py-4 font-semibold">Estado</th>
                <th className="px-6 py-4 font-semibold text-right sm:text-left">Comprobante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
              {paymentHistory.slice((historyPage - 1) * 5, historyPage * 5).map((item, idx) => {
                const isPaid = item.estado === "Pagado";
                return (
                  <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">{item.cuota}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{item.fecha}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">{item.monto}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                        isPaid ? "text-emerald-600" : "text-amber-600"
                      }`}>
                        {isPaid ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        {item.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right sm:text-left">
                      {isPaid ? (
                        item.comprobante ? (
                          <button
                            onClick={() => downloadDocument(item.comprobante, `comprobante_${item.cuota.replace('#', '')}`)}
                            className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50 inline-flex items-center justify-center cursor-pointer"
                            title="Descargar Comprobante"
                          >
                            <Download className="w-4 h-4" />
                          </button>
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

      {/* Documentos Importantes Card */}
      <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 mb-6">Documentos Importantes</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Contrato */}
          <div className="bg-slate-50/50 border border-slate-150 hover:border-blue-200 transition-all rounded-2xl p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-4 shadow-sm">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 mb-1">Contrato de Compraventa</h4>
            {contratoDoc ? (
              <button
                onClick={() => downloadDocument(contratoDoc.url, contratoDoc.name, contratoDoc.fileType)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-3 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            ) : (
              <Link
                href="/user/documents"
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-3 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </Link>
            )}
          </div>

          {/* Card 2: Certificado */}
          <div className="bg-slate-50/50 border border-slate-150 hover:border-blue-200 transition-all rounded-2xl p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-4 shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 mb-1">Certificado Cuotas al Día</h4>
            {certificadoDoc ? (
              <button
                onClick={() => downloadDocument(certificadoDoc.url, certificadoDoc.name, certificadoDoc.fileType)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-3 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            ) : (
              <Link
                href="/user/documents"
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-3 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </Link>
            )}
          </div>

          {/* Card 3: Ficha */}
          <div className="bg-slate-50/50 border border-slate-150 hover:border-blue-200 transition-all rounded-2xl p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-4 shadow-sm">
              <Compass className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 mb-1">Ficha Técnica del Inmueble</h4>
            {fichaDoc ? (
              <button
                onClick={() => downloadDocument(fichaDoc.url, fichaDoc.name, fichaDoc.fileType)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-3 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            ) : (
              <Link
                href="/user/documents"
                className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mt-3 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Descargar
              </Link>
            )}
          </div>
        </div>
      </div>


    </div>
  );
}
