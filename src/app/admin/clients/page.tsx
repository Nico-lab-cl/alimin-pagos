"use client";

import { useEffect, useState } from "react";
import { getAdminProjects, getFullPostventaData, updateClientProfile, updateClientFinancials, toggleMultiLot, toggleAlContado, registerManualPayment, activateClientProfile, deletePaymentReceipt, updateMoraDates, getFinancialHistory, generateTemporaryPassword } from "@/actions/postventa";
import { uploadDocument, deleteDocument, getReservationDocuments } from "@/actions/documents";
import PreviewModal from "@/components/shared/PreviewModal";
import { formatCLP, formatDate } from "@/lib/utils";
import { Loader2, Search, User, Mail, ChevronRight, MapPin, Hash, Target, Phone, Users, X, Calendar, DollarSign, Activity, FileText, AlertTriangle, CheckCircle2, Save, Edit3, Upload, Trash2, FolderOpen, FileCheck2, Download, Eye, Key, ShieldAlert, Lock } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import ClientPOVModal from "@/components/admin/ClientPOVModal";
import { format } from "date-fns";
import { toast } from "sonner";

import { useSearch } from "@/context/SearchContext";
import ClientDetailModal from "@/components/admin/ClientDetailModal";

export default function ClientsPage() {
  const { search, setSearch } = useSearch();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editMsg, setEditMsg] = useState({ text: "", type: "" });
  const [editForm, setEditForm] = useState({ name: "", email: "", rut: "", phone: "", observation: "" });
  
  // Financial Edit State
  const [isEditingFin, setIsEditingFin] = useState(false);
  const [isSavingFin, setIsSavingFin] = useState(false);
  const [editFinMsg, setEditFinMsg] = useState({ text: "", type: "" });
  const [finForm, setFinForm] = useState({
    price_total_clp: 0,
    reservation_price: 0,
    pie: 0,
    cuotas: 0,
    valor_cuota: 0,
    last_installment_value: 0,
    installments_paid: 0,
    daily_penalty: 0,
    due_day: 5,
    grace_days: 5,
    mora_frozen: false,
    mora_status: "ACTIVO",
    penalty_mode: "AUTO",
    manual_penalty: 0,
    extra_paid_amount: 0,
    installment_ranges: [] as any[],
    debt_start_date: "",
    debt_end_date: "",
    next_payment_date: "",
    installment_start_date: ""
  });

  // Document State
  const [docs, setDocs] = useState<any[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState({ url: "", title: "", type: "" });
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docName, setDocName] = useState("");
  const [isTogglingMultiLot, setIsTogglingMultiLot] = useState(false);
  const [isTogglingAlContado, setIsTogglingAlContado] = useState(false);
  const [showPOV, setShowPOV] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  // Manual Payment State
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [isRegisteringPayment, setIsRegisteringPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    installmentsCount: 1,
    paidAt: new Date().toISOString().split("T")[0],
    isPie: false
  });
  const [manualPaymentFile, setManualPaymentFile] = useState<File | null>(null);

  // Manual Mora State
  const [moraStartDate, setMoraStartDate] = useState<string | null>(null);
  const [moraEndDate, setMoraEndDate] = useState<string | null>(null);
  const [isUpdatingMora, setIsUpdatingMora] = useState(false);

  // Financial History State
  const [financialHistory, setFinancialHistory] = useState<any[]>([]);
  const [loadingFinHistory, setLoadingFinHistory] = useState(false);

  const itemsPerPage = 10;

  const refreshMainData = async () => {
    if (!selectedProject) return;
    setLoading(true);
    const result = await getFullPostventaData({ projectSlug: selectedProject });
    setData(result);
    setLoading(false);
  };

  useEffect(() => {
    getAdminProjects().then((result) => {
      if (result.projects?.length) {
        setProjects(result.projects);
        setSelectedProject(result.projects[0].slug);
      }
    });
  }, []);

  useEffect(() => {
    refreshMainData();
  }, [selectedProject]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedStage, selectedProject]);

  const refreshDocs = async (clientId: string, clientData: any) => {
    setLoadingDocs(true);
    try {
      const res = await getReservationDocuments(clientId);
      if (res.documents) {
        const tableDocs = res.documents.map((d: any) => ({
          id: d.id,
          name: d.name,
          date: d.created_at,
          url: `/api/documents/${d.id}`,
          fileType: d.file_type,
          type: 'table'
        }));
        
        const legacyDocs = (clientData.manual_documents || []).map((d: any, i: number) => ({
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

  // Fetch docs and financial history when client is selected
  useEffect(() => {
    if (selectedClient) {
      setDocs([]);
      setFinancialHistory([]);
      refreshDocs(selectedClient.id, selectedClient);
      
      setLoadingFinHistory(true);
      getFinancialHistory(selectedClient.id).then(res => {
        setFinancialHistory(res.history || []);
        setLoadingFinHistory(false);
      });
    }
  }, [selectedClient?.id]);

  const handleManualPayment = async () => {
    if (!selectedClient || isRegisteringPayment) return;
    if (paymentForm.amount <= 0 || paymentForm.installmentsCount <= 0) return;
    
    setIsRegisteringPayment(true);
    try {
      let receiptUrl: string | undefined;

      if (manualPaymentFile) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(manualPaymentFile);
        });
        receiptUrl = await base64Promise;
      }

      const res = await registerManualPayment(selectedClient.id, {
        amount: paymentForm.amount,
        installmentsCount: paymentForm.installmentsCount,
        paidAt: paymentForm.paidAt,
        isPie: paymentForm.isPie,
        receiptUrl
      });
      
      if (res.error) {
        alert(res.error);
      } else {
        setShowManualPayment(false);
        setPaymentForm({ amount: 0, installmentsCount: 1, paidAt: new Date().toISOString().split("T")[0], isPie: false });
        setManualPaymentFile(null);
        // Refresh data
        await refreshMainData();
        // Update selectedClient
        const freshData = await getFullPostventaData({ projectSlug: selectedProject });
        const updatedClient = (freshData?.data || []).find((c: any) => c.id === selectedClient.id);
        if (updatedClient) setSelectedClient(updatedClient);
      }
    } catch (e) {
      alert("Error al procesar pago");
    } finally {
      setIsRegisteringPayment(false);
    }
  };

  const handleUpdateMoraRange = async () => {
    if (!selectedClient || isUpdatingMora) return;
    setIsUpdatingMora(true);
    const res = await updateMoraDates(selectedClient.id, moraStartDate, moraEndDate);
    setIsUpdatingMora(false);
    if (res.error) {
      alert(res.error);
    } else {
      alert(res.message);
      await refreshMainData();
      const freshData = await getFullPostventaData({ projectSlug: selectedProject });
      const updatedClient = (freshData?.data || []).find((c: any) => c.id === selectedClient.id);
      if (updatedClient) setSelectedClient(updatedClient);
    }
  };

  const handleDeleteReceipt = async (receiptId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este comprobante? Si está aprobado, se revertirá el conteo de cuotas.")) return;
    
    const res = await deletePaymentReceipt(receiptId);
    if (res.error) {
      alert(res.error);
    } else {
      alert("Comprobante eliminado");
      await refreshMainData();
      const freshData = await getFullPostventaData({ projectSlug: selectedProject });
      const updatedClient = (freshData?.data || []).find((c: any) => c.id === selectedClient.id);
      if (updatedClient) {
          setSelectedClient(updatedClient);
          refreshDocs(updatedClient.id, updatedClient);
      }
    }
  };

  const rawClients = data?.data || [];
  const isTest = (c: any) => c.clientName?.toLowerCase().includes("nicolas cabrera") || c.clientEmail?.toLowerCase().includes("nicolas");
  const nonTestClients = rawClients.filter((c: any) => !isTest(c));
  const testClients = rawClients.filter((c: any) => isTest(c));

  const uniqueStages: string[] = Array.from(new Set(nonTestClients.map((c: any) => c.lotStage).filter(Boolean)));
  
  const stageCounts = uniqueStages.reduce((acc: any, stage: string) => {
    acc[stage] = nonTestClients.filter((c: any) => c.lotStage === stage).length;
    return acc;
  }, {});

  const filteredClients = rawClients.filter((c: any) => {
    const isTestClient = isTest(c);
    const matchesSearch = !search ||
      c.clientName?.toLowerCase().includes(search.toLowerCase()) ||
      c.clientEmail?.toLowerCase().includes(search.toLowerCase()) ||
      c.lotNumber?.toString().toUpperCase().includes(search.toUpperCase());
    
    if (selectedStage === "PRUEBAS") {
      return matchesSearch && isTestClient;
    }
    
    if (isTestClient) return false;

    if (selectedStage === "MULTILOTE") {
      return matchesSearch && c.isMultiLot;
    }

    const matchesStage = selectedStage === "ALL" || (c.lotStage && c.lotStage.toString().toUpperCase() === selectedStage.toUpperCase());
    
    return matchesSearch && matchesStage;
  });

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-12 animate-fade-in px-4">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-400">Database & CRM</p>
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
            Directorio <span className="text-white/20">Clientes</span>
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative group w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="text"
              placeholder="BUSCAR EXPEDIENTE..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none focus:border-blue-400/40 focus:ring-1 focus:ring-blue-400/20 transition-all"
            />
          </div>
          
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-white/[0.08] transition-all min-w-[200px]"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1.5rem center", backgroundSize: "1rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-[#0c1a1a]">{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs and Counts */}
      {!loading && rawClients.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 animate-fade-in">
          <button
            onClick={() => setSelectedStage("ALL")}
            className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${selectedStage === "ALL" ? "bg-accent/10 border-accent/40 text-accent shadow-[0_0_15px_rgba(212,168,75,0.2)]" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
          >
            Todos ({nonTestClients.length})
          </button>
          
          <button
            onClick={() => setSelectedStage("MULTILOTE")}
            className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${selectedStage === "MULTILOTE" ? "bg-amber-500/10 border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
          >
            Multi-Lotes ({nonTestClients.filter((c: any) => c.isMultiLot).length})
          </button>
          
          {testClients.length > 0 && (
            <button
              onClick={() => setSelectedStage("PRUEBAS")}
              className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${selectedStage === "PRUEBAS" ? "bg-red-500/10 border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
            >
              Pruebas ({testClients.length})
            </button>
          )}

          {uniqueStages.map((stage) => (
            <button
              key={stage}
              onClick={() => setSelectedStage(stage)}
              className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${selectedStage === stage.toString().toUpperCase() || selectedStage === stage ? "bg-accent/10 border-accent/40 text-accent shadow-[0_0_15px_rgba(212,168,75,0.2)]" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
            >
              Etapa {stage} ({stageCounts[stage]})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent" />
          <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Analizando Base de Datos...</p>
        </div>
      ) : (
        <div className="rounded-[3rem] overflow-hidden border border-white/5 glass-card animate-slide-up">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Expediente Cliente</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-center">Propiedad</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Salud Financiera</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Cierre Contractual</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-center">Contraseña</th>
                  <th className="px-8 py-7 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-right">Saldo Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedClients.map((c: any) => (
                  <tr 
                    key={c.id} 
                    onClick={() => {
                      setSelectedClient(c);
                      setIsEditing(false);
                      setIsEditingFin(false);
                      setEditMsg({ text: "", type: "" });
                      setEditFinMsg({ text: "", type: "" });
                      setEditForm({
                        name: c.clientName || "",
                        email: c.clientEmail || "",
                        rut: c.rut || "",
                        phone: c.clientPhone || "",
                        observation: c.observation || ""
                      });
                      setFinForm({
                        price_total_clp: c.totalToPay || 0,
                        reservation_price: c.reservation_price || 0,
                        pie: c.pie || 0,
                        cuotas: c.totalCuotas || 0,
                        valor_cuota: c.valor_cuota || 0,
                        last_installment_value: c.last_installment_value || c.valor_cuota || 0,
                        installments_paid: c.paidCuotas || 0,
                        daily_penalty: c.daily_penalty || 10000,
                        due_day: c.due_day || 5,
                        grace_days: c.grace_days || 5,
                        mora_frozen: c.mora_frozen || false,
                        mora_status: c.mora_status || (c.mora_frozen ? "CONGELADO" : "ACTIVO"),
                        penalty_mode: c.penalty_mode || "AUTO",
                        manual_penalty: c.manual_penalty || 0,
                        extra_paid_amount: c.extra_paid_amount || 0,
                        installment_ranges: c.installment_ranges 
                          ? (typeof c.installment_ranges === 'string' ? JSON.parse(c.installment_ranges) : c.installment_ranges)
                          : [],
                        debt_start_date: c.debt_start_date ? new Date(c.debt_start_date).toISOString().split('T')[0] : "",
                        debt_end_date: c.debt_end_date ? new Date(c.debt_end_date).toISOString().split('T')[0] : "",
                        next_payment_date: c.next_payment_date ? new Date(c.next_payment_date).toISOString().split('T')[0] : "",
                        installment_start_date: c.nextDueDate ? new Date(c.nextDueDate).toISOString().split('T')[0] : ""
                      });
                    }}
                    className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <td className="px-8 py-7">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-blue-400 group-hover:text-[#061010] group-hover:shadow-[0_0_20px_rgba(96,165,250,0.4)] transition-all duration-500">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <p className="text-lg font-black text-white italic tracking-tighter group-hover:text-blue-400 transition-colors truncate uppercase leading-none">{c.clientName}</p>
                            {c.isMultiLot && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[8px] font-black text-amber-400 uppercase tracking-widest">Multi-Lote</span>
                            )}
                            {c.internalStatus === 'ARCHIVED' && (
                              <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[8px] font-black text-white/40 uppercase tracking-widest">H-VERIFY</span>
                            )}
                            {c.observation && (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-[8px] font-black text-accent uppercase tracking-widest animate-pulse">
                                <FileText className="w-2.5 h-2.5" />
                                <span>NOTA</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{c.rut || "SIN RUT"}</span>
                            <div className="w-1 h-1 rounded-full bg-white/5" />
                            <span className="text-[10px] font-bold text-white/20 lowercase tracking-tight opacity-40 group-hover:opacity-80 transition-opacity">{c.clientEmail}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div className="flex flex-col items-center">
                        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 group-hover:border-accent/40 transition-colors">
                          <Hash className="w-3.5 h-3.5 text-accent" />
                          <span className="text-xs font-black text-white">Lote {c.lotNumber}</span>
                        </div>
                        {c.lotStage && <p className="text-[9px] font-black text-white/20 mt-2 uppercase tracking-widest">Etapa {c.lotStage}</p>}
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div className="space-y-3 min-w-[160px]">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                          <span className="opacity-20">{c.paidCuotas}/{c.totalCuotas} Cuotas</span>
                          <span className="text-accent">{Math.round((c.paidCuotas / c.totalCuotas) * 100)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                          <div 
                            className="h-full bg-accent group-hover:brightness-125 transition-all duration-1000" 
                            style={{ 
                              width: c.totalCuotas > 0 ? `${(c.paidCuotas / c.totalCuotas) * 100}%` : '100%',
                              boxShadow: "0 0 15px rgba(212,168,75,0.4)"
                            }} 
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div
                        className={`
                          inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl text-[10px] font-black tracking-widest border
                          ${c.status === "LATE" ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : c.status === "FROZEN" ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : c.status === "GRACE" ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                            : c.status === "UPCOMING" ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}
                        `}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse`} style={{ 
                          background: c.status === "LATE" ? "#f87171" 
                            : c.status === "FROZEN" ? "#60a5fa"
                            : c.status === "COMPLETED" ? "#10b981"
                            : c.status === "GRACE" ? "var(--warning)" 
                            : "var(--success)" 
                        }} />
                        {c.status === "LATE" ? "MORA" 
                          : c.status === "FROZEN" ? "CONGELADO"
                          : c.status === "COMPLETED" ? "PAGO CONTADO"
                          : c.status === "GRACE" ? "GRACIA" 
                          : c.status === "UPCOMING" ? "AVISO" 
                          : "AL DÍA"}
                      </div>
                    </td>
                    <td className="px-8 py-7 text-center">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            let pass = c.temp_password;
                            
                            if (!pass) {
                              toast.loading("Generando contraseña temporal...", { id: `gen-pass-${c.id}` });
                              const res = await generateTemporaryPassword(c.id);
                              if (res.success) {
                                pass = res.tempPassword;
                                toast.success("Contraseña generada correctamente", { id: `gen-pass-${c.id}` });
                                
                                // Update local state immediately so the icon turns blue
                                setData((prev: any) => {
                                  if (!prev) return prev;
                                  return {
                                    ...prev,
                                    data: prev.data.map((item: any) => 
                                      item.id === c.id ? { ...item, temp_password: res.tempPassword } : item
                                    )
                                  };
                                });
                              } else {
                                toast.error(res.error || "Error al generar contraseña", { id: `gen-pass-${c.id}` });
                                return;
                              }
                            }

                            if (pass) {
                              toast.success(`Acceso: ${c.clientName}`, {
                                description: `Usuario: ${c.clientEmail}\nClave: ${pass}`,
                                duration: 15000,
                                action: {
                                  label: "Copiar Clave",
                                  onClick: () => {
                                    navigator.clipboard.writeText(pass);
                                    toast.success("Contraseña copiada");
                                  }
                                }
                              });
                            }
                          } catch (err) {
                            console.error("Error in password click:", err);
                            toast.error("Error inesperado al gestionar credenciales");
                          }
                        }}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${c.temp_password ? "bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]" : "bg-white/5 text-white/20 border border-white/5 hover:bg-white/10"}`}
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-8 py-7 text-right">
                      <p className="text-xl font-black text-white italic tracking-tighter group-hover:text-accent transition-colors">{formatCLP(c.pendingBalance)}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-20 mt-1">SVALOR ESTIMADO</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {paginatedClients.length === 0 && (
            <div className="text-center py-40 flex flex-col items-center justify-center">
              <Target className="w-16 h-16 mb-6 opacity-5" />
              <p className="text-sm font-black uppercase tracking-[0.3em] opacity-20">Búsqueda sin resultados en este proyecto</p>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="border-t border-white/5 bg-white/[0.02] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                Mostrando página <span className="text-accent">{currentPage}</span> de <span className="text-white/60">{totalPages}</span>
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Anterior
                </button>
                <div className="hidden sm:flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black transition-all ${currentPage === page ? "bg-accent/20 text-accent border border-accent/40 shadow-[0_0_10px_rgba(212,168,75,0.2)]" : "text-white/40 hover:text-white/80 hover:bg-white/5"}`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Cliente */}
      {selectedClient && (
        <ClientDetailModal
          selectedClient={selectedClient}
          onClose={() => setSelectedClient(null)}
          onUpdate={async () => {
            await refreshMainData();
            const freshData = await getFullPostventaData({ projectSlug: selectedProject });
            const updatedClient = (freshData?.data || []).find((c: any) => c.id === selectedClient.id);
            if (updatedClient) setSelectedClient(updatedClient);
          }}
          projectSlug={selectedProject}
        />
      )}
    </div>
  );
}
