"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { getEmailTemplates, saveEmailTemplate, deleteEmailTemplate } from "@/actions/email";
import { EMAIL_SUBJECT_MAX, EMAIL_BODY_MAX } from "@/lib/emailTemplate";

/**
 * Borradores reutilizables de correo: postventa los crea, edita y borra
 * libremente. No tienen categoría fija como las de WhatsApp — son textos con
 * nombre propio ("Aviso corte de agua") que sirven de punto de partida al
 * redactar una tanda.
 */
export default function EmailTemplateManager() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState({ name: "", subject: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getEmailTemplates();
      if ((res as any).error) toast.error((res as any).error);
      else setTemplates(res.templates || []);
    } catch (err) {
      console.error("Error cargando plantillas de correo:", err);
      toast.error("No se pudieron cargar las plantillas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startNew = () => {
    setDraft({ name: "", subject: "", body: "" });
    setEditingId("new");
  };

  const startEdit = (t: any) => {
    setDraft({ name: t.name, subject: t.subject, body: t.body });
    setEditingId(t.id);
  };

  const cancel = () => {
    setEditingId(null);
    setDraft({ name: "", subject: "", body: "" });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await saveEmailTemplate({
        id: editingId !== "new" ? (editingId as string) : undefined,
        name: draft.name,
        subject: draft.subject,
        body: draft.body,
      });
      if ((res as any).error) {
        toast.error((res as any).error);
      } else {
        toast.success("Plantilla guardada");
        cancel();
        await load();
      }
    } catch (err) {
      console.error("Error guardando plantilla de correo:", err);
      toast.error("No se pudo guardar la plantilla");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await deleteEmailTemplate(id);
      if ((res as any).error) toast.error((res as any).error);
      else {
        toast.success("Plantilla eliminada");
        await load();
      }
    } catch (err) {
      console.error("Error eliminando plantilla de correo:", err);
      toast.error("No se pudo eliminar la plantilla");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Plantillas guardadas</h3>
          <p className="text-[11px] font-medium text-slate-500 mt-0.5">
            Borradores reutilizables. No se envían solas: se cargan en «Redactar y enviar» y desde ahí se
            editan o se mandan.
          </p>
        </div>
        {editingId === null && (
          <button
            onClick={startNew}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva plantilla
          </button>
        )}
      </div>

      {editingId !== null && (
        <div className="bg-white border border-brand-200 rounded-2xl shadow-sm p-6 space-y-4">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Nombre interno (ej. «Aviso corte de agua»)"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 focus:border-brand-500 outline-none transition-all font-bold"
          />
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
            placeholder="Asunto"
            maxLength={EMAIL_SUBJECT_MAX}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 focus:border-brand-500 outline-none transition-all"
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            rows={8}
            maxLength={EMAIL_BODY_MAX}
            placeholder="Cuerpo del correo"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-800 focus:border-brand-500 outline-none transition-all font-sans leading-relaxed resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={cancel}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Guardar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((t) => (
          <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col">
            <div className="flex items-start gap-2.5 mb-2">
              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{t.name}</p>
                <p className="text-[11px] font-medium text-slate-500 truncate">{t.subject}</p>
              </div>
            </div>
            <p className="text-[11px] font-medium text-slate-400 line-clamp-3 flex-1">{t.body}</p>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400">
                {t.updated_by ? `Editada por ${t.updated_by}` : ""}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => startEdit(t)}
                  className="text-[11px] font-bold text-brand-600 hover:text-brand-700 cursor-pointer"
                >
                  Editar
                </button>
                <button
                  onClick={() => remove(t.id)}
                  disabled={deletingId === t.id}
                  className="text-[11px] font-bold text-red-600 hover:text-red-700 cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  {deletingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>
        ))}

        {templates.length === 0 && editingId === null && (
          <div className="col-span-2 bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Todavía no hay plantillas guardadas
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
