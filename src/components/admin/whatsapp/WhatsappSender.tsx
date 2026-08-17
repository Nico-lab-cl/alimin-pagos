"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  Send,
  AlertTriangle,
  PhoneOff,
  Clock,
  XCircle,
  X,
  FlaskConical,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import {
  getWhatsappRecipients,
  sendWhatsappChunk,
  sendWhatsappTest,
  startWhatsappBatch,
} from "@/actions/whatsapp";
import {
  WHATSAPP_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  type WhatsappCategory,
} from "@/lib/whatsappTemplates";
import { cn } from "@/lib/utils";
import { CATEGORY_STYLES } from "./categoryStyles";

/** Destinatarios por llamada al servidor. Debe coincidir con MAX_CHUNK. */
const CHUNK_SIZE = 5;
/** Techo por tanda. Evita que un clic en "seleccionar todos" dispare 400 mensajes. */
const MAX_PER_BATCH = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Progress = { done: number; total: number; ok: number; failed: number };
type Failure = { clientName: string; error: string };

export default function WhatsappSender({
  projectSlug,
  projects,
  audience,
  initialCategory,
  onSent,
}: {
  projectSlug: string;
  projects: any[];
  audience: any[];
  initialCategory: WhatsappCategory | null;
  onSent: () => void;
}) {
  const [category, setCategory] = useState<WhatsappCategory>(initialCategory || "MORA");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [force, setForce] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const stopRef = useRef(false);

  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (initialCategory) setCategory(initialCategory);
  }, [initialCategory]);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    setProgress(null);
    setFailures([]);
    try {
      const res = await getWhatsappRecipients({ projectSlug, category });
      if ((res as any).error) {
        toast.error((res as any).error);
        setData(null);
      } else {
        setData(res);
        // Preseleccion: solo los contactables a los que no se les escribio en
        // las ultimas 24h. Los repetidos quedan fuera salvo que se marquen a mano.
        const preselected = (res.recipients || [])
          .filter((r: any) => r.sendable && r.instanceReady && !r.alreadySentAt)
          .slice(0, MAX_PER_BATCH)
          .map((r: any) => r.id);
        setSelected(new Set(preselected));
      }
    } catch (err) {
      console.error("Error cargando destinatarios:", err);
      toast.error("No se pudieron cargar los destinatarios");
    } finally {
      setLoading(false);
    }
  }, [projectSlug, category]);

  useEffect(() => {
    load();
  }, [load]);

  const recipients: any[] = data?.recipients || [];
  const sendableList = recipients.filter((r) => r.sendable && r.instanceReady);
  const blockedList = recipients.filter((r) => !r.sendable || !r.instanceReady);
  const selectedList = sendableList.filter((r) => selected.has(r.id));
  const repeatedSelected = selectedList.filter((r) => r.alreadySentAt).length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_PER_BATCH) {
          toast.warning(`El máximo por tanda es de ${MAX_PER_BATCH} mensajes`);
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
    if (sendableList.length > MAX_PER_BATCH) {
      toast.info(
        `Se seleccionaron los primeros ${MAX_PER_BATCH} de ${sendableList.length}. Envía el resto en otra tanda.`
      );
    }
  };

  const runBatch = async () => {
    setConfirmOpen(false);
    setSending(true);
    stopRef.current = false;

    const targets = selectedList.map((r) => r.id);
    const nameById = new Map(selectedList.map((r) => [r.id, r.clientName]));

    setProgress({ done: 0, total: targets.length, ok: 0, failed: 0 });
    setFailures([]);

    await startWhatsappBatch({ projectSlug, category, total: targets.length });

    let ok = 0;
    let failed = 0;
    const collected: Failure[] = [];

    for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
      if (stopRef.current) break;

      const chunk = targets.slice(i, i + CHUNK_SIZE);

      try {
        const res = await sendWhatsappChunk({ category, reservationIds: chunk, force });

        if (res.error) {
          // Falla de la llamada completa (autorizacion, plantilla apagada...):
          // no tiene sentido seguir con los tramos siguientes.
          toast.error(res.error);
          break;
        }

        for (const r of res.results || []) {
          if (r.ok) {
            ok++;
          } else {
            failed++;
            collected.push({ clientName: r.clientName, error: r.error || "Error desconocido" });
          }
        }
      } catch (err) {
        console.error("Error en el tramo de envío:", err);
        for (const id of chunk) {
          failed++;
          collected.push({
            clientName: nameById.get(id) || "?",
            error: "Se cortó la conexión con el servidor",
          });
        }
      }

      setProgress({
        done: Math.min(i + CHUNK_SIZE, targets.length),
        total: targets.length,
        ok,
        failed,
      });
      setFailures([...collected]);

      // Pausa entre tramos. Dentro del tramo la pausa la aplica el servidor.
      const hasMore = i + CHUNK_SIZE < targets.length;
      if (hasMore && !stopRef.current) {
        await sleep(3000 + Math.random() * 5000);
      }
    }

    setSending(false);

    if (stopRef.current) {
      toast.warning(`Envío detenido. Alcanzaron a salir ${ok} mensajes.`);
    } else if (failed === 0) {
      toast.success(`${ok} mensajes enviados.`);
    } else {
      toast.warning(`${ok} enviados, ${failed} con problemas. Revisa el detalle.`);
    }

    await load();
    onSent();
  };

  const runTest = async () => {
    if (!testPhone.trim()) {
      toast.error("Escribe un número para la prueba");
      return;
    }
    const targetProject = projectSlug === "ALL" ? projects[0]?.slug : projectSlug;
    if (!targetProject) {
      toast.error("No hay proyecto disponible para la prueba");
      return;
    }

    setTesting(true);
    try {
      const res = await sendWhatsappTest({
        projectSlug: targetProject,
        category,
        phone: testPhone,
      });
      if ((res as any).error) {
        toast.error((res as any).error);
      } else {
        toast.success(`Mensaje de prueba enviado a ${(res as any).sentTo}`);
      }
    } catch (err) {
      console.error("Error en el envío de prueba:", err);
      toast.error("No se pudo enviar el mensaje de prueba");
    } finally {
      setTesting(false);
    }
  };

  const formatCLP = (n: number) => `$${Math.round(n || 0).toLocaleString("es-CL")}`;
  const formatWhen = (value: string | Date) =>
    new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));

  const style = CATEGORY_STYLES[category];
  const summary = data?.summary;
  const preview = selectedList[0]?.preview || recipients[0]?.preview || "";

  return (
    <div className="space-y-6">
      {/* Selector de categoría */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {WHATSAPP_CATEGORIES.map((c) => {
          const s = CATEGORY_STYLES[c];
          const isActive = category === c;
          const aud: any = audience.find((a: any) => a.category === c);
          return (
            <button
              key={c}
              disabled={sending}
              onClick={() => setCategory(c)}
              className={cn(
                "px-4 py-3.5 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                isActive
                  ? cn(s.bg, s.border, "shadow-sm ring-1", s.border.replace("border-", "ring-"))
                  : "bg-white border-slate-200 hover:bg-slate-50"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={cn("w-2 h-2 rounded-full flex-shrink-0", s.dot)} />
                <span
                  className={cn(
                    "text-xs font-bold uppercase tracking-wide",
                    isActive ? s.text : "text-slate-600"
                  )}
                >
                  {CATEGORY_LABELS[c]}
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400">
                {aud ? `${aud.reachable} contactables de ${aud.total}` : "—"}
              </p>
            </button>
          );
        })}
      </div>

      <div className={cn("rounded-xl border px-4 py-3", style.bg, style.border)}>
        <p className={cn("text-[11px] font-semibold leading-relaxed", style.text)}>
          {CATEGORY_DESCRIPTIONS[category]}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 opacity-60">
            Buscando destinatarios...
          </p>
        </div>
      ) : !data ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Sin datos
          </p>
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "En esta categoría", value: summary.total, tone: "text-slate-800" },
              { label: "Se les puede escribir", value: summary.sendable, tone: "text-emerald-700" },
              { label: "Teléfono inválido", value: summary.badPhone, tone: "text-red-700" },
              { label: "Ya contactados (24h)", value: summary.alreadySent, tone: "text-amber-700" },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
              >
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                  {s.label}
                </span>
                <p className={cn("text-2xl font-bold tracking-tight", s.tone)}>{s.value}</p>
              </div>
            ))}
          </div>

          {summary.notConfigured > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-red-700">
                {summary.notConfigured} clientes quedan fuera porque su proyecto no tiene
                configurada la instancia de WhatsApp (faltan las variables de entorno de
                Evolution).
              </p>
            </div>
          )}

          {/* Vista previa y prueba */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800">Así llegará el mensaje</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  Con los datos reales de {selectedList[0]?.clientName || recipients[0]?.clientName || "—"}
                </p>
              </div>
              <div className="p-6">
                <div className="bg-[#dcf8c6] border border-[#c5e8ad] rounded-xl rounded-tr-sm p-4">
                  <p className="text-[13px] text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                    {preview || "Sin destinatarios para previsualizar."}
                  </p>
                </div>
                <p className="text-[10px] font-medium text-slate-400 mt-3">
                  El texto se edita en la pestaña «Plantillas».
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-slate-400" />
                  Probar antes de enviar
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  Manda un solo mensaje a tu propio número
                </p>
              </div>
              <div className="p-6 space-y-4">
                <input
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+56 9 1234 5678"
                  disabled={sending || testing}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-brand-500 outline-none transition-all font-medium disabled:opacity-50"
                />
                <button
                  onClick={runTest}
                  disabled={sending || testing}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FlaskConical className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  Enviar prueba
                </button>
                <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                  Usa los datos de un cliente real de esta categoría, pero el mensaje llega
                  marcado como prueba y solo al número que escribas aquí.
                </p>
              </div>
            </div>
          </div>

          {/* Progreso */}
          {progress && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {sending ? "Enviando mensajes..." : "Resultado de la tanda"}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    {progress.done} de {progress.total} · {progress.ok} enviados ·{" "}
                    {progress.failed} con problemas
                  </p>
                </div>
                {sending && (
                  <button
                    onClick={() => {
                      stopRef.current = true;
                      toast.info("Se detendrá al terminar el tramo en curso");
                    }}
                    className="px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Detener
                  </button>
                )}
              </div>

              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-brand-600 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>

              {failures.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      No se pudieron enviar ({failures.length})
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {failures.map((f, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-start gap-2.5">
                        <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-700 uppercase truncate">
                            {f.clientName}
                          </p>
                          <p className="text-[11px] font-medium text-red-700">{f.error}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Destinatarios */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-slate-200 bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-800">Destinatarios</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  {selected.size} seleccionados de {sendableList.length} contactables
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={force}
                    onChange={(e) => setForce(e.target.checked)}
                    disabled={sending}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  Permitir reenvío antes de 24h
                </label>

                <button
                  onClick={toggleAll}
                  disabled={sending || sendableList.length === 0}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selected.size > 0 ? "Quitar todos" : "Seleccionar todos"}
                </button>

                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={sending || selected.size === 0}
                  className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Enviar a {selected.size}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-4 w-10"></th>
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4">Lote</th>
                    <th className="px-6 py-4">WhatsApp</th>
                    <th className="px-6 py-4 text-right">Cuota</th>
                    <th className="px-6 py-4 text-right">Multa</th>
                    <th className="px-6 py-4 text-center">Días mora</th>
                    <th className="px-6 py-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
                  {sendableList.map((r) => {
                    const isSelected = selected.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => !sending && toggle(r.id)}
                        className={cn(
                          "transition-colors cursor-pointer",
                          isSelected ? "bg-brand-50/40" : "hover:bg-slate-50/50",
                          sending && "cursor-not-allowed opacity-70"
                        )}
                      >
                        <td className="px-6 py-3.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={sending}
                            className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-6 py-3.5">
                          <p className="font-bold text-slate-800 uppercase text-xs">
                            {r.clientName}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">{r.rut}</p>
                        </td>
                        <td className="px-6 py-3.5 text-slate-500 font-medium text-xs">
                          {r.projectName} · {r.lotNumber}
                        </td>
                        <td className="px-6 py-3.5 text-slate-600 font-semibold text-xs tabular-nums">
                          {r.phoneDisplay}
                          {r.phoneKind === "INTERNATIONAL" && (
                            <span className="ml-1.5 text-[9px] font-extrabold text-slate-400 uppercase">
                              Internacional
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right font-semibold text-slate-700 text-xs tabular-nums">
                          {formatCLP(r.installmentAmount)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-xs tabular-nums">
                          <span className={r.penaltyAmount > 0 ? "text-red-700" : "text-slate-400"}>
                            {formatCLP(r.penaltyAmount)}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-center text-xs font-bold tabular-nums">
                          {r.lateDays > 0 ? (
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] border",
                                r.lateDays > 90
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : r.lateDays > 30
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-slate-100 text-slate-600 border-slate-200"
                              )}
                            >
                              {r.lateDays}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          {r.alreadySentAt ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                              <Clock className="w-3.5 h-3.5 text-amber-500" />
                              {formatWhen(r.alreadySentAt)}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                              Sin contactar
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {sendableList.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-12 text-center text-xs font-semibold text-slate-400 uppercase tracking-widest"
                      >
                        No hay clientes contactables en esta categoría
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Los que quedan fuera */}
          {blockedList.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2.5 p-6 border-b border-slate-200 bg-slate-50/50">
                <PhoneOff className="w-4 h-4 text-red-500" />
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Quedan fuera de la tanda ({blockedList.length})
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    Corrige el teléfono en la ficha del cliente para incluirlos
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-6 py-4">Cliente</th>
                      <th className="px-6 py-4">Lote</th>
                      <th className="px-6 py-4">Lo que hay registrado</th>
                      <th className="px-6 py-4">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {blockedList.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3.5">
                          <p className="font-bold text-slate-800 uppercase text-xs">
                            {r.clientName}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">{r.rut}</p>
                        </td>
                        <td className="px-6 py-3.5 text-slate-500 font-medium text-xs">
                          {r.projectName} · {r.lotNumber}
                        </td>
                        <td className="px-6 py-3.5 text-slate-500 font-mono text-xs">
                          {r.rawPhone ? `"${r.rawPhone}"` : "—"}
                        </td>
                        <td className="px-6 py-3.5 text-red-700 font-semibold text-xs">
                          {r.phoneError ||
                            `Falta configurar la instancia de WhatsApp de ${r.projectSlug}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirmación */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Confirmar envío</h3>
              <button
                onClick={() => setConfirmOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-amber-700 leading-relaxed">
                  Esto le escribe por WhatsApp a clientes reales y no se puede deshacer.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-500">Mensajes a enviar</span>
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">
                    {selectedList.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-500">Categoría</span>
                  <span className={cn("font-bold", style.text)}>
                    {CATEGORY_LABELS[category]}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-500">Saldrán desde</span>
                  <span className="font-bold text-slate-800">
                    {Array.from(new Set(selectedList.map((r) => r.instanceKey))).join(" y ")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-500">Duración estimada</span>
                  <span className="font-bold text-slate-800 tabular-nums">
                    ~{Math.ceil((selectedList.length * 5.5) / 60)} min
                  </span>
                </div>
              </div>

              {repeatedSelected > 0 && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                  <Clock className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-red-700 leading-relaxed">
                    {repeatedSelected} de estos clientes ya recibieron este mismo mensaje en
                    las últimas 24 horas.
                    {force
                      ? " Se les volverá a enviar porque activaste el reenvío."
                      : " Se van a omitir automáticamente."}
                  </p>
                </div>
              )}

              <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
                Los mensajes salen de a uno con pausas de 3 a 8 segundos para no gatillar el
                antispam de WhatsApp. Puedes detener el envío en cualquier momento.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={runBatch}
                className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Sí, enviar {selectedList.length} mensajes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
