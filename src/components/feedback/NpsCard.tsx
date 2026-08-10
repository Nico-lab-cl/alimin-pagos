"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, X, Star } from "lucide-react";
import { getNpsStatus, submitNpsResponse, dismissNpsSurvey } from "@/actions/feedback";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SCORES = Array.from({ length: 11 }, (_, i) => i);

/**
 * Encuesta NPS del portal. Aparece en el dashboard del cliente hasta que
 * responde o la pospone; si la pospone vuelve a los 90 días (ciclo estándar NPS).
 *
 * La escala 0-10 va en gris neutro con la selección en `brand-600` a propósito:
 * pintar los números bajos de rojo y los altos de verde chocaría con el semáforo
 * de mora, donde esos colores significan otra cosa.
 */
export default function NpsCard() {
  const [visible, setVisible] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getNpsStatus().then((result) => {
      if (result?.shouldAsk) setVisible(true);
    });
  }, []);

  if (!visible) return null;

  const handleSubmit = async () => {
    if (score === null) return;
    setSending(true);
    const result = await submitNpsResponse({ score, message: comment });
    setSending(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setSent(true);
    setTimeout(() => setVisible(false), 3000);
  };

  const handleDismiss = async () => {
    setVisible(false);
    await dismissNpsSurvey();
  };

  if (sent) {
    return (
      <div className="bg-white border-[1.5px] border-brand-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">¡Gracias por tu respuesta!</h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Nos ayuda a decidir qué mejorar en el portal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-[1.5px] border-brand-200 rounded-2xl p-6 shadow-sm space-y-5 relative overflow-hidden">
      <button
        onClick={handleDismiss}
        aria-label="Ahora no"
        className="absolute top-4 right-4 p-1.5 text-slate-300 hover:text-slate-500 transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-4 pr-8">
        <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center shrink-0">
          <Star className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-brand-600 uppercase tracking-wider">Tu opinión</p>
          <h3 className="text-sm font-bold text-slate-800 mt-1">
            ¿Qué tan probable es que recomiendes el portal de pagos de Alimin a otro propietario?
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Pensando en los últimos cambios que hicimos. Te toma 10 segundos.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
          {SCORES.map((n) => {
            const isActive = score === n;
            return (
              <button
                key={n}
                onClick={() => setScore(n)}
                aria-label={`Nota ${n}`}
                aria-pressed={isActive}
                className={cn(
                  "aspect-square rounded-xl border text-sm font-bold transition-all cursor-pointer tabular-nums",
                  isActive
                    ? "bg-brand-600 border-brand-700 text-white shadow-sm scale-105"
                    : "bg-white border-slate-200 text-slate-600 hover:border-brand-500 hover:bg-brand-50"
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[11px] text-slate-400 font-semibold px-1">
          <span>Nada probable</span>
          <span>Muy probable</span>
        </div>
      </div>

      {score !== null && (
        <div className="space-y-3 pt-1">
          <label
            htmlFor="npsComment"
            className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block"
          >
            {score >= 9
              ? "¿Qué es lo que más te sirve? (opcional)"
              : "¿Qué deberíamos mejorar? (opcional)"}
          </label>
          <textarea
            id="npsComment"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 2000))}
            rows={3}
            placeholder="Escribe aquí si quieres contarnos algo más..."
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10 focus:outline-none resize-none"
          />
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleDismiss}
              className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
            >
              Ahora no
            </button>
            <button
              onClick={handleSubmit}
              disabled={sending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
            >
              {sending && <Loader2 className="w-4 h-4 animate-spin" />}
              {sending ? "Enviando" : "Enviar respuesta"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
