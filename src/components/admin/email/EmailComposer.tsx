"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  Send,
  AlertTriangle,
  MailWarning,
  Square,
  FlaskConical,
  X,
  FileText,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  getEmailRecipients,
  getEmailTemplates,
  startEmailBatch,
  sendEmailChunk,
  sendEmailTest,
  type EmailAudience,
} from "@/actions/email";
import { EMAIL_SUBJECT_MAX, EMAIL_BODY_MAX, EMAIL_TEMPLATE_VARIABLES } from "@/lib/emailTemplate";
import { cn } from "@/lib/utils";

const CHUNK_SIZE = 5;
/** Techo por tanda. Con ~200 clientes en total no hace falta más. */
const MAX_PER_BATCH = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AUDIENCE_OPTIONS: { id: EmailAudience; label: string }[] = [
  { id: "TODOS", label: "Todos los clientes" },
  { id: "MORA", label: "En mora" },
  { id: "GRACIA", label: "Días de gracia" },
  { id: "PROXIMO", label: "Próximo a pagar" },
  { id: "VENCIMIENTO", label: "Vence hoy" },
];

type Progress = { done: number; total: number; ok: number; failed: number };
type Failure = { clientName: string; error: string };

/**
 * Pantalla de redacción y envío. Postventa escribe asunto + cuerpo en texto
 * plano (el marco de marca lo aplica el servidor al momento de enviar), elige
 * a quién, revisa la lista y envía en tramos con progreso visible — mismo
 * patrón que WhatsappSender, adaptado a correo.
 */
