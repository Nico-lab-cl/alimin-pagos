"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { getClientPOV, adjuntarComprobanteACuotaPagada } from "@/actions/postventa";
import { quitarArchivoComprobante, ocultarReciboOficial } from "@/actions/documents";
import DocumentosCliente from "@/components/shared/DocumentosCliente";

/**
 * Los documentos de un cliente, en un modal, con permiso para adjuntar los
 * comprobantes que falten.
 *
 * Existe para que desde la Revisión de Comprobantes se pueda arreglar lo que la
 * pantalla acaba de señalar, sin tener que anotar el nombre del cliente, ir a
 * Clientes, buscarlo y abrir su ficha. El hallazgo y la forma de resolverlo
 * quedan en el mismo lugar.
 *
 * Es el mismo componente que ve el cliente en su portal; la diferencia es que
 * acá se le pasa `onAdjuntar`. El cliente nunca puede subir nada.
 */
export default function ModalDocumentosCliente({
  reservationId,
  nombre,
  onClose,
  onCambio,
}: {
  reservationId: string;
  nombre: string;
  onClose: () => void;
  /** Se avisa al cerrar si hubo cambios, para que la pantalla de atrás se refresque. */
  onCambio?: () => void;
}) {
  const [documentos, setDocumentos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [huboCambios, setHuboCambios] = useState(false);

  const cargar = () => {
    setCargando(true);
    getClientPOV(reservationId)
      .then((r: any) => setDocumentos(r?.data?.documentos || null))
      .catch(() => setDocumentos(null))
      .finally(() => setCargando(false));
  };

  useEffect(cargar, [reservationId]);

  const adjuntar = async (
    cuota: number,
    datos: { base64: string; monto: number; fecha: string; hasta?: number }
  ) => {
    const r = await adjuntarComprobanteACuotaPagada(reservationId, cuota, {
      receiptBase64: datos.base64,
      amount: datos.monto,
      paidAt: datos.fecha,
      hasta: datos.hasta,
    });
    if (r.error) {
      toast.error(r.error);
      return r;
    }
    const aQue =
      datos.hasta && datos.hasta > cuota
        ? `a las cuotas ${cuota}-${datos.hasta}`
        : `a la cuota ${cuota}`;
    toast.success(`Comprobante adjuntado ${aQue}`, {
      description: "El cliente ya lo ve en su portal. No se sumaron cuotas ni se movió caja.",
      duration: 7000,
    });
    setHuboCambios(true);
    cargar();
    return r;
  };

  // Quitar el archivo que subió el cliente. NO deshace el pago: para eso está
  // el botón de la bandeja, que avisa lo que revierte.
  const quitarArchivo = async (pagoId: string) => {
    const r = await quitarArchivoComprobante(pagoId);
    if (r.error) {
      toast.error(r.error);
      return r;
    }
    toast.success("Archivo quitado", {
      description:
        "La cuota sigue pagada: no se tocó el contador, ni la caja, ni la mora. Ya podés subir el correcto.",
      duration: 7000,
    });
    setHuboCambios(true);
    cargar();
    return r;
  };

  // Rehacer el recibo oficial. Se oculta el que estaba y el sistema emite uno
  // limpio por cuota, porque el recibo se genera al vuelo desde el pago.
  const rehacerRecibo = async (pagoId: string) => {
    const r = await ocultarReciboOficial(pagoId);
    if (r.error) {
      toast.error(r.error);
      return r;
    }
    toast.success("Recibo rehecho", {
      description:
        "Se descartó el anterior y se emitió uno limpio para esta cuota. El pago no se modificó.",
      duration: 7000,
    });
    setHuboCambios(true);
    cargar();
    return r;
  };

  const cerrar = () => {
    if (huboCambios) onCambio?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-50 rounded-2xl shadow-xl w-full max-w-6xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white rounded-t-2xl sticky top-0 z-10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Documentos del cliente
            </p>
            <h3 className="text-base font-extrabold text-slate-900">{nombre}</h3>
          </div>
          <button
            onClick={cerrar}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {cargando ? (
            <div className="py-24 flex flex-col items-center gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Cargando documentos...
              </p>
            </div>
          ) : documentos ? (
            <DocumentosCliente
              documentos={documentos}
              onAdjuntar={adjuntar}
              onQuitarArchivo={quitarArchivo}
              onRehacerRecibo={rehacerRecibo}
            />
          ) : (
            <p className="py-20 text-center text-xs text-slate-400">
              No se pudieron cargar los documentos de este cliente.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
