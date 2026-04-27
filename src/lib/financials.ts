import { prisma } from "./prisma";

/**
 * Calculates the due date for a specific installment number.
 * The payment day is always derived from the installment_start_date day.
 * e.g., if start = May 5, payments are the 5th of each month.
 */
export function getInstallmentDueDate(
  installmentStartDate: Date | string,
  installmentNumber: number,
  _dueDayOfMonth?: number // kept for backward compat, but ignored
): Date {
  const base = new Date(installmentStartDate);
  
  // Use UTC methods to prevent local timezone shift (critical for midnight UTC dates)
  const payDay = base.getUTCDate();
  
  // Construct the new date directly in UTC at 12:00:00 UTC to safely avoid boundary issues
  const due = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), payDay, 12, 0, 0, 0));

  // installment_start_date represents the MONTH of cuota 1
  // Formula: base + (N-1)
  due.setUTCMonth(due.getUTCMonth() + (installmentNumber - 1));

  return due;
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

  let pDate = new Date(paymentDate);
  pDate.setHours(0, 0, 0, 0);

  // If debtEndDate is set, cap pDate at that date
  if (debtEndDate) {
    const dEnd = new Date(debtEndDate);
    dEnd.setHours(0, 0, 0, 0);
    if (pDate > dEnd) {
      pDate = dEnd;
    }
  }

  let gDate: Date;

  if (debtStartDate) {
    // Manual debt start date overrides grace period calculation
    gDate = new Date(debtStartDate);
  } else {
    // Grace period ends X days after due date
    const gracePeriodEnd = new Date(dueDate);
    gracePeriodEnd.setDate(dueDate.getDate() + gracePeriodDays);
    gracePeriodEnd.setHours(23, 59, 59, 999);
    gDate = gracePeriodEnd;

    if (paymentDate <= gracePeriodEnd) {
      return 0;
    }
  }
  gDate.setHours(0, 0, 0, 0);

  // Apply penalty start date cutoff if configured
  if (penaltyStartDate) {
    const cutoff = new Date(penaltyStartDate);
    cutoff.setHours(0, 0, 0, 0);

    if (pDate < cutoff) return 0;
    if (gDate < cutoff) {
      gDate.setTime(cutoff.getTime());
      gDate.setDate(gDate.getDate() - 1);
    }
  }

  const diffTime = pDate.getTime() - gDate.getTime();
  let daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLate > 0) {
    daysLate += 1; // First day of penalty is also counted
  }

  if (daysLate <= 0) return 0;

  return dailyPenaltyAmount * daysLate;
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
