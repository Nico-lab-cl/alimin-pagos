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
