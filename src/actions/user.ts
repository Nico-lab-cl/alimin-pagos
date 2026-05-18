"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getInstallmentDueDate,
  calculateTotalInterest,
  calculateAggregatedAutoPenalty,
} from "@/lib/financials";
import { memoryCache } from "@/lib/cache";

const CACHE_TTL = 300;

/**
 * Gets all data for the logged-in user's lots across all their projects.
 */
export async function getUserLots() {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado", lots: [] };

  const userId = (session.user as any).id;
  const cacheKey = `user_data_${userId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;

  try {
    const reservations = await prisma.reservation.findMany({
      where: {
        user_id: userId,
        status: { in: ["active", "COMPLETED"] },
      },
      include: {
        project: true,
        lot: true,
        receipts: {
          where: { status: "APPROVED" },
          orderBy: { created_at: "desc" },
        },
        documents: {
          select: {
            id: true,
            name: true,
            file_type: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
        },
      },
    });

    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    const lots = (reservations as any[]).map((res) => {
      const lot = res.lot;
      const project = res.project;
      const paidCuotas = res.installments_paid || 0;
      const totalCuotas = lot.cuotas || 0;

      const pieAmount = res.pie || lot.pie || 0;
      // Sum approved PIE receipts for more accuracy, or fallback to full pie if status is PAID
      const piePaidFromReceipts = res.receipts
        ?.filter((r: any) => r.scope === "PIE")
        .reduce((acc: number, r: any) => acc + (r.amount_clp || 0), 0) || 0;
      const actualPie = Math.max(piePaidFromReceipts, res.pie_status === "PAID" ? pieAmount : 0);

      // Calculate installments total using ranges (Nominal Investment)
      let calculatedCuotasTotal = 0;
      const ranges = res.installment_ranges
        ? (typeof res.installment_ranges === "string"
            ? JSON.parse(res.installment_ranges)
            : res.installment_ranges)
        : [];
      for (let i = 1; i <= paidCuotas; i++) {
        const range = (ranges as any[]).find((r: any) => {
          const from = Number(r.from ?? r.start ?? 0);
          const to = Number(r.to ?? r.end ?? 0);
          return i >= from && i <= to;
        });
        calculatedCuotasTotal += range
          ? Number(range.amount ?? range.value ?? 0)
          : (lot.valor_cuota || 0);
      }

      // Total Invertido strictly follows (Cuotas + Pie + Extra)
      // As requested, we always include the full Pie amount.
      const extraPaid = res.extra_paid_amount || 0;
      const totalPaid = calculatedCuotasTotal + pieAmount + extraPaid;
      const totalToPay = lot.price_total_clp || 0;
      
      // Saldo Remanente = Compromiso Total - Total Invertido (Positive as requested)
      const pendingBalance = totalToPay - totalPaid;

      // Milestone-based progress
      const hasPie = pieAmount > 0;
      const pieStepPaid = actualPie > 0 || paidCuotas > 0;
      const totalSteps = (hasPie ? 1 : 0) + totalCuotas;
      const completedSteps = (pieStepPaid ? 1 : 0) + paidCuotas;
      const acquisitionProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

      let nextDueDate: Date | null = null;
      let penaltyAmount = 0;
      let lateDays = 0;
      let upcomingInstallments: any[] = [];
      const activeDailyPenalty = res.daily_penalty ?? project.daily_penalty_amount ?? 10000;

      const formatMonth = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' });

      if (paidCuotas < totalCuotas && res.installment_start_date) {
        // Always calculate dynamically based on installments paid
        const calculatedDueDate = getInstallmentDueDate(
          res.installment_start_date,
          paidCuotas + 1,
          res.due_day ?? project.due_day_of_month ?? 5
        );
        // Use stored next_payment_date if it exists (admin override), otherwise use calculated
        if (res.next_payment_date) {
          nextDueDate = new Date(res.next_payment_date);
        } else {
          nextDueDate = calculatedDueDate;
        }

        // Determine penalty: FIXED (manual + auto), MIXED (manual + auto) or AUTO (date-based)
        if (res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED") {
          // Both FIXED and MIXED: fixed penalty + auto penalty for currently-late installments
          // IMPORTANT: pass null for debt_start_date so auto calc uses normal grace period,
          // because the fixed amount already covers historical debt.
          const { totalPenaltyAmount: autoPenalty, totalLateDays: autoLateDays } = calculateAggregatedAutoPenalty(
            totalCuotas - paidCuotas,
            paidCuotas,
            res.installment_start_date,
            res.due_day ?? project.due_day_of_month ?? 5,
            currentDate,
            res.mora_status === "CONGELADO" || (res.mora_frozen || false),
            res.grace_days ?? project.grace_period_days ?? 5,
            activeDailyPenalty,
            null, // Don't use debt_start_date — fixed penalty covers historical debt
            project.penalty_start_date,
            res.debt_end_date,
            res.next_payment_date
          );
          const fixedPenalty = (res.manual_penalty != null && res.manual_penalty > 0) ? res.manual_penalty : 0;
          penaltyAmount = autoPenalty + fixedPenalty;
          lateDays = autoLateDays;
        } else {
          // AUTO: pure automatic penalty based on dates
          const { totalPenaltyAmount: autoPenalty, totalLateDays: autoLateDays } = calculateAggregatedAutoPenalty(
            totalCuotas - paidCuotas,
            paidCuotas,
            res.installment_start_date,
            res.due_day ?? project.due_day_of_month ?? 5,
            currentDate,
            res.mora_status === "CONGELADO" || (res.mora_frozen || false),
            res.grace_days ?? project.grace_period_days ?? 5,
            activeDailyPenalty,
            res.debt_start_date,
            project.penalty_start_date,
            res.debt_end_date,
            res.next_payment_date
          );
          penaltyAmount = autoPenalty;
          lateDays = autoLateDays;
        }

        // Calculate upcoming installments (up to 12)
        const totalPendingRemaining = totalCuotas - paidCuotas;
        const maxToShow = totalPendingRemaining; // Show all available installments
        
        // 1. Add historical penalty as a separate item if in FIXED or MIXED mode
        if ((res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED") && res.manual_penalty != null && res.manual_penalty > 0) {
          upcomingInstallments.push({
            number: 0,
            dueDate: null,
            baseAmount: 0,
            amount: Number(res.manual_penalty),
            monthName: "Intereses Anteriores (Mora Histórica)",
            hasPenalty: true,
            penaltyAmount: Number(res.manual_penalty),
            lateDays: null, 
            dailyPenalty: 0,
            isOverdue: true,
            isHistorical: true
          });
        }

        // 2. Loop through installments
        for (let i = 0; i < maxToShow; i++) {
          const installmentNumber = paidCuotas + 1 + i;
          
          let currentDue: Date;
          if (i === 0) {
            currentDue = nextDueDate!;
          } else {
            currentDue = getInstallmentDueDate(
              res.installment_start_date,
              installmentNumber,
              res.due_day ?? project.due_day_of_month ?? 5
            );
          }
           
          let installmentBaseAmount = lot.valor_cuota || 0;
          if (ranges && ranges.length > 0) {
            const range = (ranges as any[]).find((r: any) => installmentNumber >= Number(r.from) && installmentNumber <= Number(r.to));
            if (range) {
              installmentBaseAmount = Number(range.amount);
            }
          }
          
          let finalAmount = installmentBaseAmount;
          let hasPenalty = false;
          let installmentPenaltyAmount = 0;
          let installmentLateDays = 0;
          
          // Calculate auto penalty for this specific installment (always, regardless of penalty_mode)
          let autoPenaltyForThis = 0;
          if (res.mora_status !== "CONGELADO" && !res.mora_frozen) {
            autoPenaltyForThis = calculateTotalInterest(
              currentDue,
              currentDate,
              res.mora_frozen || false,
              res.grace_days ?? project.grace_period_days ?? 5,
              activeDailyPenalty,
              // For FIXED/MIXED, don't use debt_start_date (fixed penalty covers history)
              (res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED") ? null : (i === 0 ? res.debt_start_date : null),
              project.penalty_start_date,
              res.debt_end_date
            );
          }

          installmentPenaltyAmount = autoPenaltyForThis;

          if (installmentPenaltyAmount > 0) {
            finalAmount += installmentPenaltyAmount;
            hasPenalty = true;
            installmentLateDays = Math.round(installmentPenaltyAmount / activeDailyPenalty);
          }
          
          const dailyPenaltyRate = res.daily_penalty ?? project.daily_penalty_amount ?? 10000;
          
          // Status flags
          let isGracePeriod = false;
          const graceDays = res.grace_days ?? project.grace_period_days ?? 5;
          const graceEnd = new Date(currentDue);
          graceEnd.setDate(currentDue.getDate() + graceDays);
          graceEnd.setHours(23, 59, 59, 999);

          if (currentDate >= currentDue && installmentPenaltyAmount === 0 && !res.mora_frozen && currentDate <= graceEnd) {
            isGracePeriod = true;
          }

          const isOverdue = currentDate >= currentDue;

          const monthNameRaw = formatMonth.format(currentDue);
          upcomingInstallments.push({
            number: installmentNumber,
            dueDate: currentDue.toISOString(),
            baseAmount: installmentBaseAmount,
            amount: finalAmount,
            monthName: monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1),
            hasPenalty,
            penaltyAmount: installmentPenaltyAmount,
            lateDays: installmentLateDays,
            dailyPenalty: hasPenalty ? dailyPenaltyRate : 0,
            isOverdue
          });
        }
      }

      // Documents
      let documents: any[] = [];
      
      // Legacy Docs
      if (res.manual_documents) {
        try {
          const parsed = Array.isArray(res.manual_documents)
            ? res.manual_documents
            : JSON.parse(res.manual_documents as string);
          documents = parsed.map((d: any) => ({
            name: d.name,
            category: d.category,
            uploadedAt: d.uploadedAt,
            url: `/api/documents/${res.id}?name=${encodeURIComponent(d.name)}`,
          }));
        } catch {}
      }

      // New Docs
      if (res.documents && res.documents.length > 0) {
        const newDocs = res.documents.map((d: any) => ({
          name: d.name,
          category: d.category,
          uploadedAt: d.created_at,
          fileType: d.file_type,
          url: `/api/documents/${d.id}`,
        }));
        documents = [...newDocs, ...documents];
      }

      return {
        reservationId: res.id,
        projectName: project.name,
        projectSlug: project.slug,
        lotNumber: lot.number,
        lotStage: lot.stage,
        area_m2: lot.area_m2,
        totalToPay,
        totalPaid,
        pendingBalance,
        paidCuotas,
        totalCuotas,
        acquisitionProgress,
        nextInstallmentNumber: paidCuotas < totalCuotas ? paidCuotas + 1 : null,
        nextInstallmentMonth: nextDueDate ? formatMonth.format(nextDueDate).toUpperCase() : null,
        pieStatus: res.pie_status,
        pieAmount,
        valor_cuota: lot.valor_cuota || 0,
        nextDueDate,
        penaltyAmount,
        lateDays,
        isLate: penaltyAmount > 0,
        isMoraFrozen: res.mora_status === "CONGELADO" || res.mora_frozen,
        isUpToDate: penaltyAmount === 0 && !res.mora_frozen && res.mora_status !== "CONGELADO",
        dailyPenalty: res.daily_penalty ?? project.daily_penalty_amount ?? 10000,
        upcomingInstallments,
        documents,
        // Bank data for payment
        bank: {
          name: project.bank_name,
          type: project.bank_type,
          account: project.bank_account,
          holder: project.bank_holder,
          rut: project.bank_rut,
          email: project.bank_email,
        },
      };
    });

    const result = { success: true, lots };
    memoryCache.set(cacheKey, result, CACHE_TTL);
    return result;
  } catch (error) {
    console.error("Error getting user lots:", error);
    return { error: "Error al cargar tus terrenos", lots: [] };
  }
}

/**
 * Uploads a payment receipt from the user.
 */
export async function uploadPaymentReceipt({
  reservationId,
  amount,
  scope,
  receiptBase64,
  installmentsCount = 1,
}: {
  reservationId: string;
  amount: number;
  scope: "PIE" | "INSTALLMENT";
  receiptBase64: string;
  installmentsCount?: number;
}) {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado" };

  const userId = (session.user as any).id;
  const isAdmin = (session.user as any).role === "ADMIN";

  try {
    const reservation = await prisma.reservation.findFirst({
      where: isAdmin ? { id: reservationId } : { id: reservationId, user_id: userId },
      include: { lot: true },
    });

    if (!reservation) return { error: "Reserva no encontrada" };

    const nominalNumber =
      scope === "INSTALLMENT"
        ? (reservation.installments_paid || 0) + 1
        : null;

    const nominalRange =
      scope === "INSTALLMENT" && installmentsCount > 1
        ? `${nominalNumber}-${(nominalNumber || 0) + installmentsCount - 1}`
        : null;

    await prisma.paymentReceipt.create({
      data: {
        amount_clp: amount,
        status: "PENDING",
        receipt_url: receiptBase64,
        scope,
        installments_count: installmentsCount,
        nominal_installment_number: nominalNumber,
        nominal_installment_range: nominalRange,
        reservation_id: reservationId,
        lot_id: reservation.lot_id,
      },
    });

    memoryCache.deleteByPrefix("user_data_");
    memoryCache.deleteByPrefix("receipts_");

    return { success: true };
  } catch (error) {
    console.error("Error uploading receipt:", error);
    return { error: "Error al subir comprobante" };
  }
}

/**
 * Updates the FCM token for the current user.
 */
export async function updateFcmToken(token: string, platform?: string) {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado" };

  const userId = (session.user as any).id;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        fcm_token: token,
        last_platform: platform || "android",
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating FCM token:", error);
    return { error: "Error al actualizar token de notificaciones" };
  }
}

/**
 * Generates a password reset token and saves it to the user.
 */
export async function requestPasswordReset(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // For security, don't reveal if user exists or not
      return { success: true };
    }

    // Generate a 32-char hex token
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expires = new Date(Date.now() + 3600000); // 1 hour from now

    await prisma.user.update({
      where: { id: user.id },
      data: {
        reset_password_token: token,
        reset_password_expires: expires,
      },
    });

    // NOTE: In a real production environment, you would send an email here.
    // For now, we return the token in the response so the developer can see it
    // or the system can use it for demonstration.
    console.log(`Reset token for ${email}: ${token}`);
    
    return { success: true, token }; // Returning token for easy testing/dev
  } catch (error) {
    console.error("Error in requestPasswordReset:", error);
    return { error: "Error al procesar la solicitud" };
  }
}

/**
 * Resets the password using a valid token.
 */
import bcrypt from "bcryptjs";

export async function resetPassword(token: string, newPassword: string) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        reset_password_token: token,
        reset_password_expires: { gt: new Date() },
      },
    });

    if (!user) {
      return { error: "El enlace de recuperación es inválido o ha expirado" };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        reset_password_token: null,
        reset_password_expires: null,
        must_change_password: false,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error in resetPassword:", error);
    return { error: "Error al restablecer la contraseña" };
  }
}

/**
 * Gets all notifications for the current user.
 */
export async function getUserNotifications() {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado", notifications: [] };

  const userId = (session.user as any).id;

  try {
    const notifications = await prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: 20,
    });

    return { success: true, notifications };
  } catch (error) {
    console.error("Error getting notifications:", error);
    return { error: "Error al cargar notificaciones", notifications: [] };
  }
}

/**
 * Marks a notification as read.
 */
export async function markNotificationAsRead(notificationId: string) {
  const session = await auth();
  if (!session?.user) return { error: "No autorizado" };

  const userId = (session.user as any).id;

  try {
    await prisma.notification.update({
      where: { id: notificationId, user_id: userId },
      data: { read: true },
    });

    return { success: true };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return { error: "Error al marcar como leída" };
  }
}
