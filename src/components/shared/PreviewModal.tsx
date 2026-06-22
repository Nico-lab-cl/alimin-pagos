"use client";

import { X, Loader2, Download, ExternalLink, FileText } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { downloadDocument } from "@/lib/utils";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title: string;
  fileType?: string;
}

export default function PreviewModal({ isOpen, onClose, url, title, fileType }: PreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getDownloadFilename = () => {
    let name = title || "documento";
    if (name.toLowerCase().endsWith(".pdf") || 
        name.toLowerCase().endsWith(".png") || 
        name.toLowerCase().endsWith(".jpg") || 
        name.toLowerCase().endsWith(".jpeg") || 
        name.toLowerCase().endsWith(".docx") || 
        name.toLowerCase().endsWith(".xlsx")) {
      return name;
    }
    const type = fileType || "";
    if (type.includes("pdf")) return `${name}.pdf`;
    if (type.includes("png")) return `${name}.png`;
    if (type.includes("jpeg") || type.includes("jpg")) return `${name}.jpg`;
    if (type.includes("word") || type.includes("officedocument.word")) return `${name}.docx`;
    if (type.includes("sheet") || type.includes("officedocument.spreadsheet")) return `${name}.xlsx`;
    
    const nameLower = name.toLowerCase();
    if (nameLower.includes("contrato") || nameLower.includes("promesa") || nameLower.includes("comprobante") || nameLower.includes("certificado")) {
      return `${name}.pdf`;
    }
    return `${name}.pdf`;
  };

  // Clear safety timeout helper
  const clearSafetyTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Handlers that also cancel the timeout
  const handleLoadSuccess = useCallback(() => {
    clearSafetyTimeout();
    setLoading(false);
    // Don't set error — the content loaded fine
  }, [clearSafetyTimeout]);

  const handleLoadError = useCallback(() => {
    clearSafetyTimeout();
    setLoading(false);
    setError(true);
  }, [clearSafetyTimeout]);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(false);
      document.body.style.overflow = "hidden";

      // Si sabemos de antemano que no es previsualizable (ej: Word)
      const isOffice = fileType?.includes("officedocument") || fileType?.includes("msword");
      if (isOffice) {
        setLoading(false);
        setError(true);
        return;
      }

      // Timeout de seguridad: si en 25s no carga, mostrar error/descarga
      // (los documentos de promesa pueden ser PDFs pesados)
      timeoutRef.current = setTimeout(() => {
        setLoading(false);
        setError(true);
      }, 25000);
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
      clearSafetyTimeout();
    };
  }, [isOpen, fileType, clearSafetyTimeout]);

  if (!isOpen) return null;

  const isImage = fileType?.startsWith("image/") || url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
  const isPDF = fileType?.includes("pdf") || url.toLowerCase().match(/\.pdf$/);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Content Container */}
      <div className="relative w-full h-full max-w-6xl bg-[#0a0a0a] rounded-[2.5rem] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-zoom-in">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex flex-col">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Previsualización de Documento</p>
            <h3 className="text-xl font-black text-white uppercase italic tracking-tighter truncate max-w-[300px] sm:max-w-md">
              {title}
            </h3>
          </div>

          <div className="flex items-center gap-3">
             <button 
              onClick={() => downloadDocument(url, title, fileType)}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-accent hover:text-black transition-all"
              title="Descargar"
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-red-500/20 hover:text-red-400 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewer */}
        <div className="flex-1 relative bg-black/20 overflow-auto">
          {loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 bg-[#0a0a0a]">
              <Loader2 className="w-10 h-10 animate-spin text-accent" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Preparando Visor...</p>
            </div>
          )}

          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-10 text-center">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                <FileText className="w-10 h-10 text-white/20" />
              </div>
              <div>
                <h4 className="text-xl font-black text-white uppercase italic tracking-tighter mb-2">Formato no previsualizable</h4>
                <p className="text-xs font-bold text-white/20 uppercase tracking-widest leading-relaxed max-w-xs mx-auto">
                  Este archivo (Word, Excel o similar) no se puede mostrar en el navegador. Usa el botón de abajo para descargarlo.
                </p>
              </div>
              <button 
                onClick={() => downloadDocument(url, title, fileType)}
                className="px-8 py-4 bg-accent text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-all flex items-center gap-3 shadow-[0_0_30px_rgba(212,168,75,0.3)]"
              >
                Descargar Archivo Original
                <Download className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              {isImage ? (
                <img 
                  src={url} 
                  alt={title} 
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-lg animate-fade-in"
                  onLoad={handleLoadSuccess}
                  onError={handleLoadError}
                />
              ) : (
                <iframe 
                  src={`${url}#toolbar=0`} 
                  className="w-full h-full border-none rounded-lg shadow-2xl animate-fade-in"
                  onLoad={handleLoadSuccess}
                  onError={handleLoadError}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer / Info */}
        <div className="px-8 py-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between">
            <p className="text-[9px] font-black text-white/10 uppercase tracking-[0.2em]">
              © 2026 ALIMIN SPA • SISTEMA DE GESTIÓN DE PAGOS
            </p>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Servidor Seguro</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
