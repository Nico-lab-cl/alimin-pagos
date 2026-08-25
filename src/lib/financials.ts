import { prisma } from "./prisma";

/**
 * Calculates the due date for a specific installment number.
 * The payment day is always derived from the installment_start_date day.
 * e.g., if start = May 5, payments are the 5th of each month.
 */
export function getInstallmentDueDate(
  installmentStartDate: Date | string,
  installmentNumber: number,
  dueDayOfMonth?: number
): Date {
  const base = getSantiagoUTCDate(new Date(installmentStartDate));
  
  // Use UTC methods to prevent local timezone shift (critical for midnight UTC dates)
  // Use the provided dueDayOfMonth if valid, otherwise default to the day of installmentStartDate
  const payDay = dueDayOfMonth && dueDayOfMonth >= 1 && dueDayOfMonth <= 31
    ? dueDayOfMonth 
    : base.getUTCDate();
  
  // Construct the new date directly in UTC at 12:00:00 UTC to safely avoid boundary issues
  const due = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), payDay, 12, 0, 0, 0));

  // installment_start_date represents the MONTH of cuota 1
  // Formula: base + (N-1)
  due.setUTCMonth(due.getUTCMonth() + (installmentNumber - 1));

  return due;
}

/**
 * Mes y año al que corresponde una cuota, tomado de su fecha de vencimiento.
 * Ej: "Agosto 2026". Se formatea en UTC porque getInstallmentDueDate devuelve
 * la fecha fijada a las 12:00 UTC (leerla en horario local podría correr el mes).
 */
