"use client";

import { useState, useEffect } from "react";
import { formatCLP, formatDate, getDownloadFilename, downloadDocument } from "@/lib/utils";
import { 
  ArrowLeft, Bell, HelpCircle, User, FileText, Calendar, Building, Clock, 
  AlertTriangle, Phone, CheckCircle2, ChevronRight, ChevronDown, Download, Plus, 
  Mail, Settings, MoreVertical, MessageSquare, Send, ShieldAlert, History, Zap, Loader2,
  Trash2, Eye, X, Save
} from "lucide-react";
import { toast } from "sonner";
import { 
  updateClientProfile, updateClientFinancials, toggleAlContado, 
  registerManualPayment, getFinancialHistory, addClientNote, getClientNotes 
} from "@/actions/postventa";
import { uploadDocument, deleteDocument, getReservationDocuments } from "@/actions/documents";
import PreviewModal from "@/components/shared/PreviewModal";
import ClientPOVModal from "@/components/admin/ClientPOVModal";
import { cn } from "@/lib/utils";

interface ClientDetailViewProps {
  selectedClient: any;
  onBack: () => void;
  onUpdate: () => void;
  projectSlug: string;
}

export default function ClientDetailView({ selectedClient, onBack, onUpdate, projectSlug }: ClientDetailViewProps) {
  const [activeTab, setActiveTab] = useState<"GENERAL" | "FINANCES" | "LOG">("GENERAL");
  const [loading, setLoading] = useState(false);
  const [isFrozen, setIsFrozen] = useState(selectedClient.mora_frozen || false);
  const [isSavingMora, setIsSavingMora] = useState(false);
  const [showMoraBreakdown, setShowMoraBreakdown] = useState(false);
  const [showPOV, setShowPOV] = useState(false);
  const [showMoraModal, setShowMoraModal] = useState(false);
  const [isSavingMoraSettings, setIsSavingMoraSettings] = useState(false);

  const [moraForm, setMoraForm] = useState({
    mora_status: selectedClient.mora_status || "ACTIVO",
    penalty_mode: selectedClient.penalty_mode || "AUTO",
    manual_penalty: selectedClient.manual_penalty || 0,
    debt_start_date: selectedClient.debt_start_date ? new Date(selectedClient.debt_start_date).toISOString().split("T")[0] : "",
    debt_end_date: selectedClient.debt_end_date ? new Date(selectedClient.debt_end_date).toISOString().split("T")[0] : "",
  });

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: selectedClient.clientName || "",
    email: selectedClient.clientEmail || "",
    rut: selectedClient.rut || "",
    phone: selectedClient.clientPhone || "",
    address_street: selectedClient.address_street || "",
    address_number: selectedClient.address_number || "",
    address_commune: selectedClient.address_commune || "",
    address_region: selectedClient.address_region || "",
    marital_status: selectedClient.marital_status || "",
    profession: selectedClient.profession || "",
    nationality: selectedClient.nationality || "",
    observation: selectedClient.observation || "",
  });

  // Finances Edit State
  const [isEditingFinances, setIsEditingFinances] = useState(false);
  const [financesForm, setFinancesForm] = useState({
    price_total_clp: selectedClient.totalToPay || 0,
    reservation_price: selectedClient.reservation_price || 0,
    pie: selectedClient.pie || 0,
    cuotas: selectedClient.totalCuotas || 0,
    valor_cuota: selectedClient.valor_cuota || 0,
    last_installment_value: selectedClient.last_installment_value || 0,
    daily_penalty: selectedClient.daily_penalty || 0,
    due_day: selectedClient.due_day || 5,
    grace_days: selectedClient.grace_days || 0,
    installments_paid: selectedClient.paidCuotas || 0,
    installment_start_date: selectedClient.nextDueDate ? new Date(selectedClient.nextDueDate).toISOString().split("T")[0] : "",
    mora_status: selectedClient.mora_status || "ACTIVO",
    penalty_mode: selectedClient.penalty_mode || "AUTO",
    manual_penalty: selectedClient.manual_penalty || 0,
    extra_paid_amount: selectedClient.extra_paid_amount || 0,
  });

  // Sync state on selectedClient change
  useEffect(() => {
    setProfileForm({
      name: selectedClient.clientName || "",
      email: selectedClient.clientEmail || "",
      rut: selectedClient.rut || "",
      phone: selectedClient.clientPhone || "",
      address_street: selectedClient.address_street || "",
      address_number: selectedClient.address_number || "",
      address_commune: selectedClient.address_commune || "",
      address_region: selectedClient.address_region || "",
      marital_status: selectedClient.marital_status || "",
      profession: selectedClient.profession || "",
      nationality: selectedClient.nationality || "",
      observation: selectedClient.observation || "",
    });
    setFinancesForm({
      price_total_clp: selectedClient.totalToPay || 0,
      reservation_price: selectedClient.reservation_price || 0,
      pie: selectedClient.pie || 0,
      cuotas: selectedClient.totalCuotas || 0,
      valor_cuota: selectedClient.valor_cuota || 0,
      last_installment_value: selectedClient.last_installment_value || 0,
      daily_penalty: selectedClient.daily_penalty || 0,
      due_day: selectedClient.due_day || 5,
      grace_days: selectedClient.grace_days || 0,
      installments_paid: selectedClient.paidCuotas || 0,
      installment_start_date: selectedClient.nextDueDate ? new Date(selectedClient.nextDueDate).toISOString().split("T")[0] : "",
      mora_status: selectedClient.mora_status || "ACTIVO",
      penalty_mode: selectedClient.penalty_mode || "AUTO",
      manual_penalty: selectedClient.manual_penalty || 0,
      extra_paid_amount: selectedClient.extra_paid_amount || 0,
    });
    setMoraForm({
      mora_status: selectedClient.mora_status || "ACTIVO",
      penalty_mode: selectedClient.penalty_mode || "AUTO",
      manual_penalty: selectedClient.manual_penalty || 0,
      debt_start_date: selectedClient.debt_start_date ? new Date(selectedClient.debt_start_date).toISOString().split("T")[0] : "",
      debt_end_date: selectedClient.debt_end_date ? new Date(selectedClient.debt_end_date).toISOString().split("T")[0] : "",
    });
  }, [selectedClient]);

  // Manual Note State
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("Nota interna");
  const [notesList, setNotesList] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [logFilter, setLogFilter] = useState("Todos");
  const [logPage, setLogPage] = useState(1);

  // Manual Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isRegisteringPayment, setIsRegisteringPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    installmentsCount: 1,
    paidAt: new Date().toISOString().split("T")[0],
    isPie: false
  });
  const [paymentFile, setPaymentFile] = useState<File | null>(null);

  // Financial History State
  const [financialHistory, setFinancialHistory] = useState<any[]>([]);
  const [loadingFinHistory, setLoadingFinHistory] = useState(false);

  // Document State
  const [docs, setDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docName, setDocName] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState({ url: "", title: "", type: "" });

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
          type: d.type || 'table'
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

  const fetchNotesAndHistory = async () => {
    setLoadingNotes(true);
    setLoadingFinHistory(true);
    try {
      const [notes, historyRes] = await Promise.all([
        getClientNotes(selectedClient.id),
        getFinancialHistory(selectedClient.id)
      ]);
      setNotesList(notes || []);
      setFinancialHistory(historyRes?.history || []);
    } catch (e) {
      toast.error("Error al cargar historial");
    } finally {
      setLoadingNotes(false);
      setLoadingFinHistory(false);
    }
  };

  useEffect(() => {
    fetchNotesAndHistory();
    refreshDocs();
  }, [selectedClient.id]);

  useEffect(() => {
    setLogPage(1);
  }, [logFilter]);

  const handleToggleFreeze = async () => {
    setIsSavingMora(true);
    try {
      const res = await updateClientFinancials(selectedClient.id, selectedClient.lotId, {
        mora_frozen: !isFrozen,
        mora_status: !isFrozen ? "CONGELADO" : "ACTIVO"
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        setIsFrozen(!isFrozen);
        toast.success(!isFrozen ? "Mora congelada correctamente" : "Mora activada correctamente");
        onUpdate();
      }
    } catch (e) {
      toast.error("Error al guardar estado de mora");
    } finally {
      setIsSavingMora(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      toast.error("Nombre y Correo son campos obligatorios");
      return;
    }
    setLoading(true);
    try {
      const res = await updateClientProfile(selectedClient.id, {
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
        rut: profileForm.rut.trim(),
        phone: profileForm.phone.trim(),
        address_street: profileForm.address_street.trim(),
        address_number: profileForm.address_number.trim(),
        address_commune: profileForm.address_commune.trim(),
        address_region: profileForm.address_region.trim(),
        marital_status: profileForm.marital_status.trim(),
        profession: profileForm.profession.trim(),
        nationality: profileForm.nationality.trim(),
        observation: profileForm.observation.trim(),
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Perfil de cliente actualizado con éxito");
        setIsEditingProfile(false);
        onUpdate();
        fetchNotesAndHistory();
      }
    } catch (e) {
      toast.error("Error al actualizar perfil de cliente");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFinances = async () => {
    setLoading(true);
    try {
      const res = await updateClientFinancials(selectedClient.id, selectedClient.lotId, {
        price_total_clp: Number(financesForm.price_total_clp),
        reservation_price: Number(financesForm.reservation_price),
        pie: Number(financesForm.pie),
        cuotas: Number(financesForm.cuotas),
        valor_cuota: Number(financesForm.valor_cuota),
        last_installment_value: Number(financesForm.last_installment_value),
        daily_penalty: Number(financesForm.daily_penalty),
        due_day: Number(financesForm.due_day),
        grace_days: Number(financesForm.grace_days),
        installments_paid: Number(financesForm.installments_paid),
        installment_start_date: financesForm.installment_start_date || undefined,
        mora_status: financesForm.mora_status,
        penalty_mode: financesForm.penalty_mode,
        manual_penalty: Number(financesForm.manual_penalty),
        extra_paid_amount: Number(financesForm.extra_paid_amount),
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Datos financieros actualizados con éxito");
        setIsEditingFinances(false);
        onUpdate();
        fetchNotesAndHistory();
      }
    } catch (e) {
      toast.error("Error al actualizar datos financieros");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMora = async () => {
    setIsSavingMoraSettings(true);
    try {
      const res = await updateClientFinancials(selectedClient.id, selectedClient.lotId, {
        mora_status: moraForm.mora_status,
        mora_frozen: moraForm.mora_status === "CONGELADO",
        penalty_mode: moraForm.penalty_mode,
        manual_penalty: Number(moraForm.manual_penalty),
        debt_start_date: moraForm.debt_start_date || null,
        debt_end_date: moraForm.debt_end_date || null,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Configuración de mora aplicada con éxito");
        setShowMoraModal(false);
        onUpdate();
        fetchNotesAndHistory();
      }
    } catch (e) {
      toast.error("Error al actualizar la configuración de mora");
    } finally {
      setIsSavingMoraSettings(false);
    }
  };

  const getNextInstallmentDate = (dateStr: string | Date | undefined) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    date.setMonth(date.getMonth() + 1);
    return formatDate(date.toISOString());
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) {
      toast.error("Escribe el contenido de la nota");
      return;
    }
    setIsSavingNote(true);
    try {
      const res = await addClientNote(selectedClient.id, noteText.trim(), noteType);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Nota interna agregada correctamente");
        setNoteText("");
        fetchNotesAndHistory();
      }
    } catch (e) {
      toast.error("Error al agregar nota");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentForm.amount <= 0) {
      toast.error("El monto debe ser mayor a 0");
      return;
    }
    setIsRegisteringPayment(true);
    try {
      let base64 = "";
      if (paymentFile) {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Error al leer archivo"));
          reader.readAsDataURL(paymentFile);
        });
      }

      const res = await registerManualPayment(selectedClient.id, {
        amount: paymentForm.amount,
        installmentsCount: paymentForm.installmentsCount,
        paidAt: paymentForm.paidAt,
        isPie: paymentForm.isPie,
        receiptUrl: base64 || undefined
      });

      if (res.success) {
        toast.success("Pago registrado exitosamente");
        setShowPaymentModal(false);
        setPaymentForm({
          amount: 0,
          installmentsCount: 1,
          paidAt: new Date().toISOString().split("T")[0],
          isPie: false
        });
        setPaymentFile(null);
        onUpdate();
        fetchNotesAndHistory();
        refreshDocs();
      } else {
        toast.error(res.error || "Error al registrar pago");
      }
    } catch (err) {
      toast.error("Error de conexión");
    } finally {
      setIsRegisteringPayment(false);
    }
  };

  const getResponsible = () => {
    if (projectSlug?.includes("arenas") || projectSlug?.includes("arena")) {
      return {
        name: "Cindy",
        email: "cindy@aliminspa.cl",
        role: "Responsable Arena y Sol",
        initials: "CI"
      };
    }
    if (projectSlug?.includes("libertad") || projectSlug?.includes("alegria")) {
      return {
        name: "Denisse",
        email: "denisse@aliminspa.cl",
        role: "Responsable Libertad y Alegría",
        initials: "DE"
      };
    }
    return {
      name: "Sofía Lagos",
      email: "sofia.lagos@aliminspa.cl",
      role: "Responsable Postventa",
      initials: "SL"
    };
  };

  // Compile full activity log feed
  const activityLog = (() => {
    const feed: any[] = [];
    
    // Contract initiation
    if (selectedClient.created_at) {
      const resp = getResponsible();
      feed.push({
        id: "contract-init",
        title: "Inicio de contrato",
        badge: "CONTRATO",
        description: `Contrato firmado. Inicio del plan de pagos. Responsable: ${resp.name}.`,
        date: selectedClient.created_at,
        icon: FileText,
        iconBg: "bg-slate-55 text-slate-500 border border-slate-200/50",
        author: resp.name
      });
    }

    // Ledger items (payments approved)
    financialHistory.forEach(item => {
      feed.push({
        id: item.id,
        title: item.category === 'PIE' ? "Pago de Pie registrado" : item.category === 'PENALTY' ? "Pago de Multa registrado" : "Pago registrado",
        badge: "PAGO",
        description: `${item.description}. Monto: ${formatCLP(item.amount_clp)}.`,
        date: item.paid_at,
        icon: CheckCircle2,
        iconBg: "bg-emerald-50 text-emerald-600 border border-emerald-100",
        author: "Postventa Alimin"
      });
    });

    // Notes
    notesList.forEach(note => {
      let icon = MessageSquare;
      let bg = "bg-blue-50 text-blue-600 border border-blue-100";
      let badge = "NOTA INTERNA";
      
      if (note.type === "Seguimiento telefónico") {
        icon = Phone;
        bg = "bg-blue-50 text-blue-600 border border-blue-150";
        badge = "COMUNICACIÓN";
      } else if (note.type === "Alerta") {
        icon = AlertTriangle;
        bg = "bg-amber-50 text-amber-600 border border-amber-100";
        badge = "ALERTA";
      } else if (note.type === "Registro") {
        icon = History;
        bg = "bg-violet-50 text-violet-600 border border-violet-100";
        badge = "REGISTRO";
      }

      feed.push({
        id: note.id,
        title: note.type,
        badge: badge,
        description: note.text,
        date: note.date,
        icon: icon,
        iconBg: bg,
        author: note.author
      });
    });

    // Sort chronologically (descending)
    return feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  })();

  const filteredLog = activityLog.filter(log => {
    if (logFilter === "Todos") return true;
    if (logFilter === "Pagos") return log.badge === "PAGO";
    if (logFilter === "Comunicaciones") return log.badge === "COMUNICACIÓN";
    if (logFilter === "Registros") return log.badge === "REGISTRO" || log.badge === "ALERTA";
    if (logFilter === "Notas internas") return log.badge === "NOTA INTERNA" || log.badge === "CONTRATO";
    return true;
  });

  const getStageLabel = (stage: string) => {
    return stage ? `Etapa ${stage}`.toUpperCase() : "ETAPA NO DEFINIDA";
  };

  const getStatusBadge = (status: string) => {
    if (status === "LATE") {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-650 border border-red-150 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-red-500" />
          MORA DETECTADA
        </span>
      );
    }
    if (status === "GRACE") {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-150 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-amber-500" />
          EN GRACIA
        </span>
      );
    }
    if (status === "CONTADO") {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-150 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-emerald-500" />
          AL CONTADO
        </span>
      );
    }
    if (status === "CONGELADO" || status === "FROZEN") {
      return (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-200 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-slate-400" />
          CONGELADO
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-150 flex items-center gap-1">
        <span className="w-1 h-1 rounded-full bg-emerald-500" />
        CONTRATO ACTIVO
      </span>
    );
  };

  const getLotReference = () => {
    if (projectSlug?.includes("casablanca")) return `VDC-L${selectedClient.lotNumber}`;
    if (projectSlug?.includes("arenas") || projectSlug?.includes("arena")) return `AYS-L${selectedClient.lotNumber}`;
    return `L-${selectedClient.lotNumber}`;
  };

  const getProjectName = () => {
    if (projectSlug?.includes("casablanca")) return "Casablanca";
    if (projectSlug?.includes("arenas") || projectSlug?.includes("arena")) return "Arena y Sol";
    if (projectSlug?.includes("libertad") || projectSlug?.includes("alegria")) return "Libertad y Alegría";
    return "Lomas del Mar";
  };

  // DOT Indicators Helper for Cuotas
  const maxDots = 12;
  const paidDotsCount = Math.min(selectedClient.paidCuotas || 0, maxDots);
  const remainingDotsCount = Math.max(0, maxDots - paidDotsCount);

  return (
    <div className="space-y-6 animate-fade-in relative text-slate-800">
      {/* Top Breadcrumb & Header Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-850 transition-colors shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
              <span>Clientes</span>
              <ChevronRight className="w-3 h-3 text-slate-350" />
              <span>{selectedClient.clientName}</span>
              <ChevronRight className="w-3 h-3 text-slate-350" />
              <span className="text-slate-500">{getLotReference()}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-850 tracking-tight leading-none">{selectedClient.clientName}</h2>
              {getStatusBadge(selectedClient.status)}
              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 border border-slate-200 text-slate-500 tracking-wider">
                {getProjectName().toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => setShowPOV(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            Vista Cliente
          </button>

          <button 
            onClick={() => setShowPaymentModal(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar Pago
          </button>

          {activeTab === "FINANCES" && (
            <button 
              onClick={() => setShowMoraModal(true)}
              className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white border border-red-500/20 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              Ajustes de Mora
            </button>
          )}
          
          <button 
            onClick={handleToggleFreeze}
            disabled={isSavingMora}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold border transition-all shadow-sm flex items-center gap-1.5 cursor-pointer",
              isFrozen 
                ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100" 
                : "bg-white border-slate-200 text-slate-650 hover:bg-slate-50"
            )}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            {isFrozen ? "Activar Cuenta" : "Congelar Cuenta"}
          </button>
          
          <button 
            onClick={() => toast.info("Exportación de ficha disponible próximamente")}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-650 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Ficha
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-6 overflow-x-auto whitespace-nowrap pb-1 no-scrollbar scroll-smooth">
        <button
          onClick={() => setActiveTab("GENERAL")}
          className={cn(
            "pb-3.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-0.5 cursor-pointer",
            activeTab === "GENERAL" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          Datos Generales
        </button>
        <button
          onClick={() => setActiveTab("FINANCES")}
          className={cn(
            "pb-3.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-0.5 cursor-pointer",
            activeTab === "FINANCES" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          Finanzas y Mora
        </button>
        <button
          onClick={() => setActiveTab("LOG")}
          className={cn(
            "pb-3.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-0.5 cursor-pointer",
            activeTab === "LOG" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          Bitácora
        </button>
      </div>

      {/* Content Render based on active tab */}
      {activeTab === "GENERAL" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Side: Client Info & Documents */}
          <div className="lg:col-span-2 space-y-6">
            {/* Información del Cliente Card */}
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <User className="w-4.5 h-4.5 text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Información del Cliente</h3>
                </div>
                {!isEditingProfile ? (
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                  >
                    Editar
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveProfile}
                      disabled={loading}
                      className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                      Guardar
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingProfile(false);
                        setProfileForm({
                          name: selectedClient.clientName || "",
                          email: selectedClient.clientEmail || "",
                          rut: selectedClient.rut || "",
                          phone: selectedClient.clientPhone || "",
                          address_street: selectedClient.address_street || "",
                          address_number: selectedClient.address_number || "",
                          address_commune: selectedClient.address_commune || "",
                          address_region: selectedClient.address_region || "",
                          marital_status: selectedClient.marital_status || "",
                          profession: selectedClient.profession || "",
                          nationality: selectedClient.nationality || "",
                          observation: selectedClient.observation || "",
                        });
                      }}
                      className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
              
              {!isEditingProfile ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 text-xs">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">RUT</p>
                    <p className="font-bold text-slate-800">{selectedClient.rut || "SIN RUT"}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre Completo</p>
                    <p className="font-bold text-slate-800 uppercase">{selectedClient.clientName}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Email</p>
                    <p className="font-semibold text-blue-600 underline truncate select-all">{selectedClient.clientEmail}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Teléfono</p>
                    <p className="font-bold text-slate-800">{selectedClient.clientPhone || "—"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dirección</p>
                    <p className="font-semibold text-slate-700">
                      {selectedClient.address_street ? (
                        `${selectedClient.address_street} ${selectedClient.address_number || ""}, ${selectedClient.address_commune || ""}, ${selectedClient.address_region || ""}`
                      ) : "DIRECCIÓN NO REGISTRADA"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Estado Civil</p>
                    <p className="font-bold text-slate-800">{selectedClient.marital_status || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Profesión</p>
                    <p className="font-bold text-slate-800">{selectedClient.profession || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nacionalidad</p>
                    <p className="font-bold text-slate-800">{selectedClient.nationality || "—"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Observación</p>
                    <p className="font-semibold text-slate-600 whitespace-pre-wrap">{selectedClient.observation || "Sin observaciones"}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 text-xs font-semibold text-slate-700">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">RUT</label>
                    <input
                      type="text"
                      value={profileForm.rut}
                      onChange={(e) => setProfileForm({ ...profileForm, rut: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nombre Completo</label>
                    <input
                      type="text"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Email</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Teléfono</label>
                    <input
                      type="text"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Calle</label>
                    <input
                      type="text"
                      value={profileForm.address_street}
                      onChange={(e) => setProfileForm({ ...profileForm, address_street: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Número</label>
                    <input
                      type="text"
                      value={profileForm.address_number}
                      onChange={(e) => setProfileForm({ ...profileForm, address_number: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Comuna</label>
                    <input
                      type="text"
                      value={profileForm.address_commune}
                      onChange={(e) => setProfileForm({ ...profileForm, address_commune: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Región</label>
                    <input
                      type="text"
                      value={profileForm.address_region}
                      onChange={(e) => setProfileForm({ ...profileForm, address_region: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Estado Civil</label>
                    <input
                      type="text"
                      value={profileForm.marital_status}
                      onChange={(e) => setProfileForm({ ...profileForm, marital_status: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Profesión</label>
                    <input
                      type="text"
                      value={profileForm.profession}
                      onChange={(e) => setProfileForm({ ...profileForm, profession: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nacionalidad</label>
                    <input
                      type="text"
                      value={profileForm.nationality}
                      onChange={(e) => setProfileForm({ ...profileForm, nationality: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Observación</label>
                    <textarea
                      value={profileForm.observation}
                      onChange={(e) => setProfileForm({ ...profileForm, observation: e.target.value })}
                      rows={3}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Repositorio de Documentos */}
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-4.5 h-4.5 text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Documentos del Cliente</h3>
                </div>
              </div>

              {/* Upload New Document Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-450">Cargar Nuevo Documento</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Nombre (ej. Copia Contrato, Cédula)"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 placeholder-slate-450 focus:border-blue-500 outline-none"
                  />
                  <label className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 transition-all shadow-sm shrink-0">
                    {uploadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Subir
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadingDoc}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!docName.trim()) {
                          toast.error("Ingresa un nombre para el documento.");
                          e.target.value = "";
                          return;
                        }
                        if (file.size > 8 * 1024 * 1024) {
                          toast.error("El archivo es demasiado grande. Máximo 8MB.");
                          e.target.value = "";
                          return;
                        }

                        setUploadingDoc(true);
                        try {
                          const base64 = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = () => reject(new Error("Error al leer archivo"));
                            reader.readAsDataURL(file);
                          });
                          const res = await uploadDocument({
                            reservationId: selectedClient.id,
                            name: docName.trim(),
                            fileType: file.type,
                            base64Content: base64,
                          });
                          if (res.success) {
                            setDocName("");
                            refreshDocs();
                            toast.success("Documento subido correctamente.");
                          } else {
                            toast.error(res.error || "Fallo en la carga");
                          }
                        } catch (err) {
                          toast.error("Error al procesar el archivo.");
                        } finally {
                          setUploadingDoc(false);
                          e.target.value = "";
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Documents List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                {loadingDocs ? (
                  <div className="col-span-full py-8 flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500/50" />
                  </div>
                ) : docs.length === 0 ? (
                  <div className="col-span-full py-8 flex flex-col items-center justify-center gap-2 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-center">
                    <Building className="w-5 h-5 opacity-40" />
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em]">Sin documentos cargados</p>
                  </div>
                ) : (
                  docs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-500/30 transition-all gap-2 shadow-sm"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-8 h-8 rounded-lg bg-blue-50/50 border border-blue-100 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div className="overflow-hidden min-w-0">
                          <p className="text-[11px] font-bold text-slate-800 truncate" title={doc.name}>
                            {doc.name}
                          </p>
                          <p className="text-[8px] font-semibold text-slate-400 uppercase mt-0.5">
                            {new Date(doc.date).toLocaleDateString("es-CL")}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setPreviewData({ url: doc.url, title: doc.name, type: doc.fileType });
                            setIsPreviewOpen(true);
                          }}
                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors shadow-sm cursor-pointer"
                          title="Visualizar"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => downloadDocument(doc.url, doc.name, doc.fileType)}
                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors shadow-sm cursor-pointer"
                          title="Descargar"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        {doc.type === "table" && (
                          <button
                            onClick={async () => {
                              if (confirm("¿Estás seguro de que deseas eliminar este archivo?")) {
                                const res = await deleteDocument(doc.id);
                                if (res.success) {
                                  setDocs(docs.filter((d) => d.id !== doc.id));
                                  toast.success("Documento eliminado.");
                                } else {
                                  toast.error(res.error || "No se pudo eliminar.");
                                }
                              }
                            }}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-550 hover:bg-red-50 hover:text-red-650 transition-colors shadow-sm cursor-pointer"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Side: Land Info & Financial Summary */}
          <div className="space-y-6">
            {/* Información del Terreno Card */}
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <Building className="w-4.5 h-4.5 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Información del Terreno</h3>
              </div>

              <div className="grid grid-cols-1 gap-y-4 text-xs">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre del Proyecto</p>
                  <p className="font-bold text-slate-800">{getProjectName()}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre del Terreno</p>
                  <p className="font-bold text-blue-600">Lote {selectedClient.lotNumber}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Metros Cuadrados</p>
                  <p className="font-bold text-slate-800">{selectedClient.lot?.area_m2 ? `${selectedClient.lot.area_m2} m²` : "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Total del Terreno</p>
                  <p className="text-sm font-bold text-slate-800">{formatCLP(selectedClient.totalToPay)}</p>
                </div>
              </div>
            </div>

            {/* Resumen Financiero Card */}
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Resumen Financiero</h3>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Precio Venta</p>
                  <p className="text-sm font-bold text-slate-800">{formatCLP(selectedClient.totalToPay)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Reserva</p>
                  <p className="text-sm font-bold text-slate-800">{formatCLP(selectedClient.reservation_price || 0)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Pie Pagado</p>
                  <p className="text-sm font-bold text-slate-800">{formatCLP(selectedClient.pie)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Día de Pago</p>
                  <p className="text-sm font-bold text-slate-800">Día {selectedClient.due_day || 5}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Fecha Cuota Actual</p>
                  <p className="text-sm font-bold text-blue-600">{selectedClient.nextDueDate ? formatDate(selectedClient.nextDueDate) : "No definido"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Fecha Cuota Siguiente</p>
                  <p className="text-sm font-bold text-blue-600">{selectedClient.nextDueDate ? getNextInstallmentDate(selectedClient.nextDueDate) : "No definido"}</p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex justify-between items-center text-xs">
                <div>
                  <p className="text-[9px] font-bold text-slate-550 uppercase tracking-wider mb-0.5">Saldo por Financiar</p>
                  <p className="text-base font-bold text-blue-700">{formatCLP(selectedClient.pendingBalance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold text-slate-550 uppercase tracking-wider mb-0.5">Valor Cuota</p>
                  <p className="text-sm font-bold text-slate-800">{formatCLP(selectedClient.valor_cuota)}</p>
                </div>
              </div>

              {/* Bottom Dot indicators */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: paidDotsCount }).map((_, i) => (
                    <span key={`paid-${i}`} className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                  ))}
                  {Array.from({ length: remainingDotsCount }).map((_, i) => (
                    <span key={`rem-${i}`} className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  {selectedClient.paidCuotas} de {selectedClient.totalCuotas} cuotas pagadas ({selectedClient.totalCuotas - selectedClient.paidCuotas} restantes)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "FINANCES" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Sale Info Card & Progress payment Card */}
          <div className="lg:col-span-2 space-y-6">
            {/* Información de Venta Card */}
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Información de Venta - Lote {selectedClient.lotNumber}</h3>
                {!isEditingFinances ? (
                  <button
                    onClick={() => setIsEditingFinances(true)}
                    className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                  >
                    Editar
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveFinances}
                      disabled={loading}
                      className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                      Guardar
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingFinances(false);
                        setFinancesForm({
                          price_total_clp: selectedClient.totalToPay || 0,
                          reservation_price: selectedClient.reservation_price || 0,
                          pie: selectedClient.pie || 0,
                          cuotas: selectedClient.totalCuotas || 0,
                          valor_cuota: selectedClient.valor_cuota || 0,
                          last_installment_value: selectedClient.last_installment_value || 0,
                          daily_penalty: selectedClient.daily_penalty || 0,
                          due_day: selectedClient.due_day || 5,
                          grace_days: selectedClient.grace_days || 0,
                          installments_paid: selectedClient.paidCuotas || 0,
                          installment_start_date: selectedClient.nextDueDate ? new Date(selectedClient.nextDueDate).toISOString().split("T")[0] : "",
                          mora_status: selectedClient.mora_status || "ACTIVO",
                          penalty_mode: selectedClient.penalty_mode || "AUTO",
                          manual_penalty: selectedClient.manual_penalty || 0,
                          extra_paid_amount: selectedClient.extra_paid_amount || 0,
                        });
                      }}
                      className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>

              {!isEditingFinances ? (
                <div className="space-y-6">
                  {/* Fila 1: Precios */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-slate-100 pb-5 gap-6 text-xs">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Total Lote</p>
                      <p className="text-xl font-bold text-blue-600">{formatCLP(selectedClient.totalToPay)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reserva</p>
                      <p className="text-xl font-bold text-slate-800">{formatCLP(selectedClient.reservation_price || 0)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pie Pagado</p>
                      <p className="text-xl font-bold text-slate-850">{formatCLP(selectedClient.pie)}</p>
                    </div>
                  </div>

                  {/* Fila 2: Cuotas */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-slate-100 pb-5 gap-6 text-xs">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cantidad de Cuotas</p>
                      <p className="text-sm font-bold text-slate-800">{selectedClient.totalCuotas} Cuotas</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Valor de Cuota</p>
                      <p className="text-sm font-bold text-slate-800">{formatCLP(selectedClient.valor_cuota)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Última Cuota</p>
                      <p className="text-sm font-bold text-slate-850">{formatCLP(selectedClient.last_installment_value)}</p>
                    </div>
                  </div>

                  {/* Fila 3: Interés y Mora config */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-slate-100 pb-5 gap-6 text-xs">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Interés (multa por día)</p>
                      <p className="text-sm font-bold text-red-650">{formatCLP(selectedClient.daily_penalty)} / día</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Días de Gracia</p>
                      <p className="text-sm font-bold text-slate-800">{selectedClient.grace_days} días</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Día de Pago</p>
                      <p className="text-sm font-bold text-slate-800">Día {selectedClient.due_day || 5} de cada mes</p>
                    </div>
                  </div>

                  {/* Fila 4: Cuota actual y próxima */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-slate-100 pb-5 gap-6 text-xs">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cuota Actual</p>
                      {selectedClient.paidCuotas < selectedClient.totalCuotas ? (
                        <div>
                          <p className="text-sm font-bold text-slate-800">Cuota #{selectedClient.paidCuotas + 1}</p>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase mt-0.5">
                            Vencimiento: {selectedClient.nextDueDate ? formatDate(selectedClient.nextDueDate) : "No definido"}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm font-bold text-slate-400">Todas las cuotas pagadas</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Próxima Cuota</p>
                      {selectedClient.paidCuotas + 1 < selectedClient.totalCuotas ? (
                        <div>
                          <p className="text-sm font-bold text-slate-800">Cuota #{selectedClient.paidCuotas + 2}</p>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase mt-0.5">
                            Vencimiento: {selectedClient.nextDueDate ? getNextInstallmentDate(selectedClient.nextDueDate) : "No definido"}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm font-bold text-slate-400">No hay cuotas siguientes</p>
                      )}
                    </div>
                  </div>

                  {/* Fila 5: Removida según requerimiento */}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4 text-xs font-semibold text-slate-700">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Valor Total Lote ($)</label>
                    <input
                      type="number"
                      value={financesForm.price_total_clp}
                      onChange={(e) => setFinancesForm({ ...financesForm, price_total_clp: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Reserva ($)</label>
                    <input
                      type="number"
                      value={financesForm.reservation_price}
                      onChange={(e) => setFinancesForm({ ...financesForm, reservation_price: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Pie Pagado ($)</label>
                    <input
                      type="number"
                      value={financesForm.pie}
                      onChange={(e) => setFinancesForm({ ...financesForm, pie: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Cantidad de Cuotas</label>
                    <input
                      type="number"
                      value={financesForm.cuotas}
                      onChange={(e) => setFinancesForm({ ...financesForm, cuotas: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Valor de Cuota ($)</label>
                    <input
                      type="number"
                      value={financesForm.valor_cuota}
                      onChange={(e) => setFinancesForm({ ...financesForm, valor_cuota: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Valor Última Cuota ($)</label>
                    <input
                      type="number"
                      value={financesForm.last_installment_value}
                      onChange={(e) => setFinancesForm({ ...financesForm, last_installment_value: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Interés (multa por día) ($)</label>
                    <input
                      type="number"
                      value={financesForm.daily_penalty}
                      onChange={(e) => setFinancesForm({ ...financesForm, daily_penalty: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Días de Gracia</label>
                    <input
                      type="number"
                      value={financesForm.grace_days}
                      onChange={(e) => setFinancesForm({ ...financesForm, grace_days: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Día de Pago (1-31)</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={financesForm.due_day}
                      onChange={(e) => setFinancesForm({ ...financesForm, due_day: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Cuotas Pagadas</label>
                    <input
                      type="number"
                      value={financesForm.installments_paid}
                      onChange={(e) => setFinancesForm({ ...financesForm, installments_paid: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Próximo Vencimiento (Fecha)</label>
                    <input
                      type="date"
                      value={financesForm.installment_start_date}
                      onChange={(e) => setFinancesForm({ ...financesForm, installment_start_date: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Estado Mora</label>
                    <select
                      value={financesForm.mora_status}
                      onChange={(e) => setFinancesForm({ ...financesForm, mora_status: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-750 focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <option value="ACTIVO">ACTIVO</option>
                      <option value="CONGELADO">CONGELADO</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Modo Multa</label>
                    <select
                      value={financesForm.penalty_mode}
                      onChange={(e) => setFinancesForm({ ...financesForm, penalty_mode: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-755 focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <option value="AUTO">AUTOMÁTICO</option>
                      <option value="FIXED">FIJO</option>
                      <option value="MIXED">MIXTO</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Multa Manual ($)</label>
                    <input
                      type="number"
                      value={financesForm.manual_penalty}
                      onChange={(e) => setFinancesForm({ ...financesForm, manual_penalty: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Saldo Extra Pagado ($)</label>
                    <input
                      type="number"
                      value={financesForm.extra_paid_amount}
                      onChange={(e) => setFinancesForm({ ...financesForm, extra_paid_amount: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Progreso de Pago Progress Bar Card */}
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Progreso de Pago</h3>
                <span className="text-[10px] text-slate-400 font-semibold uppercase">
                  {selectedClient.paidCuotas} de {selectedClient.totalCuotas} cuotas amortizadas
                </span>
              </div>

              <div>
                <p className="text-2xl font-bold text-slate-800 tracking-tight mb-4">
                  {selectedClient.totalCuotas > 0 
                    ? Math.round((selectedClient.paidCuotas / selectedClient.totalCuotas) * 100)
                    : 0}% Completado
                </p>
                
                <div className="h-3.5 rounded-full bg-slate-100 overflow-hidden flex border border-slate-200/60 p-0.5">
                  <div 
                    className="h-full bg-blue-600 rounded-l-full transition-all duration-300" 
                    style={{ 
                      width: selectedClient.totalCuotas > 0 
                        ? `${(selectedClient.paidCuotas / selectedClient.totalCuotas) * 100}%`
                        : '0%'
                    }} 
                  />
                  {selectedClient.status === "LATE" && (
                    <div 
                      className="h-full bg-red-500 transition-all duration-300" 
                      style={{ 
                        width: selectedClient.totalCuotas > 0 ? `${(1 / selectedClient.totalCuotas) * 100}%` : '5%'
                      }} 
                    />
                  )}
                </div>

                <div className="flex gap-4 mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span>Pagado</span>
                  </div>
                  {selectedClient.status === "LATE" && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span>En Mora</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <span>Pendiente</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Mora alert, actions, and simple payment history */}
          <div className="space-y-6">
            {/* Estado de Mora Detected Card */}
            {selectedClient.status === "LATE" && (
              <div className="rounded-2xl bg-red-50 border border-red-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowMoraBreakdown(!showMoraBreakdown)}
                  className="w-full p-5 flex gap-4 items-start text-left hover:bg-red-100/50 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-650 shrink-0 shadow-inner">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] text-red-650 font-bold uppercase tracking-wider mb-0.5">Estado de Mora Detectado</p>
                    <h4 className="text-base font-bold text-red-750 leading-tight">Mora Acumulada: {formatCLP(selectedClient.penaltyAmount || 0)}</h4>
                    <p className="text-[10px] text-red-500/80 font-medium mt-1 leading-relaxed">
                      {selectedClient.overdueInstallments?.length || 1} cuota{(selectedClient.overdueInstallments?.length || 1) !== 1 ? 's' : ''} vencida{(selectedClient.overdueInstallments?.length || 1) !== 1 ? 's' : ''} a la fecha. Click para ver desglose.
                    </p>
                  </div>
                  <ChevronDown className={cn(
                    "w-5 h-5 text-red-400 shrink-0 transition-transform duration-200 mt-2",
                    showMoraBreakdown && "rotate-180"
                  )} />
                </button>

                {showMoraBreakdown && (
                  <div className="border-t border-red-200 p-5 space-y-5 animate-fade-in">
                    <div className="bg-red-100/60 border border-red-200 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider mb-0.5">Total Multa Vigente</p>
                        <p className="text-xl font-bold text-red-750">{formatCLP(selectedClient.penaltyAmount || 0)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider mb-0.5">Atraso Contable</p>
                        <p className="text-lg font-bold text-red-600">{selectedClient.lateDays || 0} Días</p>
                      </div>
                    </div>

                    {(selectedClient.penalty_mode === "FIXED" || selectedClient.penalty_mode === "MIXED") && selectedClient.manual_penalty > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-amber-600">
                          <ShieldAlert className="w-4 h-4" />
                          <h4 className="text-[10px] font-bold uppercase tracking-wider">Mora Histórica (Acuerdo Fijo)</h4>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <p className="text-[10px] font-medium text-amber-700/80 mb-3 leading-relaxed">
                            El cliente tiene un monto fijo de penalización pactado. Este monto se suma al total de la deuda.
                          </p>
                          <div className="flex items-center justify-between bg-amber-100/60 rounded-lg px-4 py-3 border border-amber-200">
                            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Monto Fijo Pactado</span>
                            <span className="text-sm font-bold text-amber-800">{formatCLP(selectedClient.manual_penalty)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedClient.overdueInstallments && selectedClient.overdueInstallments.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-red-600">
                          <AlertTriangle className="w-4 h-4" />
                          <h4 className="text-[10px] font-bold uppercase tracking-wider">Cuotas Vencidas (Mora Diaria: {formatCLP(selectedClient.daily_penalty || 10000)}/día)</h4>
                        </div>
                        <div className="space-y-2">
                          {selectedClient.overdueInstallments.map((inst: any) => (
                            <div key={inst.number} className="bg-white border border-red-150 rounded-xl p-4 flex items-center justify-between hover:border-red-300 transition-colors shadow-sm">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold text-slate-800">Cuota {inst.number}</span>
                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                    {inst.monthName}
                                  </span>
                                </div>
                                <p className="text-[10px] text-red-500 font-semibold">
                                  Venció el {formatDate(inst.dueDate)}
                                </p>
                              </div>
                              <div className="text-right flex flex-col items-end gap-1.5">
                                <span className="text-sm font-bold text-red-600">{formatCLP(inst.penaltyAmount)}</span>
                                <span className="text-[8px] font-bold text-red-550 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                                  {inst.lateDays} {inst.lateDays === 1 ? 'día' : 'días'} de atraso
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Acciones Rápidas Card */}
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-4">
              <p className="text-[10px] font-bold text-slate-450 uppercase tracking-wider border-b border-slate-100 pb-2">Acciones Rápidas</p>
              
              <button 
                onClick={() => setShowPaymentModal(true)}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Registrar Pago Manual
              </button>
              
              <button 
                onClick={handleToggleFreeze}
                disabled={isSavingMora}
                className="w-full py-3 rounded-xl bg-slate-500 hover:bg-slate-600 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                {isFrozen ? "Activar Mora" : "Congelar Mora"}
              </button>
              
              <button 
                onClick={() => toast.info("Funcionalidad de repactación en desarrollo")}
                className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-650 hover:bg-slate-50 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                Repactar Cuotas
              </button>

              <button 
                onClick={() => toast.info("Generación de PDF de estado de cuenta en desarrollo")}
                className="w-full py-3 rounded-xl bg-white border border-blue-600 text-blue-605 hover:bg-blue-50 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm mt-3 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                Generar Estado de Cuenta PDF
              </button>
            </div>

            {/* Historial de Pagos Card */}
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <p className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Historial de Pagos</p>
                <button 
                  onClick={() => setActiveTab("LOG")}
                  className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  Ver todo
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-550">Último Pago</span>
                  <span className="font-semibold text-slate-800">
                    {financialHistory.length > 0 
                      ? new Date(financialHistory[0].paid_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-50 pt-2.5">
                  <span className="text-slate-550">Monto Total Pagado</span>
                  <span className="font-bold text-blue-600">{formatCLP(selectedClient.pie + (selectedClient.paidCuotas * selectedClient.valor_cuota))}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-50 pt-2.5">
                  <span className="text-slate-550">Saldo Pendiente</span>
                  <span className="font-bold text-slate-850">{formatCLP(selectedClient.pendingBalance)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "LOG" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Activity List Feed */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <h3 className="text-sm font-bold text-slate-850 uppercase tracking-wider">Historial de Actividad</h3>
                
                <button 
                  onClick={() => {
                    setNoteType("Nota interna");
                    document.getElementById("add-note-textarea")?.focus();
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm w-fit cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar Nota
                </button>
              </div>

              {/* Log filter tags */}
              <div className="flex flex-wrap gap-1.5">
                {["Todos", "Pagos", "Comunicaciones", "Registros", "Notas internas"].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setLogFilter(filter)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                      logFilter === filter 
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Feed items */}
              {loadingNotes ? (
                <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
              ) : filteredLog.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-slate-100 rounded-xl">
                  <History className="w-12 h-12 text-slate-205 mx-auto mb-4" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Sin historial registrado en este filtro</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="relative border-l border-slate-100 ml-5 space-y-8 py-3">
                    {filteredLog.slice((logPage - 1) * 5, logPage * 5).map((log, idx) => (
                      <div key={log.id || idx} className="relative pl-8">
                        {/* Timeline dot icon wrapper */}
                        <span className={cn(
                          "absolute -left-5 top-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm",
                          log.iconBg
                        )}>
                          <log.icon className="w-4 h-4" />
                        </span>
                        
                        <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 hover:border-slate-200 transition-colors shadow-sm">
                          <div className="flex items-center justify-between gap-4 mb-2 flex-wrap sm:flex-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-800">{log.title}</span>
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-200 text-slate-655">
                                {log.badge}
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-455 uppercase">
                              {formatDate(log.date)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed font-medium mb-3">{log.description}</p>
                          
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-655 uppercase border border-slate-350">
                              {log.author ? log.author.substring(0, 2).toUpperCase() : "AD"}
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{log.author}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {filteredLog.length > 5 && (
                    <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4 gap-4 text-slate-550 text-xs font-semibold px-2">
                      <button
                        type="button"
                        onClick={() => setLogPage(prev => Math.max(prev - 1, 1))}
                        disabled={logPage === 1}
                        className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-655 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all bg-white cursor-pointer"
                      >
                        Anterior
                      </button>
                      <span className="text-xs text-slate-550 font-bold">
                        Página {logPage} de {Math.ceil(filteredLog.length / 5)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLogPage(prev => Math.min(prev + 1, Math.ceil(filteredLog.length / 5)))}
                        disabled={logPage === Math.ceil(filteredLog.length / 5)}
                        className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-655 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all bg-white cursor-pointer"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Add Note, responsibles and pending balance */}
          <div className="space-y-6">
            {/* Agregar Nota Interna Card */}
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-4">
              <p className="text-[10px] font-bold text-slate-450 uppercase tracking-wider border-b border-slate-100 pb-2">Agregar Nota Interna</p>
              
              <div className="space-y-3 text-xs text-slate-700">
                <div>
                  <textarea 
                    id="add-note-textarea"
                    rows={4}
                    placeholder="Escribe una nota detallada sobre el cliente o transacción..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:border-blue-500 outline-none font-medium resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Tipo de entrada</label>
                  <select
                    value={noteType}
                    onChange={e => setNoteType(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="Nota interna">Nota interna</option>
                    <option value="Seguimiento telefónico">Seguimiento telefónico</option>
                    <option value="Alerta">Alerta</option>
                  </select>
                </div>

                <button
                  onClick={handleSaveNote}
                  disabled={isSavingNote}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  {isSavingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Guardar Nota
                </button>
              </div>
            </div>

            {/* Responsibles Card */}
            <div className="rounded-2xl bg-white border border-slate-150 shadow-sm p-6 space-y-4">
              <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider border-b border-slate-100 pb-2">Responsable de Cartera</p>
              
              <div className="space-y-4 text-xs font-semibold text-slate-750">
                {(() => {
                  const resp = getResponsible();
                  return (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-150 flex items-center justify-center font-bold text-blue-650 text-[10px] uppercase">
                          {resp.initials}
                        </div>
                        <div>
                          <p className="font-bold text-slate-850 uppercase">{resp.name}</p>
                          <p className="text-[9px] text-[#64748B] uppercase tracking-wider font-semibold">{resp.role}</p>
                        </div>
                      </div>
                      <a href={`mailto:${resp.email}`} className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:text-slate-655 shadow-sm transition-colors">
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Saldo Pendiente Card */}
            <div className="rounded-2xl bg-blue-600 p-6 text-white space-y-4 shadow-md relative overflow-hidden group">
              <Zap className="absolute top-[-5%] left-[-5%] w-32 h-32 opacity-10 text-white" />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-white/70 mb-0.5">Saldo Pendiente</p>
                <h4 className="text-3xl font-bold tracking-tight text-white">{formatCLP(selectedClient.pendingBalance)}</h4>
              </div>
              <div className="border-t border-white/20 pt-4 flex justify-between items-center text-[10px] font-semibold text-white/80">
                <span>Próxima Cuota</span>
                <span className="font-bold">{selectedClient.nextDueDate ? formatDate(selectedClient.nextDueDate) : "No calculado"}</span>
                <span>Monto</span>
                <span className="font-bold">{formatCLP(selectedClient.valor_cuota)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Payment Modal Overlay */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <h3 className="text-base font-bold text-slate-800 uppercase tracking-wider">Registrar Pago Manual</h3>
              <button 
                onClick={() => setShowPaymentModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-450 hover:text-slate-700 border border-transparent hover:border-slate-200 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterPayment} className="space-y-4 text-xs font-semibold text-slate-750">
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-450">Monto del Pago ($)</label>
                <input 
                  type="number" 
                  value={paymentForm.amount || ""}
                  onChange={e => setPaymentForm({...paymentForm, amount: Number(e.target.value)})}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:border-blue-500 outline-none"
                  placeholder="Monto en CLP"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-455">Fecha del Pago</label>
                <input 
                  type="date" 
                  value={paymentForm.paidAt}
                  onChange={e => setPaymentForm({...paymentForm, paidAt: e.target.value})}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:border-blue-500 outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-455">Cantidad de Cuotas que amortiza</label>
                <input 
                  type="number" 
                  min={1}
                  value={paymentForm.installmentsCount}
                  onChange={e => setPaymentForm({...paymentForm, installmentsCount: Math.max(1, Number(e.target.value))})}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-750 focus:border-blue-500 outline-none"
                  required
                />
              </div>

              <div className="flex items-center gap-2 py-2">
                <input 
                  type="checkbox" 
                  id="is-pie-checkbox"
                  checked={paymentForm.isPie}
                  onChange={e => setPaymentForm({...paymentForm, isPie: e.target.checked})}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="is-pie-checkbox" className="text-xs text-slate-650 cursor-pointer">Registrar como pago de PIE</label>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-455">Comprobante de Pago (Imagen/PDF - Opcional)</label>
                <input 
                  type="file" 
                  accept="image/*,application/pdf"
                  onChange={e => setPaymentFile(e.target.files?.[0] || null)}
                  className="w-full border border-slate-200 bg-slate-50/50 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 cursor-pointer focus:border-blue-500 outline-none file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-50 file:text-blue-750 hover:file:bg-blue-100"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-655 rounded-xl font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRegisteringPayment}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  {isRegisteringPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Registrar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {isPreviewOpen && (
        <PreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          url={previewData.url}
          title={previewData.title}
          fileType={previewData.type}
        />
      )}

      {showPOV && (
        <ClientPOVModal 
          reservationId={selectedClient.id} 
          clientName={selectedClient.clientName} 
          onClose={() => setShowPOV(false)} 
        />
      )}

      {/* Ajustes de Mora Modal Overlay */}
      {showMoraModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 my-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-slate-800 uppercase tracking-wider">Ajustes de Mora</h3>
              </div>
              <button 
                onClick={() => setShowMoraModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-450 hover:text-slate-700 border border-transparent hover:border-slate-200 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-6 text-xs font-semibold text-slate-750">
              
              {/* Mora Status Selector */}
              <div className="space-y-2">
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Estado Financiero (Mora)</label>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button 
                    type="button"
                    onClick={() => setMoraForm({...moraForm, mora_status: "ACTIVO"})} 
                    className={cn(
                      "flex-1 py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                      moraForm.mora_status === "ACTIVO" 
                        ? "bg-red-50 border-red-300 text-red-600 shadow-sm" 
                        : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                    )}
                  >
                    Activo Con Mora
                  </button>
                  <button 
                    type="button"
                    onClick={() => setMoraForm({...moraForm, mora_status: "AL_DIA"})} 
                    className={cn(
                      "flex-1 py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                      moraForm.mora_status === "AL_DIA" 
                        ? "bg-emerald-50 border-emerald-300 text-emerald-600 shadow-sm" 
                        : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                    )}
                  >
                    Al Día Sin Mora
                  </button>
                  <button 
                    type="button"
                    onClick={() => setMoraForm({...moraForm, mora_status: "CONGELADO"})} 
                    className={cn(
                      "flex-1 py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                      moraForm.mora_status === "CONGELADO" 
                        ? "bg-blue-50 border-blue-300 text-blue-600 shadow-sm" 
                        : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                    )}
                  >
                    Congelado (Pausado)
                  </button>
                </div>
              </div>

              {/* Penalty Mode Selector (only if ACTIVO) */}
              {moraForm.mora_status === "ACTIVO" && (
                <div className="p-4 bg-slate-50/50 border border-slate-150 rounded-2xl space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Modo de Cálculo de Penalización</label>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <button 
                        type="button"
                        onClick={() => setMoraForm({...moraForm, penalty_mode: "AUTO"})} 
                        className={cn(
                          "flex-1 py-2.5 px-3 rounded-xl text-[9px] font-bold tracking-wider uppercase transition-all border cursor-pointer",
                          moraForm.penalty_mode === "AUTO" 
                            ? "bg-slate-100 border-slate-300 text-slate-800 shadow-inner font-black" 
                            : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                        )}
                      >
                        Por Fecha (Auto)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setMoraForm({...moraForm, penalty_mode: "MIXED"})} 
                        className={cn(
                          "flex-1 py-2.5 px-3 rounded-xl text-[9px] font-bold tracking-wider uppercase transition-all border cursor-pointer",
                          moraForm.penalty_mode === "MIXED" 
                            ? "bg-slate-100 border-slate-350 text-slate-800 shadow-inner font-black" 
                            : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                        )}
                      >
                        Mixto (Fijo+Auto)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setMoraForm({...moraForm, penalty_mode: "FIXED"})} 
                        className={cn(
                          "flex-1 py-2.5 px-3 rounded-xl text-[9px] font-bold tracking-wider uppercase transition-all border cursor-pointer",
                          moraForm.penalty_mode === "FIXED" 
                            ? "bg-slate-100 border-slate-300 text-slate-800 shadow-inner font-black" 
                            : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                        )}
                      >
                        Monto Fijo
                      </button>
                    </div>
                  </div>

                  {/* Mode explanation banner */}
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-800 font-medium leading-relaxed">
                    {moraForm.penalty_mode === "AUTO" && "La multa se calcula automáticamente multiplicando los días de atraso por el interés diario configurado."}
                    {moraForm.penalty_mode === "MIXED" && "Se cobra un monto fijo histórico, más el cálculo automático para cuotas nuevas que vayan venciendo."}
                    {moraForm.penalty_mode === "FIXED" && "Solo se cobra el monto fijo definido manualmente, ignorando fechas de atraso y días."}
                  </div>

                  {/* Manual Penalty Input */}
                  {(moraForm.penalty_mode === "FIXED" || moraForm.penalty_mode === "MIXED") && (
                    <div className="space-y-1.5 animate-fade-in">
                      <label className="block text-[9px] uppercase tracking-wider text-red-500 font-bold">Monto de Multa Fijo ($)</label>
                      <input 
                        type="number" 
                        value={moraForm.manual_penalty || 0}
                        onChange={e => setMoraForm({...moraForm, manual_penalty: Number(e.target.value)})}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-850 focus:border-red-400 outline-none"
                        placeholder="Monto en CLP"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Debt Date Ranges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Inicio Deuda (Fuerza Mora)</label>
                  <input 
                    type="date" 
                    value={moraForm.debt_start_date}
                    onChange={e => setMoraForm({...moraForm, debt_start_date: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-750 focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Fin Deuda (Opcional)</label>
                  <input 
                    type="date" 
                    value={moraForm.debt_end_date}
                    onChange={e => setMoraForm({...moraForm, debt_end_date: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-750 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMoraModal(false)}
                  className="flex-1 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-655 rounded-xl font-bold transition-all cursor-pointer text-center"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveMora}
                  disabled={isSavingMoraSettings}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-650 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  {isSavingMoraSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Aplicar Ajustes de Mora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
