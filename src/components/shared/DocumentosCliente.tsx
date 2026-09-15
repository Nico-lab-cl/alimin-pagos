"use client";

import { useMemo, useState } from "react";
import { Download, Eye, FileText, Search } from "lucide-react";
import PreviewModal from "@/components/shared/PreviewModal";
import { downloadDocument, formatCLP } from "@/lib/utils";

/**
 * "Mis Documentos": dos pestañas sobre una misma tabla.
 *
 * Este componente lo usan las DOS pantallas —el portal del cliente y la vista
 * "como cliente" de postventa— a propósito. Antes cada una tenía su copia y se
 * desincronizaron: el admin quedó mostrando el diseño viejo con los datos
 * nuevos, y nadie se dio cuenta hasta que un cliente lo notó.
 *
 * Cada fila lleva sus dos archivos al lado: el comprobante que emitimos
 * nosotros y el que subió el cliente. Tenerlos en la misma fila es lo que
 * permite ver de un vistazo qué pagos tienen respaldo suyo y cuáles no.
 */

type Pestana = "CUOTAS" | "DOCUMENTOS";

const PESTANAS: { id: Pestana; etiqueta: string; ayuda: string }[] = [
  {
    id: "CUOTAS",
    etiqueta: "Cuotas",
    ayuda: "Tus cuotas pagadas, de la más reciente a la más antigua.",
  },
  {
    id: "DOCUMENTOS",
    etiqueta: "Documentos",
    ayuda:
      "Reserva, pie, gastos operacionales y los documentos de tu propiedad: contrato, certificados y fichas.",
  },
];

