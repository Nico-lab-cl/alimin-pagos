"use client";

import { useMemo, useState } from "react";
import { Download, Eye, FileText, Loader2, Search, Upload, X } from "lucide-react";
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

export default function DocumentosCliente({
  documentos,
  /**
   * Adjuntar el respaldo de una cuota que ya figura pagada pero quedo sin
   * comprobante. Se recibe como funcion y no se importa la accion aca a
   * proposito: este componente tambien lo usa el portal del cliente, y el
   * cliente no puede subir nada. Sin esta prop, la columna solo muestra "—".
   */
  onAdjuntar,
}: {
  documentos: any;
  onAdjuntar?: (
    cuota: number,
    datos: { base64: string; monto: number; fecha: string; hasta?: number }
  ) => Promise<{ error?: string; success?: boolean }>;
}) {
  const [pestana, setPestana] = useState<Pestana>("CUOTAS");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ url: string; title: string; type: string } | null>(null);
  const [subiendoPara, setSubiendoPara] = useState<any>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [monto, setMonto] = useState(0);
  const [fecha, setFecha] = useState("");
  // Ultima cuota del grupo cuando UNA transferencia pago varias seguidas.
  // Vacio = solo esta.
  const [hasta, setHasta] = useState("");
  const [guardando, setGuardando] = useState(false);

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

  const abrirSubida = (fila: any) => {
    setArchivo(null);
    setHasta("");
    setMonto(fila.monto || 0);
    // Se propone el vencimiento pactado de esa cuota; postventa lo corrige con
    // la fecha real que diga la transferencia, que es la que verá el cliente.
    const v = fila.vencimiento ? new Date(fila.vencimiento) : new Date();
    setFecha(Number.isNaN(v.getTime()) ? "" : v.toISOString().split("T")[0]);
    setSubiendoPara(fila);
  };

  const guardarSubida = async () => {
    if (!subiendoPara || !onAdjuntar) return;
    if (!archivo) return;
    setGuardando(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = () => rej(new Error("no se pudo leer"));
        fr.readAsDataURL(archivo);
      });
      const r = await onAdjuntar(subiendoPara.numero, {
        base64,
        monto,
        fecha,
        hasta: hasta.trim() ? Number(hasta) : undefined,
      });
      if (!r?.error) setSubiendoPara(null);
    } finally {
      setGuardando(false);
    }
  };

  /** Los dos botones de una celda de archivo: ver y descargar. */
  const acciones = (archivo: any, etiqueta: string, filaCuota?: any) => {
    if (!archivo) {
      // Cuando quien mira puede adjuntar —postventa, nunca el cliente— la celda
      // vacía deja de ser un guion muerto y pasa a ser la forma de arreglarlo.
      if (onAdjuntar && filaCuota) {
        return (
          <button
            onClick={() => abrirSubida(filaCuota)}
            className="px-2.5 h-8 rounded-lg border border-dashed border-brand-300 bg-brand-50/30 text-[11px] font-bold text-brand-600 hover:bg-brand-50 transition-all cursor-pointer inline-flex items-center gap-1.5"
            title={`Adjuntar el comprobante de la cuota ${filaCuota.numero}`}
          >
            <Upload className="w-3 h-3" />
            Subir
          </button>
        );
      }
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
                    <tr
                      key={c.numero}
                      className={`transition-colors ${
                        c.noContada
                          ? "bg-amber-50/70 hover:bg-amber-50"
                          : "hover:bg-slate-50/40"
                      }`}
                    >
                      <td className={`${tdBase} font-bold text-slate-900`}>
                        {c.etiqueta}
                        {/* Solo la ve postventa: hay comprobante pero la ficha no
                            cuenta esta cuota como pagada. Alguna de las dos esta
                            mal y hay que revisarla. */}
                        {c.noContada && (
                          <span className="block text-[10px] font-bold text-amber-700 mt-0.5">
                            Tiene comprobante pero la ficha no la cuenta como pagada
                          </span>
                        )}
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
                      <td className={tdBase}>{acciones(c.comprobante, "tu comprobante", c)}</td>
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

      {/* Adjuntar el respaldo de una cuota que ya figura pagada.
          NO es registrar un pago: la cuota ya está contada y la plata ya está en
          caja. Acá solo se sube el papel que faltaba. */}
      {subiendoPara && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Adjuntar comprobante
                </p>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {subiendoPara.etiqueta}
                </h3>
              </div>
              <button
                onClick={() => setSubiendoPara(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-3">
              Esta cuota ya figura pagada: lo único que falta es el papel. Adjuntarlo{" "}
              <span className="font-bold">no suma cuotas, no mueve caja ni mora</span>. El
              cliente pasa a verlo en su portal con la fecha que pongas acá.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Comprobante del cliente
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white file:text-[10px] file:font-bold file:uppercase file:tracking-wider file:cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  ¿Esta transferencia pagó varias cuotas?
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                    De la {subiendoPara?.numero} hasta la
                  </span>
                  <input
                    type="number"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                    placeholder={String(subiendoPara?.numero ?? "")}
                    className="w-20 h-10 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-brand-400"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Dejalo vacío si el depósito cubrió solo esta cuota. Si cubrió varias,
                  poné la última: el mismo comprobante queda en todas y el cliente las ve
                  agrupadas.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Monto
                  </label>
                  <input
                    type="number"
                    value={monto}
                    onChange={(e) => setMonto(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Fecha del pago
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-brand-400"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                Se propone el vencimiento pactado y el monto de una cuota. Corregilos con
                lo que diga la transferencia: es lo que va a ver el cliente.
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setSubiendoPara(null)}
                className="px-4 h-10 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={guardarSubida}
                disabled={!archivo || guardando || !fecha}
                className="px-4 h-10 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer inline-flex items-center gap-2"
              >
                {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Adjuntar
              </button>
            </div>
          </div>
        </div>
      )}

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
