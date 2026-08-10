"use client";

import { useEffect, useState } from "react";
import { MessageSquarePlus, X, Lightbulb, AlertCircle, Heart, Loader2, CheckCircle2, Send } from "lucide-react";
import { submitFeedback } from "@/actions/feedback";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "SUGERENCIA", label: "Sugerencia", icon: Lightbulb, hint: "Una idea para mejorar el portal" },
  { value: "PROBLEMA", label: "Problema", icon: AlertCircle, hint: "Algo no funciona como esperabas" },
  { value: "FELICITACION", label: "Felicitación", icon: Heart, hint: "Algo que te gustó" },
] as const;

const MAX_LENGTH = 2000;

/**
 * Botón flotante para abrir el formulario de sugerencias. Va en `brand-600`
 * porque es un elemento accionable: el semáforo de mora (rojo/ámbar/verde de
 * estado) nunca se usa acá, para no confundirlo con el estado de la cuenta.
 */
export function FeedbackFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Enviar sugerencias sobre el portal"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 px-4 py-3.5 sm:px-5 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-600/25 border border-brand-700/20 transition-all active:scale-95 cursor-pointer group"
    >
      <MessageSquarePlus className="w-5 h-5 shrink-0" />
      <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider">Sugerencias</span>
    </button>
  );
}

export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<string>("SUGERENCIA");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Al cerrarse se limpia, para que la próxima vez el formulario esté en blanco.
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setCategory("SUGERENCIA");
        setMessage("");
        setSent(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (message.trim().length < 5) {
      toast.error("Cuéntanos un poco más para poder ayudarte");
      return;
    }
    setSending(true);
    const result = await submitFeedback({
      category,
      message,
      pageContext: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
    setSending(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setSent(true);
    setTimeout(onClose, 2200);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        {sent ? (
          <div className="p-10 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-brand-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800">¡Gracias por escribirnos!</h3>
            <p className="text-xs text-slate-500 font-medium max-w-xs">
              Tu comentario llegó al equipo de Alimin. Lo revisamos uno por uno.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center shrink-0">
                  <MessageSquarePlus className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <h3 id="feedback-title" className="text-sm font-bold text-slate-800">
                    ¿Cómo podemos mejorar tu portal?
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Leemos todos los comentarios y nos ayudan a decidir qué construir.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  ¿De qué se trata?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map((c) => {
                    const isActive = category === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setCategory(c.value)}
                        title={c.hint}
                        className={cn(
                          "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer",
                          isActive
                            ? "bg-brand-50 border-brand-500 text-brand-700 shadow-sm"
                            : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        <c.icon className={cn("w-4 h-4", isActive ? "text-brand-600" : "text-slate-400")} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="feedbackMessage"
                  className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block"
                >
                  Cuéntanos
                </label>
                <textarea
                  id="feedbackMessage"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
                  rows={5}
                  autoFocus
                  placeholder="Por ejemplo: me gustaría ver el detalle de mis cuotas pagadas, o el botón de subir comprobante no me funciona en el celular..."
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10 focus:outline-none resize-none"
                />
                <div className="flex justify-between items-center">
                  <p className="text-[11px] text-slate-400 font-medium">
                    Se envía junto a tu nombre y tu lote, para poder responderte.
                  </p>
                  <span className="text-[11px] text-slate-400 font-medium tabular-nums shrink-0">
                    {message.length}/{MAX_LENGTH}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={sending || message.trim().length < 5}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Enviando" : "Enviar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
