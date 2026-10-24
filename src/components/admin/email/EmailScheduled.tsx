"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CalendarClock, Paperclip, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getScheduledEmailBatches, cancelScheduledEmailBatch } from "@/actions/email";
import { formatoFechaHoraChile } from "@/lib/horaChile";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Programado", className: "bg-brand-50 text-brand-700 border-brand-100" },
  SENDING: { label: "Enviando", className: "bg-amber-50 text-amber-700 border-amber-200" },
  SENT: { label: "Enviado", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PARTIAL: { label: "Enviado con errores", className: "bg-amber-50 text-amber-700 border-amber-200" },
  FAILED: { label: "Falló", className: "bg-red-50 text-red-700 border-red-200" },
  CANCELLED: { label: "Cancelado", className: "bg-slate-100 text-slate-500 border-slate-200" },
  EXPIRED: { label: "No salió", className: "bg-red-50 text-red-700 border-red-200" },
};

/**
 * Tandas de correo programadas: las que vienen (con boton para cancelar) y
 * las que ya salieron, con cuantos llegaron, cuantos fallaron y a quienes se
 * omitio porque al momento del envio ya no estaban en el segmento.
 */
export default function EmailScheduled({ projectSlug }: { projectSlug: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await getScheduledEmailBatches({ projectSlug });
      if (res.error) setError(res.error);
      setData(res);
    } catch (err) {
      console.error("Error cargando envíos programados:", err);
      setError("No se pudieron cargar los envíos programados");
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    load();
  }, [load]);

  // Mientras haya algo saliendo, refrescar solo para ver el avance.
  const batches: any[] = data?.batches || [];
  const anySending = batches.some((b) => b.status === "SENDING");
  useEffect(() => {
    if (!anySending) return;
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [anySending, load]);

  const cancel = async (id: string) => {
    setCancelling(id);
    try {
      const res: any = await cancelScheduledEmailBatch(id);
      if (res.error) toast.error(res.error);
      else toast.success("Envío cancelado");
      await load();
    } finally {
      setCancelling(null);
    }
  };

  const upcoming = batches.filter((b) => b.status === "PENDING" || b.status === "SENDING");
  const past = batches.filter((b) => b.status !== "PENDING" && b.status !== "SENDING");

  const renderRow = (b: any) => {
    const st = STATUS[b.status] || { label: b.status, className: "bg-slate-100 text-slate-600 border-slate-200" };
    const detail: any[] = Array.isArray(b.detail) ? b.detail : [];
    const done = b.sent_count + b.failed_count + b.skipped_count;
    return (
      <div key={b.id} className="px-6 py-4 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-800 truncate">{b.subject}</p>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
              <CalendarClock className="w-3 h-3 inline -mt-0.5 mr-1 text-slate-400" />
              {formatoFechaHoraChile(b.scheduled_at)} (hora Chile) · {b.total} destinatario(s) · {b.audienceLabel} ·{" "}
              {b.projectName}
            </p>
            {b.attachments?.length > 0 && (
              <p className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
                <Paperclip className="w-3 h-3 inline -mt-0.5 mr-1 text-slate-400" />
                {b.attachments.map((a: any) => a.file_name).join(", ")}
              </p>
            )}
            <p className="text-[10px] font-medium text-slate-400 mt-0.5">
              Programado por {b.created_by}
              {b.cancelled_by && ` · cancelado por ${b.cancelled_by}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={cn("text-[10px] font-bold uppercase px-2 py-1 rounded-lg border", st.className)}>
              {st.label}
            </span>
            {(b.status === "PENDING" || b.status === "SENDING") && data?.canSend && (
              <button
                onClick={() => cancel(b.id)}
                disabled={cancelling === b.id}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-red-700 hover:bg-red-50 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {cancelling === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                {b.status === "SENDING" ? "Detener" : "Cancelar"}
              </button>
            )}
          </div>
        </div>

        {(done > 0 || b.status === "SENDING") && (
          <p className="text-[11px] font-bold text-slate-600">
            <span className="text-emerald-700">{b.sent_count} enviados</span>
            {b.failed_count > 0 && <span className="text-red-700 ml-2">{b.failed_count} con error</span>}
            {b.skipped_count > 0 && (
              <span className="text-slate-500 ml-2">{b.skipped_count} omitidos (ya no estaban en el segmento)</span>
            )}
            {b.status === "SENDING" && <span className="text-slate-400 ml-2">· {done} de {b.total}</span>}
            {detail.length > 0 && (
              <button
                onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                className="ml-2 text-brand-600 hover:text-brand-700 cursor-pointer"
              >
                {expanded === b.id ? "Ocultar detalle" : "Ver detalle"}
              </button>
            )}
          </p>
        )}
        {b.error && <p className="text-[11px] font-semibold text-red-700">{b.error}</p>}
        {expanded === b.id && detail.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1 bg-slate-50 rounded-xl p-3">
            {detail.map((d: any, i: number) => (
              <p key={i} className={cn("text-[11px] font-semibold", d.skipped ? "text-slate-500" : "text-red-700")}>
                {d.clientName}: {d.error}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">
          Los envíos programados salen solos a la hora indicada (hora de Chile), aunque nadie tenga el portal abierto.
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-700">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : (
        <>
          {[
            { title: "Próximos", rows: upcoming, empty: "No hay envíos programados." },
            { title: "Anteriores", rows: past, empty: "Todavía no sale ningún envío programado." },
          ].map((section) => (
            <div key={section.title} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800">{section.title}</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {section.rows.length}
                </span>
              </div>
              {section.rows.length === 0 ? (
                <p className="py-10 text-center text-xs font-semibold text-slate-400">{section.empty}</p>
              ) : (
                <div className="divide-y divide-slate-100">{section.rows.map(renderRow)}</div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
