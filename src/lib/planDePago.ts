/**
 * Cuantas cuotas tiene que pagar el cliente y cuanto suma, a partir de las
 * `upcomingInstallments` que arma cargarTerrenosDelUsuario. La usan la pantalla
 * de pago del portal (/user/pay/[id]) y la API de la app movil, para que el
 * cliente vea el mismo minimo en los dos lados.
 *
 * Regla: se pagan primero la mora historica (si hay) y todas las cuotas que ya
 * tienen multa; minimo una cuota. Una cuota vencida que todavia esta en sus
 * dias de gracia no tiene multa, asi que no entra en el minimo: se puede
 * sumar como opcional.
 */

export type CuotaPorPagar = {
  number: number;
  dueDate?: string | null;
  interestStartDate?: string | null;
  baseAmount?: number;
  amount?: number;
  penaltyAmount?: number;
  hasPenalty?: boolean;
  isOverdue?: boolean;
  isHistorical?: boolean;
};

export function reglasDePago(cuotas: CuotaPorPagar[] = []) {
  const tieneHistorica = cuotas.some((c) => c.number === 0 || c.isHistorical);
  const offsetHistorica = tieneHistorica ? 1 : 0;
  const cuotasConMulta = cuotas.filter((c) => c.number > 0 && c.hasPenalty).length;
  return {
    tieneHistorica,
    cuotasConMulta,
    /** Items de `cuotas` que hay que pagar si o si (incluye la fila de mora historica). */
    minimoItems: offsetHistorica + Math.max(1, cuotasConMulta),
    maximoItems: offsetHistorica + (cuotas.filter((c) => c.number > 0).length || 1),
  };
}

/** Total de pagar los primeros `items` de `cuotas`, desglosado como en la pantalla de pago. */
export function totalParaItems(cuotas: CuotaPorPagar[] = [], items: number) {
  const seleccion = cuotas.slice(0, items);
  const reales = seleccion.filter((c) => c.number > 0);
  const historica = seleccion.find((c) => c.number === 0 || c.isHistorical);
  const moraHistorica = historica ? historica.penaltyAmount || historica.amount || 0 : 0;
  const baseAmount = seleccion
    .filter((c) => !c.isHistorical)
    .reduce((acc, c) => acc + (c.baseAmount || c.amount || 0), 0);
  const penaltyAmount = reales.reduce((acc, c) => acc + (c.penaltyAmount || 0), 0);
  return { baseAmount, penaltyAmount, moraHistorica, totalAmount: baseAmount + penaltyAmount + moraHistorica };
}
