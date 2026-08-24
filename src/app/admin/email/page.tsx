"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Mail, Send, FileText, BarChart3, RefreshCw, AlertTriangle, History } from "lucide-react";
import { toast } from "sonner";
import { getEmailOverview } from "@/actions/email";
import { cn } from "@/lib/utils";
import EmailPanel from "@/components/admin/email/EmailPanel";
import EmailComposer from "@/components/admin/email/EmailComposer";
import EmailTemplateManager from "@/components/admin/email/EmailTemplateManager";
import EmailHistory from "@/components/admin/email/EmailHistory";

/**
 * Modulo de correo masivo. Postventa escribe asunto + cuerpo, elige a quien,
 * y el envio real lo hace n8n (nodo Gmail de la cuenta que corresponda). El
 * portal solo arma el correo y lleva el registro.
 *
 * Mismo patron de pestañas que /admin/whatsapp: Panel / Redactar y enviar /
 * Plantillas / Historial.
 */

type Tab = "panel" | "redactar" | "plantillas" | "historial";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "panel", label: "Panel", icon: BarChart3 },
  { id: "redactar", label: "Redactar y enviar", icon: Send },
  { id: "plantillas", label: "Plantillas", icon: FileText },
  { id: "historial", label: "Historial", icon: History },
];

export default function EmailPage() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("panel");
  const [selectedProject, setSelectedProject] = useState("ALL");
  const [overview, setOverview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEmailOverview({ projectSlug: selectedProject });
      if ((res as any).error) {
        setError((res as any).error);
        setOverview(null);
      } else {
        setOverview(res);
      }
    } catch (err) {
      console.error("Error cargando el panel de correo:", err);
      setError("No se pudo cargar el panel de correo");
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return (
    <div className="space-y-8 animate-fade-in text-slate-800 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 pb-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email</h1>
            <span className="text-[9px] font-extrabold text-brand-600 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded shadow-xs">
              ENVÍO MASIVO
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 mt-1.5">
            Correos a los clientes desde el portal, enviados vía Gmail de cada cuenta de postventa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition-all shadow-sm focus:border-brand-500 uppercase"
          >
            <option value="ALL">Todos los proyectos</option>
            {(overview?.projects || []).map((p: any) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={loadOverview}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-slate-500", loading && "animate-spin")} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm overflow-x-auto">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap",
                isActive ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">No se pudo cargar el módulo</p>
            <p className="text-xs font-medium text-red-700/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {loading && !overview && !error && (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 opacity-60">Cargando correo...</p>
        </div>
      )}

      {!error && overview && (
        <>
          {tab === "panel" && <EmailPanel overview={overview} />}

          {tab === "redactar" && (
            <EmailComposer
              projectSlug={selectedProject}
              projects={overview.projects || []}
              canSend={overview.canSend}
              configured={overview.configured}
              onSent={() => {
                loadOverview();
                toast.success("Tanda finalizada. El panel se actualizó.");
              }}
            />
          )}

          {tab === "plantillas" && <EmailTemplateManager />}

          {tab === "historial" && <EmailHistory projectSlug={selectedProject} />}
        </>
      )}

      {!error && !loading && !overview && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Mail className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Sin datos de correo</p>
        </div>
      )}
    </div>
  );
}