export default function EmailComposer({
  projectSlug,
  projects,
  canSend,
  configured,
  onSent,
}: {
  projectSlug: string;
  projects: any[];
  canSend: boolean;
  configured: boolean;
  onSent: () => void;
}) {
  const [audience, setAudience] = useState<EmailAudience>("TODOS");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualMode, setManualMode] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const [templates, setTemplates] = useState<any[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const stopRef = useRef(false);

  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    setProgress(null);
    setFailures([]);
    try {
      const res = await getEmailRecipients({ projectSlug, audience });
      if ((res as any).error) {
        toast.error((res as any).error);
        setData(null);
      } else {
        setData(res);
        const preselected = (res.recipients || [])
          .filter((r: any) => r.sendable && r.buzonReady)
          .slice(0, MAX_PER_BATCH)
          .map((r: any) => r.id);
        setSelected(new Set(preselected));
      }
    } catch (err) {
      console.error("Error cargando destinatarios de correo:", err);
      toast.error("No se pudieron cargar los destinatarios");
    } finally {
      setLoading(false);
    }
  }, [projectSlug, audience]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    async function loadTemplates() {
      try {
        const res = await getEmailTemplates();
        if (!(res as any).error) setTemplates(res.templates || []);
      } catch (err) {
        console.error("Error cargando plantillas de correo:", err);
      }
    }
    loadTemplates();
  }, []);

  const recipients: any[] = data?.recipients || [];
  const sendableList = recipients.filter((r) => r.sendable && r.buzonReady);
  const blockedList = recipients.filter((r) => !r.sendable || !r.buzonReady);
  const selectedList = sendableList.filter((r) => selected.has(r.id));

  const visibleList = manualMode ? recipients : sendableList;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_PER_BATCH) {
          toast.warning(`El máximo por tanda es de ${MAX_PER_BATCH} correos`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size > 0) {
      setSelected(new Set());
      return;
    }
    const ids = sendableList.slice(0, MAX_PER_BATCH).map((r) => r.id);
    setSelected(new Set(ids));
  };

  const insertVariable = (variable: string) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((prev) => prev + variable);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + variable + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    });
  };

  /** Carga un borrador guardado en el editor. Nombrada sin prefijo "use" a
   *  propósito: React/ESLint tratan cualquier función "use..." como si fuera
   *  un Hook y esto no lo es. */
  const applyTemplate = (t: any) => {
    setSubject(t.subject);
    setBody(t.body);
    setTemplatePickerOpen(false);
    toast.success(`Plantilla «${t.name}» cargada`);
  };

  const validateDraft = (): string | null => {
    if (!subject.trim()) return "Escribe un asunto";
    if (subject.length > EMAIL_SUBJECT_MAX) return `El asunto supera los ${EMAIL_SUBJECT_MAX} caracteres`;
    if (!body.trim()) return "Escribe el cuerpo del correo";
    if (body.length > EMAIL_BODY_MAX) return `El mensaje supera los ${EMAIL_BODY_MAX} caracteres`;
    return null;
  };

  const runBatch = async () => {
    const err = validateDraft();
    if (err) {
      toast.error(err);
      return;
    }

    setConfirmOpen(false);
    setSending(true);
    stopRef.current = false;

    const targets = selectedList.map((r) => r.id);
    const nameById = new Map(selectedList.map((r) => [r.id, r.clientName]));

    setProgress({ done: 0, total: targets.length, ok: 0, failed: 0 });
    setFailures([]);

    const startRes = await startEmailBatch({ projectSlug, audience, total: targets.length });
    if ((startRes as any).error) {
      toast.error((startRes as any).error);
      setSending(false);
      return;
    }
    const batchId = (startRes as any).batchId as string;

    let ok = 0;
    let failed = 0;
    const collected: Failure[] = [];

    for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
      if (stopRef.current) break;

      const chunk = targets.slice(i, i + CHUNK_SIZE);

      try {
        const res = await sendEmailChunk({
          batchId,
          subject,
          body,
          reservationIds: chunk,
          batchTotal: targets.length,
          startIndex: i,
        });

        if (res.error) {
          toast.error(res.error);
          break;
        }

        for (const r of res.results || []) {
          if (r.ok) ok++;
          else {
            failed++;
            collected.push({ clientName: r.clientName, error: r.error || "Error desconocido" });
          }
        }
      } catch (err) {
        console.error("Error en el tramo de envío:", err);
        for (const id of chunk) {
          failed++;
          collected.push({ clientName: nameById.get(id) || "?", error: "Se cortó la conexión con el servidor" });
        }
      }

      setProgress({ done: Math.min(i + CHUNK_SIZE, targets.length), total: targets.length, ok, failed });
      setFailures([...collected]);

      const hasMore = i + CHUNK_SIZE < targets.length;
      if (hasMore && !stopRef.current) {
        await sleep(2000 + Math.random() * 3000);
      }
    }

    setSending(false);

    if (stopRef.current) {
      toast.warning(`Envío detenido. Alcanzaron a salir ${ok} correos.`);
    } else if (failed === 0) {
      toast.success(`${ok} correos enviados.`);
    } else {
      toast.warning(`${ok} enviados, ${failed} con problemas. Revisa el detalle.`);
    }

    await load();
    onSent();
  };

  const runTest = async () => {
    const err = validateDraft();
    if (err) {
      toast.error(err);
      return;
    }
    if (!testEmail.trim()) {
      toast.error("Escribe un correo para la prueba");
      return;
    }
    const targetProject = projectSlug === "ALL" ? projects[0]?.slug : projectSlug;
    if (!targetProject) {
      toast.error("No hay proyecto disponible para la prueba");
      return;
    }

    // Si hay alguien marcado, la prueba usa SUS datos reales (nombre, lote,
    // rut) en vez de "el primer cliente del proyecto" — es lo que espera ver
    // quien marcó a un cliente puntual antes de apretar "Enviar prueba".
    const previewClient = selectedList[0];

    setTesting(true);
    try {
      const res = await sendEmailTest({
        projectSlug: targetProject,
        subject,
        body,
        to: testEmail,
        reservationId: previewClient?.id ?? null,
      });
      if ((res as any).error) {
        toast.error((res as any).error);
      } else {
        toast.success(
          previewClient
            ? `Correo de prueba enviado a ${(res as any).sentTo}, con los datos de ${previewClient.clientName}`
            : `Correo de prueba enviado a ${(res as any).sentTo}`
        );
      }
    } catch (err) {
      console.error("Error en el correo de prueba:", err);
      toast.error("No se pudo enviar el correo de prueba");
    } finally {
      setTesting(false);
    }
  };

  if (!canSend) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
        <MailWarning className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-700">Tu cuenta no puede enviar correos masivos</p>
        <p className="text-xs font-medium text-slate-500 mt-1.5">
          Solo postventa@lomasdelmar.cl y postventa@libertadyalegria.cl pueden redactar y enviar tandas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-700 leading-relaxed">
            Falta configurar el webhook de correo en el servidor. El envío está desactivado hasta que
            se configure.
          </p>
        </div>
      )}

      {/* Segmento */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {AUDIENCE_OPTIONS.map((a) => (
          <button
            key={a.id}
            disabled={sending}
            onClick={() => {
              setManualMode(false);
              setAudience(a.id);
            }}
            className={cn(
              "px-4 py-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              audience === a.id && !manualMode
                ? "bg-brand-600 border-brand-600 text-white shadow-sm"
                : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
            )}
          >
            <p className="text-xs font-bold">{a.label}</p>
          </button>
        ))}
      </div>

      {/* Redacción */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Redactar</h3>
          <button
            onClick={() => setTemplatePickerOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            Usar una plantilla
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Asunto
            </label>
            <span className={cn("text-[10px] font-bold tabular-nums", subject.length > EMAIL_SUBJECT_MAX ? "text-red-700" : "text-slate-400")}>
              {subject.length} / {EMAIL_SUBJECT_MAX}
            </span>
          </div>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Claro y directo — sin URGENTE ni mayúsculas sostenidas"
            disabled={sending}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:border-brand-500 outline-none transition-all font-medium disabled:opacity-60"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Cuerpo del correo
            </label>
            <span className={cn("text-[10px] font-bold tabular-nums", body.length > EMAIL_BODY_MAX ? "text-red-700" : "text-slate-400")}>
              {body.length} / {EMAIL_BODY_MAX}
            </span>
          </div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            disabled={sending}
            placeholder="Escribe el mensaje tal como lo leería el cliente. El logo, los colores y el pie se agregan solos."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-800 focus:border-brand-500 outline-none transition-all font-sans leading-relaxed resize-y disabled:opacity-60"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EMAIL_TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.key}
              onClick={() => insertVariable(v.key)}
              title={v.description}
              disabled={sending}
              className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-mono font-semibold text-slate-500 hover:border-brand-500 hover:text-brand-600 transition-all cursor-pointer disabled:opacity-50"
            >
              {v.key}
            </button>
          ))}
        </div>

        {/* Prueba */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="tucorreo@aliminspa.cl"
              disabled={sending || testing}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 focus:border-brand-500 outline-none transition-all disabled:opacity-60"
            />
            <button
              onClick={runTest}
              disabled={sending || testing || !configured}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
              Enviar prueba
            </button>
          </div>
          <p className="text-[10px] font-semibold text-slate-400">
            {selectedList[0]
              ? `Va a llegar con los datos de ${selectedList[0].clientName} (el primero que marcaste abajo).`
              : "Nadie marcado abajo todavía: va a llegar con los datos de un cliente de ejemplo del proyecto."}
          </p>
        </div>
      </div>

      {/* Destinatarios */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-6 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800">Destinatarios</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setManualMode((m) => !m)}
              disabled={sending}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                manualMode ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              Selección manual
            </button>
            <button
              onClick={toggleAll}
              disabled={sending || loading}
              className="text-[11px] font-bold text-brand-600 hover:text-brand-700 cursor-pointer disabled:opacity-50"
            >
              {selected.size > 0 ? "Deseleccionar todos" : "Seleccionar todos"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {visibleList.map((r: any) => {
              const disabled = !r.sendable || !r.buzonReady;
              return (
                <label
                  key={r.id}
                  className={cn(
                    "flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    disabled={disabled || sending}
                    onChange={() => toggle(r.id)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 uppercase truncate">{r.clientName}</p>
                    <p className="text-[10px] font-medium text-slate-400 truncate">
                      {r.to || "Sin correo válido"} · {r.projectName} · Lote {r.lotNumber || "—"}
                    </p>
                  </div>
                  {!r.sendable && (
                    <span className="text-[9px] font-bold text-red-700 uppercase flex-shrink-0">Sin correo</span>
                  )}
                  {r.sendable && !r.buzonReady && (
                    <span className="text-[9px] font-bold text-amber-700 uppercase flex-shrink-0">Sin buzón</span>
                  )}
                </label>
              );
            })}

            {visibleList.length === 0 && (
              <div className="py-12 text-center text-xs font-semibold text-slate-400 uppercase tracking-widest">
                Nadie en este segmento
              </div>
            )}
          </div>
        )}

        {blockedList.length > 0 && !manualMode && (
          <div className="px-6 py-3 bg-red-50/60 border-t border-red-100">
            <p className="text-[11px] font-semibold text-red-700">
              {blockedList.length} cliente(s) quedaron fuera por no tener correo válido registrado.
            </p>
          </div>
        )}
      </div>

      {/* Enviar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div>
          <p className="text-sm font-bold text-slate-800">{selected.size} destinatario(s) seleccionados</p>
          <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Se envían en tramos de {CHUNK_SIZE}, espaciados</p>
        </div>

        {sending ? (
          <button
            onClick={() => (stopRef.current = true)}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
            Detener
          </button>
        ) : (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={selected.size === 0 || loading || !configured}
            className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            Enviar a {selected.size}
          </button>
        )}
      </div>

      {/* Progreso */}
      {progress && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>
              {progress.done} / {progress.total}
            </span>
            <span>
              <span className="text-emerald-700">{progress.ok} ok</span>
              {progress.failed > 0 && <span className="text-red-700 ml-2">{progress.failed} con problemas</span>}
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>

          {failures.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pt-2 border-t border-slate-100">
              {failures.map((f, i) => (
                <p key={i} className="text-[11px] font-semibold text-red-700">
                  {f.clientName}: {f.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmación */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-900">¿Enviar a {selected.size} clientes?</h3>
            <p className="text-xs font-medium text-slate-500 leading-relaxed">
              Asunto: <span className="font-bold text-slate-700">{subject}</span>
              <br />
              Esto no se puede deshacer una vez enviado. Considera mandar antes una prueba a tu propio
              correo.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={runBatch}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Sí, enviar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selector de plantillas guardadas */}
      {templatePickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setTemplatePickerOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[70vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Plantillas guardadas</h3>
              <button onClick={() => setTemplatePickerOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100">
              {templates.length === 0 && (
                <p className="p-6 text-xs font-semibold text-slate-400 text-center">
                  No hay plantillas guardadas todavía. Puedes crear una desde la pestaña «Plantillas».
                </p>
              )}
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="w-full text-left px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <p className="text-xs font-bold text-slate-800">{t.name}</p>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">{t.subject}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
