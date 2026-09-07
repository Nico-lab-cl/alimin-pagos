"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Loader2,
  Send,
  AlertTriangle,
  FileText,
  Users,
  Image as ImageIcon,
  Video as VideoIcon,
  Paperclip,
  X,
  UploadCloud,
  CheckCircle2,
  XCircle,
  Clock,
  FlaskConical,
  Eye,
  Trash2,
  MessageSquare,
  Sparkles,
  Search,
  ChevronRight,
  RefreshCw,
  PhoneOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  getWhatsappMassRecipients,
  startWhatsappMassBatch,
  sendWhatsappMassChunk,
  sendWhatsappMassTest,
  type WhatsappMassAttachment,
} from "@/actions/whatsapp";
import {
  WHATSAPP_MASS_AUDIENCES,
  MASS_AUDIENCE_LABELS,
  MASS_TEMPLATE_VARIABLES,
  type WhatsappMassAudience,
} from "@/lib/whatsappTemplates";
import { cn } from "@/lib/utils";

const CHUNK_SIZE = 5;
const MAX_PER_BATCH = 150;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AUDIENCE_OPTIONS: { id: WhatsappMassAudience; label: string; hint: string }[] = [
  { id: "TODOS", label: "Todos los clientes", hint: "Envío general a toda la base activa" },
  { id: "MORA", label: "En mora", hint: "Clientes con cuotas vencidas que generan multa" },
  { id: "GRACIA", label: "Días de gracia", hint: "Clientes vencidos dentro del período de gracia" },
  { id: "PROXIMO", label: "Próximo a pagar", hint: "Clientes con cuota por vencer en 5 días" },
  { id: "VENCIMIENTO", label: "Vence hoy", hint: "Clientes cuya cuota vence hoy" },
];

type Progress = { done: number; total: number; ok: number; failed: number };
type Failure = { clientName: string; error: string };

type UploadedAttachment = {
  media: string; // Base64 data URL
  mediatype: "image" | "video" | "document";
  fileName: string;
  mimetype: string;
  size: number;
  previewUrl?: string;
};

