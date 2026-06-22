"use client";

import { X, Loader2, Download, FileText } from "lucide-react";
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
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Content Container */}
      <div className="relative w-full h-full max-w-6xl bg-white border border-slate-200 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-zoom-in">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-150 bg-slate-50/50">
          <div className="flex flex-col">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-600">Previsualización de Documento</p>
            <h3 className="text-base font-bold text-slate-800 uppercase tracking-tight truncate max-w-[300px] sm:max-w-md">
              {title}
            </h3>
          </div>

          <div className="flex items-center gap-3">
             <button 
              onClick={() => downloadDocument(url, title, fileType)}
              className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-250 transition-all shadow-sm cursor-pointer"
              title="Descargar"
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shadow-sm cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewer */}
        <div className="flex-1 relative bg-slate-50/50 overflow-auto">
          {loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 bg-white">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 opacity-60">Preparando Visor...</p>
            </div>
          )}

          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-10 text-center bg-white">
              <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-800 uppercase tracking-tight mb-1">Formato no previsualizable</h4>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide leading-relaxed max-w-xs mx-auto">
                  Este archivo (Word, Excel o similar) no se puede mostrar en el navegador. Usa el botón de abajo para descargarlo.
                </p>
              </div>
              <button 
                onClick={() => downloadDocument(url, title, fileType)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <span>Descargar Archivo Original</span>
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              {isImage ? (
                <img 
                  src={url} 
                  alt={title} 
                  className="max-w-full max-h-full object-contain shadow-lg rounded-lg border border-slate-200 bg-white animate-fade-in"
                  onLoad={handleLoadSuccess}
                  onError={handleLoadError}
                />
              ) : (
                <iframe 
                  src={`${url}#toolbar=0`} 
                  className="w-full h-full border border-slate-200 rounded-lg shadow-lg bg-white animate-fade-in"
                  onLoad={handleLoadSuccess}
                  onError={handleLoadError}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer / Info */}
        <div className="px-8 py-4 border-t border-slate-150 bg-slate-50/50 flex items-center justify-between">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              © 2026 ALIMIN SPA • SISTEMA DE GESTIÓN DE PAGOS
            </p>
            <div className="flex items-center gap-4">
                <div className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase tracking-widest border border-emerald-100 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Servidor Seguro</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
