"use client";

import { useEffect, useState } from "react";
import { getAdminProjects, getPendingReceipts, approveReceipt, rejectReceipt } from "@/actions/postventa";
import { formatCLP, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { 
  Loader2, 
  Check, 
  X, 
  ImageIcon, 
  FileText, 
  User, 
  Zap, 
  Mail, 
  Phone, 
  Calendar, 
  ArrowRight, 
  Eye,
  CheckSquare,
  ChevronRight
} from "lucide-react";

import { useSearch } from "@/context/SearchContext";

export default function ReceiptsPage() {
  const { search } = useSearch();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    getAdminProjects().then((result) => {
      if (result.projects?.length) {
        setProjects(result.projects);
        setSelectedProject(result.projects[0].slug);
      }
    });
  }, []);

  const loadReceipts = () => {
    if (selectedProject) {
      setLoading(true);
      getPendingReceipts(selectedProject).then((result) => {
        setReceipts(result.receipts || []);
        setLoading(false);
      });
    }
  };

  useEffect(() => {
    loadReceipts();
  }, [selectedProject]);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    const result = await approveReceipt(id);
    if (result.success) {
      toast.success("Comprobante validado correctamente");
      loadReceipts();
    } else {
      toast.error(result.error || "Ocurrió un fallo en la validación");
    }
    setProcessing(null);
  };

  const handleReject = async (id: string) => {
    const reason = prompt("Motivo de la impugnación:");
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("Debes especificar un motivo");
      return;
    }
    setProcessing(id);
    const result = await rejectReceipt(id, reason);
    if (result.success) {
      toast.success("Comprobante rechazado exitosamente");
      loadReceipts();
    } else {
      toast.error(result.error || "Error al procesar el rechazo");
    }
    setProcessing(null);
  };

  const filteredReceipts = receipts.filter(r => 
    !search ||
    r.reservation?.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.reservation?.last_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.lot?.number?.toString().toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredReceipts.length / itemsPerPage);
  const paginatedReceipts = filteredReceipts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-12 animate-fade-in px-4">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/20">
              <CheckSquare className="w-5 h-5 text-accent" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-accent">Auditoría Financiera</p>
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
            Bandeja de <span className="text-white/20">Pagos</span>
          </h1>
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

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent" />
          <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Sincronizando Archivos...</p>
        </div>
      ) : receipts.length === 0 ? (
        <div className="text-center py-40 rounded-[3rem] border border-white/5 glass-card animate-fade-in">
          <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-10 border border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
            <Check className="w-12 h-12 text-emerald-500" />
          </div>
          <h3 className="text-3xl font-black text-white mb-3 italic tracking-tighter uppercase">Sin Pendientes</h3>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-30 max-w-xs mx-auto">
            Todos los comprobantes han sido conciliados para este proyecto.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-8">
          {paginatedReceipts.map((receipt: any, idx: number) => (
            <div
              key={receipt.id}
              className="group relative rounded-[3rem] overflow-hidden glass-card animate-slide-up"
              style={{ 
                animationDelay: `${idx * 60}ms`,
                animationFillMode: "both"
              }}
            >
              <div className="p-10 space-y-8">
                {/* Header Information */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-accent group-hover:text-[#061010] group-hover:shadow-[0_0_30px_rgba(212,168,75,0.4)] transition-all duration-500">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-2xl font-black text-white tracking-tighter uppercase leading-none italic group-hover:translate-x-1 transition-transform">
                        {receipt.reservation?.name} {receipt.reservation?.last_name}
                      </h4>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-accent italic">Lote {receipt.lot?.number}</span>
                        <div className="w-1 h-1 rounded-full bg-white/10" />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30">
                          {receipt.scope === "PIE" ? "Ingreso de Capital" : `Abono de Cuotas (${receipt.installments_count || 1})`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-white mb-1 tracking-tighter italic">
                      {formatCLP(receipt.amount_clp)}
                    </p>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-20">
                      Recibido: {formatDate(receipt.created_at)}
                    </p>
                  </div>
                </div>

                {/* Preview Area */}
                <div className="relative group/preview rounded-[2rem] overflow-hidden border border-white/5 bg-black/50 aspect-video flex items-center justify-center">
                  {receipt.receipt_url && receipt.receipt_url.startsWith("data:image") ? (
                    <img
                      src={receipt.receipt_url}
                      alt="Payment Document"
                      className="w-full h-full object-cover opacity-60 group-hover/preview:opacity-100 group-hover/preview:scale-105 transition-all duration-700 font-black cursor-pointer"
                    />
                  ) : receipt.receipt_url && receipt.receipt_url.startsWith("data:application/pdf") ? (
                    <div className="w-full h-full relative">
                      <iframe
                        src={`${receipt.receipt_url}#toolbar=0&navpanes=0&scrollbar=0`}
                        className="w-full h-full border-none opacity-40 group-hover/preview:opacity-90 transition-opacity"
                        title="PDF Preview"
                      />
                      <div className="absolute inset-0 pointer-events-none" /> {/* Shield to allow hover/click on the card instead of iframe */}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 opacity-20 group-hover/preview:opacity-100 transition-opacity">
                      <FileText className="w-12 h-12" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Documento Digital (PDF)</p>
                    </div>
                  )}
                  
                  {/* Floating View Action */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button 
                      onClick={() => window.open(receipt.receipt_url, '_blank')}
                      className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white text-black font-black text-[10px] uppercase tracking-widest animate-slide-up"
                    >
                      <Eye className="w-4 h-4" />
                      Abrir en Pantalla Completa
                    </button>
                    <a href={receipt.receipt_url} download={`comprobante_${receipt.id}`} className="p-3 rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-all border border-white/10">
                      <Zap className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="grid grid-cols-2 gap-5">
                  <button
                    onClick={() => handleApprove(receipt.id)}
                    disabled={processing === receipt.id}
                    className="group/btn flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-500 bg-emerald-500/5 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-black hover:shadow-[0_10px_30px_rgba(16,185,129,0.3)] disabled:opacity-20"
                  >
                    {processing === receipt.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>Validar</span>
                  </button>
                  <button
                    onClick={() => handleReject(receipt.id)}
                    disabled={processing === receipt.id}
                    className="group/btn flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-500 bg-red-400/5 text-red-400 border border-red-400/20 hover:bg-red-400 hover:text-white hover:shadow-[0_10px_30px_rgba(248,113,113,0.3)] disabled:opacity-20"
                  >
                    <X className="w-4 h-4 transition-transform group-hover/btn:rotate-90" />
                    <span>Rechazar</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-8">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-20">
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredReceipts.length)} de {filteredReceipts.length} Comprobantes
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center rotate-180 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="px-4 text-xs font-black text-white/50">{currentPage} / {totalPages}</div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
