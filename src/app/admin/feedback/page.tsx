"use client";

import { useEffect, useState } from "react";
import { getFeedbackDashboard, updateFeedbackStatus } from "@/actions/feedback";
import { formatDate, cn } from "@/lib/utils";
import {
  Loader2,
  MessageSquare,
  Lightbulb,
  AlertCircle,
  Heart,
  Star,
  TrendingUp,
  Search,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

type FilterType = "ALL" | "NEW" | "NPS" | "COMMENT";

type FeedbackItem = {
  id: string;
  type: string;
  category: string | null;
  score: number | null;
  message: string | null;
  status: string;
  adminNote: string | null;
  pageContext: string | null;
  createdAt: string | null;
  clientName: string;
  clientEmail: string;
  lotNumber: string | null;
  projectName: string | null;
  reservationId: string | null;
};

type NpsSummary = {
  score: number | null;
  average: number | null;
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
};

type DashboardData = { items: FeedbackItem[]; nps: NpsSummary; pendingCount: number };

const CATEGORY_META: Record<string, { label: string; icon: LucideIcon }> = {
  SUGERENCIA: { label: "Sugerencia", icon: Lightbulb },
  PROBLEMA: { label: "Problema", icon: AlertCircle },
  FELICITACION: { label: "Felicitación", icon: Heart },
};

/** Clasificación NPS estándar: 9-10 promotor, 7-8 pasivo, 0-6 detractor. */
function scoreBucket(score: number) {
  if (score >= 9) return { label: "Promotor", className: "bg-emerald-100 border-emerald-500 text-emerald-700" };
  if (score >= 7) return { label: "Pasivo", className: "bg-slate-100 border-slate-300 text-slate-600" };
  return { label: "Detractor", className: "bg-red-100 border-red-500 text-red-700" };
}

export default function FeedbackPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("ALL");
  const [search, setSearch] = useState("");

  const load = () => {
    getFeedbackDashboard().then((result) => {
      if (result?.error) toast.error(result.error);
      else if (result?.success) {
        setData({ items: result.items, nps: result.nps, pendingCount: result.pendingCount });
      }
      setLoading(false);
    });
  };

  useEffect(load, []);

  const handleStatus = async (id: string, status: "READ" | "DONE") => {
    const result = await updateFeedbackStatus(id, status);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setData((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((i) => (i.id === id ? { ...i, status } : i));
      return { ...prev, items, pendingCount: items.filter((i) => i.status === "NEW").length };
    });
    toast.success(status === "DONE" ? "Marcado como atendido" : "Marcado como leído");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Cargando retroalimentación...</p>
      </div>
    );
  }

  const nps: NpsSummary = data?.nps || { score: null, average: null, responses: 0, promoters: 0, passives: 0, detractors: 0 };
  const items = (data?.items || []).filter((i) => {
    if (filter === "NEW" && i.status !== "NEW") return false;
    if (filter === "NPS" && i.type !== "NPS") return false;
    if (filter === "COMMENT" && i.type !== "COMMENT") return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (i.clientName || "").toLowerCase().includes(q) ||
      (i.message || "").toLowerCase().includes(q) ||
      (i.lotNumber || "").toString().toLowerCase().includes(q)
    );
  });

  const total = Math.max(1, nps.responses);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Retroalimentación</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Comentarios de los clientes y satisfacción (NPS) del portal de pagos.
        </p>
      </div>

      {/* Métricas NPS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border-[1.5px] border-brand-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-brand-600">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">NPS</span>
          </div>
          <p className="text-3xl font-bold text-slate-800 mt-2 tabular-nums">
            {nps.score === null ? "—" : nps.score}
          </p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">
            {nps.responses} {nps.responses === 1 ? "respuesta" : "respuestas"} · promedio{" "}
            {nps.average === null ? "—" : nps.average}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Promotores (9-10)</span>
          <p className="text-3xl font-bold text-emerald-700 mt-2 tabular-nums">{nps.promoters}</p>
          <div className="h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${(nps.promoters / total) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pasivos (7-8)</span>
          <p className="text-3xl font-bold text-slate-600 mt-2 tabular-nums">{nps.passives}</p>
          <div className="h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-slate-300" style={{ width: `${(nps.passives / total) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Detractores (0-6)</span>
          <p className="text-3xl font-bold text-red-700 mt-2 tabular-nums">{nps.detractors}</p>
          <div className="h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-red-500" style={{ width: `${(nps.detractors / total) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            ["ALL", `Todos (${data?.items?.length || 0})`],
            ["NEW", `Sin leer (${data?.pendingCount || 0})`],
            ["COMMENT", "Comentarios"],
            ["NPS", "Encuesta NPS"],
          ] as [FilterType, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border",
                filter === value
                  ? "bg-brand-600 border-brand-700 text-white shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, lote o texto..."
            className="w-full sm:w-72 pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:border-brand-600 focus:ring-2 focus:ring-brand-600/10 focus:outline-none"
          />
        </div>
      </div>

      {/* Listado */}
      {items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 shadow-sm flex flex-col items-center gap-3 text-center">
          <Inbox className="w-10 h-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-600">Todavía no hay comentarios acá</p>
          <p className="text-xs text-slate-400 font-medium max-w-sm">
            Cuando un cliente escriba desde el portal o responda la encuesta, aparecerá en esta lista.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isNps = item.type === "NPS";
            const bucket = isNps && item.score !== null ? scoreBucket(item.score) : null;
            const catMeta = item.category ? CATEGORY_META[item.category] : null;
            const CatIcon = catMeta?.icon || MessageSquare;

            return (
              <div
                key={item.id}
                className={cn(
                  "bg-white border rounded-2xl p-5 shadow-sm space-y-3",
                  item.status === "NEW" ? "border-brand-200 border-[1.5px]" : "border-slate-200"
                )}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 text-sm font-bold tabular-nums",
                        isNps ? bucket?.className : "bg-brand-50 border-brand-200 text-brand-600"
                      )}
                    >
                      {isNps ? item.score : <CatIcon className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{item.clientName}</p>
                      <p className="text-[11px] text-slate-400 font-semibold">
                        {item.lotNumber ? `Lote ${item.lotNumber}` : "Sin lote"}
                        {item.projectName ? ` · ${item.projectName}` : ""} · {formatDate(item.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isNps ? (
                      <span className={cn("px-3 py-1 rounded-lg border text-[11px] font-bold", bucket?.className)}>
                        <Star className="w-3 h-3 inline mr-1 -mt-0.5" />
                        {bucket?.label}
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600">
                        {catMeta?.label || "Comentario"}
                      </span>
                    )}
                    {item.status === "NEW" && (
                      <span className="px-3 py-1 rounded-lg border border-brand-200 bg-brand-50 text-[11px] font-bold text-brand-700">
                        Sin leer
                      </span>
                    )}
                    {item.status === "DONE" && (
                      <span className="px-3 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500">
                        Atendido
                      </span>
                    )}
                  </div>
                </div>

                {item.message && (
                  <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-xl p-4">
                    {item.message}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[11px] text-slate-400 font-medium">
                    {item.clientEmail}
                    {item.pageContext ? ` · desde ${item.pageContext}` : ""}
                  </p>
                  <div className="flex gap-2">
                    {item.status === "NEW" && (
                      <button
                        onClick={() => handleStatus(item.id, "READ")}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        Marcar leído
                      </button>
                    )}
                    {item.status !== "DONE" && (
                      <button
                        onClick={() => handleStatus(item.id, "DONE")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Atendido
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
