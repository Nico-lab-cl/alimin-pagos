/**
 * Auditoría de una ficha: ¿lo que dice el contador de cuotas coincide con lo que
 * dicen los comprobantes y con lo que dice la caja?
 *
 * Nace del caso de Luis Donoso (Arena y Sol, L-20). Su ficha decía 22 cuotas
 * pagadas y sus comprobantes, leídos con cuidado, cubrían cuatro: los rangos se
 * pisaban entre sí ("21-22" y "22-23" comparten la 22) y habían entrado
 * $3.500.000 para lo que los rangos declaraban como $2.000.000. La pantalla de
 * revisión de entonces no lo vio, porque agrupaba los duplicados por
 * `nominal_installment_number` —un solo número— y nunca comparaba los RANGOS
 * entre sí.
 *
 * Son cuatro preguntas, de menor a mayor alcance:
 *
 *   1. COBERTURA  cada cuota contada como pagada, ¿tiene un comprobante que la
 *                 cubra? Lo contrario es una cuota que figura pagada sin que
 *                 nadie la haya pagado.
 *   2. TRASLAPE   ¿hay dos comprobantes cubriendo la misma cuota?
 *   3. PLATA      la suma de los comprobantes, ¿coincide con lo pactado por las
 *                 cuotas que dicen cubrir?
 *   4. CAJA       el FinancialLedger, que es lo que alimenta el "Total Pagado"
 *                 del cliente, ¿dice lo mismo que los comprobantes?
 *
 * Todo es de SOLO LECTURA y se calcula sobre datos ya cargados: acá no se
 * consulta ni se escribe nada.
 */
import { esAbonoDeIntereses } from "@/lib/receiptDocs";

export type Severidad = "ROJO" | "AMBAR" | "VERDE";

