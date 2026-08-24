"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  MessageCircle,
  Send,
  FileText,
  BarChart3,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { getWhatsappOverview } from "@/actions/whatsapp";
import type { WhatsappCategory } from "@/lib/whatsappTemplates";
import { cn } from "@/lib/utils";
import WhatsappPanel from "@/components/admin/whatsapp/WhatsappPanel";
import WhatsappSender from "@/components/admin/whatsapp/WhatsappSender";
import WhatsappTemplateEditor from "@/components/admin/whatsapp/WhatsappTemplateEditor";
import WhatsappPaymentHistory from "@/components/admin/whatsapp/WhatsappPaymentHistory";

type Tab = "panel" | "enviar" | "avisos" | "plantillas";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "panel", label: "Panel", icon: BarChart3 },
  { id: "enviar", label: "Enviar", icon: Send },
  { id: "avisos", label: "Avisos de pago", icon: BadgeCheck },
  { id: "plantillas", label: "Plantillas", icon: FileText },
];

export default function WhatsappPage() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("panel");
  const [selectedProject, setSelectedProject] = useState("ALL");
  const [overview, setOverview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  /** Categoria con la que se abre la pestana de envio al venir desde el panel. */
  const [initialCategory, setInitialCategory] = useState<WhatsappCategory | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getWhatsappOverview({ projectSlug: selectedProject });
      if ((res as any).error) {
        setError((res as any).error);
        setOverview(null);
      } else {
        setOverview(res);
      }
    } catch (err) {
      console.error("Error cargando el panel de WhatsApp:", err);
      setError("No se pudo cargar el panel de WhatsApp");
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const goToSender = (category: WhatsappCategory) => {
    setInitialCategory(category);
    setTab("enviar");
  };

  const connections = overview?.connections || [];
  const anyDisconnected = connections.some((c: any) => !c.connected);

  return (
    <div className="space-y-8 animate-fade-in text-slate-800 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 pb-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">WhatsApp</h1>
            <span className="text-[9px] font-extrabold text-brand-600 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded shadow-xs">
              COBRANZA + AVISOS
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 mt-1.5">
            Cobranza manual y avisos automáticos de pago a los clientes, vía Evolution API.
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

      {/* Estado de las sesiones de WhatsApp */}
      {connections.length > 0 && (
        <div
          className={cn(
            "rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between",
            anyDisconnected
              ? "bg-red-50 border-red-200"
              : "bg-white border-slate-200 shadow-sm"
          )}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {connections.map((c: any) => (
              <div key={c.instanceKey} className="flex items-center gap-2.5">
                {c.connected ? (
                  <Wifi className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500 flex-shrink-0" />
                )}
                <div className="leading-tight">
                  <p className="text-xs font-bold text-slate-800">
                    {c.instanceName || c.instanceKey}
                  </p>
                  <p
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wider",
                      c.connected ? "text-emerald-700" : "text-red-700"
                    )}
                  >
                    {c.connected ? "Conectado" : c.state}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {anyDisconnected && (
            <p className="text-[11px] font-semibold text-red-700 flex items-start gap-1.5 max-w-xl">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                {connections.find((c: any) => !c.connected)?.error ||
                  "Hay una sesión de WhatsApp desconectada. Escanea el QR en el manager de Evolution antes de enviar."}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Pestañas */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer",
                isActive
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
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
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 opacity-60">
            Cargando mensajería...
          </p>
        </div>
      )}

      {!error && overview && (
        <>
          {tab === "panel" && (
            <WhatsappPanel overview={overview} onPickCategory={goToSender} />
          )}

          {tab === "enviar" && (
            <WhatsappSender
              projectSlug={selectedProject}
              projects={overview.projects || []}
              audience={overview.audience || []}
              initialCategory={initialCategory}
              onSent={() => {
                loadOverview();
                toast.success("Tanda finalizada. El panel se actualizó.");
              }}
            />
          )}

          {tab === "avisos" && <WhatsappPaymentHistory projectSlug={selectedProject} />}

          {tab === "plantillas" && (
            <div className="space-y-10">
              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Cobranza</h2>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    Se eligen y se envían a mano desde la pestaña «Enviar».
                  </p>
                </div>
                <WhatsappTemplateEditor kind="COBRANZA" />
              </section>

              <section className="space-y-4 pt-4 border-t border-slate-200">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Avisos de pago</h2>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    Salen solos al aprobar un comprobante o registrar un pago.
                  </p>
                </div>
                <WhatsappTemplateEditor kind="PAGO" />
              </section>
            </div>
          )}
        </>
      )}

      {!error && !loading && !overview && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Sin datos de mensajería
          </p>
        </div>
      )}
    </div>
  );
}
