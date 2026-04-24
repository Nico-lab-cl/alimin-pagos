"use client";

import { X, Loader2, Download, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(false);
      // Bloquear scroll del body
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

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
             <a 
              href={url} 
              download 
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-accent hover:text-black transition-all"
              title="Descargar"
            >
              <Download className="w-4 h-4" />
            </a>
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
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                <X className="w-10 h-10 text-red-500/40" />
              </div>
              <div>
                <h4 className="text-xl font-black text-white uppercase italic tracking-tighter mb-2">No se pudo cargar la vista previa</h4>
                <p className="text-xs font-bold text-white/20 uppercase tracking-widest leading-relaxed max-w-xs mx-auto">
                  El formato del archivo puede no ser compatible con el visor integrado.
                </p>
              </div>
              <a 
                href={url}
                target="_blank"
                className="px-8 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-white hover:bg-white/10 transition-all flex items-center gap-3"
              >
                Abrir en nueva pestaña
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              {(fileType?.startsWith("image/") || url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/)) ? (
                <img 
                  src={url} 
                  alt={title} 
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-lg animate-fade-in"
                  onLoad={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setError(true);
                  }}
                />
              ) : (
                <iframe 
                  src={`${url}#toolbar=0`} 
                  className="w-full h-full border-none rounded-lg shadow-2xl animate-fade-in"
                  onLoad={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setError(true);
                  }}
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
