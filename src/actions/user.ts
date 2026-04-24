"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getInstallmentDueDate,
  calculateTotalInterest,
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
      where: { user_id: userId, status: "active" },
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

    const lots = reservations.map((res) => {
      const lot = res.lot;
      const project = res.project;
      const paidCuotas = res.installments_paid || 0;
      const totalCuotas = lot.cuotas || 0;

      const pieAmount = res.pie || lot.pie || 0;
      const actualPie = res.pie_status === "PAID" ? pieAmount : 0;

      let calculatedCuotasTotal = 0;
      const ranges = res.installment_ranges
        ? (typeof res.installment_ranges === "string"
            ? JSON.parse(res.installment_ranges)
            : res.installment_ranges)
        : [];
      for (let i = 1; i <= paidCuotas; i++) {
        const range = (ranges as any[]).find(
          (r: any) => i >= Number(r.from) && i <= Number(r.to)
        );
        calculatedCuotasTotal += range
          ? Number(range.amount)
          : (lot.valor_cuota || 0);
      }

      const totalPaid =
        actualPie + calculatedCuotasTotal + (res.extra_paid_amount || 0);
      const totalToPay = lot.price_total_clp || 0;
      const pendingBalance = Math.max(
        0,
        totalToPay - totalPaid + (res.pending_amount || 0)
      );

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

        // Determine penalty: FIXED (manual) or AUTO (date-based)
        if (res.penalty_mode === "FIXED" && res.manual_penalty != null && res.manual_penalty > 0) {
          penaltyAmount = res.manual_penalty;
          if (activeDailyPenalty > 0) {
            lateDays = Math.round(penaltyAmount / activeDailyPenalty);
          }
        } else {
          penaltyAmount = calculateTotalInterest(
            nextDueDate,
            currentDate,
            res.mora_status === "CONGELADO" || res.mora_status === "AL_DIA" || (res.mora_frozen || false),
            res.grace_days ?? project.grace_period_days ?? 5,
            activeDailyPenalty,
            res.debt_start_date,
            project.penalty_start_date
          );

          if (penaltyAmount > 0 && activeDailyPenalty > 0) {
            lateDays = Math.round(penaltyAmount / activeDailyPenalty);
          }
        }

        // Calculate upcoming installments (up to 12)
        const totalPendingRemaining = totalCuotas - paidCuotas;
        const maxToShow = Math.min(12, totalPendingRemaining);
        
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
          
          // Embed penalty in the FIRST pending installment only if it's active
          if (i === 0 && penaltyAmount > 0 && res.mora_status === "ACTIVO") {
            finalAmount += penaltyAmount;
            hasPenalty = true;
            installmentPenaltyAmount = penaltyAmount;
            installmentLateDays = lateDays;
          }
          
          const dailyPenaltyRate = res.daily_penalty ?? project.daily_penalty_amount ?? 10000;
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
            dailyPenalty: hasPenalty ? dailyPenaltyRate : 0
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
        nextInstallmentNumber: paidCuotas < totalCuotas ? paidCuotas + 1 : null,
        nextInstallmentMonth: nextDueDate ? formatMonth.format(nextDueDate).toUpperCase() : null,
        pieStatus: res.pie_status,
        pieAmount,
        valor_cuota: lot.valor_cuota || 0,
        nextDueDate,
        penaltyAmount,
        lateDays,
        isLate: penaltyAmount > 0 && res.mora_status === "ACTIVO",
        isMoraFrozen: res.mora_status === "CONGELADO" || res.mora_frozen,
        isUpToDate: res.mora_status === "AL_DIA",
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

  try {
    const reservation = await prisma.reservation.findFirst({
      where: { id: reservationId, user_id: userId },
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
