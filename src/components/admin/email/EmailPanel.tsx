"use client";

import { CheckCircle2, XCircle, Mail } from "lucide-react";

/**
 * Panel del modulo de correo: cuantos correos han salido, en que ventana de
 * tiempo, y los ultimos envios con su estado. Mismo patron que WhatsappPanel,
 * mas simple porque acá no hay "audiencia por categoría" fija que segmentar
 * de antemano: la audiencia se elige al momento de redactar.
 */
export default function EmailPanel({ overview }: { overview: any }) {
  const stats = overview.stats;

  const formatDateTime = (value: string | Date | null) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  return (
    <div className="space-y-6">
      {!overview.configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <Mail className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-700 leading-relaxed">
            Falta configurar el webhook de correo en el servidor
            (<span className="font-mono">N8N_EMAIL_WEBHOOK_URL</span>,{" "}
            <span className="font-mono">N8N_EMAIL_WEBHOOK_AUTH_HEADER</span>,{" "}
            <span className="font-mono">N8N_EMAIL_WEBHOOK_AUTH_VALUE</span>). Mientras tanto no se
            puede enviar nada desde acá.
          </p>
        </div>
      )}

      {!overview.canSend && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-600 leading-relaxed">
            Tu cuenta puede ver este panel y el historial, pero solo{" "}
            <span className="font-bold text-slate-800">postventa@lomasdelmar.cl</span> y{" "}
            <span className="font-bold text-slate-800">postventa@libertadyalegria.cl</span> pueden
            enviar correos masivos.
          </p>
        </div>
      )}

      {/* Indicadores generales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Enviados hoy", value: stats.sentToday, hint: "Últimas 24 horas" },
          { label: "Últimos 7 días", value: stats.sent7, hint: "Correos entregados a n8n" },
          { label: "Últimos 30 días", value: stats.sent30, hint: "Correos entregados a n8n" },
          { label: "Total histórico", value: stats.sentTotal, hint: "Desde que se activó el módulo" },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{card.label}</p>
            <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums">{card.value}</p>
            <p className="text-[10px] font-semibold text-slate-400 mt-1">{card.hint}</p>
          </div>
        ))}
      </div>

      {/* Historial reciente */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50/50">
          <h3 className="text-base font-bold text-slate-800">Últimos correos</h3>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {overview.recent?.length || 0} registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Asunto</th>
                <th className="px-6 py-4">Correo</th>
                <th className="px-6 py-4">Enviado por</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
              {(overview.recent || []).map((msg: any) => (
                <tr key={msg.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3.5 font-bold text-slate-800 uppercase text-xs">{msg.client_name}</td>
                  <td className="px-6 py-3.5 text-slate-600 font-medium text-xs max-w-xs truncate">
                    {msg.subject}
                  </td>
                  <td className="px-6 py-3.5 text-slate-500 font-medium text-xs">{msg.to_email}</td>
                  <td className="px-6 py-3.5 text-slate-500 font-medium text-xs">{msg.sent_by}</td>
                  <td className="px-6 py-3.5 text-slate-500 font-medium text-xs tabular-nums">
                    {formatDateTime(msg.created_at)}
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    {msg.status === "SENT" ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Enviado
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-700"
                        title={msg.error || "Error desconocido"}
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                        Falló
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {(overview.recent || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    Todavía no se ha enviado ningún correo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
