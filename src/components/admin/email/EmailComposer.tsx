"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  Eye,
  Paperclip,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import {
  getEmailRecipients,
  getEmailTemplates,
  startEmailBatch,
  sendEmailChunk,
  sendEmailTest,
  uploadEmailAttachment,
  deleteEmailAttachment,
  scheduleEmailBatch,
  type EmailAudience,
} from "@/actions/email";
import {
  EMAIL_SUBJECT_MAX,
  EMAIL_BODY_MAX,
  EMAIL_TEMPLATE_VARIABLES,
  buildEmailHtml,
  renderEmailVariables,
  getEmailVariableSampleValues,
  EMAIL_ATTACHMENTS_MAX_FILES,
  EMAIL_ATTACHMENTS_MAX_BYTES,
  EMAIL_ATTACHMENT_BLOCKED_EXT,
} from "@/lib/emailTemplate";
import { ahoraEnChile, sumarDiasFecha, chileLocalToUtc, formatoFechaHoraChile } from "@/lib/horaChile";
import EmailVariableSelector from "./EmailVariableSelector";
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
type Attachment = { id: string; fileName: string; size: number };

const formatMB = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

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
  onScheduled,
}: {
  projectSlug: string;
  projects: any[];
  canSend: boolean;
  configured: boolean;
  onSent: () => void;
  /** Despues de programar una tanda (la pagina salta a la pestaña Programados). */
  onScheduled?: () => void;
}) {
  const [audience, setAudience] = useState<EmailAudience>("TODOS");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualMode, setManualMode] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  const [templates, setTemplates] = useState<any[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const stopRef = useRef(false);

  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);

  // Adjuntos: cada archivo se sube apenas se elige y queda por id; el envio
  // (ahora o programado) solo manda los ids.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentIds = attachments.map((a) => a.id);
  const attachmentsBytes = attachments.reduce((acc, a) => acc + a.size, 0);

  // Programacion: fecha y hora SIEMPRE en hora de Chile, sin importar la
  // zona horaria del computador desde donde se programe.
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [schedDate, setSchedDate] = useState(() => sumarDiasFecha(ahoraEnChile().fecha, 1));
  const [schedTime, setSchedTime] = useState("09:00");
  const [scheduling, setScheduling] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const chileNow = ahoraEnChile(new Date(nowMs));
  const scheduledAt = sendMode === "schedule" ? chileLocalToUtc(schedDate, schedTime) : null;
  const scheduleError =
    sendMode !== "schedule"
      ? null
      : !scheduledAt
        ? "Elige una fecha y hora válidas"
        : scheduledAt.getTime() < nowMs + 5 * 60_000
          ? "Tiene que ser al menos 5 minutos más tarde que la hora actual de Chile"
          : null;

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

  // Vista previa en vivo: el cliente marcado (o, si nadie está marcado
  // todavía, el primero de la lista cargada) manda sus datos reales al
  // marco de correo real -- el mismo buildEmailHtml que arma el envío de
  // verdad -- para que postventa vea el correo tal cual antes de mandar
  // nada, sin tener que usar "Enviar prueba" para eso.
  const previewSource = selectedList[0] || recipients[0] || null;

  const previewValues = useMemo(() => {
    return getEmailVariableSampleValues(previewSource);
  }, [previewSource]);

  const previewHtml = useMemo(() => {
    const rendered = renderEmailVariables(
      body.trim() ? body : "Escribe el cuerpo del correo para ver la vista previa acá.",
      previewValues
    );
    return buildEmailHtml({
      projectSlug: previewSource?.projectSlug || "",
      projectName: previewValues.proyecto || "Proyecto",
      bodyText: rendered,
    });
  }, [body, previewSource, previewValues]);

  const previewSubject = subject.trim()
    ? renderEmailVariables(subject, previewValues)
    : "(sin asunto)";

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
    if (activeField === "subject") {
      const el = subjectRef.current;
      if (!el) {
        setSubject((prev) => prev + variable);
        return;
      }
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + variable + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + variable.length, start + variable.length);
      });
    } else {
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
    }
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

  const addFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;

    if (attachments.length + files.length > EMAIL_ATTACHMENTS_MAX_FILES) {
      toast.error(`Se pueden adjuntar hasta ${EMAIL_ATTACHMENTS_MAX_FILES} archivos por correo`);
      return;
    }
    let total = attachmentsBytes;
    for (const f of files) {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (EMAIL_ATTACHMENT_BLOCKED_EXT.includes(ext)) {
        toast.error(`Gmail no permite adjuntar archivos .${ext} («${f.name}»)`);
        return;
      }
      if (f.size === 0) {
        toast.error(`«${f.name}» está vacío`);
        return;
      }
      total += f.size;
    }
    if (total > EMAIL_ATTACHMENTS_MAX_BYTES) {
      toast.error(
        `Entre todos los adjuntos no pueden pasar de ${formatMB(EMAIL_ATTACHMENTS_MAX_BYTES)} (quedarían en ${formatMB(total)})`
      );
      return;
    }

    setUploading(true);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        const res: any = await uploadEmailAttachment(fd);
        if (res.error) {
          toast.error(res.error);
          break;
        }
        setAttachments((prev) => [
          ...prev,
          { id: res.attachment.id, fileName: res.attachment.file_name, size: res.attachment.size_bytes },
        ]);
      }
    } catch (err) {
      console.error("Error subiendo adjunto:", err);
      toast.error("No se pudo subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    deleteEmailAttachment(id).catch(() => {});
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
          attachmentIds,
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

  const runSchedule = async () => {
    const err = validateDraft() || scheduleError;
    if (err) {
      toast.error(err);
      return;
    }
    setConfirmOpen(false);
    setScheduling(true);
    try {
      const res: any = await scheduleEmailBatch({
        projectSlug,
        audience,
        subject,
        body,
        reservationIds: selectedList.map((r) => r.id),
        attachmentIds,
        fecha: schedDate,
        hora: schedTime,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Envío programado para el ${formatoFechaHoraChile(res.scheduledAt)} (hora de Chile). Puedes cancelarlo en «Programados».`
      );
      onScheduled?.();
    } catch (err) {
      console.error("Error programando el envío:", err);
      toast.error("No se pudo programar el envío");
    } finally {
      setScheduling(false);
    }
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
        attachmentIds,
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
            ref={subjectRef}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={() => setActiveField("subject")}
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
            onFocus={() => setActiveField("body")}
            rows={8}
            disabled={sending}
            placeholder="Escribe el mensaje tal como lo leería el cliente. El logo y la cabecera se agregan solos."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-800 focus:border-brand-500 outline-none transition-all font-sans leading-relaxed resize-y disabled:opacity-60"
          />
        </div>

        {/* Selector interactivo de metacampos con categorías y ayuda (?) */}
        <EmailVariableSelector onInsert={insertVariable} disabled={sending} />

        {/* Adjuntos: van los mismos archivos a todos los destinatarios */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Paperclip className="w-3.5 h-3.5" />
              Archivos adjuntos (opcional)
            </label>
            <span className="text-[10px] font-bold tabular-nums text-slate-400">
              {attachments.length} / {EMAIL_ATTACHMENTS_MAX_FILES} · {formatMB(attachmentsBytes)} de{" "}
              {formatMB(EMAIL_ATTACHMENTS_MAX_BYTES)}
            </span>
          </div>

          {attachments.length > 0 && (
            <ul className="space-y-1.5">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                >
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 truncate" title={a.fileName}>
                    {a.fileName}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 tabular-nums flex-shrink-0">
                    {formatMB(a.size)}
                  </span>
                  <button
                    onClick={() => removeAttachment(a.id)}
                    disabled={sending || scheduling}
                    title="Quitar archivo"
                    className="text-slate-400 hover:text-red-600 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || scheduling || uploading || attachments.length >= EMAIL_ATTACHMENTS_MAX_FILES}
            className="px-3 py-2 rounded-xl bg-white border border-dashed border-slate-300 text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
            {uploading ? "Subiendo..." : attachments.length ? "Agregar más archivos" : "Adjuntar archivos"}
          </button>
          <p className="text-[10px] font-semibold text-slate-400">
            Puedes elegir varios a la vez (PDF, imágenes, Word, Excel...). Llegan los mismos archivos a todos
            los destinatarios. La prueba también los lleva, para que veas que llegan bien.
          </p>
        </div>

        {/* Vista previa en vivo: se actualiza sola al marcar a alguien abajo
            o al escribir, sin tener que mandar nada. */}
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Eye className="w-3.5 h-3.5" />
              Vista previa
            </div>
            <p className="text-[10px] font-semibold text-slate-400">
              {previewSource
                ? `Con los datos de ${previewSource.clientName}`
                : "Marca a un cliente abajo para ver sus datos acá"}
            </p>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 truncate">
              <span className="text-slate-400">Asunto: </span>
              {previewSubject}
            </div>
            {attachments.length > 0 && (
              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 truncate">
                <Paperclip className="w-3 h-3 inline -mt-0.5 mr-1 text-slate-400" />
                {attachments.map((a) => a.fileName).join(", ")}
              </div>
            )}
            <iframe
              title="Vista previa del correo"
              srcDoc={previewHtml}
              className="w-full h-72 bg-white"
              sandbox=""
            />
          </div>
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
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex bg-slate-50 border border-slate-200 rounded-xl p-1 w-fit">
          {[
            { id: "now" as const, label: "Enviar ahora", icon: Send },
            { id: "schedule" as const, label: "Programar envío", icon: CalendarClock },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setSendMode(m.id)}
              disabled={sending || scheduling}
              className={cn(
                "px-3 py-1.5 text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50",
                sendMode === m.id ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <m.icon className="w-3.5 h-3.5" />
              {m.label}
            </button>
          ))}
        </div>

        {sendMode === "schedule" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Día</label>
                <input
                  type="date"
                  value={schedDate}
                  min={chileNow.fecha}
                  onChange={(e) => setSchedDate(e.target.value)}
                  disabled={scheduling}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Hora (Chile)
                </label>
                <input
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  disabled={scheduling}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:border-brand-500 outline-none"
                />
              </div>
            </div>
            <p className={cn("text-[10px] font-semibold", scheduleError ? "text-red-700" : "text-slate-400")}>
              {scheduleError
                ? scheduleError
                : `Sale el ${formatoFechaHoraChile(scheduledAt)} hora de Chile (ahora en Chile son las ${chileNow.hora}).`}{" "}
              {!scheduleError &&
                "Los montos y días de mora se calculan a esa hora, y a quien ya no esté en el segmento (por ejemplo, porque pagó) no le llega."}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{selected.size} destinatario(s) seleccionados</p>
          <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
            Se envían en tramos de {CHUNK_SIZE}, espaciados
            {attachments.length > 0 && ` · ${attachments.length} adjunto(s)`}
          </p>
        </div>

        {sendMode === "schedule" ? (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={selected.size === 0 || loading || !configured || scheduling || uploading || !!scheduleError}
            className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {scheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
            Programar a {selected.size}
          </button>
        ) : sending ? (
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
            disabled={selected.size === 0 || loading || !configured || uploading}
            className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            Enviar a {selected.size}
          </button>
        )}
        </div>
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
            <h3 className="text-base font-bold text-slate-900">
              {sendMode === "schedule"
                ? `¿Programar el envío a ${selected.size} clientes?`
                : `¿Enviar a ${selected.size} clientes?`}
            </h3>
            <p className="text-xs font-medium text-slate-500 leading-relaxed">
              Asunto: <span className="font-bold text-slate-700">{subject}</span>
              {attachments.length > 0 && (
                <>
                  <br />
                  Adjuntos: <span className="font-bold text-slate-700">{attachments.map((a) => a.fileName).join(", ")}</span>
                </>
              )}
              {sendMode === "schedule" && (
                <>
                  <br />
                  Sale el <span className="font-bold text-slate-700">{formatoFechaHoraChile(scheduledAt)}</span>{" "}
                  (hora de Chile). Hasta esa hora lo puedes cancelar en «Programados».
                </>
              )}
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
                onClick={sendMode === "schedule" ? runSchedule : runBatch}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                {sendMode === "schedule" ? "Sí, programar" : "Sí, enviar"}
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