export default function WhatsappMassComposer({
  projectSlug,
  projects,
  onSent,
}: {
  projectSlug: string;
  projects: any[];
  onSent: () => void;
}) {
  const [audience, setAudience] = useState<WhatsappMassAudience>("TODOS");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [force, setForce] = useState(false);

  const [message, setMessage] = useState(
    "Estimado/a {nombre},\n\nLe escribimos de {proyecto} para compartirle una información importante respecto a su lote {lote}.\n\nAdjuntamos el archivo con el detalle.\n\nPuede revisar su estado de cuenta en: {portal}\n\nQuedamos atentos a cualquier consulta.\nSaludos cordiales."
  );
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  const [attachment, setAttachment] = useState<UploadedAttachment | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const stopRef = useRef(false);

  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);

  // Carga de destinatarios
  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    setProgress(null);
    setFailures([]);
    try {
      const res = await getWhatsappMassRecipients({ projectSlug, audience });
      if ((res as any).error) {
        toast.error((res as any).error);
        setData(null);
      } else {
        setData(res);
        const preselected = (res.recipients || [])
          .filter((r: any) => r.sendable && r.instanceReady && !r.alreadySentAt)
          .slice(0, MAX_PER_BATCH)
          .map((r: any) => r.id);
        setSelected(new Set(preselected));
      }
    } catch (err) {
      console.error("Error cargando destinatarios masivos:", err);
      toast.error("No se pudieron cargar los destinatarios");
    } finally {
      setLoading(false);
    }
  }, [projectSlug, audience]);

  useEffect(() => {
    load();
  }, [load]);

  const allRecipients: any[] = data?.recipients || [];

  const filteredRecipients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allRecipients;
    return allRecipients.filter(
      (r) =>
        r.clientName?.toLowerCase().includes(term) ||
        r.rut?.toLowerCase().includes(term) ||
        r.lotNumber?.toString().includes(term) ||
        r.rawPhone?.includes(term) ||
        r.projectName?.toLowerCase().includes(term)
    );
  }, [allRecipients, search]);

  const sendableList = useMemo(
    () => filteredRecipients.filter((r) => r.sendable && r.instanceReady),
    [filteredRecipients]
  );

  const selectedList = useMemo(
    () => allRecipients.filter((r) => selected.has(r.id)),
    [allRecipients, selected]
  );

  const previewSource = selectedList[0] || allRecipients[0] || null;

  // Renderizado en vivo para el preview estilo WhatsApp
  const renderedLiveMessage = useMemo(() => {
    if (!message.trim()) return "(Mensaje vacío)";
    const values: Record<string, string> = {
      "{nombre}": previewSource?.clientName || "Juan Pérez",
      "{proyecto}": previewSource?.projectName || "Arena y Sol",
      "{lote}": previewSource?.lotNumber ? String(previewSource.lotNumber) : "12",
      "{etapa}": previewSource?.lotStage ? String(previewSource.lotStage) : "1",
      "{rut}": previewSource?.rut || "12.345.678-9",
      "{portal}": "https://pagos.alimin.cl/user",
      "{saldo}": previewSource?.pendingBalance ? `$${Math.round(previewSource.pendingBalance).toLocaleString("es-CL")}` : "$2.450.000",
      "{monto}": "$120.000",
      "{fecha_vencimiento}": "15/09/2026",
    };
    return Object.entries(values).reduce(
      (text, [key, val]) => text.split(key).join(val),
      message
    );
  }, [message, previewSource]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_PER_BATCH) {
          toast.warning(`El máximo recomendado por tanda es de ${MAX_PER_BATCH} mensajes`);
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
    } else {
      const ids = sendableList.slice(0, MAX_PER_BATCH).map((r) => r.id);
      setSelected(new Set(ids));
    }
  };

  const insertVariable = (variable: string) => {
    const el = messageRef.current;
    if (!el) {
      setMessage((prev) => prev + variable);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + variable + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    });
  };

  // Manejo de carga de archivos (Imágenes, Videos, Documentos)
  const processFile = (file: File) => {
    let mediatype: "image" | "video" | "document" = "document";
    const mime = file.type.toLowerCase();

    if (mime.startsWith("image/")) {
      mediatype = "image";
      if (file.size > 5 * 1024 * 1024) {
        toast.error("La imagen supera el límite de 5 MB");
        return;
      }
    } else if (mime.startsWith("video/")) {
      mediatype = "video";
      if (file.size > 16 * 1024 * 1024) {
        toast.error("El video supera el límite de 16 MB para WhatsApp");
        return;
      }
    } else {
      mediatype = "document";
      if (file.size > 20 * 1024 * 1024) {
        toast.error("El documento supera el límite de 20 MB");
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const previewUrl = URL.createObjectURL(file);
      setAttachment({
        media: base64,
        mediatype,
        fileName: file.name,
        mimetype: file.type || "application/octet-stream",
        size: file.size,
        previewUrl,
      });
      toast.success(`Archivo adjuntado: ${file.name}`);
    };
    reader.onerror = () => {
      toast.error("Error al leer el archivo");
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const removeAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Envío de Prueba
  const runTest = async () => {
    if (!testPhone.trim()) {
      toast.error("Ingresa un número de WhatsApp para la prueba");
      return;
    }
    if (!message.trim() && !attachment) {
      toast.error("Escribe un mensaje o adjunta un archivo antes de probar");
      return;
    }

    setTesting(true);
    try {
      const payloadAttachment: WhatsappMassAttachment | null = attachment
        ? {
            media: attachment.media,
            mediatype: attachment.mediatype,
            fileName: attachment.fileName,
            mimetype: attachment.mimetype,
          }
        : null;

      const res = await sendWhatsappMassTest({
        projectSlug: projectSlug === "ALL" ? (projects[0]?.slug || "arena-y-sol") : projectSlug,
        phone: testPhone,
        message,
        attachment: payloadAttachment,
      });

      if ((res as any).error) {
        toast.error((res as any).error);
      } else {
        toast.success(`Mensaje de prueba enviado exitosamente a ${res.sentTo}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Error al enviar mensaje de prueba");
    } finally {
      setTesting(false);
    }
  };

  // Envío Masivo por Tramos
  const runBatch = async () => {
    if (selected.size === 0) {
      toast.error("Selecciona al menos un destinatario");
      return;
    }
    if (!message.trim() && !attachment) {
      toast.error("Debe ingresar un mensaje de texto o adjuntar un archivo");
      return;
    }

    setConfirmOpen(false);
    setSending(true);
    stopRef.current = false;

    const targets = Array.from(selected);
    setProgress({ done: 0, total: targets.length, ok: 0, failed: 0 });
    setFailures([]);

    // Registro de inicio en auditoría
    await startWhatsappMassBatch({
      projectSlug,
      audience,
      total: targets.length,
      hasAttachment: Boolean(attachment),
    });

    const payloadAttachment: WhatsappMassAttachment | null = attachment
      ? {
          media: attachment.media,
          mediatype: attachment.mediatype,
          fileName: attachment.fileName,
          mimetype: attachment.mimetype,
        }
      : null;

    let okCount = 0;
    let failedCount = 0;
    const allFailures: Failure[] = [];

    for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
      if (stopRef.current) {
        toast.warning("Envío masivo detenido por el usuario.");
        break;
      }

      const chunk = targets.slice(i, i + CHUNK_SIZE);
      try {
        const res = await sendWhatsappMassChunk({
          reservationIds: chunk,
          message,
          attachment: payloadAttachment,
          force,
        });

        if (res.error) {
          failedCount += chunk.length;
          chunk.forEach((id) => {
            const r = allRecipients.find((x) => x.id === id);
            allFailures.push({ clientName: r?.clientName || id, error: res.error! });
          });
        } else if (res.results) {
          res.results.forEach((r) => {
            if (r.ok) {
              okCount += 1;
            } else {
              failedCount += 1;
              allFailures.push({ clientName: r.clientName, error: r.error || "Error desconocido" });
            }
          });
        }
      } catch (err: any) {
        failedCount += chunk.length;
        chunk.forEach((id) => {
          const r = allRecipients.find((x) => x.id === id);
          allFailures.push({ clientName: r?.clientName || id, error: err?.message || "Error en petición" });
        });
      }

      const done = Math.min(i + CHUNK_SIZE, targets.length);
      setProgress({ done, total: targets.length, ok: okCount, failed: failedCount });
      setFailures([...allFailures]);

      if (done < targets.length && !stopRef.current) {
        await sleep(3000);
      }
    }

    setSending(false);
    if (!stopRef.current) {
      toast.success(`Difusión finalizada: ${okCount} enviados, ${failedCount} fallidos.`);
      onSent();
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Selector de Segmento / Audiencia */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-600" />
              1. Segmento de Destinatarios
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Elige a qué grupo de clientes deseas dirigir esta difusión masiva.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading || sending}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Recargar audiencia
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-5">
          {AUDIENCE_OPTIONS.map((opt) => {
            const active = audience === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAudience(opt.id)}
                disabled={sending}
                className={cn(
                  "p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                  active
                    ? "bg-brand-50 border-brand-500 ring-2 ring-brand-500/20 shadow-xs"
                    : "bg-slate-50/50 border-slate-200 hover:border-slate-300 hover:bg-white"
                )}
              >
                <div>
                  <p className={cn("text-xs font-bold", active ? "text-brand-900" : "text-slate-800")}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">
                    {opt.hint}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid: Editor + Adjuntos (Izquierda) vs Vista Previa en Vivo (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Columna Izquierda: Redactor y Subida de Archivos (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-brand-600" />
                2. Redactar Mensaje
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Escribe el texto que acompañará a la difusión. Puedes insertar variables dinámicas.
              </p>
            </div>

            {/* Píldoras de Variables */}
            <div>
              <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Variables Disponibles (Clic para insertar)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MASS_TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 border border-slate-200 text-[11px] font-mono font-semibold text-slate-700 transition-all cursor-pointer"
                    title={v.description}
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div>
              <textarea
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                placeholder="Escribe el mensaje de WhatsApp aquí..."
                className="w-full p-4 rounded-xl border border-slate-200 text-xs font-normal text-slate-800 leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-slate-400 resize-y"
              />
              <div className="flex justify-between items-center mt-1 text-[11px] text-slate-400">
                <span>WhatsApp admite formato con *negrita*, _cursiva_ y ~tachado~.</span>
                <span>{message.length} caracteres</span>
              </div>
            </div>

            {/* Sección de Adjuntos */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                  Archivo Adjunto (Opcional)
                </p>
                <span className="text-[10px] text-slate-400">Imágenes (5MB), Videos (16MB), Documentos (20MB)</span>
              </div>

              {!attachment ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5",
                    isDragging
                      ? "border-brand-500 bg-brand-50/50 scale-[0.99]"
                      : "border-slate-200 hover:border-brand-400 hover:bg-slate-50/50 bg-slate-50/20"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="w-10 h-10 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Haz clic para subir o arrastra y suelta tu archivo aquí
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Soporta JPG, PNG, MP4, PDF, Word o Excel
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 text-brand-600">
                      {attachment.mediatype === "image" && <ImageIcon className="w-5 h-5" />}
                      {attachment.mediatype === "video" && <VideoIcon className="w-5 h-5 text-purple-600" />}
                      {attachment.mediatype === "document" && <FileText className="w-5 h-5 text-blue-600" />}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-slate-800 truncate" title={attachment.fileName}>
                        {attachment.fileName}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {attachment.mediatype.toUpperCase()} • {(attachment.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeAttachment}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                    title="Quitar archivo adjunto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bloque de Envío de Prueba */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div>
              <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-amber-600" />
                Envío de Prueba Previo
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Recibe este mensaje y su archivo en tu WhatsApp antes de soltar la tanda.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+56 9 1234 5678"
                className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-brand-500 shadow-xs w-40"
              />
              <button
                type="button"
                onClick={runTest}
                disabled={testing || (!message.trim() && !attachment)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50 flex-shrink-0"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-brand-600" />}
                Probar
              </button>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Vista Previa en Vivo WhatsApp (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-brand-600" />
              Vista Previa en Vivo
            </h2>
            <p className="text-xs text-slate-500 mb-5">
              Simulación de cómo visualizará el cliente el mensaje en su teléfono.
            </p>

            {/* Teléfono Mockup WhatsApp */}
            <div className="bg-[#EFEAE2] border border-slate-300 rounded-2xl overflow-hidden shadow-inner flex flex-col min-h-[460px]">
              {/* Header de WhatsApp */}
              <div className="bg-[#075E54] px-4 py-3 text-white flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                  {previewSource?.projectName?.charAt(0) || "P"}
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight">
                    {previewSource?.projectName || "Postventa Inmobiliaria"}
                  </p>
                  <p className="text-[10px] text-emerald-100">Cuenta de empresa</p>
                </div>
              </div>

              {/* Chat Container */}
              <div className="p-4 flex-1 flex flex-col justify-end space-y-3">
                {/* Burbuja de Mensaje */}
                <div className="bg-white rounded-2xl rounded-tl-sm p-3 shadow-xs max-w-[92%] self-start border border-slate-100 space-y-2.5">
                  {/* Vista de Medio Adjunto */}
                  {attachment && (
                    <div className="rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80">
                      {attachment.mediatype === "image" && attachment.previewUrl && (
                        <img
                          src={attachment.previewUrl}
                          alt="Preview"
                          className="w-full max-h-52 object-cover"
                        />
                      )}
                      {attachment.mediatype === "video" && attachment.previewUrl && (
                        <video
                          src={attachment.previewUrl}
                          controls
                          className="w-full max-h-52 object-cover bg-black"
                        />
                      )}
                      {attachment.mediatype === "document" && (
                        <div className="p-3 flex items-center gap-2.5 bg-slate-50">
                          <FileText className="w-6 h-6 text-red-500 flex-shrink-0" />
                          <div className="overflow-hidden">
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {attachment.fileName}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {(attachment.size / (1024 * 1024)).toFixed(2)} MB • Documento
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Texto Renderizado */}
                  <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {renderedLiveMessage}
                  </p>

                  <div className="flex justify-end items-center gap-1 text-[9px] text-slate-400">
                    <span>12:00</span>
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Destinatarios y Selección Masiva */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-600" />
              3. Destinatarios Seleccionados ({selected.size} de {sendableList.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Revisa y filtra la lista antes de soltar la tanda masiva.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente, RUT, lote..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-brand-500 w-52"
              />
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
            >
              {selected.size > 0 ? "Desmarcar todos" : "Seleccionar todos"}
            </button>
          </div>
        </div>

        {/* Checkbox Forzar 24h */}
        <div className="flex items-center gap-2 p-3 bg-amber-50/50 border border-amber-200/80 rounded-xl text-xs text-amber-800">
          <input
            type="checkbox"
            id="forceSendMass"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="rounded border-amber-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
          />
          <label htmlFor="forceSendMass" className="cursor-pointer font-medium">
            Omitir bloqueo antirrepetición de 24 horas (enviar incluso a quienes recibieron difusión recientemente).
          </label>
        </div>

        {/* Tabla */}
        <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-[360px] overflow-y-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="p-3 w-10 text-center">Sel.</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Proyecto / Lote</th>
                <th className="p-3">Teléfono WhatsApp</th>
                <th className="p-3">Estado Cuenta</th>
                <th className="p-3">Último Envío (24h)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredRecipients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    No se encontraron clientes en este segmento o filtro.
                  </td>
                </tr>
              ) : (
                filteredRecipients.map((r) => {
                  const isChecked = selected.has(r.id);
                  const isReady = r.sendable && r.instanceReady;
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "hover:bg-slate-50/80 transition-colors",
                        isChecked && "bg-brand-50/30",
                        !isReady && "opacity-60 bg-slate-50/30"
                      )}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!isReady || sending}
                          onChange={() => toggleSelect(r.id)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="p-3">
                        <p className="font-bold text-slate-800">{r.clientName || "Sin nombre"}</p>
                        <p className="text-[11px] text-slate-400">{r.rut || "Sin RUT"}</p>
                      </td>
                      <td className="p-3">
                        <p className="font-semibold text-slate-800">{r.projectName}</p>
                        <p className="text-[11px] text-slate-400">Lote {r.lotNumber || "—"}</p>
                      </td>
                      <td className="p-3">
                        {r.sendable ? (
                          <span className="font-mono text-slate-700">{r.phoneDisplay || r.rawPhone}</span>
                        ) : (
                          <span className="text-red-600 text-[11px] font-semibold flex items-center gap-1">
                            <PhoneOff className="w-3 h-3" />
                            {r.phoneError || "Inválido"}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            r.status === "LATE" && "bg-red-50 text-red-700 border border-red-200",
                            r.status === "GRACE" && "bg-amber-50 text-amber-700 border border-amber-200",
                            r.status === "UPCOMING" && "bg-blue-50 text-blue-700 border border-blue-200",
                            r.status === "CURRENT" && "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          )}
                        >
                          {r.status || "OK"}
                        </span>
                      </td>
                      <td className="p-3 text-[11px] text-slate-500">
                        {r.alreadySentAt ? (
                          <span className="text-amber-700 font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Enviado hoy
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Botón Principal de Lanzamiento */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Se enviarán <strong className="text-slate-900">{selected.size} mensajes</strong> en tramos de 5 con pausas antispam de 3 a 8 segundos.
          </div>

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={selected.size === 0 || sending || (!message.trim() && !attachment)}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            Iniciar Envío Masivo ({selected.size})
          </button>
        </div>
      </div>

      {/* Modal de Confirmación */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 mx-auto">
              <Send className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-slate-900">¿Confirmar Envío Masivo?</h3>
              <p className="text-xs text-slate-500">
                Estás a punto de enviar un mensaje de difusión vía WhatsApp a:
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Total destinatarios:</span>
                <strong className="text-slate-900">{selected.size} clientes</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Archivo adjunto:</span>
                <strong className="text-slate-900">
                  {attachment ? `${attachment.fileName} (${attachment.mediatype})` : "Ninguno (Solo texto)"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Segmento:</span>
                <strong className="text-slate-900">{MASS_AUDIENCE_LABELS[audience]}</strong>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={runBatch}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                Sí, Enviar Ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Progreso del Envío */}
      {sending && progress && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scale-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Enviando Difusión por WhatsApp...</h3>
                  <p className="text-[11px] text-slate-500">Tramos de 5 con pausas antispam de seguridad</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopRef.current = true;
                  toast.info("Deteniendo al finalizar el tramo actual...");
                }}
                className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs font-bold transition-all cursor-pointer"
              >
                Detener
              </button>
            </div>

            {/* Barra de Progreso */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>{progress.done} de {progress.total} procesados</span>
                <span>{Math.round((progress.done / progress.total) * 100)}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div
                  className="h-full bg-brand-600 transition-all duration-300 rounded-full"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-emerald-700 font-bold text-lg">{progress.ok}</p>
                <p className="text-emerald-600 text-[10px] font-semibold uppercase">Entregados</p>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-red-700 font-bold text-lg">{progress.failed}</p>
                <p className="text-red-600 text-[10px] font-semibold uppercase">Fallidos</p>
              </div>
            </div>

            {failures.length > 0 && (
              <div className="border border-red-100 bg-red-50/50 rounded-xl p-3 max-h-32 overflow-y-auto space-y-1">
                <p className="text-[11px] font-bold text-red-800">Errores registrados:</p>
                {failures.map((f, idx) => (
                  <p key={idx} className="text-[10px] text-red-700">
                    • <strong>{f.clientName}</strong>: {f.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