function formatFecha(valor: any): string {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function DocumentosCliente({ documentos }: { documentos: any }) {
  const [pestana, setPestana] = useState<Pestana>("CUOTAS");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ url: string; title: string; type: string } | null>(null);

  const cuotas = documentos?.cuotas || [];
  const otros = documentos?.documentos || [];

  const coincide = (campos: any[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return campos.filter(Boolean).some((c) => String(c).toLowerCase().includes(q));
  };

  const cuotasFiltradas = useMemo(
    () =>
      cuotas.filter((c: any) =>
        coincide([c.etiqueta, c.numero, formatFecha(c.fechaPago), formatFecha(c.vencimiento)])
      ),
    [cuotas, query]
  );

  const otrosFiltrados = useMemo(
    () => otros.filter((o: any) => coincide([o.nombre, o.tipo, formatFecha(o.fecha)])),
    [otros, query]
  );

  const conteos: Record<Pestana, number> = {
    CUOTAS: cuotas.length,
    DOCUMENTOS: otros.length,
  };

  const abrir = (archivo: any) =>
    setPreview({ url: archivo.url, title: archivo.nombre, type: archivo.fileType });

  /** Los dos botones de una celda de archivo: ver y descargar. */
  const acciones = (archivo: any, etiqueta: string) => {
    if (!archivo) {
      return <span className="text-xs text-slate-300 font-medium">—</span>;
    }
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => abrir(archivo)}
          title={`Ver ${etiqueta}`}
          className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all cursor-pointer shrink-0"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => downloadDocument(archivo.url, archivo.archivo, archivo.fileType)}
          title={`Descargar ${etiqueta}`}
          className="w-8 h-8 rounded-lg border border-brand-200 bg-brand-50/40 flex items-center justify-center text-brand-600 hover:bg-brand-50 transition-all cursor-pointer shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const vacio = (mensaje: string) => (
    <div className="text-center py-20">
      <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
      <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">{mensaje}</p>
    </div>
  );

  const thBase =
    "px-4 py-3 text-[10px] font-black text-slate-400 tracking-wider uppercase whitespace-nowrap";
  const tdBase = "px-4 py-3.5 text-sm text-slate-700 whitespace-nowrap";

  const ayuda = PESTANAS.find((p) => p.id === pestana)?.ayuda;

  return (
    <div className="space-y-6">
      {/* Pestañas */}
      <div className="flex flex-wrap gap-2">
        {PESTANAS.map((p) => {
          const activa = pestana === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all border cursor-pointer flex items-center gap-2 ${
                activa
                  ? "bg-brand-600 border-brand-600 text-white shadow-sm"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {p.etiqueta}
              <span
                className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                  activa ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                {conteos[p.id]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-slate-500 font-medium">{ayuda}</p>
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cuota o fecha..."
            className="w-full h-10 pl-10 pr-4 rounded-full border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-50 transition-all"
          />
        </div>
      </div>

      {/* La tabla se desplaza dentro de su propio marco: en el teléfono la
          página nunca se mueve de lado. */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {pestana === "CUOTAS" &&
            (cuotasFiltradas.length === 0 ? (
              vacio(
                query
                  ? "Ninguna cuota coincide con tu búsqueda."
                  : "Todavía no hay cuotas pagadas registradas."
              )
            ) : (
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    <th className={thBase}>Cuota</th>
                    <th className={thBase}>Vencimiento</th>
                    <th className={thBase}>Fecha de pago</th>
                    <th className={`${thBase} text-right`}>Monto</th>
                    <th className={thBase}>Comprobante emitido</th>
                    <th className={thBase}>Tu comprobante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cuotasFiltradas.map((c: any) => (
                    <tr key={c.numero} className="hover:bg-slate-50/40 transition-colors">
                      <td className={`${tdBase} font-bold text-slate-900`}>
                        {c.etiqueta}
                        {(c.lote || c.agrupadaCon) && (
                          <span className="block text-[10px] font-bold text-slate-400 mt-0.5">
                            {[c.lote, c.agrupadaCon && `Pagada con las cuotas ${c.agrupadaCon}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className={`${tdBase} text-slate-500`}>{formatFecha(c.vencimiento)}</td>
                      <td className={tdBase}>{formatFecha(c.fechaPago)}</td>
                      <td className={`${tdBase} text-right font-bold text-slate-900`}>
                        {formatCLP(c.monto)}
                      </td>
                      <td className={tdBase}>{acciones(c.recibo, "comprobante emitido")}</td>
                      <td className={tdBase}>{acciones(c.comprobante, "tu comprobante")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {pestana === "DOCUMENTOS" &&
            (otrosFiltrados.length === 0 ? (
              vacio(
                query
                  ? "Ningún documento coincide con tu búsqueda."
                  : "Todavía no hay documentos disponibles para tu cuenta."
              )
            ) : (
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    <th className={thBase}>Documento</th>
                    <th className={thBase}>Tipo</th>
                    <th className={thBase}>Fecha</th>
                    <th className={`${thBase} text-right`}>Monto</th>
                    <th className={thBase}>Comprobante emitido</th>
                    <th className={thBase}>Tu comprobante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {otrosFiltrados.map((o: any, i: number) => (
                    <tr
                      key={`${o.emitido?.url || o.nombre}-${i}`}
                      className="hover:bg-slate-50/40 transition-colors"
                    >
                      <td className={`${tdBase} font-bold text-slate-900`}>
                        {o.nombre}
                        {o.lote && (
                          <span className="block text-[10px] font-bold text-slate-400 mt-0.5">
                            {o.lote}
                          </span>
                        )}
                      </td>
                      <td className={tdBase}>
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest border bg-slate-50 text-slate-500 border-slate-100">
                          {o.tipo}
                        </span>
                      </td>
                      <td className={`${tdBase} text-slate-500`}>{formatFecha(o.fecha)}</td>
                      <td className={`${tdBase} text-right font-bold text-slate-900`}>
                        {o.monto === null || o.monto === undefined ? (
                          <span className="text-slate-300 font-medium">—</span>
                        ) : (
                          formatCLP(o.monto)
                        )}
                      </td>
                      <td className={tdBase}>{acciones(o.emitido, "documento")}</td>
                      <td className={tdBase}>{acciones(o.comprobante, "tu comprobante")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
        </div>
      </div>

      <PreviewModal
        isOpen={!!preview}
        onClose={() => setPreview(null)}
        url={preview?.url || ""}
        title={preview?.title || ""}
        fileType={preview?.type || ""}
      />
    </div>
  );
}
