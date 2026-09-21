/**
 * ¿A qué clientes les faltan comprobantes?
 *
 * Esa es LA pregunta y la única que esta pantalla contesta.
 *
 * Antes contestaba cinco (cobertura, desfase, traslape, plata y caja) y
 * clasificaba las fichas en "Descuadra / Sin respaldo / Cuadrado". Se sacó
 * todo eso, a pedido de postventa, porque las cuatro preguntas extra acusaban
 * de descuadre a fichas que estaban bien:
 *
 *   - TRASLAPE marcaba en rojo dos comprobantes con el mismo número de cuota,
 *     que casi siempre es un rótulo repetido y no un pago cobrado dos veces
 *     (los de Lomas llegaron con el número que traían de allá).
 *   - CAJA comparaba los comprobantes contra el FinancialLedger, que es el
 *     reporte de recaudación del proyecto y NO el saldo del cliente. Que falte
 *     una fila ahí no le mueve un peso a nadie: las aprobaciones viejas no
 *     escribían esa tabla, así que le pasa a casi toda la cartera migrada.
 *   - PLATA y DESFASE eran variantes del mismo descuadre inventado.
 *
 * El criterio que queda es el de postventa: si el historial financiero del
 * cliente está bien, alcanza. Lo único que hay que perseguir es el papel que
 * falta. Están en el historial de git si algún día se quieren de vuelta.
 *
 * Todo es de SOLO LECTURA y se calcula sobre datos ya cargados: acá no se
 * consulta ni se escribe nada.
 */
import { esAbonoDeIntereses } from "@/lib/receiptDocs";

/** Dos estados, no un semáforo: o tiene todos sus comprobantes o le faltan. */
export type Severidad = "FALTAN" | "COMPLETO";

export type Hallazgo = {
  severidad: "FALTAN";
  chequeo: "Comprobantes";
  titulo: string;
  detalle: string;
};

export type ComprobanteAuditado = {
  id: string;
  amount_clp: number;
  status: string | null;
  scope: string;
  installments_count?: number | null;
  nominal_installment_number?: number | null;
  nominal_installment_range?: string | null;
  created_at?: Date | string | null;
  paid_at?: Date | string | null;
  processed_at?: Date | string | null;
};

/**
 * Las cuotas que cubre un comprobante, expandidas de verdad.
 *
 * Un rango "4-6" cubre 4, 5 y 6. La pantalla vieja lo partía por "-" y se
 * quedaba con los extremos, así que la 5 no la veía nadie.
 */
export function cuotasQueCubre(r: ComprobanteAuditado): number[] {
  if (r.scope !== "INSTALLMENT") return [];
  // Un abono de intereses no paga ninguna cuota, aunque venga guardado como
  // "INSTALLMENT" (ver esAbonoDeIntereses).
  if (esAbonoDeIntereses(r)) return [];

  if (r.nominal_installment_range) {
    const [desde, hasta] = String(r.nominal_installment_range).split("-").map(Number);
    if (Number.isFinite(desde) && Number.isFinite(hasta) && hasta >= desde) {
      const out: number[] = [];
      for (let n = desde; n <= hasta; n++) out.push(n);
      return out;
    }
  }
  if (r.nominal_installment_number) return [r.nominal_installment_number];
  return [];
}

/** La cuota más alta que tiene algún comprobante detrás. 0 si no hay ninguna. */
function cuotasCubiertasOrdenadas(porCuota: Map<number, unknown[]>): number {
  const nums = [...porCuota.keys()];
  return nums.length === 0 ? 0 : Math.max(...nums);
}

/**
 * Como se lee el comprobante que cubre la cuota mas alta. Importa que diga
 * "Cuotas 22-23" y no solo "23": los errores se esconden justo en los rangos.
 */
function etiquetaDelUltimo(porCuota: Map<number, ComprobanteAuditado[]>, ultima: number): string {
  if (!ultima) return "—";
  const r = (porCuota.get(ultima) || [])[0];
  if (!r) return `Cuota ${ultima}`;
  return r.nominal_installment_range ? `Cuotas ${r.nominal_installment_range}` : `Cuota ${ultima}`;
}

export type ResultadoAuditoria = {
  severidad: Severidad;
  hallazgos: Hallazgo[];
  /** Cuotas contadas como pagadas a las que no las respalda ningún comprobante. */
  cuotasSinRespaldo: number[];
  /** Resumen numérico, para la tabla y el Excel. */
  cuotasContadas: number;
  /** La cuota más alta con comprobante. 0 si no hay ninguno. */
  ultimaConComprobante: number;
  /** Como se lee ese ultimo comprobante: "Cuota 8" o "Cuotas 7-8". */
  ultimoComprobanteEtiqueta: string;
  cuotasConRespaldo: number;
  recibidoEnCuotas: number;
  /** Toda la plata de comprobantes de cuota, mora incluida. */
  recibidoConMora: number;
  pactadoDeCuotasCubiertas: number;
  caja: number | null;
};

