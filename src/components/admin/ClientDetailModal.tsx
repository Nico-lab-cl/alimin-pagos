"use client";

import { useState, useEffect } from "react";
import { formatCLP, formatDate } from "@/lib/utils";
import { 
  X, User, Mail, Hash, Phone, FileText, AlertTriangle, 
  Save, Edit3, Upload, Trash2, FolderOpen, FileCheck2, 
  Download, Eye, Key, ShieldAlert, Lock, Target, DollarSign,
  Calendar, Activity, MapPin, Search, ChevronRight, CheckCircle2, History
} from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { toast } from "sonner";
import { 
  updateClientProfile, updateClientFinancials, toggleMultiLot, 
  toggleAlContado, registerManualPayment, activateClientProfile, 
  deletePaymentReceipt, updateMoraDates, getFinancialHistory, 
  generateTemporaryPassword 
} from "@/actions/postventa";
import { uploadDocument, deleteDocument, getReservationDocuments } from "@/actions/documents";
import PreviewModal from "@/components/shared/PreviewModal";
import ClientPOVModal from "@/components/admin/ClientPOVModal";
import { Loader2 } from "lucide-react";

export default function ClientDetailModal({ selectedClient, onClose, onUpdate, projectSlug }: any) {
  const [activeTab, setActiveTab] = useState("PROFILE");

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editMsg, setEditMsg] = useState({ text: "", type: "" });
  const [editForm, setEditForm] = useState({ 
    name: selectedClient?.clientName || "", 
    email: selectedClient?.clientEmail || "", 
    rut: selectedClient?.rut || "", 
    phone: selectedClient?.clientPhone || "", 
    observation: selectedClient?.observation || "",
    marital_status: selectedClient?.marital_status || "",
    profession: selectedClient?.profession || "",
    nationality: selectedClient?.nationality || "",
    address_street: selectedClient?.address_street || "",
    address_number: selectedClient?.address_number || "",
    address_region: selectedClient?.address_region || "",
    address_commune: selectedClient?.address_commune || ""
  });
  
  // Financial Edit State
  const [isEditingFin, setIsEditingFin] = useState(false);
  const [isSavingFin, setIsSavingFin] = useState(false);
  const [editFinMsg, setEditFinMsg] = useState({ text: "", type: "" });
  const [finForm, setFinForm] = useState({
    price_total_clp: selectedClient?.totalToPay || 0,
    reservation_price: selectedClient?.reservation_price || 0,
    pie: selectedClient?.pie || 0,
    cuotas: selectedClient?.totalCuotas || 0,
    valor_cuota: selectedClient?.valor_cuota || 0,
    last_installment_value: selectedClient?.last_installment_value || selectedClient?.valor_cuota || 0,
    installments_paid: selectedClient?.paidCuotas || 0,
    daily_penalty: selectedClient?.daily_penalty || 10000,
    due_day: selectedClient?.due_day || 5,
    grace_days: selectedClient?.grace_days || 5,
    mora_frozen: selectedClient?.mora_frozen || false,
    mora_status: selectedClient?.mora_status || (selectedClient?.mora_frozen ? "CONGELADO" : "ACTIVO"),
    penalty_mode: selectedClient?.penalty_mode || "AUTO",
    manual_penalty: selectedClient?.manual_penalty || 0,
    extra_paid_amount: selectedClient?.extra_paid_amount || 0,
    installment_ranges: selectedClient?.installment_ranges 
      ? (typeof selectedClient.installment_ranges === 'string' ? JSON.parse(selectedClient.installment_ranges) : selectedClient.installment_ranges)
      : [],
    debt_start_date: selectedClient?.debt_start_date ? new Date(selectedClient.debt_start_date).toISOString().split('T')[0] : "",
    debt_end_date: selectedClient?.debt_end_date ? new Date(selectedClient.debt_end_date).toISOString().split('T')[0] : "",
    next_payment_date: selectedClient?.next_payment_date ? new Date(selectedClient.next_payment_date).toISOString().split('T')[0] : "",
    installment_start_date: selectedClient?.nextDueDate ? new Date(selectedClient.nextDueDate).toISOString().split('T')[0] : ""
  });

  // Document State
  const [docs, setDocs] = useState<any[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState({ url: "", title: "", type: "" });
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docName, setDocName] = useState("");
  
  // Controls
  const [isTogglingMultiLot, setIsTogglingMultiLot] = useState(false);
  const [isTogglingAlContado, setIsTogglingAlContado] = useState(false);
  const [showPOV, setShowPOV] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  // Manual Mora State
  const [moraStartDate, setMoraStartDate] = useState<string | null>(selectedClient?.debt_start_date || null);
  const [moraEndDate, setMoraEndDate] = useState<string | null>(selectedClient?.debt_end_date || null);
  const [isUpdatingMora, setIsUpdatingMora] = useState(false);

  // Financial History State
  const [financialHistory, setFinancialHistory] = useState<any[]>([]);
  const [loadingFinHistory, setLoadingFinHistory] = useState(false);

  useEffect(() => {
    if (selectedClient) {
      refreshDocs();
      setLoadingFinHistory(true);
      getFinancialHistory(selectedClient.id).then(res => {
        setFinancialHistory(res.history || []);
        setLoadingFinHistory(false);
      });
    }
  }, [selectedClient?.id]);

  const refreshDocs = async () => {
    setLoadingDocs(true);
    try {
      const res = await getReservationDocuments(selectedClient.id);
      if (res.documents) {
        const tableDocs = res.documents.map((d: any) => ({
          id: d.id,
          name: d.name,
          date: d.created_at,
          url: `/api/documents/${d.id}`,
          fileType: d.file_type,
          type: 'table'
        }));
        
        const legacyDocs = (selectedClient.manual_documents || []).map((d: any, i: number) => ({
          id: `legacy-${i}`,
          name: d.name,
          date: d.uploadedAt,
          url: d.url,
          type: 'legacy'
        }));

        setDocs([...tableDocs, ...legacyDocs]);
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleUpdateMoraRange = async () => {
    if (!selectedClient || isUpdatingMora) return;
    setIsUpdatingMora(true);
    const res = await updateMoraDates(selectedClient.id, moraStartDate, moraEndDate);
    setIsUpdatingMora(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(res.message);
      onUpdate();
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setEditMsg({ text: "", type: "" });
    try {
      const res = await updateClientProfile(selectedClient.id, editForm);
      if (res.error) {
        setEditMsg({ text: res.error, type: "error" });
      } else {
        setEditMsg({ text: "Datos actualizados correctamente.", type: "success" });
        setIsEditing(false);
        onUpdate();
      }
    } catch (e) {
      setEditMsg({ text: "Error de conexión.", type: "error" });
    }
    setIsSaving(false);
  };

  const handleSaveFinancials = async () => {
    setIsSavingFin(true);
    setEditFinMsg({ text: "", type: "" });
    try {
      const res = await updateClientFinancials(selectedClient.id, selectedClient.lotId, finForm);
      if (res.error) {
        setEditFinMsg({ text: res.error, type: "error" });
      } else {
        setEditFinMsg({ text: "Finanzas actualizadas.", type: "success" });
        setIsEditingFin(false);
        onUpdate();
      }
    } catch (e) {
      setEditFinMsg({ text: "Error de conexión.", type: "error" });
    }
    setIsSavingFin(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="bg-[#050C0C] border border-white/10 rounded-[2rem] w-full max-w-[1200px] h-[85vh] shadow-2xl animate-slide-up flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        
        {/* Header Cover Area */}
        <div className="bg-gradient-to-r from-black/80 to-black border-b border-white/5 p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center relative overflow-hidden">
              <User className="w-8 h-8 text-accent relative z-10" />
              <div className="absolute inset-0 bg-accent/10 rounded-2xl animate-pulse"></div>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">{selectedClient.clientName}</h2>
                <span className="px-3 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-black text-white/40 uppercase tracking-widest">
                  {selectedClient.rut || "SIN RUT"}
                </span>
              </div>
              <p className="text-sm font-black text-white/40 uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                <Target className="w-4 h-4 text-accent" />
                Propiedad Asignada: Lote {selectedClient.lotNumber} | Etapa {selectedClient.lotStage}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                setIsTogglingMultiLot(true);
                try {
                  const newStatus = !selectedClient.isMultiLot;
                  const res = await toggleMultiLot(selectedClient.id, newStatus);
                  if (!res.error) onUpdate();
                } catch (e) {}
                setIsTogglingMultiLot(false);
              }}
              disabled={isTogglingMultiLot}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${
                selectedClient.isMultiLot 
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20" 
                  : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white"
              }`}
            >
              {isTogglingMultiLot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Target className="w-3.5 h-3.5" />}
              MULTI-LOTE: {selectedClient.isMultiLot ? "SI" : "NO"}
            </button>

            <button
              onClick={async () => {
                setIsTogglingAlContado(true);
                try {
                  const isCurrentlyContado = selectedClient.status === "COMPLETED";
                  const newStatus = !isCurrentlyContado;
                  const res = await toggleAlContado(selectedClient.id, newStatus);
                  if (!res.error) onUpdate();
                } catch (e) {}
                setIsTogglingAlContado(false);
              }}
              disabled={isTogglingAlContado}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${
                selectedClient.status === "COMPLETED" 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" 
                  : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white"
              }`}
            >
              {isTogglingAlContado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
              AL CONTADO: {selectedClient.status === "COMPLETED" ? "SI" : "NO"}
            </button>

            <button
              onClick={() => setShowPOV(true)}
              className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20 hover:shadow-[0_0_15px_rgba(139,92,246,0.2)]"
            >
              <Eye className="w-3.5 h-3.5" />
              Vista Cliente
            </button>

            {(!selectedClient.portal_active || selectedClient.clientName?.toLowerCase().includes("nicolas cabrera") || selectedClient.clientEmail?.toLowerCase().includes("nicolas")) && (
              <button
                onClick={async () => {
                  if (!confirm("¿Seguro que deseas activar este cliente y enviar sus credenciales?")) return;
                  setIsActivating(true);
                  try {
                    const res = await activateClientProfile(selectedClient.id);
                    if (res.error) toast.error(res.error);
                    else {
                      toast.success("Cliente activado exitosamente. Credenciales enviadas.");
                      onUpdate();
                    }
                  } catch (e) {
                    toast.error("Ocurrió un error al activar el cliente.");
                  }
                  setIsActivating(false);
                }}
                disabled={isActivating}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]"
              >
                {isActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                Activar Cliente
              </button>
            )}

            <button 
              onClick={onClose}
              className="w-10 h-10 ml-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 focus:outline-none transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar Menu */}
          <div className="w-24 border-r border-white/5 bg-black/20 flex flex-col items-center py-6 gap-6 shrink-0">
            <button 
              onClick={() => setActiveTab("PROFILE")}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${activeTab === "PROFILE" ? "bg-accent/20 text-accent border border-accent/30 shadow-[0_0_20px_rgba(212,168,75,0.2)]" : "text-white/40 hover:text-white hover:bg-white/5"}`}
              title="Información de Contacto"
            >
              <div className="relative">
                <FileText className="w-6 h-6" />
                <User className="w-3 h-3 absolute -bottom-1 -right-1" />
                <Edit3 className="w-2.5 h-2.5 absolute -top-1 -right-1" />
              </div>
            </button>

            <button 
              onClick={() => setActiveTab("FINANCES")}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${activeTab === "FINANCES" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]" : "text-white/40 hover:text-white hover:bg-white/5"}`}
              title="Finanzas y Saldos"
            >
              <DollarSign className="w-7 h-7" />
            </button>

            <button 
              onClick={() => setActiveTab("MORA")}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${activeTab === "MORA" ? "bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.2)]" : "text-white/40 hover:text-white hover:bg-white/5"}`}
              title="Cálculo de Multas (Mora)"
            >
              <AlertTriangle className="w-6 h-6" />
            </button>

            <button 
              onClick={() => setActiveTab("DOCUMENTS")}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${activeTab === "DOCUMENTS" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.2)]" : "text-white/40 hover:text-white hover:bg-white/5"}`}
              title="Documentos"
            >
              <FolderOpen className="w-6 h-6" />
            </button>

            <button 
              onClick={() => setActiveTab("CUOTAS")}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${activeTab === "CUOTAS" ? "bg-violet-500/20 text-violet-400 border border-violet-500/30 shadow-[0_0_20px_rgba(139,92,246,0.2)]" : "text-white/40 hover:text-white hover:bg-white/5"}`}
              title="Historial de Cuotas"
            >
              <Calendar className="w-6 h-6" />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-8 relative scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {activeTab === "PROFILE" && (
              <div className="max-w-4xl animate-fade-in">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black text-white italic tracking-tighter uppercase leading-none">Información de Contacto</h3>
                  {!isEditing && (
                    <button onClick={() => setIsEditing(true)} className="text-[10px] uppercase font-black tracking-widest text-accent hover:text-white transition-colors flex items-center gap-1.5 bg-accent/20 px-4 py-2 rounded-xl border border-accent/30">
                      <Edit3 className="w-3.5 h-3.5" /> Editar Datos
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Nombre Completo</label>
                        <input type="text" value={editForm.name} onChange={e=>setEditForm({...editForm, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">RUT Registrado</label>
                        <input type="text" value={editForm.rut} onChange={e=>setEditForm({...editForm, rut: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Correo / Usuario</label>
                        <input type="email" value={editForm.email} onChange={e=>setEditForm({...editForm, email: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Teléfono</label>
                        <input type="text" value={editForm.phone} onChange={e=>setEditForm({...editForm, phone: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                    </div>
                    
                    <div className="w-full h-px bg-white/10 my-4" />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Estado Civil</label>
                        <input type="text" value={editForm.marital_status} onChange={e=>setEditForm({...editForm, marital_status: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Profesión u Oficio</label>
                        <input type="text" value={editForm.profession} onChange={e=>setEditForm({...editForm, profession: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Nacionalidad</label>
                        <input type="text" value={editForm.nationality} onChange={e=>setEditForm({...editForm, nationality: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Región</label>
                        <input type="text" value={editForm.address_region} onChange={e=>setEditForm({...editForm, address_region: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Comuna</label>
                        <input type="text" value={editForm.address_commune} onChange={e=>setEditForm({...editForm, address_commune: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Calle / Pasaje</label>
                        <input type="text" value={editForm.address_street} onChange={e=>setEditForm({...editForm, address_street: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Número</label>
                        <input type="text" value={editForm.address_number} onChange={e=>setEditForm({...editForm, address_number: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Observaciones Post-Venta</label>
                      <textarea 
                        value={editForm.observation} 
                        onChange={e=>setEditForm({...editForm, observation: e.target.value})} 
                        placeholder="Escribe aquí cualquier detalle relevante sobre el cliente..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-accent outline-none font-bold min-h-[100px] resize-none"
                      />
                    </div>

                    {editMsg.text && (
                      <div className={`text-[10px] font-black uppercase tracking-widest p-3 rounded-xl border ${editMsg.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                        {editMsg.text}
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button onClick={() => {setIsEditing(false); setEditMsg({text:"",type:""});}} className="px-6 py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/5">Cancelar</button>
                      <button 
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        className="flex-1 px-6 py-3 rounded-xl bg-accent text-black text-[10px] font-black uppercase tracking-widest hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(212,168,75,0.3)]"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Guardar Cambios
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                    <div>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Nombre Completo</p>
                      <p className="text-sm font-bold text-white uppercase">{selectedClient.clientName}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">RUT Registrado</p>
                      <p className="text-sm font-bold text-white uppercase">{selectedClient.rut || "No registrado"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Correo Electrónico</p>
                      <p className="text-sm font-bold text-white">{selectedClient.clientEmail}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Teléfono</p>
                      <p className="text-sm font-bold text-white">{selectedClient.clientPhone || "No registrado"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Estado Civil</p>
                      <p className="text-sm font-bold text-white uppercase">{selectedClient.marital_status || "-"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Profesión u Oficio</p>
                      <p className="text-sm font-bold text-white uppercase">{selectedClient.profession || "-"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Nacionalidad</p>
                      <p className="text-sm font-bold text-white uppercase">{selectedClient.nationality || "Chilena"}</p>
                    </div>
                    <div className="col-span-2 grid grid-cols-4 gap-4">
                      <div className="col-span-2">
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Calle / Pasaje</p>
                        <p className="text-sm font-bold text-white uppercase">{selectedClient.address_street || "-"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Número</p>
                        <p className="text-sm font-bold text-white uppercase">{selectedClient.address_number || "-"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Región / Comuna</p>
                        <p className="text-sm font-bold text-white uppercase">{selectedClient.address_region ? `${selectedClient.address_region}, ${selectedClient.address_commune}` : "-"}</p>
                      </div>
                    </div>
                    <div className="col-span-2 p-5 rounded-2xl bg-white/5 border border-white/10 mt-4">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 flex items-center gap-2"><FileText className="w-3 h-3" /> Observaciones Post-Venta</p>
                      <p className="text-sm font-bold text-white/80 whitespace-pre-wrap">{selectedClient.observation || <span className="italic opacity-50">Sin observaciones registradas.</span>}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "FINANCES" && (
              <div className="max-w-4xl animate-fade-in">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black text-emerald-400 italic tracking-tighter uppercase leading-none">Finanzas y Saldos</h3>
                  {!isEditingFin && (
                    <button onClick={() => setIsEditingFin(true)} className="text-[10px] uppercase font-black tracking-widest text-emerald-400 hover:text-white transition-colors flex items-center gap-1.5 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/30">
                      <Edit3 className="w-3.5 h-3.5" /> Editar Finanzas
                    </button>
                  )}
                </div>
                
                {isEditingFin ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Valor Terreno Total</label>
                        <input type="number" value={finForm.price_total_clp} onChange={e=>setFinForm({...finForm, price_total_clp: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Valor Reserva Inicial</label>
                        <input type="number" value={finForm.reservation_price} onChange={e=>setFinForm({...finForm, reservation_price: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Valor Pie Pagado</label>
                        <input type="number" value={finForm.pie} onChange={e=>setFinForm({...finForm, pie: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Total Cuotas a Pagar</label>
                        <input type="number" value={finForm.cuotas} onChange={e=>setFinForm({...finForm, cuotas: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Valor Cuota Normal</label>
                        <input type="number" value={finForm.valor_cuota} onChange={e=>setFinForm({...finForm, valor_cuota: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Valor Última Cuota</label>
                        <input type="number" value={finForm.last_installment_value} onChange={e=>setFinForm({...finForm, last_installment_value: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Total Cuotas Pagadas</label>
                        <input type="number" value={finForm.installments_paid} onChange={e=>setFinForm({...finForm, installments_paid: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Interés Multa x Día ($)</label>
                        <input type="number" value={finForm.daily_penalty} onChange={e=>setFinForm({...finForm, daily_penalty: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Días de Gracia</label>
                        <input type="number" value={finForm.grace_days} onChange={e=>setFinForm({...finForm, grace_days: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Día de Pago Mes</label>
                        <input type="number" value={finForm.due_day} onChange={e=>setFinForm({...finForm, due_day: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-bold" />
                      </div>
                    </div>
                    
                    <div className="p-4 border border-white/10 rounded-2xl bg-white/5 space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Precios de Cuotas Anteriores</p>
                      <p className="text-xs text-white/40">Usa esto si el cliente pagó cuotas más baratas o caras en el pasado.</p>
                      {finForm.installment_ranges.map((range: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/10">
                          <input type="number" placeholder="Desde" value={range.from} onChange={e => { const newRanges = [...finForm.installment_ranges]; newRanges[idx].from = Number(e.target.value); setFinForm({...finForm, installment_ranges: newRanges})}} className="w-20 bg-transparent outline-none text-sm font-bold text-center" />
                          <span className="text-white/20">-</span>
                          <input type="number" placeholder="Hasta" value={range.to} onChange={e => { const newRanges = [...finForm.installment_ranges]; newRanges[idx].to = Number(e.target.value); setFinForm({...finForm, installment_ranges: newRanges})}} className="w-20 bg-transparent outline-none text-sm font-bold text-center" />
                          <span className="text-white/20">👉</span>
                          $<input type="number" placeholder="Monto CLP" value={range.amount} onChange={e => { const newRanges = [...finForm.installment_ranges]; newRanges[idx].amount = Number(e.target.value); setFinForm({...finForm, installment_ranges: newRanges})}} className="flex-1 bg-transparent outline-none text-sm font-bold" />
                          <button onClick={() => { const newRanges = finForm.installment_ranges.filter((_: any, i: number) => i !== idx); setFinForm({...finForm, installment_ranges: newRanges})}} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      ))}
                      <button onClick={() => setFinForm({...finForm, installment_ranges: [...finForm.installment_ranges, {from: 1, to: 10, amount: 0}]})} className="text-[10px] uppercase font-black tracking-widest text-blue-400 hover:text-blue-300 flex items-center gap-1.5">+ Agregar Historial</button>
                      {finForm.installment_ranges.length === 0 && <p className="text-xs text-white/20 italic">No hay precios anteriores registrados.</p>}
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button onClick={() => setIsEditingFin(false)} className="px-6 py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/5">Cancelar</button>
                      <button 
                        onClick={handleSaveFinancials}
                        disabled={isSavingFin}
                        className="flex-1 px-6 py-3 rounded-xl bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isSavingFin ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Guardar Finanzas
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Valor Terreno Total</p>
                      <p className="text-xl font-bold text-white">{formatCLP(selectedClient.totalToPay)}</p>
                    </div>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Valor Reserva Inicial</p>
                      <p className="text-xl font-bold text-white">{formatCLP(selectedClient.reservation_price || 0)}</p>
                    </div>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Valor Pie Pagado</p>
                      <p className="text-xl font-bold text-emerald-400">{formatCLP(selectedClient.pie)}</p>
                    </div>
                    
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Total Cuotas a Pagar</p>
                      <p className="text-xl font-bold text-white">{selectedClient.totalCuotas} Cuotas</p>
                    </div>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Valor Cuota Normal</p>
                      <p className="text-xl font-bold text-white">{formatCLP(selectedClient.valor_cuota)}</p>
                    </div>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Valor Última Cuota</p>
                      <p className="text-xl font-bold text-white">{formatCLP(selectedClient.last_installment_value)}</p>
                    </div>

                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Total Cuotas ya Pagadas</p>
                      <p className="text-xl font-bold text-emerald-400">{selectedClient.paidCuotas} Cuotas</p>
                    </div>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Interés Multa x Día ($)</p>
                      <p className="text-xl font-bold text-red-400">{formatCLP(selectedClient.daily_penalty || 10000)}</p>
                    </div>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Días de Gracia</p>
                      <p className="text-xl font-bold text-white">{selectedClient.grace_days} Días</p>
                    </div>

                    <div className="col-span-full">
                      <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/10 flex">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(selectedClient.paidCuotas / Math.max(selectedClient.totalCuotas, 1)) * 100}%` }}></div>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mt-2 text-right">Progreso: {Math.round((selectedClient.paidCuotas / Math.max(selectedClient.totalCuotas, 1)) * 100)}%</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "MORA" && (
              <div className="max-w-4xl animate-fade-in">
                <h3 className="text-xl font-black text-red-400 italic tracking-tighter uppercase leading-none mb-8">Cálculo de Multas</h3>
                
                <div className="space-y-6">
                  <div className="bg-red-500/5 border border-red-500/20 p-6 rounded-2xl space-y-6">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-red-400">Estado Financiero Manual</h4>
                    
                    <div className="flex gap-4">
                      <button onClick={() => setFinForm({...finForm, mora_status: "ACTIVO"})} className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${finForm.mora_status === "ACTIVO" ? "bg-red-500/20 border-red-500/40 text-red-400" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}>
                        Activo Con Mora
                      </button>
                      <button onClick={() => setFinForm({...finForm, mora_status: "AL_DIA"})} className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${finForm.mora_status === "AL_DIA" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}>
                        Al Día Sin Mora
                      </button>
                      <button onClick={() => setFinForm({...finForm, mora_status: "CONGELADO"})} className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${finForm.mora_status === "CONGELADO" ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}>
                        Congelado (Pausado)
                      </button>
                    </div>

                    {finForm.mora_status === "ACTIVO" && (
                      <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Modo de Cálculo de Penalización</p>
                        <div className="flex gap-3">
                          <button onClick={() => setFinForm({...finForm, penalty_mode: "AUTO"})} className={`flex-1 py-2 px-3 rounded-lg text-[9px] font-bold tracking-widest transition-all ${finForm.penalty_mode === "AUTO" ? "bg-white/20 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"}`}>Por Fecha (Auto)</button>
                          <button onClick={() => setFinForm({...finForm, penalty_mode: "MIXED"})} className={`flex-1 py-2 px-3 rounded-lg text-[9px] font-bold tracking-widest transition-all ${finForm.penalty_mode === "MIXED" ? "bg-white/20 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"}`}>Mixto (Fijo+Auto)</button>
                          <button onClick={() => setFinForm({...finForm, penalty_mode: "FIXED"})} className={`flex-1 py-2 px-3 rounded-lg text-[9px] font-bold tracking-widest transition-all ${finForm.penalty_mode === "FIXED" ? "bg-white/20 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"}`}>Monto Fijo</button>
                        </div>
                        <p className="text-xs text-white/40">
                          {finForm.penalty_mode === "AUTO" && "La multa se calcula automáticamente según los días de atraso × interés diario."}
                          {finForm.penalty_mode === "MIXED" && "Se cobra un monto fijo histórico, más el cálculo automático para cuotas nuevas."}
                          {finForm.penalty_mode === "FIXED" && "Solo se cobra el monto fijo definido, ignorando fechas de atraso."}
                        </p>
                        
                        {(finForm.penalty_mode === "FIXED" || finForm.penalty_mode === "MIXED") && (
                          <div className="space-y-2 mt-4">
                            <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Monto de Multa Fijo ($)</label>
                            <input type="number" value={finForm.manual_penalty || 0} onChange={e=>setFinForm({...finForm, manual_penalty: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-red-400 outline-none font-bold" />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Inicio Deuda (Fuerza Mora)</label>
                        <DatePicker date={moraStartDate} onChange={setMoraStartDate} />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[9px] text-white/40 uppercase font-black tracking-widest">Fin Deuda (Opcional)</label>
                        <DatePicker date={moraEndDate} onChange={setMoraEndDate} />
                      </div>
                    </div>
                    
                    <button 
                      onClick={async () => {
                        await handleSaveFinancials();
                        await handleUpdateMoraRange();
                      }}
                      disabled={isUpdatingMora || isSavingFin}
                      className="w-full py-4 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-400 flex justify-center items-center gap-2 mt-6"
                    >
                      {isUpdatingMora || isSavingFin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Aplicar Configuración de Mora
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "DOCUMENTS" && (
              <div className="max-w-4xl animate-fade-in">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black text-blue-400 italic tracking-tighter uppercase leading-none">Repositorio de Documentos</h3>
                </div>
                
                <div className="bg-white/[0.02] border border-blue-500/20 rounded-2xl p-6 mb-6">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-4">Cargar Nuevo Documento</p>
                  <div className="flex gap-3">
                    <input type="text" placeholder="Nombre del documento (ej. Carnet Identidad)" value={docName} onChange={e=>setDocName(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-400 outline-none font-bold" />
                    <label className="px-6 py-3 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-400 cursor-pointer flex items-center justify-center gap-2 transition-all">
                      {uploadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Upload className="w-3.5 h-3.5"/>}
                      Subir
                      <input type="file" className="hidden" disabled={uploadingDoc} onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!docName.trim()) { toast.error("Ingresa un nombre para el documento."); e.target.value = ""; return; }
                        if (file.size > 8 * 1024 * 1024) { toast.error("El archivo es demasiado grande. Máximo 8MB."); e.target.value = ""; return; }
                        
                        setUploadingDoc(true);
                        try {
                          const base64 = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = () => reject(new Error("Error al leer archivo"));
                            reader.readAsDataURL(file);
                          });
                          const res = await uploadDocument({ reservationId: selectedClient.id, name: docName.trim(), fileType: file.type, base64Content: base64 });
                          if (res.success) {
                            setDocName("");
                            refreshDocs();
                            toast.success("Documento subido correctamente.");
                          } else toast.error(res.error || "Fallo en la carga");
                        } catch(err) { toast.error("Error al procesar el archivo."); }
                        finally { setUploadingDoc(false); e.target.value = ""; }
                      }} />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {loadingDocs ? (
                    <div className="col-span-full py-16 flex flex-col items-center justify-center gap-4 bg-white/[0.01] rounded-2xl border border-dashed border-white/10">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-400/30"/>
                    </div>
                  ) : docs.length === 0 ? (
                    <div className="col-span-full py-16 flex flex-col items-center justify-center gap-4 bg-white/[0.01] rounded-2xl border border-dashed border-white/10 text-white/20">
                      <FileCheck2 className="w-8 h-8" />
                      <p className="text-[10px] font-black uppercase tracking-[0.3em]">Sin documentos</p>
                    </div>
                  ) : docs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:border-blue-500/30 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><FileText className="w-4 h-4 text-blue-400/50" /></div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-white truncate max-w-[150px]">{doc.name}</p>
                          <p className="text-[9px] font-black text-white/30 uppercase mt-1">{new Date(doc.date).toLocaleDateString('es-CL')}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => {setPreviewData({url: doc.url, title: doc.name, type: doc.fileType}); setIsPreviewOpen(true);}} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white"><Eye className="w-3.5 h-3.5"/></button>
                        <a href={doc.url} download className="w-8 h-8 rounded-lg bg-white/5 hover:bg-blue-500 hover:text-white flex items-center justify-center text-white/40"><Download className="w-3.5 h-3.5"/></a>
                        {doc.type === 'table' && (
                          <button onClick={async () => { if(confirm("¿Eliminar archivo?")) { const res = await deleteDocument(doc.id); if (res.success) setDocs(docs.filter(d=>d.id!==doc.id)); }}} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500 hover:text-white flex items-center justify-center text-white/40"><Trash2 className="w-3.5 h-3.5"/></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "CUOTAS" && (
              <div className="max-w-4xl animate-fade-in">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black text-violet-400 italic tracking-tighter uppercase leading-none">Historial de Cuotas</h3>
                </div>

                <div className="bg-violet-500/10 border border-violet-500/30 p-5 rounded-2xl mb-8 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center"><Calendar className="w-6 h-6 text-violet-400"/></div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400/60 mb-1">Próximo Vencimiento (Cuota Actual)</p>
                    <p className="text-xl font-bold text-violet-400">{selectedClient.nextDueDate ? formatDate(selectedClient.nextDueDate) : "No calculado"}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 border-b border-white/5 pb-2 mb-4">Registro Financiero (Ledger)</h4>
                  
                  {loadingFinHistory ? (
                    <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/20"/></div>
                  ) : financialHistory.length === 0 ? (
                    <p className="text-xs text-white/20 text-center py-10">No hay pagos registrados aún.</p>
                  ) : (
                    <div className="space-y-3">
                      {financialHistory.map(item => (
                        <div key={item.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.category === 'PIE' ? 'bg-amber-500/10 text-amber-400' : item.category === 'PENALTY' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                              <History className="w-4 h-4"/>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{item.description}</p>
                              <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-1">{new Date(item.paid_at).toLocaleDateString('es-CL')}</p>
                            </div>
                          </div>
                          <p className="text-lg font-bold text-white">{formatCLP(item.amount_clp)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} url={previewData.url} title={previewData.title} fileType={previewData.type} />
      {showPOV && <ClientPOVModal reservationId={selectedClient.id} clientName={selectedClient.clientName} onClose={() => setShowPOV(false)} />}
    </div>
  );
}
