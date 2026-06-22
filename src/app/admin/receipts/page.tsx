"use client";

import { useEffect, useState, useMemo } from "react";
import { getAdminProjects, approveReceipt, rejectReceipt, getAllReceipts } from "@/actions/postventa";
import { formatCLP, cn, getReceiptDownloadFilename, downloadDocument } from "@/lib/utils";
import { toast } from "sonner";
import { 
  Loader2, 
  Check, 
  X, 
  Eye, 
  Download, 
  Search, 
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  FileSpreadsheet,
  FileText
} from "lucide-react";
import Link from "next/link";

export default function ReceiptsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("all");
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const itemsPerPage = 7; // Mockup shows 7 items per page

  // Active tab state: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");

  // Local Search state (filters client and project name)
  const [searchQuery, setSearchQuery] = useState("");

  // Detail Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // Load Projects on mount
  useEffect(() => {
    getAdminProjects().then((result) => {
      if (result.projects?.length) {
        setProjects(result.projects);
      }
    });
  }, []);

  // Load receipts when project changes
  const loadReceipts = () => {
    setLoading(true);
    getAllReceipts(selectedProject).then((result) => {
      setReceipts(result.receipts || []);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadReceipts();
    setCurrentPage(1); // Reset page on project change
  }, [selectedProject]);

  // Handle page reset when switching tabs
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const handleApproveInModal = async (id: string) => {
    setProcessing(id);
    const result = await approveReceipt(id);
    if (result.success) {
      toast.success("Pago Aprobado", {
        description: "El saldo del cliente ha sido actualizado.",
      });
      setSelectedReceipt(null); // Close modal
      loadReceipts();
    } else {
      toast.error(result.error || "Ocurrió un fallo en la validación");
    }
    setProcessing(null);
  };

  const handleConfirmRejectInModal = async () => {
    if (!selectedReceipt) return;
    if (!rejectionReason.trim()) {
      toast.error("Debes especificar un motivo");
      return;
    }
    const id = selectedReceipt.id;
    const reason = rejectionReason;
    
    setProcessing(id);
    const result = await rejectReceipt(id, reason);
    if (result.success) {
      toast.success("Pago Rechazado", {
        description: "El comprobante fue rechazado y el cliente ha sido notificado.",
      });
      setSelectedReceipt(null); // Close modal
      setShowRejectionForm(false);
      setRejectionReason("");
      loadReceipts();
    } else {
      toast.error(result.error || "Error al procesar el rechazo");
    }
    setProcessing(null);
  };

  // Custom date formatter (matches: 12/05/2024)
  const formatReceiptDateSimple = (date: Date | string | null | undefined): string => {
    if (!date) return "—";
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Filter receipts based on Search and Status
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      // 1. Status Filter
      if (activeTab !== "ALL" && r.status !== activeTab) return false;

      // 2. Search
      const q = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        r.reservation?.name?.toLowerCase().includes(q) ||
        r.reservation?.last_name?.toLowerCase().includes(q) ||
        r.reservation?.rut?.toLowerCase().includes(q) ||
        r.lot?.number?.toString().toLowerCase().includes(q) ||
        r.reservation?.project?.name?.toLowerCase().includes(q);
      
      return matchesSearch;
    });
  }, [receipts, activeTab, searchQuery]);

  // Pagination calculations
  const totalItems = filteredReceipts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems);
  const paginatedReceipts = useMemo(() => {
    return filteredReceipts.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredReceipts, currentPage]);

  // Export to Excel/CSV function (Spanish Excel compatible)
  const handleExportExcel = () => {
    const headers = [
      "Fecha de Pago", 
      "Cliente", 
      "RUT", 
      "Proyecto", 
      "Lote", 
      "Etapa", 
      "Monto (CLP)", 
      "Concepto", 
      "Estado", 
      "Motivo de Rechazo"
    ];
    
    const rows = filteredReceipts.map((r: any) => [
      formatReceiptDateSimple(r.created_at),
      `${r.reservation?.name || ""} ${r.reservation?.last_name || ""}`.trim(),
      r.reservation?.rut || "",
      r.reservation?.project?.name || "",
      r.lot?.number || "",
      r.lot?.stage || "",
      r.amount_clp,
      r.scope === "PIE" ? "Pie" : `Cuota ${String(r.nominal_installment_number || r.reservation?.installments_paid || 1).padStart(2, '0')}`,
      r.status === "PENDING" ? "Pendiente" : r.status === "APPROVED" ? "Aprobado" : "Rechazado",
      r.rejection_reason || ""
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(";"), 
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `bandeja_pagos_${activeTab.toLowerCase()}_${selectedProject}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel/CSV exportado exitosamente");
  };

  // Generate page numbers with ellipsis [ < ] [ 1 ] [ 2 ] [ 3 ] [ ... ] [ 6 ] [ > ]
  const renderPageButtons = () => {
    const pages: (number | string)[] = [];
    
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push("ellipsis-1");
      }
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push("ellipsis-2");
      }
      
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }

    return pages.map((p, idx) => {
      if (typeof p === "string") {
        return (
          <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-slate-400 font-bold text-xs">
            ...
          </span>
        );
      }
      
      return (
        <button
          key={p}
          onClick={() => setCurrentPage(p)}
          className={cn(
            "w-8 h-8 rounded-lg text-xs font-bold transition-all border",
            currentPage === p 
              ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
              : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
          )}
        >
          {p}
        </button>
      );
    });
  };

  return (
    <div className="space-y-6 text-slate-800 animate-fade-in font-outfit">
      
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight leading-none">
            Bandeja de Pagos
          </h1>
        </div>

        {/* Header Tools */}
        <div className="flex items-center gap-3">
          {/* Subtle Project dropdown next to layout buttons to preserve multi-project filtering */}
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold uppercase tracking-wider outline-none cursor-pointer hover:bg-slate-50 transition-all shadow-sm focus:border-blue-500"
            style={{ 
              appearance: "none", 
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23475569'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, 
              backgroundRepeat: "no-repeat", 
              backgroundPosition: "right 0.8rem center", 
              backgroundSize: "0.5rem",
              paddingRight: "2rem"
            }}
          >
            <option value="all">TODOS LOS PROYECTOS</option>
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name.toUpperCase()}</option>
            ))}
          </select>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-250 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Exportar Excel
          </button>

          <Link
            href="/admin/clients"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo Ingreso
          </Link>
        </div>
      </div>

      {/* Tabs & Search Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Navigation Tabs (Todos, Pendientes, Aprobados, Rechazados) */}
        <div className="inline-flex p-1 bg-slate-100/90 rounded-2xl border border-slate-200/50 w-fit">
          <button
            onClick={() => setActiveTab("ALL")}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-bold tracking-tight transition-all duration-200",
              activeTab === "ALL"
                ? "bg-white text-slate-800 shadow-sm border border-slate-200/60 font-black"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Todos
          </button>
          <button
            onClick={() => setActiveTab("PENDING")}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-bold tracking-tight transition-all duration-200",
              activeTab === "PENDING"
                ? "bg-white text-slate-800 shadow-sm border border-slate-200/60 font-black"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Pendientes
          </button>
          <button
            onClick={() => setActiveTab("APPROVED")}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-bold tracking-tight transition-all duration-200",
              activeTab === "APPROVED"
                ? "bg-white text-slate-800 shadow-sm border border-slate-200/60 font-black"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Aprobados
          </button>
          <button
            onClick={() => setActiveTab("REJECTED")}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-bold tracking-tight transition-all duration-200",
              activeTab === "REJECTED"
                ? "bg-white text-slate-800 shadow-sm border border-slate-200/60 font-black"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            Rechazados
          </button>
        </div>

        {/* Inline Search Bar (on the right of tabs) */}
        <div className="relative max-w-xs w-full md:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar cliente o proyecto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:border-blue-500 outline-none transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Main Table Container */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4 bg-slate-50 rounded-[2rem] border border-slate-200/50">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Cargando registros...</p>
        </div>
      ) : paginatedReceipts.length === 0 ? (
        <div className="text-center py-32 rounded-[2rem] border border-slate-200/60 bg-slate-50 flex flex-col items-center justify-center p-6">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4 border border-blue-100 shadow-sm">
            <Check className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1 tracking-tight">Sin Comprobantes</h3>
          <p className="text-xs font-medium text-slate-505 max-w-sm">
            No se encontraron comprobantes con el estado actual o los criterios de búsqueda.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-250/60 rounded-[2rem] p-6 shadow-sm">
          
          {/* Table Header Row (Desktop only) */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-black text-slate-400 tracking-wider uppercase border-b border-slate-100 mb-2">
            <div className="col-span-3">Cliente</div>
            <div className="col-span-2">Proyecto</div>
            <div className="col-span-1 text-center">Cuota</div>
            <div className="col-span-2">Monto</div>
            <div className="col-span-1.5">Fecha de Pago</div>
            <div className="col-span-1">Estado</div>
            <div className="col-span-1 text-center">Comprobante</div>
            <div className="col-span-0.5 text-right"></div>
          </div>

          {/* Row Items */}
          <div className="divide-y divide-slate-100">
            {paginatedReceipts.map((receipt: any) => {
              const clientName = `${receipt.reservation?.name || ""} ${receipt.reservation?.last_name || ""}`.trim() || "Cliente Sin Nombre";
              const clientRut = receipt.reservation?.rut || "Sin RUT";
              const projectName = receipt.reservation?.project?.name || "Proyecto Sin Nombre";
              
              // Installment Progress format e.g. "04 / 24" or "Pie"
              let quotaText = "—";
              if (receipt.scope === "PIE") {
                quotaText = "Pie";
              } else {
                const totalCuotas = receipt.lot?.cuotas || 24;
                const instNum = receipt.nominal_installment_number || receipt.reservation?.installments_paid || 1;
                quotaText = `${String(instNum).padStart(2, '0')} / ${String(totalCuotas).padStart(2, '0')}`;
              }

              // Amount Formatted with Space e.g. "$ 1.450.000"
              const formattedMonto = `$ ${receipt.amount_clp.toLocaleString("es-CL")}`;

              return (
                <div
                  key={receipt.id}
                  className="grid grid-cols-1 md:grid-cols-12 items-center gap-4 py-4 px-4 hover:bg-slate-50/50 transition-all rounded-xl"
                >
                  {/* Column 1: Cliente */}
                  <div className="col-span-3">
                    <span className="md:hidden block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente:</span>
                    <div className="font-bold text-slate-800 text-sm leading-tight">{clientName}</div>
                    <div className="text-slate-400 text-xs mt-0.5 font-medium">{clientRut}</div>
                  </div>

                  {/* Column 2: Proyecto */}
                  <div className="col-span-2 text-slate-650 text-xs font-semibold">
                    <span className="md:hidden block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Proyecto:</span>
                    {projectName}
                  </div>

                  {/* Column 3: Cuota */}
                  <div className="col-span-1 text-slate-650 text-xs font-bold md:text-center">
                    <span className="md:hidden block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cuota:</span>
                    {quotaText}
                  </div>

                  {/* Column 4: Monto */}
                  <div className="col-span-2 font-bold text-slate-900 text-sm">
                    <span className="md:hidden block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Monto:</span>
                    {formattedMonto}
                  </div>

                  {/* Column 5: Fecha de Pago */}
                  <div className="col-span-1.5 text-slate-500 text-xs font-semibold">
                    <span className="md:hidden block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha de Pago:</span>
                    {formatReceiptDateSimple(receipt.created_at)}
                  </div>

                  {/* Column 6: Estado */}
                  <div className="col-span-1">
                    <span className="md:hidden block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Estado:</span>
                    {receipt.status === "PENDING" && (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/50">
                        Pendiente
                      </span>
                    )}
                    {receipt.status === "APPROVED" && (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                        Aprobado
                      </span>
                    )}
                    {receipt.status === "REJECTED" && (
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200/50">
                        Rechazado
                      </span>
                    )}
                  </div>

                  {/* Column 7: Comprobante */}
                  <div className="col-span-1 flex items-center md:justify-center gap-1.5">
                    <span className="md:hidden block text-[9px] font-bold text-slate-400 uppercase tracking-wider mr-auto">Comprobante:</span>
                    <button
                      onClick={() => setPreviewUrl(receipt.receipt_url)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-650 hover:bg-slate-100 transition-colors"
                      title="Previsualizar Comprobante"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => downloadDocument(receipt.receipt_url, `comprobante_${receipt.id}`)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-655 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Descargar Comprobante"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Column 8: Acciones */}
                  <div className="col-span-1.5 text-right flex md:block items-center justify-end w-full">
                    <span className="md:hidden block text-[9px] font-bold text-slate-400 uppercase tracking-wider mr-auto">Detalle:</span>
                    <button
                      onClick={() => {
                        setSelectedReceipt(receipt);
                        setShowRejectionForm(false);
                        setRejectionReason("");
                      }}
                      className="px-3 py-1.5 border border-blue-600 text-blue-600 hover:bg-blue-50 font-bold text-[11px] rounded-lg transition-all shadow-sm"
                    >
                      Ver Detalle
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Footer (Mockup Style) */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 pt-4 mt-4 gap-4 text-slate-400 text-xs font-semibold px-2">
              <p>
                Mostrando {startIndex} a {endIndex} de {totalItems} resultados
              </p>
              
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                {renderPageButtons()}
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Screen Image/PDF Preview Modal */}
      {previewUrl && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-10 animate-fade-in"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          
          <button 
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-10 border border-white/10"
            onClick={() => setPreviewUrl(null)}
          >
            <X className="w-5 h-5" />
          </button>

          <div 
            className="relative w-full max-w-4xl h-[85vh] flex items-center justify-center animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {previewUrl.startsWith("data:application/pdf") ? (
              <iframe 
                src={previewUrl} 
                className="w-full h-full rounded-2xl border border-white/10 shadow-2xl bg-white"
                title="Full Preview"
              />
            ) : (
              <img 
                src={previewUrl} 
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl bg-white p-2 border border-white/10"
                alt="Full Preview"
              />
            )}
          </div>
        </div>
      )}

      {/* Interactive Detail Modal (Ver Detalle) */}
      {selectedReceipt && (
        <div 
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-fade-in"
          onClick={() => {
            if (!processing) {
              setSelectedReceipt(null);
              setShowRejectionForm(false);
              setRejectionReason("");
            }
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />

          {/* Modal Container */}
          <div 
            className="relative bg-white border border-slate-200 rounded-3xl max-w-3xl w-full shadow-xl p-6 md:p-8 animate-scale-up text-slate-800 flex flex-col md:grid md:grid-cols-2 gap-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left side: Information details */}
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Detalle de Pago</h3>
                <button
                  onClick={() => {
                    setSelectedReceipt(null);
                    setShowRejectionForm(false);
                    setRejectionReason("");
                  }}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-2 pb-2 border-b border-slate-150">
                <span className="text-xs font-semibold text-slate-400">Estado del Pago:</span>
                {selectedReceipt.status === "PENDING" && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-250">
                    Pendiente de Aprobación
                  </span>
                )}
                {selectedReceipt.status === "APPROVED" && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-250">
                    Aprobado
                  </span>
                )}
                {selectedReceipt.status === "REJECTED" && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-250">
                    Rechazado
                  </span>
                )}
              </div>

              {/* Info Blocks */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs font-semibold">
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cliente</span>
                  <span className="text-slate-800 block text-sm">{`${selectedReceipt.reservation?.name || ""} ${selectedReceipt.reservation?.last_name || ""}`.trim()}</span>
                  <span className="text-slate-400 text-xs mt-0.5 block">{selectedReceipt.reservation?.rut || "Sin RUT"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Contacto</span>
                  <span className="text-slate-650 block truncate">{selectedReceipt.reservation?.email || "Sin Email"}</span>
                  <span className="text-slate-650 block mt-0.5">{selectedReceipt.reservation?.phone || "Sin Teléfono"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Proyecto y Lote</span>
                  <span className="text-slate-800 block text-sm">{selectedReceipt.reservation?.project?.name || "Sin Proyecto"}</span>
                  <span className="text-slate-500 block mt-0.5">Lote {selectedReceipt.lot?.number || "—"}{selectedReceipt.lot?.stage ? ` - ${selectedReceipt.lot.stage}` : ""}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Concepto y Cuota</span>
                  <span className="text-slate-850 block">
                    {selectedReceipt.scope === "PIE" ? "Pie (Capital)" : "Cuotas de Financiamiento"}
                  </span>
                  <span className="text-blue-600 block mt-0.5 font-bold">
                    {selectedReceipt.scope === "PIE" ? "Ingreso Inicial" : `Cuota ${String(selectedReceipt.nominal_installment_number || selectedReceipt.reservation?.installments_paid || 1).padStart(2, '0')} / ${String(selectedReceipt.lot?.cuotas || 24).padStart(2, '0')}`}
                  </span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-100">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Monto Depositado</span>
                  <span className="text-2xl font-black text-slate-900">$ {selectedReceipt.amount_clp.toLocaleString("es-CL")}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha de Carga</span>
                  <span className="text-slate-650 font-medium block">{formatReceiptDateSimple(selectedReceipt.created_at)}</span>
                </div>
              </div>

              {/* Rejection Details */}
              {selectedReceipt.status === "REJECTED" && selectedReceipt.rejection_reason && (
                <div className="p-4 bg-red-50 border border-red-150 rounded-2xl flex items-start gap-2.5 text-xs text-red-800">
                  <AlertCircle className="w-5 h-5 text-red-650 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5">Motivo del Rechazo:</span>
                    <p className="font-semibold text-red-700/90 leading-relaxed">{selectedReceipt.rejection_reason}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons inside detail view */}
              {!showRejectionForm ? (
                <div className="flex gap-2 pt-5 border-t border-slate-100">
                  {selectedReceipt.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => handleApproveInModal(selectedReceipt.id)}
                        disabled={processing === selectedReceipt.id}
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all disabled:opacity-30"
                      >
                        {processing === selectedReceipt.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Aprobar Pago
                      </button>
                      <button
                        onClick={() => setShowRejectionForm(true)}
                        disabled={processing === selectedReceipt.id}
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 hover:bg-red-50 text-slate-650 hover:text-red-600 hover:border-red-200 font-bold text-xs rounded-xl transition-all disabled:opacity-30"
                      >
                        <X className="w-3.5 h-3.5" />
                        Rechazar Pago
                      </button>
                    </>
                  )}
                  {selectedReceipt.status !== "PENDING" && (
                    <button
                      onClick={() => {
                        setSelectedReceipt(null);
                        setShowRejectionForm(false);
                        setRejectionReason("");
                      }}
                      className="w-full py-2.5 border border-slate-200 text-xs font-bold text-slate-650 hover:bg-slate-50 transition-colors rounded-xl"
                    >
                      Cerrar Ventana
                    </button>
                  )}
                </div>
              ) : (
                /* Inline Rejection Reason Panel */
                <div className="pt-4 border-t border-slate-100 space-y-3 animate-fade-in">
                  <label className="block text-[10px] font-bold text-red-650 uppercase tracking-wider">Especifica el Motivo del Rechazo:</label>
                  <textarea
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Escribe aquí el motivo del rechazo para que el cliente lo reciba en su portal..."
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl p-3 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:border-red-500 focus:bg-white outline-none transition-all resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowRejectionForm(false);
                        setRejectionReason("");
                      }}
                      className="px-3.5 py-2 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-650 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleConfirmRejectInModal}
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold rounded-lg transition-all shadow-sm"
                    >
                      Confirmar Rechazo
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right side: File preview panel */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between items-center h-[280px] md:h-auto min-h-[300px]">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider self-start mb-2">Comprobante de Respaldo</span>
              
              <div className="flex-1 w-full bg-white border border-slate-150 rounded-xl overflow-hidden shadow-inner flex items-center justify-center relative">
                {selectedReceipt.receipt_url && selectedReceipt.receipt_url.startsWith("data:image") ? (
                  <img
                    src={selectedReceipt.receipt_url}
                    alt="Payment Document"
                    className="max-w-full max-h-[320px] object-contain p-2"
                  />
                ) : selectedReceipt.receipt_url && selectedReceipt.receipt_url.startsWith("data:application/pdf") ? (
                  <iframe
                    src={`${selectedReceipt.receipt_url}#toolbar=0&navpanes=0&scrollbar=0`}
                    className="w-full h-full border-none"
                    title="PDF Respaldo"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 opacity-30 text-slate-500">
                    <FileText className="w-12 h-12" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Documento Digital</p>
                  </div>
                )}
              </div>

              <div className="w-full flex gap-2 mt-4">
                <button
                  onClick={() => setPreviewUrl(selectedReceipt.receipt_url)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs text-slate-650 hover:bg-slate-50 hover:text-slate-800 transition-colors shadow-sm font-bold"
                >
                  <Eye className="w-4 h-4" />
                  Previsualizar
                </button>
                <button
                  onClick={() => downloadDocument(selectedReceipt.receipt_url, `comprobante_${selectedReceipt.id}`)}
                  className="p-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 rounded-xl transition-colors shadow-sm cursor-pointer"
                  title="Descargar archivo original"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
