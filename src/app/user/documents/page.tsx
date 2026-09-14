"use client";
import { useEffect, useMemo, useState } from "react";
import { getUserLots } from "@/actions/user";
import { Loader2 } from "lucide-react";
import DocumentosCliente from "@/components/shared/DocumentosCliente";

export default function UserDocuments() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserLots().then((result) => {
      setData(result);
      setLoading(false);
    });
  }, []);

  // Un cliente puede tener varios lotes, y cada lote trae su propio armado.
  // Se juntan en una sola tabla y cada fila queda marcada con su lote: separar
  // por lote obligaría a elegir primero cuál mirar, y lo que el cliente quiere
  // es ver todo su historial de una.
  const documentos = useMemo(() => {
    const lots = data?.lots || [];
    const marcar = (filas: any[], lote: string) =>
      filas.map((f: any) => ({ ...f, lote }));

    const unido = {
      cuotas: [] as any[],
      pagosSubidos: [] as any[],
      otrosPagos: [] as any[],
      archivos: [] as any[],
    };

    for (const lot of lots) {
      const d = lot.documentos;
      if (!d) continue;
      // La etiqueta solo se muestra cuando hay más de un lote: con uno solo es
      // ruido repetido en cada fila.
      const etiqueta = lots.length > 1 ? `Lote ${lot.lotNumber}` : "";
      unido.cuotas.push(...marcar(d.cuotas || [], etiqueta));
      unido.pagosSubidos.push(...marcar(d.pagosSubidos || [], etiqueta));
      unido.otrosPagos.push(...marcar(d.otrosPagos || [], etiqueta));
      unido.archivos.push(...marcar(d.archivos || [], etiqueta));
    }

    // Con varios lotes hay que reordenar: cada lote venía ordenado por dentro,
    // pero concatenarlos deja la cuota 1 del primero antes que la 20 del
    // segundo.
    if (lots.length > 1) {
      const porFecha = (a: any, b: any) =>
        new Date(b.fechaPago || b.fecha || 0).getTime() -
        new Date(a.fechaPago || a.fecha || 0).getTime();
      unido.cuotas.sort(porFecha);
      unido.pagosSubidos.sort(porFecha);
      unido.otrosPagos.sort((a, b) => (a.orden || 0) - (b.orden || 0));
      unido.archivos.sort(porFecha);
    }

    return unido;
  }, [data]);

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

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h2 className="text-3xl font-extrabold text-brand-800 tracking-tight leading-none mb-2">
          Mis Documentos
        </h2>
        <p className="text-sm text-slate-500 font-medium">Todos tus documentos en un solo lugar</p>
      </div>

      <DocumentosCliente documentos={documentos} />

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
    </div>
  );
}
