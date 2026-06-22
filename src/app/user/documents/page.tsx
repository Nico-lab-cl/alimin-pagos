"use client";
import { useEffect, useState } from "react";
import { getUserLots } from "@/actions/user";
import { 
  FileText, 
  Download, 
  Loader2, 
  ShieldCheck, 
  Building2,
  CheckCircle,
  Clock,
  Compass,
  FileBadge,
  Eye,
  FileCheck
} from "lucide-react";
import PreviewModal from "@/components/shared/PreviewModal";
import { getDownloadFilename, downloadDocument } from "@/lib/utils";

type DocCategory = "Todos" | "Contratos" | "Certificados" | "Comprobantes" | "Fichas";

export default function UserDocuments() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<DocCategory>("Todos");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState({ url: "", title: "", type: "" });

  useEffect(() => {
    getUserLots().then((result) => {
      setData(result);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-450">Sincronizando Archivos...</p>
      </div>
    );
  }

  // Get all documents across all lots
  const allDocs = (data?.lots || []).flatMap((lot: any) => 
    (lot.documents || []).map((doc: any) => ({
      ...doc,
      lotNumber: lot.lotNumber,
      projectName: lot.projectName,
    }))
  );

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
    return "FICHA"; // Fallback to Ficha/General as shown in mockup
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
          icon: FileBadge, // Receipt-like badge
          iconColor: "text-orange-500",
          bgColor: "bg-orange-50/50 border-orange-100",
          badgeBg: "bg-orange-50 text-orange-655 border-orange-100",
          badgeText: "Comprobante",
        };
      case "FICHA":
      default:
        return {
          icon: Compass,
          iconColor: "text-slate-600",
          bgColor: "bg-slate-50 border-slate-100",
          badgeBg: "bg-slate-50 text-slate-500 border-slate-100",
          badgeText: "Ficha",
        };
    }
  };

  const filteredDocs = allDocs.filter((doc: any) => {
    const type = getCategoryType(doc);
    if (activeCategory === "Todos") return true;
    if (activeCategory === "Contratos" && type === "CONTRATO") return true;
    if (activeCategory === "Certificados" && type === "CERTIFICADO") return true;
    if (activeCategory === "Comprobantes" && type === "COMPROBANTE") return true;
    if (activeCategory === "Fichas" && type === "FICHA") return true;
    return false;
  });

  return (
    <div className="space-y-10 max-w-7xl mx-auto">
      {/* Title Header */}
      <div>
        <h2 className="text-3xl font-extrabold text-blue-800 tracking-tight leading-none mb-2">Mis Documentos</h2>
        <p className="text-sm text-slate-500 font-medium">Todos tus documentos en un solo lugar</p>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2.5 pb-2">
        {(["Todos", "Contratos", "Certificados", "Comprobantes", "Fichas"] as DocCategory[]).map((cat) => {
          const isActive = activeCategory === cat;
          const label = cat === "Comprobantes" ? "Comprobantes de Pago" : cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all border cursor-pointer ${
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
      {filteredDocs.length === 0 ? (
        <div className="text-center py-24 bg-white border border-slate-150 rounded-3xl shadow-sm">
          <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-bold text-slate-700">Sin Documentos</h3>
          <p className="text-xs text-slate-450 mt-1 max-w-xs mx-auto leading-relaxed">
            No se encontraron documentos en esta categoría para tu cuenta.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.map((doc: any, idx: number) => {
            const type = getCategoryType(doc);
            const theme = getCategoryTheme(type);
            const Icon = theme.icon;

            return (
              <div 
                key={idx} 
                className="bg-white border border-slate-150 hover:border-blue-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all group"
              >
                {/* Top Section with Center Icon and Badge */}
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className={`w-20 h-20 rounded-2xl ${theme.bgColor} flex items-center justify-center border mb-3 group-hover:scale-105 transition-transform duration-300`}>
                    <Icon className={`w-10 h-10 ${theme.iconColor}`} />
                  </div>
                  
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest border ${theme.badgeBg}`}>
                    {theme.badgeText}
                  </span>
                </div>

                {/* Doc Description */}
                <div className="mt-4 flex-1 text-center">
                  <h4 className="text-sm font-bold text-slate-800 line-clamp-2 leading-tight">
                    {doc.name}
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wide">
                    {doc.uploadedAt ? `Emitido ${new Date(doc.uploadedAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}` : "Emitido recientemente"}
                  </p>
                  <p className="text-[9px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">
                    {doc.fileType ? `${doc.fileType.toUpperCase()}` : "PDF 0.8MB"}
                  </p>
                </div>

                {/* Bottom Action buttons */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-3">
                  <button 
                    onClick={() => {
                      setPreviewData({ url: doc.url, title: doc.name, type: doc.fileType });
                      setIsPreviewOpen(true);
                    }}
                    className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all shrink-0 cursor-pointer"
                    title="Previsualizar"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  
                  <button 
                    onClick={() => downloadDocument(doc.url, doc.name, doc.fileType)}
                    className="flex-1 h-11 rounded-xl border border-blue-600 hover:bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Descargar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Proactive Help Message */}
      <div className="text-center pt-8 border-t border-slate-150 text-sm text-slate-550 font-medium">
        Todos tus documentos están disponibles 24/7. Si necesitas algún documento adicional,{" "}
        <a href="https://wa.me/56912345678" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-bold underline">
          contáctanos.
        </a>
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
