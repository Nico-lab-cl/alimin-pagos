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
 * Son cinco preguntas:
 *
 *   1. COBERTURA  cada cuota contada como pagada, ¿tiene un comprobante que la
 *                 cubra? Lo contrario es una cuota que figura pagada sin que
 *                 nadie la haya pagado.
 *   2. DESFASE    si la ficha dice que pagó hasta la cuota N, ¿el último
 *                 comprobante que emitimos habla de esa misma cuota? Es la
 *                 comparación que delata un caso como el de Luis de una mirada.
 *   3. TRASLAPE   ¿hay dos comprobantes cubriendo la misma cuota?
 *   4. PLATA      la suma de los comprobantes, ¿coincide con lo pactado por las
 *                 cuotas que dicen cubrir?
 *   5. CAJA       el FinancialLedger, que es lo que alimenta el "Total Pagado"
 *                 del cliente, ¿dice lo mismo que los comprobantes?
 *
 * Todo es de SOLO LECTURA y se calcula sobre datos ya cargados: acá no se
 * consulta ni se escribe nada.
 */
import { esAbonoDeIntereses } from "@/lib/receiptDocs";

export type Severidad = "ROJO" | "AMBAR" | "VERDE";

export type Hallazgo = {
  severidad: Exclude<Severidad, "VERDE">;
  /** Cuál de los cinco chequeos lo encontró. */
  chequeo: "Cobertura" | "Desfase" | "Varias cuotas" | "Traslape" | "Plata" | "Caja";
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
  /** La cuota más alta con comprobante. 0 si no hay ninguno. */
  ultimaConComprobante: number;
  /** Como se lee ese ultimo comprobante: "Cuota 8" o "Cuotas 7-8". */
  ultimoComprobanteEtiqueta: string;
  cuotasConRespaldo: number;
  recibidoEnCuotas: number;
  /** Toda la plata de comprobantes de cuota, mora incluida. Se compara con la caja. */
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
        : `Cuotas ${resumirNumeros(cuotasSinRespaldo)}. La plata puede estar perfectamente ingresada —de hecho suele estarlo—: cuando postventa registra una cuota a mano SIN adjuntar archivo, se escribe la caja y sube el contador, pero no se crea ningún comprobante. Lo que falta acá es el papel, no necesariamente el pago. Compará la columna "En caja" para saber cuál de los dos casos es.`,
    });
  }

  // ------------------------------------------------- 2. DESFASE DEL FINAL
  // La pregunta más directa: si la ficha dice que el cliente pagó hasta la
  // cuota N, ¿el último comprobante que emitimos habla de esa misma cuota?
  //
  // Es el chequeo que delata de una mirada un caso como el de Luis Donoso: su
  // ficha contaba 22 cuotas y sus comprobantes llegaban hasta la 24. Dos cifras
  // que tendrían que ser la misma y no lo eran.
  const ultimaConComprobante = cuotasCubiertasOrdenadas(porCuota);
  if (cuotasContadas > 0 && deCuotas.length > 0 && ultimaConComprobante !== cuotasContadas) {
    const faltan = ultimaConComprobante < cuotasContadas;
    hallazgos.push({
      severidad: "ROJO",
      chequeo: "Desfase",
      titulo: faltan
        ? `La ficha llega a la cuota ${cuotasContadas} y el último comprobante solo a la ${ultimaConComprobante}`
        : `Hay comprobantes hasta la cuota ${ultimaConComprobante}, pero la ficha solo cuenta ${cuotasContadas}`,
      detalle: faltan
        ? `Faltan los comprobantes de las cuotas ${resumirNumeros(
            Array.from({ length: cuotasContadas - ultimaConComprobante }, (_, i) => ultimaConComprobante + 1 + i)
          )}. El último papel que emitimos no refleja hasta dónde dice la ficha que pagó el cliente.`
        : `Hay ${ultimaConComprobante - cuotasContadas} cuota(s) con comprobante que la ficha no cuenta como pagadas. O el contador quedó corto, o esos comprobantes apuntan a una cuota equivocada.`,
    });
  }

  // ------------------------------------- 3. COMPROBANTES DE VARIAS CUOTAS
  // Un comprobante que paga varias cuotas de una vez guarda tres cosas que
  // tienen que decir lo mismo: el rango ("7-9"), la cantidad (3) y el monto.
  // Los tres caminos que crean un comprobante los escriben coherentes, así que
  // si acá no coinciden es porque algo los reescribió después por separado.
  for (const r of deCuotas) {
    const cubre = cuotasQueCubre(r);
    if (cubre.length < 2) continue;

    const cantidadDeclarada = r.installments_count || 1;
    if (cantidadDeclarada !== cubre.length) {
      hallazgos.push({
        severidad: "ROJO",
        chequeo: "Varias cuotas",
        titulo: `Un comprobante dice cubrir ${cubre.length} cuotas pero está marcado como ${cantidadDeclarada}`,
        detalle: `El comprobante ${r.id.slice(0, 8)} tiene el rango ${r.nominal_installment_range} —que son ${cubre.length} cuotas— y la cantidad declarada es ${cantidadDeclarada}. Las dos cifras salen del mismo lugar al crearlo, así que una fue reescrita después.`,
      });
    }

    // El monto puede ser MAYOR que lo pactado (suele traer la mora encima), pero
    // nunca menor: eso significa que se contaron más cuotas de las que se pagaron.
    const pactado = cubre.reduce((a, n) => a + valorDeCuota(n), 0);
    if (pactado > 0 && (r.amount_clp || 0) < pactado) {
      const alcanzaPara = valorDeCuota(cubre[0]) > 0 ? (r.amount_clp || 0) / valorDeCuota(cubre[0]) : 0;
      hallazgos.push({
        severidad: "ROJO",
        chequeo: "Varias cuotas",
        titulo: `Un comprobante cubre ${cubre.length} cuotas pero el monto alcanza para ${alcanzaPara.toFixed(1)}`,
        detalle: `El comprobante ${r.id.slice(0, 8)} dice cubrir las cuotas ${resumirNumeros(
          cubre
        )}, que valen ${clp(pactado)}, y trae ${clp(r.amount_clp || 0)}. Faltan ${clp(
          pactado - (r.amount_clp || 0)
        )}: se le contaron al cliente cuotas que ese pago no alcanzó a cubrir.`,
      });
    }
  }

  // ----------------------------------------------------------- 4. TRASLAPE
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

  // -------------------------------------------------------------- 5. PLATA
  const recibidoEnCuotas = deCuotas.reduce((a, r) => a + (r.amount_clp || 0), 0);
  // Los abonos de intereses tambien son comprobantes de scope INSTALLMENT y su
  // plata cae en la categoria PENALTY, asi que entran en la comparacion contra
  // la caja aunque no cubran ninguna cuota.
  const recibidoConMora = aprobados
    .filter((r) => r.scope === "INSTALLMENT")
    .reduce((a, r) => a + (r.amount_clp || 0), 0);
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

  // --------------------------------------------------------------- 6. CAJA
  //
  // Cuidado con qué se compara contra qué. Al aprobar un pago, la plata se parte
  // en DOS filas de caja:
  //
  //   cuotaPaidAmount   = min(pagado, lo pactado)   -> categoría CUOTA
  //   penaltyPaidAmount = max(0, pagado - pactado)  -> categoría PENALTY
  //
  // pero el comprobante guarda el monto COMPLETO. Comparar el total de los
  // comprobantes contra la categoría CUOTA sola le inventaba un descuadre a todo
  // cliente que alguna vez pagó la cuota junto con su mora. Por eso los dos lados
  // toman lo mismo: toda la plata que entró por comprobantes de cuota, mora
  // incluida, contra CUOTA + PENALTY.
  if (caja !== null && (caja > 0 || recibidoConMora > 0)) {
    const brecha = caja - recibidoConMora;
    if (Math.abs(brecha) >= umbral) {
      const faltaEnCaja = brecha < 0;
      hallazgos.push({
        severidad: "ROJO",
        chequeo: "Caja",
        titulo: faltaEnCaja
          ? `Hay ${clp(-brecha)} en comprobantes que no entraron a la caja`
          : `Hay ${clp(brecha)} en la caja sin comprobante que los respalde`,
        detalle: faltaEnCaja
          ? `Los comprobantes suman ${clp(recibidoConMora)} y el historial financiero registra ${clp(
              caja
            )}. Falta la fila de caja de algún pago: el comprobante existe y está aprobado, pero esa plata no se sumó al "Total Pagado" del cliente, así que su saldo figura más alto de lo que corresponde.`
          : `El historial financiero registra ${clp(caja)} y los comprobantes suman ${clp(
              recibidoConMora
            )}. Hay plata contabilizada sin comprobante detrás: puede ser un pago registrado a mano sin adjuntar archivo, que escribe la caja pero no crea comprobante.`,
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
    ultimaConComprobante,
    ultimoComprobanteEtiqueta: etiquetaDelUltimo(porCuota, ultimaConComprobante),
    cuotasConRespaldo: cuotasCubiertas.filter((n) => n <= cuotasContadas).length,
    recibidoEnCuotas,
    recibidoConMora,
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
