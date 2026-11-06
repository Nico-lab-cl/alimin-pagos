"use client";

import { useEffect, useRef, useState } from "react";
import { getAdminProjects } from "@/actions/postventa";
import {
  getMiProyectoAdmin,
  crearNovedad,
  cambiarEstadoNovedad,
  eliminarNovedad,
  subirFotoGaleria,
  ordenarGaleria,
  eliminarFoto,
} from "@/actions/miProyecto";
import { cn, formatDate } from "@/lib/utils";
import { Loader2, ImagePlus, Star, ArrowUp, ArrowDown, Trash2, Send, Smartphone, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Proyecto = { slug: string; name: string };
type Foto = { id: string; caption: string | null; isCover: boolean; url: string };
type Novedad = { id: string; title: string; body: string; status: string; publishedAt: string | null; createdAt: string | null; fotos: string[] };

/**
 * Achica la foto en el navegador antes de subirla (lado mayor 1600 px, JPEG):
 * las fotos de un telefono pesan 4-8 MB y en la app se ven igual a este tamano.
 */
async function prepararFoto(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function ProyectoAppPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [fotosNovedad, setFotosNovedad] = useState<string[]>([]);
  const [avisar, setAvisar] = useState(true);
  const inputGaleria = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAdminProjects().then((r) => {
      const lista = (r.projects || []).map((p: { slug: string; name: string }) => ({ slug: p.slug, name: p.name }));
      setProyectos(lista);
      setSlug(lista[0]?.slug || null);
      if (!lista.length) setCargando(false);
    });
  }, []);

  const cargar = async (s: string) => {
    const r = await getMiProyectoAdmin(s);
    if ("success" in r && r.success) {
      setFotos(r.fotos);
      setNovedades(r.novedades);
      setAviso(null);
    } else {
      setFotos([]);
      setNovedades([]);
      setAviso(r.error || "No se pudo cargar.");
    }
    setCargando(false);
  };

  useEffect(() => {
    if (slug) cargar(slug);
  }, [slug]);

  const proyecto = proyectos.find((p) => p.slug === slug);

  const agregarFotosNovedad = async (files: FileList | null) => {
    if (!files) return;
    const nuevas = await Promise.all([...files].slice(0, 6 - fotosNovedad.length).map(prepararFoto));
    setFotosNovedad((prev) => [...prev, ...nuevas]);
  };

  const guardarNovedad = async (publicar: boolean) => {
    if (!slug) return;
    setGuardando(true);
    const r = await crearNovedad({ projectSlug: slug, title: titulo, body: texto, publicar, avisar, fotos: fotosNovedad });
    setGuardando(false);
    if (r.error) return toast.error(r.error);
    toast.success(
      publicar
        ? `Publicada${"avisados" in r && r.avisados ? `: avisamos a ${r.avisados} clientes` : ""}`
        : "Borrador guardado"
    );
    setTitulo("");
    setTexto("");
    setFotosNovedad([]);
    cargar(slug);
  };

  const accion = async (promesa: Promise<{ error?: string; success?: boolean }>, ok: string) => {
    const r = await promesa;
    if (r.error) return toast.error(r.error);
    toast.success(ok);
    if (slug) cargar(slug);
  };

  const subirGaleria = async (files: FileList | null) => {
    if (!files || !slug) return;
    setGuardando(true);
    for (const file of [...files]) {
      const r = await subirFotoGaleria({ projectSlug: slug, foto: await prepararFoto(file) });
      if (r.error) { toast.error(r.error); break; }
    }
    setGuardando(false);
    if (inputGaleria.current) inputGaleria.current.value = "";
    cargar(slug);
  };

  const mover = (i: number, delta: number) => {
    if (!slug) return;
    const orden = fotos.map((f) => f.id);
    const j = i + delta;
    if (j < 0 || j >= orden.length) return;
    [orden[i], orden[j]] = [orden[j], orden[i]];
    const portada = fotos.find((f) => f.isCover)?.id || null;
    accion(ordenarGaleria({ projectSlug: slug, orden, portadaId: portada }), "Orden guardado");
  };

  const marcarPortada = (id: string) => {
    if (!slug) return;
    accion(ordenarGaleria({ projectSlug: slug, orden: fotos.map((f) => f.id), portadaId: id }), "Portada actualizada");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-brand-600" /> Mi proyecto en la app
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Lo que publiques aquí lo ven en Alimin app los clientes de ese proyecto.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 p-1 bg-white border border-slate-200 rounded-xl" role="tablist" aria-label="Proyecto">
          {proyectos.map((p) => (
            <button
              key={p.slug}
              role="tab"
              aria-selected={p.slug === slug}
              onClick={() => {
                if (p.slug === slug) return;
                setCargando(true);
                setSlug(p.slug);
              }}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer",
                p.slug === slug ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {aviso && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
          <AlertTriangle className="w-5 h-5 shrink-0" /> {aviso}
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
          <section className="xl:col-span-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4" aria-label="Nueva novedad">
            <h2 className="text-lg font-bold text-slate-800">Nueva novedad · {proyecto?.name}</h2>
            <div className="space-y-1.5">
              <label htmlFor="mp-titulo" className="text-xs font-bold text-slate-600">Título</label>
              <input id="mp-titulo" value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Terminamos el cierre perimetral" className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="mp-texto" className="text-xs font-bold text-slate-600">Texto</label>
              <textarea id="mp-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} placeholder="Cuéntales a los clientes qué cambió en el proyecto." className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm resize-y" />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">Fotos (hasta 6)</span>
              <div className="flex flex-wrap gap-2">
                {fotosNovedad.map((f, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f} alt={`Foto ${i + 1} de la novedad`} className="w-28 h-20 object-cover rounded-lg" />
                    <button aria-label="Quitar foto" onClick={() => setFotosNovedad((prev) => prev.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-bold cursor-pointer">×</button>
                  </div>
                ))}
                {fotosNovedad.length < 6 && (
                  <label className="w-28 h-20 rounded-lg border-2 border-dashed border-brand-200 bg-brand-50/40 text-brand-700 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer">
                    <ImagePlus className="w-4 h-4" /> Agregar
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => agregarFotosNovedad(e.target.files)} />
                  </label>
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="w-4 h-4 accent-brand-600" />
              Avisar a los clientes de {proyecto?.name} en la app
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button disabled={guardando} onClick={() => guardarNovedad(false)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">Guardar borrador</button>
              <button disabled={guardando} onClick={() => guardarNovedad(true)} className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Publicar
              </button>
            </div>
          </section>

          <div className="xl:col-span-2 space-y-6">
            <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3" aria-label="Fotos del proyecto">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-800">Fotos del proyecto</h2>
                <label className="px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold flex items-center gap-1 cursor-pointer">
                  <ImagePlus className="w-4 h-4" /> Subir
                  <input ref={inputGaleria} type="file" accept="image/*" multiple className="hidden" onChange={(e) => subirGaleria(e.target.files)} />
                </label>
              </div>
              {fotos.length === 0 ? (
                <p className="text-sm text-slate-500">Todavía no hay fotos. La primera que subas queda de portada.</p>
              ) : (
                <ul className="space-y-2">
                  {fotos.map((f, i) => (
                    <li key={f.id} className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.caption || `Foto ${i + 1}`} className="w-20 h-14 object-cover rounded-lg" />
                      <span className="flex-1 text-xs font-semibold text-slate-600">{f.isCover ? "Portada" : `Foto ${i + 1}`}</span>
                      <button aria-label="Usar de portada" title="Usar de portada" onClick={() => marcarPortada(f.id)} className={cn("p-1.5 rounded-lg cursor-pointer", f.isCover ? "text-amber-500" : "text-slate-400 hover:text-amber-500")}><Star className="w-4 h-4" fill={f.isCover ? "currentColor" : "none"} /></button>
                      <button aria-label="Subir en el orden" onClick={() => mover(i, -1)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"><ArrowUp className="w-4 h-4" /></button>
                      <button aria-label="Bajar en el orden" onClick={() => mover(i, 1)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"><ArrowDown className="w-4 h-4" /></button>
                      <button aria-label="Eliminar foto" onClick={() => slug && accion(eliminarFoto({ projectSlug: slug, id: f.id }), "Foto eliminada")} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3" aria-label="Novedades">
              <h2 className="text-base font-bold text-slate-800">Novedades</h2>
              {novedades.length === 0 ? (
                <p className="text-sm text-slate-500">Todavía no hay novedades para este proyecto.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {novedades.map((n) => (
                    <li key={n.id} className="py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800">{n.title}</p>
                        <p className={cn("text-xs font-semibold mt-0.5", n.status === "PUBLISHED" ? "text-emerald-700" : "text-amber-700")}>
                          {n.status === "PUBLISHED" ? `Publicada ${n.publishedAt ? formatDate(n.publishedAt) : ""}` : "Borrador, no se ve en la app"}
                          {n.fotos.length ? ` · ${n.fotos.length} foto${n.fotos.length > 1 ? "s" : ""}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => slug && accion(cambiarEstadoNovedad({ projectSlug: slug, id: n.id, publicar: n.status !== "PUBLISHED" }), n.status === "PUBLISHED" ? "Quitada de la app" : "Publicada")}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {n.status === "PUBLISHED" ? "Quitar" : "Publicar"}
                      </button>
                      <button aria-label="Eliminar novedad" onClick={() => slug && accion(eliminarNovedad({ projectSlug: slug, id: n.id }), "Novedad eliminada")} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