export function getInstallmentPeriodLabel(
  installmentStartDate: Date | string | null | undefined,
  installmentNumber: number,
  dueDayOfMonth?: number
): string | null {
  if (!installmentStartDate) return null;
  const due = getInstallmentDueDate(installmentStartDate, installmentNumber, dueDayOfMonth);
  if (isNaN(due.getTime())) return null;
  // formatToParts en vez de format() para quedar en "Agosto 2026" y no en el
  // "agosto de 2026" que arma es-CL (y así calzar con el recibo oficial).
  const parts = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(due);
  const month = parts.find((p) => p.type === "month")?.value || "";
  const year = parts.find((p) => p.type === "year")?.value || "";
  if (!month || !year) return null;
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`;
}

/**
 * Concepto que se imprime en los comprobantes digitales de cuota: número de
 * cuota + mes y año al que corresponde.
 *   "Cuota 3 - Agosto 2026"
 *   "Cuotas 3-4 - Agosto 2026 a Septiembre 2026"
 * Si no se conoce el número nominal o la fecha de inicio de cuotas, degrada al
 * texto genérico anterior en vez de inventar un período.
 */
export function buildInstallmentConcept(opts: {
  installmentStartDate?: Date | string | null;
  dueDay?: number | null;
  firstInstallmentNumber?: number | null;
  installmentsCount?: number | null;
}): string {
  const count = Math.max(1, opts.installmentsCount || 1);
  const first = opts.firstInstallmentNumber || null;

  if (!first) {
    return count > 1 ? `Pago Cuota(s) x${count}` : "Pago de Cuota";
  }

  const last = first + count - 1;
  const numbers = count > 1 ? `Cuotas ${first}-${last}` : `Cuota ${first}`;
  const dueDay = opts.dueDay ?? undefined;
  const firstPeriod = getInstallmentPeriodLabel(opts.installmentStartDate, first, dueDay);
  if (!firstPeriod) return numbers;
  if (count === 1) return `${numbers} - ${firstPeriod}`;

  const lastPeriod = getInstallmentPeriodLabel(opts.installmentStartDate, last, dueDay);
  return lastPeriod && lastPeriod !== firstPeriod
    ? `${numbers} - ${firstPeriod} a ${lastPeriod}`
    : `${numbers} - ${firstPeriod}`;
}

/**
 * Monto nominal de UNA cuota según los tramos pactados (installment_ranges).
 * Si la cuota no cae en ningún tramo, cae al valor_cuota del lote.
 *
 * Los tramos vienen con nombres de campo distintos según de dónde se cargaron
 * (from/to o start/end, amount o value), por eso se leen ambos.
 */
export function getNominalInstallmentAmount(
  installmentRanges: unknown,
  installmentNumber: number,
  fallbackAmount: number
): number {
  const ranges = installmentRanges
    ? typeof installmentRanges === "string"
      ? JSON.parse(installmentRanges)
      : installmentRanges
    : [];

  if (!Array.isArray(ranges)) return fallbackAmount;

  const range = ranges.find((r: any) => {
    const from = Number(r.from ?? r.start ?? 0);
    const to = Number(r.to ?? r.end ?? 0);
    return installmentNumber >= from && installmentNumber <= to;
  });

  if (!range) return fallbackAmount;
  const amount = Number(range.amount ?? range.value ?? 0);
  return amount > 0 ? amount : fallbackAmount;
}

/**
 * Helper to get a UTC Date set at 12:00:00 UTC representing the calendar day in Chile (America/Santiago) timezone.
 */
export function getSantiagoUTCDate(date: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find(p => p.type === "year")?.value);
  const month = Number(parts.find(p => p.type === "month")?.value);
  const day = Number(parts.find(p => p.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

/**
 * Retorna la fecha actual en Chile (America/Santiago) a las 12:00:00 UTC.
 * Usar las 12:00:00 UTC evita que el ajuste de zona horaria (UTC-3/UTC-4) retroceda el día calendario.
 */
export function getChileToday(): Date {
  return getSantiagoUTCDate(new Date());
}

/**
 * Calculates the total penalty (mora) for a late payment.
 * Uses project-level config for daily penalty and grace period.
 */
export function calculateTotalInterest(
  dueDate: Date,
  paymentDate: Date = new Date(),
  moraFrozen: boolean = false,
  gracePeriodDays: number = 5,
  dailyPenaltyAmount: number = 10000,
  debtStartDate?: Date | string | null,
  penaltyStartDate?: Date | string | null,
  debtEndDate?: Date | string | null
): number {
  if (moraFrozen) return 0;

  const pDate = getSantiagoUTCDate(paymentDate);
  const dDate = getSantiagoUTCDate(dueDate);

  // If debtEndDate is set, cap pDate at that date
  let activePaymentDate = pDate;
  if (debtEndDate) {
    const dEnd = getSantiagoUTCDate(new Date(debtEndDate));
    if (activePaymentDate > dEnd) {
      activePaymentDate = dEnd;
    }
  }

  let gDate: Date;

  if (debtStartDate) {
    // Manual debt start date overrides grace period calculation
    const dStart = getSantiagoUTCDate(new Date(debtStartDate));
    
    // Only apply manual start date if it is greater than or equal to the due date of the current installment
    if (dStart >= dDate) {
      gDate = dStart;
    } else {
      // Normal grace calculation
      const gracePeriodEnd = new Date(dDate);
      gracePeriodEnd.setUTCDate(dDate.getUTCDate() + gracePeriodDays);
      
      if (activePaymentDate <= gracePeriodEnd) {
        return 0;
      }

      gDate = new Date(gracePeriodEnd);
      gDate.setUTCDate(gDate.getUTCDate() + 1);
    }
  } else {
    // Grace period ends X days after due date
    const gracePeriodEnd = new Date(dDate);
    gracePeriodEnd.setUTCDate(dDate.getUTCDate() + gracePeriodDays);
    
    if (activePaymentDate <= gracePeriodEnd) {
      return 0;
    }

    // The first day of penalty is the day AFTER grace period ends
    gDate = new Date(gracePeriodEnd);
    gDate.setUTCDate(gDate.getUTCDate() + 1);
  }

  // Apply penalty start date cutoff if configured
  if (penaltyStartDate) {
    const cutoff = getSantiagoUTCDate(new Date(penaltyStartDate));

    if (activePaymentDate < cutoff) return 0;
    if (gDate < cutoff) {
      gDate = cutoff;
    }
  }

  if (activePaymentDate < gDate) return 0;

  const diffTime = activePaymentDate.getTime() - gDate.getTime();
  const daysLate = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

  return dailyPenaltyAmount * daysLate;
}

/**
 * Réplica EXACTA de calculateDaysLate/calculateTotalInterest de
 * aliminlomasdelmar.com (su src/lib/financials.ts), para que la mora del
 * proyecto Lomas del Mar coincida al peso con lo que muestra ese sistema.
 *
 * Difiere de calculateTotalInterest (la fórmula estándar del portal) en:
 *   1) NO suma el "+1 día" final al conteo de atraso.
 *   2) Cuando hay debtStartDate, ancla el conteo al día ANTERIOR (-1).
 *   3) El cutoff (penalty_start_date) solo aplica cuando NO hay debtStartDate,
 *      igual que Lomas (effectiveIsLegacy = isLegacy || !!debtStart).
 * Además, el llamador debe pasar debtStartDate a TODAS las cuotas (no solo a la
 * primera), tal como hace el loop de Lomas. Se usa únicamente para lomas-del-mar.
 */
export function calculateLomasInterest(
  dueDate: Date,
  paymentDate: Date = new Date(),
  moraFrozen: boolean = false,
  gracePeriodDays: number = 5,
  dailyPenaltyAmount: number = 10000,
  debtStartDate?: Date | string | null,
  penaltyStartDate?: Date | string | null,
  debtEndDate?: Date | string | null
): number {
  if (moraFrozen) return 0;

  let effectivePayment = getSantiagoUTCDate(paymentDate);
  if (debtEndDate) {
    const end = getSantiagoUTCDate(new Date(debtEndDate));
    if (effectivePayment > end) effectivePayment = end;
  }

  const dueMidnight = getSantiagoUTCDate(dueDate);
  const gracePeriodEnd = new Date(dueMidnight);
  gracePeriodEnd.setUTCDate(gracePeriodEnd.getUTCDate() + gracePeriodDays);

  let effectiveMoraStart = gracePeriodEnd;
  if (debtStartDate) {
    const manualStart = getSantiagoUTCDate(new Date(debtStartDate));
    effectiveMoraStart = manualStart > gracePeriodEnd ? manualStart : gracePeriodEnd;
  }
  if (effectivePayment < effectiveMoraStart) return 0;

  let gDate: Date;
  if (debtStartDate) {
    const manualStart = getSantiagoUTCDate(new Date(debtStartDate));
    const baseAnchor = manualStart > gracePeriodEnd ? manualStart : gracePeriodEnd;
    gDate = new Date(baseAnchor);
    gDate.setUTCDate(gDate.getUTCDate() - 1); // ancla al día anterior (comportamiento Lomas)
  } else {
    gDate = gracePeriodEnd;
  }

  // Cutoff equivalente a PENALTY_START_DATE_WEB: Lomas solo lo aplica cuando NO
  // hay debtStartDate (effectiveIsLegacy). Para las cuotas vencidas actuales el
  // cutoff (mar-2026) queda muy atrás, así que en la práctica no altera nada.
  if (!debtStartDate && penaltyStartDate) {
    const cutoff = getSantiagoUTCDate(new Date(penaltyStartDate));
    if (effectivePayment < cutoff) return 0;
    if (gDate < cutoff) {
      gDate = new Date(cutoff);
      gDate.setUTCDate(gDate.getUTCDate() - 1);
    }
  }

  const diffTime = effectivePayment.getTime() - gDate.getTime();
  const daysLate = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return daysLate > 0 ? dailyPenaltyAmount * daysLate : 0;
}

/**
 * Calcula el monto vigente de una multa fija/pactada (manual_penalty) que crece
 * día a día mientras no se pague, usando debtStartDate como fecha desde la que
 * empieza a crecer (se re-fija cada vez que un pago toca el monto).
 * Si no hay debtStartDate (datos históricos previos a esta función), el monto
 * se muestra plano sin crecer — no se altera retroactivamente nada existente.
 */
export function calculateGrowingFixedPenalty(
  manualPenalty: number | null | undefined,
  debtStartDate: Date | string | null | undefined,
  dailyPenalty: number,
  currentDate: Date
): { amount: number; growthDays: number } {
  const base = manualPenalty && manualPenalty > 0 ? manualPenalty : 0;
  if (base === 0) return { amount: 0, growthDays: 0 };
  if (!debtStartDate) return { amount: base, growthDays: 0 };

  const start = getSantiagoUTCDate(new Date(debtStartDate));
  const today = getSantiagoUTCDate(currentDate);
  const diffDays = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const growthDays = Math.max(0, diffDays);

  return { amount: base + dailyPenalty * growthDays, growthDays };
}

export type AbonoMora = {
  amount_clp: number | null;
  created_at: Date | string | null;
  nominal_installment_number: number | null;
};

/**
 * Reparte los abonos de mora (recibos con scope="MORA") sobre las cuotas vencidas.
 *
 * Regla central: UN ABONO SOLO PUEDE CUBRIR INTERES QUE YA EXISTIA EL DIA EN QUE
 * SE PAGO. Nadie paga por adelantado una mora que todavia no se ha devengado.
 *
 * Antes esto se resolvia restando el total historico de abonos contra la mora de
 * HOY. El efecto era que un abono viejo seguia perdonando el interes de todas las
 * cuotas siguientes, mes tras mes: la cuota vencia, se generaba su multa, y el
 * mismo abono de hace meses la volvia a borrar. El cliente aparecia "en gracia"
 * indefinidamente.
 *
 * Como se aplica ahora:
 *   - El abono que nombra una cuota (nominal_installment_number) se aplica solo a
 *     esa cuota, topado a su interes.
 *   - El abono que NO nombra cuota (los importados de Lomas vienen asi) se aplica
 *     de la cuota vencida mas antigua hacia adelante, en orden de antiguedad del
 *     abono, y topado al interes que esa cuota tenia a la fecha del abono.
 *   - Cada peso abonado se consume UNA sola vez.
 *
 * El llamador entrega `moraALaFecha`, que calcula el interes de la cuota en curso
 * a una fecha dada. Debe usar exactamente la misma formula y los mismos parametros
 * con que calculo el interes de hoy, cambiando solo la fecha; asi el tope y el
 * monto que se descuenta son siempre comparables.
 */
export function crearAplicadorDeAbonosMora(abonos: AbonoMora[]) {
  const sinCuota = abonos
    .filter((a) => !a.nominal_installment_number)
    .sort(
      (a, b) =>
        new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    );
  const saldos = sinCuota.map((a) => a.amount_clp || 0);
  let acumulado = 0;

  return {
    /**
     * Devuelve cuanto interes de esta cuota queda cubierto por abonos.
     * Descuenta de los saldos disponibles, por lo que debe llamarse una sola vez
     * por cuota y en orden ascendente de numero de cuota.
     */
    aplicar(
      installmentNumber: number,
      moraDeHoy: number,
      moraALaFecha: (fecha: Date) => number,
    ): number {
      if (moraDeHoy <= 0) return 0;

      // 1) Abonos que nombran explicitamente esta cuota.
      const directo = Math.min(
        abonos
          .filter((a) => a.nominal_installment_number === installmentNumber)
          .reduce((s, a) => s + (a.amount_clp || 0), 0),
        moraDeHoy,
      );

      // 2) Abonos sin cuota, del mas antiguo al mas nuevo.
      let cubierto = directo;
      for (let k = 0; k < sinCuota.length && cubierto < moraDeHoy; k++) {
        if (saldos[k] <= 0) continue;
        const fecha = sinCuota[k].created_at;
        if (!fecha) continue;

        // Tope: el interes que esta cuota tenia el dia del abono.
        const tope = Math.min(moraALaFecha(new Date(fecha)), moraDeHoy);
        const cubrible = tope - cubierto;
        if (cubrible <= 0) continue;

        const usar = Math.min(saldos[k], cubrible);
        saldos[k] -= usar;
        cubierto += usar;
      }

      acumulado += cubierto;
      return cubierto;
    },

    /** Total efectivamente aplicado a cuotas vencidas. */
    get totalAplicado() {
      return acumulado;
    },
  };
}

/**
 * Calculates the total aggregated automatic penalty across all pending installments.
 * It loops through each pending installment, calculates its due date, and evaluates its penalty independently.
 */
export function calculateAggregatedAutoPenalty(
  totalPendingRemaining: number,
  paidCuotas: number,
  installmentStartDate: Date | string | null,
  dueDay: number,
  currentDate: Date,
  moraFrozen: boolean,
  gracePeriodDays: number,
  activeDailyPenalty: number,
  firstInstallmentDebtStartDate?: Date | string | null,
  penaltyStartDate?: Date | string | null,
  debtEndDate?: Date | string | null,
  firstInstallmentOverrideDate?: Date | string | null
): { totalPenaltyAmount: number; totalLateDays: number } {
  let totalPenaltyAmount = 0;
  let totalLateDays = 0;

  for (let i = 0; i < totalPendingRemaining; i++) {
    const installmentNumber = paidCuotas + 1 + i;
    let currentDue: Date;
    
    // Admin next_payment_date override applies ONLY to the very first pending installment
    if (i === 0 && firstInstallmentOverrideDate) {
      currentDue = new Date(firstInstallmentOverrideDate);
    } else if (installmentStartDate) {
      currentDue = getInstallmentDueDate(
        installmentStartDate,
        installmentNumber,
        dueDay
      );
    } else {
      continue; // Can't calculate if no installment start date
    }

    // The manual debt_start_date override only applies to the FIRST missed installment
    const appliedDebtStartDate = i === 0 ? firstInstallmentDebtStartDate : null;

    const penalty = calculateTotalInterest(
      currentDue,
      currentDate,
      moraFrozen,
      gracePeriodDays,
      activeDailyPenalty,
      appliedDebtStartDate,
      penaltyStartDate,
      debtEndDate
    );

    if (penalty > 0) {
      totalPenaltyAmount += penalty;
      if (activeDailyPenalty > 0) {
        totalLateDays += Math.round(penalty / activeDailyPenalty);
      }
    }
  }

  return { totalPenaltyAmount, totalLateDays };
}

/**
 * Gets the project configuration for financial calculations.
 */
export async function getProjectConfig(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      grace_period_days: true,
      daily_penalty_amount: true,
      due_day_of_month: true,
      penalty_start_date: true,
      bank_name: true,
      bank_type: true,
      bank_account: true,
      bank_holder: true,
      bank_rut: true,
      bank_email: true,
    },
  });
  return project;
}
