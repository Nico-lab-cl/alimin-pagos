"use client";
import { useEffect, useMemo, useState } from "react";
import { getUserLots } from "@/actions/user";
import {
  FileText,
  Download,
  Loader2,
  ShieldCheck,
  Compass,
  Eye,
  Search,
  ReceiptText,
  Upload,
} from "lucide-react";
import PreviewModal from "@/components/shared/PreviewModal";
import { downloadDocument } from "@/lib/utils";

/** Cómo se ordena cada sección. */
type SortMode = "FECHA" | "CONCEPTO";

/** Filtros del bloque de "otros documentos" (contratos, certificados, fichas). */
type OtherCategory = "Todos" | "Contratos" | "Certificados" | "Fichas";

export default function UserDocuments() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("FECHA");
  const [otherCategory, setOtherCategory] = useState<OtherCategory>("Todos");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState({ url: "", title: "", type: "" });

  useEffect(() => {
    getUserLots().then((result) => {
      setData(result);
      setLoading(false);
    });
  }, []);

  // Todos los documentos de todos los lotes, con el lote y el proyecto pegados
  // para poder buscarlos por ahí.
  const allDocs = useMemo(
    () =>
      (data?.lots || []).flatMap((lot: any) =>
        (lot.documents || []).map((doc: any) => ({
          ...doc,
          lotNumber: lot.lotNumber,
          projectName: lot.projectName,
        }))
      ),
    [data]
  );

  const formatFecha = (valor: any) =>
    valor
      ? new Date(valor).toLocaleDateString("es-CL", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

  // Categoría de los documentos que NO son recibos ni comprobantes. Se sigue
  // deduciendo del nombre porque los contratos y certificados se cargan a mano y
  // no traen una categoría confiable.
  const otherCategoryOf = (doc: any) => {
    const texto = `${doc.name || ""} ${doc.category || ""}`.toLowerCase();
    if (texto.includes("contrato") || texto.includes("promesa")) return "Contratos";
    if (texto.includes("certificado") || texto.includes("inscripcion")) return "Certificados";
    return "Fichas";
  };

  const coincide = (doc: any) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [doc.name, doc.fileName, doc.projectName, doc.lotNumber, formatFecha(doc.uploadedAt)]
      .filter(Boolean)
      .some((campo: any) => String(campo).toLowerCase().includes(q));
  };

  const ordenar = (docs: any[]) =>
    [...docs].sort((a, b) => {
      if (sortMode === "CONCEPTO") {
        const diff = (a.conceptOrder || 0) - (b.conceptOrder || 0);
        if (diff !== 0) return diff;
      }
      return new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime();
    });

  const recibos = ordenar(allDocs.filter((d: any) => d.kind === "RECIBO_OFICIAL" && coincide(d)));
  const subidos = ordenar(
    allDocs.filter((d: any) => d.kind === "COMPROBANTE_CLIENTE" && coincide(d))
  );
  const otros = ordenar(
    allDocs.filter(
      (d: any) =>
        d.kind !== "RECIBO_OFICIAL" &&
        d.kind !== "COMPROBANTE_CLIENTE" &&
        coincide(d) &&
        (otherCategory === "Todos" || otherCategoryOf(d) === otherCategory)
    )
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Sincronizando Archivos...
        </p>
      </div>
    );
  }

  const abrirPreview = (doc: any) => {
    setPreviewData({ url: doc.url, title: doc.name, type: doc.fileType });
    setIsPreviewOpen(true);
  };

  const tarjeta = (doc: any, idx: number, variante: "RECIBO" | "SUBIDO" | "OTRO") => {
    const tema =
      variante === "RECIBO"
        ? {
            Icon: ReceiptText,
            iconColor: "text-brand-600",
            bgColor: "bg-brand-50/80 border-brand-100",
            badgeBg: "bg-brand-50 text-brand-700 border-brand-100",
            badgeText: "Recibo oficial",
          }
        : variante === "SUBIDO"
          ? {
              Icon: Upload,
              iconColor: "text-orange-500",
              bgColor: "bg-orange-50/50 border-orange-100",
              badgeBg: "bg-orange-50 text-orange-700 border-orange-100",
              badgeText: "Lo subiste tú",
            }
          : otherCategoryOf(doc) === "Contratos"
            ? {
                Icon: FileText,
                iconColor: "text-brand-600",
                bgColor: "bg-brand-50/80 border-brand-100",
                badgeBg: "bg-brand-50 text-brand-600 border-brand-100",
                badgeText: "Contrato",
              }
            : otherCategoryOf(doc) === "Certificados"
              ? {
                  Icon: ShieldCheck,
                  iconColor: "text-emerald-600",
                  bgColor: "bg-[#f3faf7] border-[#def7ec]",
                  badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-100",
                  badgeText: "Certificado",
                }
              : {
                  Icon: Compass,
                  iconColor: "text-slate-600",
                  bgColor: "bg-slate-50 border-slate-100",
                  badgeBg: "bg-slate-50 text-slate-500 border-slate-100",
                  badgeText: "Ficha",
                };
    const { Icon } = tema;
    const fecha = formatFecha(doc.uploadedAt);

    return (
      <div
        key={`${doc.url}-${idx}`}
        className="bg-white border border-slate-200 hover:border-brand-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all group"
      >
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div
            className={`w-20 h-20 rounded-2xl ${tema.bgColor} flex items-center justify-center border mb-3 group-hover:scale-105 transition-transform duration-300`}
          >
            <Icon className={`w-10 h-10 ${tema.iconColor}`} />
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest border ${tema.badgeBg}`}
          >
            {tema.badgeText}
          </span>
        </div>

        <div className="mt-4 flex-1 text-center">
          <h4 className="text-sm font-bold text-slate-800 line-clamp-2 leading-tight">{doc.name}</h4>
          {doc.lotNumber && (
            <p className="text-[10px] font-bold text-slate-500 mt-1.5">
              {doc.projectName} · Lote {doc.lotNumber}
            </p>
          )}
          <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wide">
            {variante === "RECIBO"
              ? fecha
                ? `Pagado ${fecha}`
                : "Pago registrado"
              : fecha
                ? `Emitido ${fecha}`
                : "Emitido recientemente"}
          </p>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-3">
          <button
            onClick={() => abrirPreview(doc)}
            className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all shrink-0 cursor-pointer"
            title="Previsualizar"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => downloadDocument(doc.url, doc.fileName || doc.name, doc.fileType)}
            className="flex-1 h-11 rounded-xl border border-brand-600 hover:bg-brand-50 text-brand-600 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Descargar
          </button>
        </div>
      </div>
    );
  };

  const seccionVacia = (mensaje: string) => (
    <div className="text-center py-16 bg-white border border-slate-200 rounded-3xl shadow-sm">
      <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
      <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">{mensaje}</p>
    </div>
  );

  return (
    <div className="space-y-12 max-w-7xl mx-auto">
      <div>
        <h2 className="text-3xl font-extrabold text-brand-800 tracking-tight leading-none mb-2">
          Mis Documentos
        </h2>
        <p className="text-sm text-slate-500 font-medium">Todos tus documentos en un solo lugar</p>
      </div>

      {/* Buscador y orden, comunes a todas las secciones */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por concepto, lote o fecha..."
            className="w-full h-11 pl-11 pr-4 rounded-full border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Ordenar por
          </span>
          {(["FECHA", "CONCEPTO"] as SortMode[]).map((modo) => (
            <button
              key={modo}
              onClick={() => setSortMode(modo)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                sortMode === modo
                  ? "bg-brand-600 border-brand-600 text-white shadow-sm"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {modo === "FECHA" ? "Fecha de pago" : "Concepto"}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Recibos que emitimos nosotros */}
      <section className="space-y-5">
        <div>
          <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">Recibos de pago</h3>
          <p className="text-xs text-slate-500 mt-1">
            Documentos oficiales emitidos por nosotros. Son los que sirven como respaldo de tus
            pagos.
          </p>
        </div>
        {recibos.length === 0 ? (
          seccionVacia(
            query
              ? "Ningún recibo coincide con tu búsqueda."
              : "Todavía no hay recibos disponibles para tu cuenta."
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recibos.map((doc: any, idx: number) => tarjeta(doc, idx, "RECIBO"))}
          </div>
        )}
      </section>

      {/* 2. Lo que subió el propio cliente */}
      <section className="space-y-5">
        <div>
          <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">
            Comprobantes que subiste
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Las transferencias que nos enviaste. Quedan guardadas como respaldo tuyo.
          </p>
        </div>
        {subidos.length === 0 ? (
          seccionVacia(
            query
              ? "Ningún comprobante coincide con tu búsqueda."
              : "Aún no has subido comprobantes desde el portal."
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subidos.map((doc: any, idx: number) => tarjeta(doc, idx, "SUBIDO"))}
          </div>
        )}
      </section>

      {/* 3. Contratos, certificados y fichas */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">
              Contratos y certificados
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              La documentación de tu propiedad: contratos, certificados y fichas del proyecto.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["Todos", "Contratos", "Certificados", "Fichas"] as OtherCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setOtherCategory(cat)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                  otherCategory === cat
                    ? "bg-brand-600 border-brand-600 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        {otros.length === 0 ? (
          seccionVacia("No se encontraron documentos en esta categoría para tu cuenta.")
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {otros.map((doc: any, idx: number) => tarjeta(doc, idx, "OTRO"))}
          </div>
        )}
      </section>

      <div className="text-center pt-8 border-t border-slate-200 text-sm text-slate-500 font-medium">
        Todos tus documentos están disponibles 24/7. Si necesitas algún documento adicional,{" "}
        <a
          href="https://wa.me/56912345678"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 hover:text-brand-800 font-bold underline"
        >
          contáctanos.
        </a>
      </div>

      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        url={previewData.url}
        title={previewData.title}
        fileType={previewData.type}
      />
    </div>
  );
}
