"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles, X, SendHorizontal, LoaderCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Mensaje = { rol: "usuario" | "asistente"; texto: string; error?: boolean };

const SUGERENCIAS = [
  "¿Quiénes están en mora?",
  "¿Qué cuotas vencen esta semana?",
  "¿Cuántos comprobantes hay por revisar?",
  "Resumen de la cartera",
];

/** **negrita** dentro de una linea; todo lo demas va como texto plano. */
function conNegrita(linea: string): ReactNode[] {
  return linea.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") ? (
      <strong key={i} className="font-semibold text-slate-900">
        {parte.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{parte}</span>
    )
  );
}

function TextoAsistente({ texto }: { texto: string }) {
  return (
    <div className="space-y-1">
      {texto.split("\n").map((linea, i) => {
        const vineta = linea.match(/^\s*[-•*]\s+(.*)$/);
        if (vineta) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-slate-400">•</span>
              <span>{conNegrita(vineta[1])}</span>
            </div>
          );
        }
        return linea.trim() ? <p key={i}>{conNegrita(linea)}</p> : <div key={i} className="h-1" />;
      })}
    </div>
  );
}

export default function AsistentePostventa() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [borrador, setBorrador] = useState("");
  const [cargando, setCargando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

  useEffect(() => {
    if (abierto) entradaRef.current?.focus();
  }, [abierto]);

  async function enviar(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta || cargando) return;
    const historial: Mensaje[] = [...mensajes.filter((m) => !m.error), { rol: "usuario", texto: pregunta }];
    setMensajes([...mensajes, { rol: "usuario", texto: pregunta }]);
    setBorrador("");
    setCargando(true);
    try {
      const r = await fetch("/api/admin/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: historial.map(({ rol, texto }) => ({ rol, texto })) }),
      });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(datos.error || "No se pudo consultar al asistente.");
      setMensajes((m) => [...m, { rol: "asistente", texto: datos.texto }]);
    } catch (e) {
      const texto = e instanceof Error ? e.message : "Error de conexión.";
      setMensajes((m) => [...m, { rol: "asistente", texto, error: true }]);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-700"
          aria-label="Abrir asistente"
        >
          <Sparkles className="h-4 w-4" />
          Asistente
        </button>
      )}

      {abierto && (
        <div className="fixed inset-x-4 bottom-4 z-50 flex h-[min(640px,calc(100vh-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[420px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Asistente de postventa</p>
                <p className="text-[11px] text-slate-500">Solo consulta · no modifica datos</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {mensajes.length > 0 && (
                <button
                  onClick={() => setMensajes([])}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                  aria-label="Borrar conversación"
                  title="Borrar conversación"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setAbierto(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                aria-label="Cerrar asistente"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-700">
            {mensajes.length === 0 && (
              <div className="space-y-3">
                <p className="text-slate-500">
                  Pregunta por un cliente (nombre, RUT o lote) o por la cartera: saldos, cuotas, fechas de pago, mora.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGERENCIAS.map((s) => (
                    <button
                      key={s}
                      onClick={() => enviar(s)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-200 hover:text-brand-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mensajes.map((m, i) =>
              m.rol === "usuario" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-white">
                    {m.texto}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div
                    className={cn(
                      "max-w-[90%] rounded-2xl rounded-bl-sm border px-3.5 py-2",
                      m.error ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white"
                    )}
                  >
                    {m.error ? m.texto : <TextoAsistente texto={m.texto} />}
                  </div>
                </div>
              )
            )}

            {cargando && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Consultando…
              </div>
            )}
            <div ref={finRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar(borrador);
            }}
            className="flex items-end gap-2 border-t border-slate-100 bg-white p-3"
          >
            <textarea
              ref={entradaRef}
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar(borrador);
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Ej: ¿cuándo vence la próxima cuota del lote 37?"
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500"
            />
            <button
              type="submit"
              disabled={cargando || !borrador.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white transition-all hover:bg-brand-700 disabled:opacity-40"
              aria-label="Enviar"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
