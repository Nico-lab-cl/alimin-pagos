"use client";

import { Send, CheckCircle2, XCircle, PhoneOff, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORY_DESCRIPTIONS,
  type WhatsappCategory,
} from "@/lib/whatsappTemplates";
import { CATEGORY_STYLES } from "./categoryStyles";

/**
 * Panel del modulo: cuantos mensajes han salido y a cuanta gente se le puede
 * escribir hoy en cada categoria.
 *
 * La distincion importante de esta pantalla es "enviados" (historico de lo que
 * salio) contra "audiencia" (cuantos clientes estan en ese estado ahora mismo).
 * Son dos numeros que se leen distinto y por eso no comparten tarjeta.
 */
export default function WhatsappPanel({
  overview,
  onPickCategory,
}: {
  overview: any;
  onPickCategory: (category: WhatsappCategory) => void;
}) {
  const stats = overview.stats;
  const audienceByCategory = new Map(
    (overview.audience || []).map((a: any) => [a.category, a])
  );

  const maxDaily = Math.max(...(overview.daily || []).map((d: any) => d.count), 1);

  const formatDay = (key: string) => {
    const [, m, d] = key.split("-");
    return `${d}/${m}`;
  };

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
      {/* Indicadores generales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Enviados hoy", value: stats.sentToday, hint: "Últimas 24 horas" },
          { label: "Últimos 7 días", value: stats.sent7, hint: "Mensajes entregados a Evolution" },
          { label: "Últimos 30 días", value: stats.sent30, hint: "Mensajes entregados a Evolution" },
          { label: "Total histórico", value: stats.sentTotal, hint: "Desde que se activó el módulo" },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4">
              {card.label}
            </span>
            <p className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
              {card.value.toLocaleString("es-CL")}
            </p>
            <p className="text-[10px] font-bold text-slate-400">{card.hint}</p>
          </div>
        ))}
      </div>

      {stats.failedTotal > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-xs font-semibold text-slate-600">
            <span className="font-bold text-red-700">{stats.failedTotal}</span> mensajes
            fallaron en total. Aparecen marcados en el historial de abajo con el motivo.
          </p>
        </div>
      )}

      {/* Categorías */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {stats.byCategory.map((cat: any) => {
          const style = CATEGORY_STYLES[cat.category as WhatsappCategory];
          const audience: any = audienceByCategory.get(cat.category) || {
            total: 0,
            reachable: 0,
            unreachable: 0,
          };

          return (
            <div
              key={cat.category}
              className={cn(
                "bg-white border rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden",
                style.border
              )}
            >
              <div className={cn("px-6 py-4 flex items-center gap-2.5", style.bg)}>
                <div className={cn("w-2 h-2 rounded-full flex-shrink-0", style.dot)} />
                <span className={cn("text-xs font-bold uppercase tracking-wide", style.text)}>
                  {cat.label}
                </span>
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Mensajes enviados
                </span>
                <p className="text-3xl font-bold text-slate-800 tracking-tight">
                  {cat.count.toLocaleString("es-CL")}
                </p>

                <div className="mt-5 pt-5 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-500 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      Clientes hoy
                    </span>
                    <span className="font-bold text-slate-800">{audience.total}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-500 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Contactables
                    </span>
                    <span className="font-bold text-emerald-700">{audience.reachable}</span>
                  </div>
                  {audience.unreachable > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-500 flex items-center gap-1.5">
                        <PhoneOff className="w-3.5 h-3.5 text-red-500" />
                        Teléfono inválido
                      </span>
                      <span className="font-bold text-red-700">{audience.unreachable}</span>
                    </div>
                  )}
                </div>

                <p className="text-[10px] font-medium text-slate-400 leading-relaxed mt-5">
                  {CATEGORY_DESCRIPTIONS[cat.category as WhatsappCategory]}
                </p>

                <button
                  onClick={() => onPickCategory(cat.category)}
                  disabled={audience.reachable === 0}
                  className="mt-5 w-full px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" />
                  {audience.reachable > 0
                    ? `Enviar a ${audience.reachable}`
                    : "Sin destinatarios"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actividad de los últimos 14 días */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">Mensajes por día</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
              Últimos 14 días
            </p>
          </div>
        </div>

        <div className="h-48 w-full flex items-end justify-between gap-1 pt-8">
          {(overview.daily || []).map((bar: any) => (
            <div key={bar.day} className="flex flex-col items-center gap-2 flex-1 group/bar">
              <div className="relative w-full max-w-10 bg-slate-50 rounded-t-lg h-28 flex flex-col justify-end">
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold px-2 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-sm z-10">
                  {bar.count} mensajes
                </div>
                <div
                  className="w-full bg-brand-600 rounded-t-md transition-all"
                  style={{ height: `${bar.count === 0 ? 2 : (bar.count / maxDaily) * 100}%` }}
                />
              </div>
              <span className="text-[9px] font-bold text-slate-400">{formatDay(bar.day)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Historial */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50/50">
          <h3 className="text-base font-bold text-slate-800">Últimos mensajes</h3>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {overview.recent?.length || 0} registros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Categoría</th>
                <th className="px-6 py-4">Número</th>
                <th className="px-6 py-4">Instancia</th>
                <th className="px-6 py-4">Enviado por</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
              {(overview.recent || []).map((msg: any) => {
                const style = CATEGORY_STYLES[msg.category as WhatsappCategory];
                return (
                  <tr key={msg.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3.5 font-bold text-slate-800 uppercase text-xs">
                      {msg.client_name}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                          style?.bg,
                          style?.border,
                          style?.text
                        )}
                      >
                        {msg.category}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 font-medium text-xs tabular-nums">
                      +{msg.phone}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 font-medium text-xs">
                      {msg.instance}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 font-medium text-xs">
                      {msg.sent_by}
                    </td>
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
                );
              })}

              {(overview.recent || []).length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-xs font-semibold text-slate-400 uppercase tracking-widest"
                  >
                    Todavía no se ha enviado ningún mensaje
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
