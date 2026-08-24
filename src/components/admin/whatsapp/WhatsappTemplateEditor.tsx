"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Save, AlertTriangle, Database, Zap } from "lucide-react";
import { toast } from "sonner";
import { getWhatsappTemplates, saveWhatsappTemplate } from "@/actions/whatsapp";
import type { PaymentCategory, WhatsappCategory } from "@/lib/whatsappTemplates";
import { cn } from "@/lib/utils";
import { ALL_CATEGORY_STYLES } from "./categoryStyles";

/**
 * Editor de plantillas, servido para los dos grupos.
 *
 * `kind` decide cuales se editan: las cuatro de cobranza, que alguien elige y
 * dispara a mano, o los tres avisos de pago, que salen solos. Las etiquetas, el
 * texto por defecto y las variables disponibles vienen del servidor junto con
 * las plantillas, asi que esta pantalla no necesita saber cual grupo esta
 * mostrando mas alla de pedirlo.
 */
export default function WhatsappTemplateEditor({
  kind = "COBRANZA",
}: {
  kind?: "COBRANZA" | "PAGO";
}) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [variables, setVariables] = useState<{ key: string; description: string }[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { name: string; body: string; active: boolean }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await getWhatsappTemplates(kind);
        if ((res as any).error) {
          toast.error((res as any).error);
        } else {
          setTemplates(res.templates || []);
          setVariables((res as any).variables || []);
          setDrafts(
            Object.fromEntries(
              (res.templates || []).map((t: any) => [
                t.category,
                { name: t.name, body: t.body, active: t.active },
              ])
            )
          );
        }
      } catch (err) {
        console.error("Error cargando plantillas:", err);
        toast.error("No se pudieron cargar las plantillas");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [kind]);

  const update = (category: string, patch: Partial<{ name: string; body: string; active: boolean }>) => {
    setDrafts((prev) => ({ ...prev, [category]: { ...prev[category], ...patch } }));
  };

  /** Inserta la variable donde esta el cursor, no al final del texto. */
  const insertVariable = (category: string, variable: string) => {
    const el = textareas.current[category];
    const draft = drafts[category];
    if (!draft) return;

    if (!el) {
      update(category, { body: draft.body + variable });
      return;
    }

    const start = el.selectionStart ?? draft.body.length;
    const end = el.selectionEnd ?? draft.body.length;
    const next = draft.body.slice(0, start) + variable + draft.body.slice(end);
    update(category, { body: next });

    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    });
  };

  const save = async (category: WhatsappCategory | PaymentCategory) => {
    const draft = drafts[category];
    if (!draft) return;

    setSaving(category);
    try {
      const res = await saveWhatsappTemplate({
        category,
        name: draft.name,
        body: draft.body,
        active: draft.active,
      });
      if ((res as any).error) {
        toast.error((res as any).error);
      } else {
        const label = templates.find((t) => t.category === category)?.label ?? category;
        toast.success(`Plantilla «${label}» guardada`);
        setTemplates((prev) =>
          prev.map((t) => (t.category === category ? { ...t, ...draft, persisted: true } : t))
        );
      }
    } catch (err) {
      console.error("Error guardando plantilla:", err);
      toast.error("No se pudo guardar la plantilla");
    } finally {
      setSaving(null);
    }
  };

  /** Variables escritas en el texto que no existen: se enviarian tal cual. */
  const unknownVariables = (body: string): string[] => {
    const known = new Set(variables.map((v) => v.key));
    const found = body.match(/\{[a-z_]+\}/gi) || [];
    return Array.from(new Set(found.filter((v) => !known.has(v.toLowerCase()))));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 opacity-60">
          Cargando plantillas...
        </p>
      </div>
    );
  }

  const anyUnsaved = templates.some((t) => !t.persisted);

  return (
    <div className="space-y-6">
      {anyUnsaved && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <Database className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-700 leading-relaxed">
            Algunas plantillas aún no están guardadas en la base y se está mostrando el texto
            por defecto. Se guardarán la primera vez que aprietes «Guardar», o al aplicar la
            migración{" "}
            <span className="font-mono">
              {kind === "PAGO" ? "05_whatsapp_payment_notices.sql" : "03_whatsapp_tables.sql"}
            </span>
            .
          </p>
        </div>
      )}

      {kind === "PAGO" && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-3">
          <Zap className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-slate-600 leading-relaxed">
            Estos tres mensajes salen solos al aprobar un comprobante o registrar un pago: nadie
            los elige, la plantilla la decide el tipo de pago. Desmarcar «Activa» apaga ese aviso
            para todos los proyectos.
          </p>
        </div>
      )}

      {/* Variables disponibles */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-1">Variables disponibles</h3>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">
          Haz clic en una para insertarla donde tengas el cursor
        </p>
        <div className="flex flex-wrap gap-2">
          {variables.map((v) => (
            <span
              key={v.key}
              title={v.description}
              className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono font-semibold text-slate-600"
            >
              {v.key}
            </span>
          ))}
        </div>
      </div>

      {/* Editores */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {templates.map((t) => {
          const style = ALL_CATEGORY_STYLES[t.category];
          const draft = drafts[t.category];
          if (!draft) return null;

          const dirty =
            draft.body !== t.body || draft.name !== t.name || draft.active !== t.active;
          const unknown = unknownVariables(draft.body);

          return (
            <div
              key={t.category}
              className={cn(
                "bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col",
                style.border
              )}
            >
              <div className={cn("px-6 py-4 flex items-center justify-between", style.bg)}>
                <div className="flex items-center gap-2.5">
                  <div className={cn("w-2 h-2 rounded-full flex-shrink-0", style.dot)} />
                  <span className={cn("text-xs font-bold uppercase tracking-wide", style.text)}>
                    {t.label}
                  </span>
                </div>

                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => update(t.category, { active: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  Activa
                </label>
              </div>

              <div className="p-6 space-y-4 flex-1 flex flex-col">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Nombre interno
                  </label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => update(t.category, { name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 focus:border-brand-500 outline-none transition-all font-medium"
                  />
                </div>

                <div className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Mensaje
                    </label>
                    <span
                      className={cn(
                        "text-[10px] font-bold tabular-nums",
                        draft.body.length > 4000 ? "text-red-700" : "text-slate-400"
                      )}
                    >
                      {draft.body.length} / 4000
                    </span>
                  </div>
                  <textarea
                    ref={(el) => {
                      textareas.current[t.category] = el;
                    }}
                    value={draft.body}
                    onChange={(e) => update(t.category, { body: e.target.value })}
                    rows={12}
                    className="w-full flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-800 focus:border-brand-500 outline-none transition-all font-sans leading-relaxed resize-y"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {variables.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVariable(t.category, v.key)}
                      title={v.description}
                      className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-mono font-semibold text-slate-500 hover:border-brand-500 hover:text-brand-600 transition-all cursor-pointer"
                    >
                      {v.key}
                    </button>
                  ))}
                </div>

                {unknown.length > 0 && (
                  <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] font-semibold text-amber-700 leading-relaxed">
                      Estas variables no existen y le llegarán al cliente tal cual están
                      escritas: {unknown.join(", ")}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400">
                    {t.updated_by ? `Editada por ${t.updated_by}` : "Texto por defecto"}
                  </p>
                  <button
                    onClick={() => save(t.category)}
                    disabled={!dirty || saving === t.category}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {saving === t.category ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {dirty ? "Guardar cambios" : "Sin cambios"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