export function auditarFicha(opts: {
  /** `installments_paid` de la reserva. */
  cuotasContadas: number;
  comprobantes: ComprobanteAuditado[];
  /** Monto pactado de la cuota N. */
  valorDeCuota: (n: number) => number;
  /** Suma del FinancialLedger. Se muestra como dato; ya no genera hallazgo. */
  caja: number | null;
}): ResultadoAuditoria {
  const { cuotasContadas, comprobantes, valorDeCuota, caja } = opts;
  const hallazgos: Hallazgo[] = [];

  const aprobados = comprobantes.filter((r) => r.status === "APPROVED");
  const deCuotas = aprobados.filter((r) => cuotasQueCubre(r).length > 0);
  const recibidoEnCuotas = deCuotas.reduce((a, r) => a + (r.amount_clp || 0), 0);
  // Los abonos de intereses tambien son comprobantes de scope INSTALLMENT
  // aunque no cubran ninguna cuota, asi que su plata entra acá.
  const recibidoConMora = aprobados
    .filter((r) => r.scope === "INSTALLMENT")
    .reduce((a, r) => a + (r.amount_clp || 0), 0);

  // Qué comprobante cubre cada cuota.
  const porCuota = new Map<number, ComprobanteAuditado[]>();
  for (const r of deCuotas) {
    for (const n of cuotasQueCubre(r)) {
      porCuota.set(n, [...(porCuota.get(n) || []), r]);
    }
  }

  // ------------------------------------------- COMPROBANTES QUE FALTAN
  //
  // Se recorre de la cuota 1 a la última que la ficha cuenta como pagada. La
  // que no tiene ningún comprobante detrás es un papel que hay que conseguir.
  //
  // No se distingue si la cuota es anterior o posterior al primer comprobante
  // de la ficha. Esa frontera servía para decidir qué era "contradicción" y qué
  // era "historial migrado", y ya no hay contradicciones que decidir: al
  // cliente que arrastra 37 cuotas de la planilla le faltan 37 comprobantes,
  // igual que al que tiene un hueco suelto en el medio.
  const cuotasSinRespaldo: number[] = [];
  for (let n = 1; n <= cuotasContadas; n++) {
    if (!porCuota.has(n)) cuotasSinRespaldo.push(n);
  }

  if (cuotasSinRespaldo.length > 0) {
    hallazgos.push({
      severidad: "FALTAN",
      chequeo: "Comprobantes",
      titulo: `Faltan ${cuotasSinRespaldo.length} comprobante(s) de ${cuotasContadas} cuotas pagadas`,
      detalle: `Cuotas ${resumirNumeros(
        cuotasSinRespaldo
      )}. Figuran pagadas y no tienen el respaldo cargado. La plata puede estar perfectamente ingresada —cuando se registra una cuota a mano sin adjuntar archivo, o cuando la cuota viene del historial anterior al portal, sube el contador pero no queda comprobante—, así que lo que falta acá es el papel, no el pago.`,
    });
  }

  const cuotasCubiertas = [...porCuota.keys()];
  const ultimaConComprobante = cuotasCubiertasOrdenadas(porCuota);

  return {
    severidad: hallazgos.length > 0 ? "FALTAN" : "COMPLETO",
    hallazgos,
    cuotasSinRespaldo,
    cuotasContadas,
    ultimaConComprobante,
    ultimoComprobanteEtiqueta: etiquetaDelUltimo(porCuota, ultimaConComprobante),
    cuotasConRespaldo: cuotasCubiertas.filter((n) => n <= cuotasContadas).length,
    recibidoEnCuotas,
    recibidoConMora,
    pactadoDeCuotasCubiertas: cuotasCubiertas.reduce((a, n) => a + valorDeCuota(n), 0),
    caja,
  };
}

/** "1, 2, 3, 7, 9, 10, 11" -> "1-3, 7, 9-11". Una lista larga no se lee. */
export function resumirNumeros(nums: number[]): string {
  if (nums.length === 0) return "";
  const orden = [...nums].sort((a, b) => a - b);
  const tramos: string[] = [];
  let ini = orden[0];
  let prev = orden[0];
  for (let i = 1; i <= orden.length; i++) {
    const actual = orden[i];
    if (actual === prev + 1) {
      prev = actual;
      continue;
    }
    tramos.push(ini === prev ? `${ini}` : `${ini}-${prev}`);
    ini = actual;
    prev = actual;
  }
  return tramos.join(", ");
}
