"use client";

import { useEffect, useState, useMemo } from "react";
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
import ClientDetailView from "@/components/admin/ClientDetailView";

export default function ClientsPage() {
  const { search, setSearch, selectedClientId, setSelectedClientId, selectedClientProject, setSelectedClientProject } = useSearch();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "LATE" | "GRACE" | "UPCOMING" | "OK">("ALL");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  
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
    if (selectedClientId) {
      if (selectedClientProject && selectedClientProject !== selectedProject) {
        setSelectedProject(selectedClientProject);
        return;
      }
      if (data?.data) {
        const client = data.data.find((c: any) => c.id === selectedClientId);
        if (client) {
          setSelectedClient(client);
          setSelectedClientId(null);
          setSelectedClientProject(null);
          setSearch("");
        }
      }
    }
  }, [selectedClientId, selectedClientProject, data?.data, selectedProject]);

  useEffect(() => {
    setSelectedClientIds([]);
  }, [selectedProject, selectedStage, activeTab, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedStage, selectedProject, activeTab]);

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
          type: d.type || 'table'
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

  const stats = useMemo(() => {
    return {
      total: nonTestClients.length,
      late: nonTestClients.filter((c: any) => c.status === "LATE").length,
      grace: nonTestClients.filter((c: any) => c.status === "GRACE").length,
      upcoming: nonTestClients.filter((c: any) => c.status === "UPCOMING").length,
      ok: nonTestClients.filter((c: any) => c.status === "OK" || c.status === "COMPLETED").length,
    };
  }, [nonTestClients]);

  const filteredClients = rawClients.filter((c: any) => {
    const isTestClient = isTest(c);
    const matchesSearch = !search ||
      c.clientName?.toLowerCase().includes(search.toLowerCase()) ||
      c.clientEmail?.toLowerCase().includes(search.toLowerCase()) ||
      c.rut?.toLowerCase().includes(search.toLowerCase()) ||
      c.lotNumber?.toString().toUpperCase().includes(search.toUpperCase());
    
    if (selectedStage === "PRUEBAS") {
      if (!isTestClient) return false;
    } else {
      if (isTestClient) return false;
    }

    if (selectedStage === "MULTILOTE") {
      if (!c.isMultiLot) return false;
    } else if (selectedStage !== "ALL" && selectedStage !== "PRUEBAS") {
      if (!c.lotStage || c.lotStage.toString().toUpperCase() !== selectedStage.toUpperCase()) return false;
    }

    if (activeTab === "LATE" && c.status !== "LATE") return false;
    if (activeTab === "GRACE" && c.status !== "GRACE") return false;
    if (activeTab === "UPCOMING" && c.status !== "UPCOMING") return false;
    if (activeTab === "OK" && c.status !== "OK" && c.status !== "COMPLETED") return false;

    return matchesSearch;
  });

  const handleExportCSV = () => {
    const listToExport = selectedClientIds.length > 0
      ? filteredClients.filter((c: any) => selectedClientIds.includes(c.id))
      : filteredClients;

    const headers = ["Cliente", "RUT", "Email", "Teléfono", "Lote", "Etapa", "Cuotas Pagadas", "Total Cuotas", "Estado", "Saldo Pendiente"];
    const rows = listToExport.map((c: any) => [
      c.clientName || "",
      c.rut || "",
      c.clientEmail || "",
      c.clientPhone || "",
      `Lote ${c.lotNumber || ""}`,
      c.lotStage || "",
      c.paidCuotas || 0,
      c.totalCuotas || 0,
      c.status === "LATE" ? "MORA" : c.status === "FROZEN" ? "CONGELADO" : c.status === "GRACE" ? "GRACIA" : c.status === "UPCOMING" ? "AVISO" : "AL DÍA",
      c.pendingBalance || 0
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((row: any) => row.map((val: any) => `"${val.toString().replace(/"/g, '""')}"`).join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Clientes_${selectedProject}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (selectedClient) {
    return (
      <ClientDetailView
        selectedClient={selectedClient}
        onBack={() => setSelectedClient(null)}
        onUpdate={async () => {
          await refreshMainData();
          const freshData = await getFullPostventaData({ projectSlug: selectedProject });
          const updatedClient = (freshData?.data || []).find((c: any) => c.id === selectedClient.id);
          if (updatedClient) setSelectedClient(updatedClient);
        }}
        projectSlug={selectedProject}
      />
    );
  }

  return (
    <div className="w-full text-[#191c1e] font-sans">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8 border-b border-[#E2E8F0] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Database & CRM</p>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-[#191c1e] font-headline-lg">Directorio de Clientes</h2>
          <p className="text-sm text-[#64748B] mt-1">Gestión integral de cartera y estado de cuenta.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]/50" />
            <input
              type="text"
              placeholder="Filtrar por nombre o RUT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10 focus:outline-none transition-all placeholder:text-[#64748B]/40 text-[#191c1e]"
            />
          </div>
          
          {/* Project select */}
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#191c1e] font-medium focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10 focus:outline-none cursor-pointer hover:bg-slate-50 transition-all min-w-[200px]"
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "1rem" }}
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug} className="bg-white text-[#191c1e]">{p.name}</option>
            ))}
          </select>

          {/* Stage select */}
          {(selectedProject?.toLowerCase().includes("libertad") || selectedProject?.toLowerCase().includes("alegria")) && (
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-[#191c1e] font-medium focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/10 focus:outline-none cursor-pointer hover:bg-slate-50 transition-all min-w-[150px]"
              style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "1rem" }}
            >
              <option value="ALL">Filtro de Etapas: Todas</option>
              {testClients.length > 0 && <option value="PRUEBAS">Clientes Pruebas</option>}
              {uniqueStages.map((stage) => (
                <option key={stage} value={stage}>Etapa {stage}</option>
              ))}
            </select>
          )}

          {/* Export button */}
          <button 
            onClick={handleExportCSV}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm font-semibold text-[#191c1e] hover:bg-slate-50 transition-all cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4 text-[#64748B]" />
            <span>{selectedClientIds.length > 0 ? `Exportar (${selectedClientIds.length})` : "Exportar"}</span>
          </button>
        </div>
      </div>

      {/* Tabs and Counts */}
      {!loading && rawClients.length > 0 && (
        <div className="flex overflow-x-auto pb-2 mb-6 border-b border-[#E2E8F0] hide-scrollbar gap-2">
          {/* Tab: Todos */}
          <button
            onClick={() => setActiveTab("ALL")}
            className={`px-4 py-2 text-xs font-semibold tracking-wider whitespace-nowrap transition-all border-b-2 cursor-pointer ${
              activeTab === "ALL" 
                ? "border-[#1D4ED8] text-[#1D4ED8] font-bold" 
                : "border-transparent text-[#64748B] hover:text-[#1D4ED8]"
            }`}
          >
            Todos los Clientes 
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === "ALL" ? "bg-[#1D4ED8]/10 text-[#1D4ED8]" : "bg-slate-100 text-slate-600"
            }`}>
              {stats.total}
            </span>
          </button>
          
          {/* Tab: En Mora */}
          <button
            onClick={() => setActiveTab("LATE")}
            className={`px-4 py-2 text-xs font-semibold tracking-wider whitespace-nowrap transition-all border-b-2 cursor-pointer ${
              activeTab === "LATE" 
                ? "border-[#EF4444] text-[#EF4444] font-bold" 
                : "border-transparent text-[#64748B] hover:text-[#EF4444]"
            }`}
          >
            En Mora (Crítico) 
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === "LATE" ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-red-50 text-red-500 border border-red-100"
            }`}>
              {stats.late}
            </span>
          </button>

          {/* Tab: Días de Gracia */}
          <button
            onClick={() => setActiveTab("GRACE")}
            className={`px-4 py-2 text-xs font-semibold tracking-wider whitespace-nowrap transition-all border-b-2 cursor-pointer ${
              activeTab === "GRACE" 
                ? "border-[#F59E0B] text-[#F59E0B] font-bold" 
                : "border-transparent text-[#64748B] hover:text-[#F59E0B]"
            }`}
          >
            Días de Gracia 
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === "GRACE" ? "bg-[#F59E0B]/10 text-[#F59E0B]" : "bg-amber-50 text-amber-600 border border-amber-100"
            }`}>
              {stats.grace}
            </span>
          </button>

          {/* Tab: Próximos Venc. */}
          <button
            onClick={() => setActiveTab("UPCOMING")}
            className={`px-4 py-2 text-xs font-semibold tracking-wider whitespace-nowrap transition-all border-b-2 cursor-pointer ${
              activeTab === "UPCOMING" 
                ? "border-[#6366F1] text-[#6366F1] font-bold" 
                : "border-transparent text-[#64748B] hover:text-[#6366F1]"
            }`}
          >
            Próximos Venc. 
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === "UPCOMING" ? "bg-[#6366F1]/10 text-[#6366F1]" : "bg-indigo-50 text-indigo-600 border border-indigo-100"
            }`}>
              {stats.upcoming}
            </span>
          </button>

          {/* Tab: Al Día */}
          <button
            onClick={() => setActiveTab("OK")}
            className={`px-4 py-2 text-xs font-semibold tracking-wider whitespace-nowrap transition-all border-b-2 cursor-pointer ${
              activeTab === "OK" 
                ? "border-[#10B981] text-[#10B981] font-bold" 
                : "border-transparent text-[#64748B] hover:text-[#10B981]"
            }`}
          >
            Al Día 
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
              activeTab === "OK" ? "bg-[#10B981]/10 text-[#10B981]" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
            }`}>
              {stats.ok}
            </span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-[#1D4ED8]" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#64748B] opacity-60">Analizando Base de Datos...</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F1F5F9] border-b border-[#E2E8F0]">
                  <th className="px-6 py-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={filteredClients.length > 0 && filteredClients.every((c: any) => selectedClientIds.includes(c.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedClientIds(filteredClients.map((c: any) => c.id));
                        } else {
                          setSelectedClientIds([]);
                        }
                      }}
                      className="w-4 h-4 text-blue-600 border-[#E2E8F0] rounded focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Nombre del Cliente</th>
                  <th className="px-6 py-4 text-xs font-semibold text-[#64748B] uppercase tracking-wider">RUT</th>
                  <th className="px-6 py-4 text-xs font-semibold text-[#64748B] uppercase tracking-wider text-center">Lote</th>
                  <th className="px-6 py-4 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Progreso de Cuotas</th>
                  <th className="px-6 py-4 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Estado de Pago</th>
                  <th className="px-6 py-4 text-xs font-semibold text-[#64748B] uppercase tracking-wider text-right">Saldo Pendiente</th>
                  <th className="px-6 py-4 text-xs font-semibold text-[#64748B] uppercase tracking-wider text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-sm text-[#191c1e]">
                {paginatedClients.map((c: any) => {
                  const isLate = c.status === "LATE";
                  const isGrace = c.status === "GRACE";
                  const isUpcoming = c.status === "UPCOMING";
                  const isContado = c.status === "COMPLETED";

                  let clientNameColor = "text-slate-800";
                  if (isLate) clientNameColor = "text-red-650";
                  else if (isGrace) clientNameColor = "text-amber-700";

                  let avatarBg = "bg-blue-50 text-blue-600 border border-blue-100";
                  if (isLate) avatarBg = "bg-red-50 text-red-600 border border-red-200";
                  else if (isGrace) avatarBg = "bg-amber-50 text-amber-700 border border-amber-200";
                  else if (isUpcoming) avatarBg = "bg-indigo-50 text-indigo-700 border border-indigo-200";
                  else if (isContado) avatarBg = "bg-emerald-50 text-emerald-700 border border-emerald-200";

                  let progressBarColor = "bg-[#1D4ED8]";
                  if (isLate) progressBarColor = "bg-[#EF4444]";
                  else if (isGrace) progressBarColor = "bg-[#F59E0B]";
                  else if (isUpcoming) progressBarColor = "bg-[#6366F1]";
                  else if (isContado) progressBarColor = "bg-[#10B981]";

                  let balanceColor = "text-[#191c1e]";
                  if (isLate) balanceColor = "text-[#EF4444]";

                  let badgeStyle = "bg-[#D1FAE5] text-[#10B981] border-[#10B981]/20";
                  let dotColor = "bg-[#10B981]";
                  let badgeText = "Al Día";

                  if (isLate) {
                    badgeStyle = "bg-[#FEE2E2] text-[#EF4444] border-[#EF4444]/20";
                    dotColor = "bg-[#EF4444]";
                    badgeText = `En Mora (${c.lateDays}d)`;
                  } else if (isGrace) {
                    badgeStyle = "bg-[#FEF3C7] text-[#F59E0B] border-[#F59E0B]/20";
                    dotColor = "bg-[#F59E0B]";
                    badgeText = "Días de Gracia";
                  } else if (isUpcoming) {
                    badgeStyle = "bg-[#E0E7FF] text-[#6366F1] border-[#6366F1]/20";
                    dotColor = "bg-[#6366F1]";
                    badgeText = "Aviso Próximo";
                  } else if (isContado) {
                    badgeStyle = "bg-[#D1FAE5] text-[#10B981] border-[#10B981]/20";
                    dotColor = "bg-[#10B981]";
                    badgeText = "Contado";
                  } else if (c.status === "FROZEN") {
                    badgeStyle = "bg-slate-100 text-slate-500 border-slate-200";
                    dotColor = "bg-slate-450";
                    badgeText = "Congelado";
                  }

                  const initials = c.clientName 
                    ? c.clientName.split(" ").filter(Boolean).map((n: string) => n[0]).join("").substring(0, 2).toUpperCase() 
                    : "CL";

                  return (
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
                      className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 text-center w-12" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedClientIds.includes(c.id)}
                          onChange={(e) => {
                            setSelectedClientIds(prev =>
                              prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                            );
                          }}
                          className="w-4 h-4 text-blue-600 border-slate-350 rounded focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0 shadow-sm ${avatarBg}`}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className={`text-sm font-bold truncate uppercase leading-none group-hover:opacity-85 transition-opacity ${clientNameColor}`}>
                                {c.clientName}
                              </p>
                              {c.isMultiLot && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] font-semibold text-[#B45309] uppercase tracking-wider">Multi-Lote</span>
                              )}
                              {c.internalStatus === 'ARCHIVED' && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">H-VERIFY</span>
                              )}
                              {c.observation && (
                                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1D4ED8]/10 border border-[#1D4ED8]/20 text-[9px] font-semibold text-[#1D4ED8] uppercase tracking-wider">
                                  <FileText className="w-2.5 h-2.5" />
                                  <span>NOTA</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[#64748B] lowercase truncate">{c.clientEmail}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-650">
                        {c.rut || "SIN RUT"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-center">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 group-hover:border-[#1D4ED8]/30 transition-colors">
                            <Hash className="w-3.5 h-3.5 text-[#B45309]" />
                            <span className="text-xs font-bold text-[#191c1e]">Lote {c.lotNumber}</span>
                          </div>
                          {c.lotStage && <p className="text-[9px] text-[#64748B] uppercase tracking-wider mt-1.5">Etapa {c.lotStage}</p>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-2 min-w-[150px]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#64748B] font-medium">{c.paidCuotas}/{c.totalCuotas} Cuotas</span>
                            <span className={`${isLate ? 'text-red-500 font-bold' : 'text-[#1D4ED8] font-bold'}`}>{c.totalCuotas > 0 ? Math.round((c.paidCuotas / c.totalCuotas) * 100) : 0}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200/50">
                            <div 
                              className={`h-full transition-all duration-500 ${progressBarColor}`}
                              style={{ 
                                width: c.totalCuotas > 0 ? `${(c.paidCuotas / c.totalCuotas) * 100}%` : '100%'
                              }} 
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider border ${badgeStyle}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                          {badgeText}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className={`text-base font-bold italic tracking-tight group-hover:opacity-90 transition-opacity ${balanceColor}`}>{formatCLP(c.pendingBalance)}</p>
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={async () => {
                              try {
                                let pass = c.temp_password;
                                
                                if (!pass) {
                                  toast.loading("Generando contraseña...", { id: `gen-pass-${c.id}` });
                                  const res = await generateTemporaryPassword(c.id);
                                  if (res.success) {
                                    pass = res.tempPassword;
                                    toast.success("Contraseña generada", { id: `gen-pass-${c.id}` });
                                    
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
                                        toast.success("Copiada");
                                      }
                                    }
                                  });
                                }
                              } catch (err) {
                                console.error("Error in password click:", err);
                                toast.error("Error al gestionar credenciales");
                              }
                            }}
                            title="Gestionar Contraseña"
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                              c.temp_password 
                                ? "bg-[#1D4ED8]/10 text-[#1D4ED8] border border-[#1D4ED8]/20 shadow-sm" 
                                : "bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200 hover:text-slate-600"
                            }`}
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
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
                            title="Ver Ficha Técnica"
                            className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center transition-all"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {paginatedClients.length === 0 && (
            <div className="text-center py-40 flex flex-col items-center justify-center">
              <Target className="w-16 h-16 mb-4 text-slate-300 opacity-50" />
              <p className="text-sm font-semibold uppercase tracking-wider text-[#64748B]">Búsqueda sin resultados en este proyecto</p>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="border-t border-[#E2E8F0] bg-slate-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs font-semibold text-[#64748B]">
                Página <span className="text-[#1D4ED8] font-bold">{currentPage}</span> de <span className="text-slate-600">{totalPages}</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg bg-white border border-[#E2E8F0] text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  Anterior
                </button>
                <div className="hidden sm:flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold transition-all cursor-pointer ${currentPage === page ? "bg-[#1D4ED8] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-lg bg-white border border-[#E2E8F0] text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}


    </div>
  );
}