export type Hallazgo = {
  severidad: Exclude<Severidad, "VERDE">;
  /** Cuál de los cuatro chequeos lo encontró. */
  chequeo: "Cobertura" | "Traslape" | "Plata" | "Caja";
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

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

export type ResultadoAuditoria = {
  severidad: Severidad;
  hallazgos: Hallazgo[];
  /** Cuotas contadas como pagadas que ningún comprobante cubre. */
  cuotasSinRespaldo: number[];
  /** Cuotas cubiertas por más de un comprobante. */
  cuotasPisadas: number[];
  /** Resumen numérico, para la tabla y el Excel. */
  cuotasContadas: number;
  cuotasConRespaldo: number;
  recibidoEnCuotas: number;
  pactadoDeCuotasCubiertas: number;
  caja: number | null;
};

export function auditarFicha(opts: {
  /** `installments_paid` de la reserva. */
  cuotasContadas: number;
  comprobantes: ComprobanteAuditado[];
  /** Monto pactado de la cuota N. */
  valorDeCuota: (n: number) => number;
  /** Suma del FinancialLedger categoría CUOTA. NULL si la ficha no tiene caja. */
  caja: number | null;
}): ResultadoAuditoria {
  const { cuotasContadas, comprobantes, valorDeCuota, caja } = opts;
  const hallazgos: Hallazgo[] = [];

  const aprobados = comprobantes.filter((r) => r.status === "APPROVED");
  const deCuotas = aprobados.filter((r) => cuotasQueCubre(r).length > 0);

  // Qué comprobante cubre cada cuota.
  const porCuota = new Map<number, ComprobanteAuditado[]>();
  for (const r of deCuotas) {
    for (const n of cuotasQueCubre(r)) {
      porCuota.set(n, [...(porCuota.get(n) || []), r]);
    }
  }

  // ---------------------------------------------------------- 1. COBERTURA
  const cuotasSinRespaldo: number[] = [];
  for (let n = 1; n <= cuotasContadas; n++) {
    if (!porCuota.has(n)) cuotasSinRespaldo.push(n);
  }

  if (cuotasSinRespaldo.length > 0) {
    // Una ficha SIN ningún comprobante de cuota es historial migrado de la
    // planilla: no hay con qué cruzarla y no tiene sentido pintarla de rojo.
    // Una ficha que tiene comprobantes pero le faltan algunas cuotas sí es una
    // inconsistencia real.
    const migradaCompleta = deCuotas.length === 0;
    hallazgos.push({
      severidad: migradaCompleta ? "AMBAR" : "ROJO",
      chequeo: "Cobertura",
      titulo: migradaCompleta
        ? `${cuotasSinRespaldo.length} cuotas sin comprobante (ficha migrada)`
        : `${cuotasSinRespaldo.length} cuotas figuran pagadas sin comprobante`,
      detalle: migradaCompleta
        ? `La ficha cuenta ${cuotasContadas} cuotas pagadas y no tiene ningún comprobante de cuota: viene de la planilla. Hay que cargar los respaldos o dejar constancia de que no existen.`
        : `Cuotas ${resumirNumeros(cuotasSinRespaldo)}. La ficha las cuenta como pagadas pero ningún comprobante las cubre: o se sumaron a mano, o el comprobante quedó con otro número.`,
    });
  }

  // ----------------------------------------------------------- 2. TRASLAPE
  const cuotasPisadas = [...porCuota.entries()]
    .filter(([, lista]) => lista.length > 1)
    .map(([n]) => n)
    .sort((a, b) => a - b);

  if (cuotasPisadas.length > 0) {
    const ejemplos = cuotasPisadas.slice(0, 3).map((n) => {
      const lista = porCuota.get(n)!;
      return `cuota ${n}: ${lista
        .map((r) => (r.nominal_installment_range ? `rango ${r.nominal_installment_range}` : `nº ${r.nominal_installment_number}`))
        .join(" y ")}`;
    });
    hallazgos.push({
      severidad: "ROJO",
      chequeo: "Traslape",
      titulo: `${cuotasPisadas.length} cuota(s) cubiertas por más de un comprobante`,
      detalle: `${ejemplos.join(" · ")}${cuotasPisadas.length > 3 ? " · …" : ""}. Dos comprobantes cobrando la misma cuota: o un rango está mal escrito, o el pago se cargó dos veces.`,
    });
  }

  // -------------------------------------------------------------- 3. PLATA
  const recibidoEnCuotas = deCuotas.reduce((a, r) => a + (r.amount_clp || 0), 0);
  const cuotasCubiertas = [...porCuota.keys()];
  const pactadoDeCuotasCubiertas = cuotasCubiertas.reduce((a, n) => a + valorDeCuota(n), 0);
  const diferencia = recibidoEnCuotas - pactadoDeCuotasCubiertas;

  // El umbral es una cuota: por debajo de eso la diferencia suele ser mora
  // cobrada junto con la cuota, y marcarla sería ruido.
  const umbral = valorDeCuota(1) || 1;
  if (deCuotas.length > 0 && Math.abs(diferencia) >= umbral) {
    const sobra = diferencia > 0;
    hallazgos.push({
      severidad: "ROJO",
      chequeo: "Plata",
      titulo: sobra
        ? `Entró ${clp(diferencia)} más de lo que las cuotas declaran`
        : `Faltan ${clp(-diferencia)} para las cuotas declaradas`,
      detalle: sobra
        ? `Los comprobantes suman ${clp(recibidoEnCuotas)}, pero las ${cuotasCubiertas.length} cuotas que dicen cubrir valen ${clp(pactadoDeCuotasCubiertas)}. Sobran ${clp(diferencia)}, que son ${(diferencia / umbral).toFixed(1)} cuotas: puede ser mora cobrada aparte, o cuotas que se pagaron y quedaron sin declarar.`
        : `Los comprobantes suman ${clp(recibidoEnCuotas)} y las ${cuotasCubiertas.length} cuotas que dicen cubrir valen ${clp(pactadoDeCuotasCubiertas)}. El cliente figura con cuotas que no alcanzó a pagar.`,
    });
  }

  // --------------------------------------------------------------- 4. CAJA
  if (caja !== null && (caja > 0 || recibidoEnCuotas > 0)) {
    const brecha = caja - recibidoEnCuotas;
    if (Math.abs(brecha) >= umbral) {
      hallazgos.push({
        severidad: "ROJO",
        chequeo: "Caja",
        titulo: `La caja y los comprobantes difieren en ${clp(Math.abs(brecha))}`,
        detalle: `El historial financiero registra ${clp(caja)} en cuotas y los comprobantes suman ${clp(recibidoEnCuotas)}. La caja es lo que alimenta el "Total Pagado" y el saldo que ve el cliente, así que si no coinciden, el saldo está mal.`,
      });
    }
  }

  const severidad: Severidad = hallazgos.some((h) => h.severidad === "ROJO")
    ? "ROJO"
    : hallazgos.length > 0
      ? "AMBAR"
      : "VERDE";

  return {
    severidad,
    hallazgos,
    cuotasSinRespaldo,
    cuotasPisadas,
    cuotasContadas,
    cuotasConRespaldo: cuotasCubiertas.filter((n) => n <= cuotasContadas).length,
    recibidoEnCuotas,
    pactadoDeCuotasCubiertas,
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
