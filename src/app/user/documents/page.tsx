"use client";

import { useEffect, useState } from "react";
import { getUserLots } from "@/actions/user";
import { 
  FileText, 
  Download, 
  Loader2, 
  Search, 
  MapPin, 
  FileCheck, 
  Files,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Building2,
  ChevronRight,
  Eye
} from "lucide-react";
import PreviewModal from "@/components/shared/PreviewModal";

export default function UserDocuments() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState({ url: "", title: "" });

  useEffect(() => {
    getUserLots().then((result) => {
      setData(result);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-accent" />
        <p className="text-xs font-black uppercase tracking-[0.3em] opacity-20">Sincronizando Archivos...</p>
      </div>
    );
  }

  // Group documents by lot number
  const lotDocuments = (data?.lots || []).map((lot: any) => ({
    lotNumber: lot.lotNumber,
    project: lot.projectName,
    docs: (lot.documents || []).filter((doc: any) => 
      !search || doc.name.toLowerCase().includes(search.toLowerCase()) || doc.category?.toLowerCase().includes(search.toLowerCase())
    )
  }));

  const hasDocs = lotDocuments.some((ld: any) => ld.docs.length > 0);

  return (
    <div className="space-y-16 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-10">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-px bg-accent" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Archivo Digital</p>
          </div>
          <h2 className="text-5xl font-black text-white tracking-tighter uppercase leading-none italic">
            Centro de <span className="text-white/20">Documentos</span>
          </h2>
        </div>

        <div className="relative group w-full sm:w-80">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-accent transition-colors" />
          <input
            type="text"
            placeholder="BUSCAR DOCUMENTO..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-14 pr-6 py-5 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all shadow-2xl"
          />
        </div>
      </div>

      {/* Folders/Lots Sections */}
      {!hasDocs ? (
        <div className="text-center py-40 rounded-[3rem] border border-white/5 glass-card animate-fade-in max-w-2xl mx-auto">
          <Files className="w-20 h-20 mx-auto mb-8 opacity-10" />
          <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase mb-4">Sin Archivos</h2>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/30 max-w-sm mx-auto leading-relaxed">
            No se han cargado documentos para tus propiedades en este servidor todavía.
          </p>
        </div>
      ) : (
        <div className="grid gap-16">
          {lotDocuments.map((section: any, idx: number) => section.docs.length > 0 && (
            <div key={section.lotNumber} className="animate-slide-up" style={{ animationDelay: `${idx * 150}ms`, animationFillMode: "both" }}>
              <div className="flex items-center gap-6 mb-8">
                <div className="w-px h-12 bg-accent opacity-30 hidden sm:block" />
                <div>
                  <h3 className="text-3xl font-black text-white tracking-tighter uppercase italic leading-none">
                    Lote <span className="text-accent">#{section.lotNumber}</span>
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mt-2">{section.project}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 text-slate-100">
                {section.docs.map((doc: any, dIdx: number) => (
                  <div 
                    key={dIdx} 
                    className="group relative rounded-[2.5rem] p-8 glass-card bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-500 overflow-hidden"
                  >
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="flex items-start justify-between mb-8">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center transition-transform group-hover:scale-110 duration-500">
                          <FileText className="w-6 h-6 text-accent" />
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              setPreviewData({ url: doc.url, title: doc.name, type: doc.fileType });
                              setIsPreviewOpen(true);
                            }}
                            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-accent transition-all"
                            title="Previsualizar"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <a 
                            href={doc.url} 
                            download 
                            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-accent hover:text-[#061010] hover:shadow-[0_0_20px_rgba(212,168,75,0.4)] transition-all"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </div>

                      <div className="flex-1">
                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-accent mb-2 block">{doc.category || "General"}</span>
                        <h4 className="text-xl font-black text-white italic tracking-tighter leading-tight group-hover:translate-x-1 transition-transform">{doc.name}</h4>
                      </div>

                      <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-between opacity-30 group-hover:opacity-100 transition-opacity">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em]">Cargado: {new Date(doc.uploadedAt).toLocaleDateString('es-CL')}</p>
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Background Icon */}
                    <Zap className="absolute -bottom-8 -right-8 w-32 h-32 text-white/[0.01] group-hover:text-accent/[0.04] transition-all duration-1000" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Proactive Help Card */}
      <div className="rounded-[3rem] p-12 bg-gradient-to-br from-accent to-accent-dark text-[#061010] relative overflow-hidden group shadow-[0_20px_50px_rgba(212,168,75,0.2)]">
        <ShieldCheck className="absolute -bottom-10 -right-10 w-64 h-64 text-[#061010]/10 group-hover:scale-110 transition-transform duration-1000" />
        <div className="relative z-10 max-w-2xl">
          <h4 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-6">¿Falta algún documento?</h4>
          <p className="text-sm font-black uppercase tracking-widest leading-relaxed opacity-70 mb-10 italic">
            Los folios, certificados de inscripción y escrituras notariales pueden tardar hasta 45 días hábiles después de la firma en estar disponibles digitalmente.
          </p>
          <button className="px-10 py-4 bg-[#061010] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl hover:translate-y-[-2px] transition-all active:scale-95 flex items-center gap-4">
            Consultar con Postventa
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <PreviewModal 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        url={previewData.url}
        title={previewData.title}
        fileType={previewData.type}
      />
    </div>
  );
}
