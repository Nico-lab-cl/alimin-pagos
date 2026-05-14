"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getInstallmentDueDate,
  calculateTotalInterest,
  calculateAggregatedAutoPenalty,
  getProjectConfig,
} from "@/lib/financials";
import { memoryCache } from "@/lib/cache";
import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";

const CACHE_TTL = 300; // 5 minutes

export async function invalidatePostventaCache() {
  memoryCache.deleteByPrefix("postventa_");
}

/**
 * Gets all reservation data for a project with financial calculations.
 * Used by admin dashboard and alerts.
 */
export async function getFullPostventaData({
  projectSlug,
}: {
  projectSlug: string;
}) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado", data: [], stats: null };
  }

  // Check project access
  if (user.allowedProjects && !user.allowedProjects.includes(projectSlug)) {
    return { error: "No tienes acceso a este proyecto", data: [], stats: null };
  }

  const cacheKey = `postventa_${projectSlug}`;
  // const cached = memoryCache.get(cacheKey);
  // if (cached) return cached;

  try {
    const project = await prisma.project.findUnique({
      where: { slug: projectSlug },
    });
    if (!project) return { error: "Proyecto no encontrado", data: [], stats: null };

    const allReservations = await prisma.reservation.findMany({
      where: {
        project_id: project.id,
        status: { in: ["active", "COMPLETED"] },
      },
      orderBy: { created_at: "desc" },
      include: {
        lot: true,
        user: { select: { id: true, name: true, email: true, portal_active: true, temp_password: true } },
        receipts: {
          where: { status: "APPROVED" },
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            amount_clp: true,
            scope: true,
            created_at: true,
          },
        },
      },
    });

    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    const fiveDaysFromNow = new Date(currentDate);
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);

    const processedData = allReservations.map((res) => {
      const lot = res.lot;
      const paidCuotas = res.installments_paid || 0;
      const totalCuotas = lot.cuotas || 0;

      // Calculate total paid (Total Invertido)
      const pieAmount = res.pie || lot.pie || 0;
      const piePaidFromReceipts = res.receipts
        ?.filter((r) => r.scope === "PIE")
        .reduce((acc, r) => acc + (r.amount_clp || 0), 0) || 0;
      const actualPie = Math.max(piePaidFromReceipts, res.pie_status === "PAID" ? pieAmount : 0);

      // Calculate installments total using ranges if available (Nominal Investment)
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
      // As requested, we always include the full Pie amount because if they are in the system, it's paid.
      const extraPaid = res.extra_paid_amount || 0;
      const totalPaid = calculatedCuotasTotal + pieAmount + extraPaid;
      
      // Total Commitment is the total lot price
      const totalToPay = lot.price_total_clp || 0;
      
      // Saldo Remanente = Compromiso Total - Total Invertido (Positive value as requested)
      let pendingBalance = totalToPay - totalPaid;

      // Due date & penalty
      let nextDueDate: Date | null = null;
      let lateDays = 0;
      let penaltyAmount = 0;
      const activeDailyPenalty = res.daily_penalty ?? project.daily_penalty_amount ?? 10000;

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

        // Determine penalty: FIXED (manual), MIXED (manual + auto) or AUTO (date-based)
        if (res.penalty_mode === "FIXED" && res.manual_penalty != null && res.manual_penalty > 0) {
          penaltyAmount = res.manual_penalty;
          if (activeDailyPenalty > 0) {
            lateDays = Math.round(penaltyAmount / activeDailyPenalty);
          }
        } else if (res.penalty_mode === "MIXED") {
          const { totalPenaltyAmount: autoPenalty, totalLateDays: autoLateDays } = calculateAggregatedAutoPenalty(
            totalCuotas - paidCuotas,
            paidCuotas,
            res.installment_start_date,
            res.due_day ?? project.due_day_of_month ?? 5,
            currentDate,
            res.mora_frozen || false,
            res.grace_days ?? project.grace_period_days ?? 5,
            activeDailyPenalty,
            res.debt_start_date,
            project.penalty_start_date,
            res.debt_end_date,
            res.next_payment_date
          );
          
          const fixedPenalty = (res.manual_penalty != null && res.manual_penalty > 0) ? res.manual_penalty : 0;
          penaltyAmount = autoPenalty + fixedPenalty;

          if (penaltyAmount > 0 && activeDailyPenalty > 0) {
            lateDays = Math.round(penaltyAmount / activeDailyPenalty);
          }
        } else {
          const { totalPenaltyAmount: autoPenalty, totalLateDays: autoLateDays } = calculateAggregatedAutoPenalty(
            totalCuotas - paidCuotas,
            paidCuotas,
            res.installment_start_date,
            res.due_day ?? project.due_day_of_month ?? 5,
            currentDate,
            res.mora_frozen || false,
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
      }

      // Status flags
      let isGracePeriod = false;
      if (
        nextDueDate &&
        currentDate >= nextDueDate &&
        penaltyAmount === 0 &&
        !res.mora_frozen
      ) {
        isGracePeriod = true;
      }

      let isUpcoming = false;
      if (
        nextDueDate &&
        nextDueDate > currentDate &&
        nextDueDate <= fiveDaysFromNow
      ) {
        isUpcoming = true;
      }

      let status = "OK";
      
      // Override logic for COMPLETED, AL_DIA and CONGELADO
      if (res.status === "COMPLETED") {
        status = "COMPLETED";
        penaltyAmount = 0;
        pendingBalance = 0; // Ensure balance is 0 for paid in full
      } else if (res.mora_status === "AL_DIA") {
        status = "OK";
        penaltyAmount = 0;
      } else if (res.mora_status === "CONGELADO" || res.mora_frozen) {
        status = "FROZEN";
        penaltyAmount = 0;
      } else if (penaltyAmount > 0) {
        status = "LATE";
      } else if (isGracePeriod) {
        status = "GRACE";
      } else if (isUpcoming) {
        status = "UPCOMING";
      }

      // Manual docs meta (strip base64)
      let manualDocsMeta: any[] = [];
      if (res.manual_documents) {
        try {
          const parsed = Array.isArray(res.manual_documents)
            ? res.manual_documents
            : JSON.parse(res.manual_documents as string);
          manualDocsMeta = parsed.map((d: any) => ({
            name: d.name,
            category: d.category,
            uploadedAt: d.uploadedAt,
            url: `/api/documents/${res.id}?name=${encodeURIComponent(d.name)}`,
          }));
        } catch {}
      }

      const formatMonth = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' });
      const nextInstallmentMonth = nextDueDate ? formatMonth.format(nextDueDate).toUpperCase() : null;

      return {
        id: res.id,
        name: res.name,
        last_name: res.last_name,
        clientName: res.last_name
          ? `${res.name} ${res.last_name}`.trim()
          : res.name,
        clientEmail: res.user?.email || res.email,
        clientPhone: res.phone,
        rut: res.rut,
        lotNumber: lot.number,
        lotStage: lot.stage,
        lotId: lot.id,
        totalToPay,
        totalPaid,
        pendingBalance,
        paidCuotas,
        totalCuotas,
        nextInstallmentNumber: paidCuotas < totalCuotas ? paidCuotas + 1 : null,
        nextInstallmentMonth,
        pieStatus: res.pie_status,
        pieAmount,
        nextDueDate,
        lateDays,
        penaltyAmount,
        isGracePeriod,
        isUpcoming,
        isLate: penaltyAmount > 0,
        mora_frozen: res.mora_frozen,
        mora_status: res.mora_status || (res.mora_frozen ? "CONGELADO" : "ACTIVO"),
        status,
        address_street: res.address_street,
        address_number: res.address_number,
        address_commune: res.address_commune,
        address_region: res.address_region,
        marital_status: res.marital_status,
        profession: res.profession,
        nationality: res.nationality,
        internalStatus: res.status,
        isMultiLot: res.is_multilote || false,
        installment_start_date: res.installment_start_date,
        installment_ranges: res.installment_ranges,
        debt_start_date: res.debt_start_date,
        debt_end_date: res.debt_end_date,
        next_payment_date: res.next_payment_date,
        pie: res.pie || lot.pie || 0,
        extra_paid_amount: res.extra_paid_amount,
        pending_amount: res.pending_amount,
        reservation_price: res.reservation_price || lot.reservation_amount_clp || 0,
        last_installment_value: res.last_installment_value || lot.last_installment_amount || (lot.valor_cuota || 0),
        daily_penalty: res.daily_penalty || project.daily_penalty_amount || 10000,
        due_day: res.due_day || project.due_day_of_month || 5,
        grace_days: res.grace_days || project.grace_period_days || 5,
        penalty_mode: res.penalty_mode || "AUTO",
        manual_penalty: res.manual_penalty || 0,
        valor_cuota: lot.valor_cuota || 0,
        is_multilote: res.is_multilote || false,
        lot,
        buyer: res.user,
        observation: res.observation,
        portal_active: res.user?.portal_active || false,
        temp_password: res.user?.temp_password || null,
      };
    });

    const stats = {
      total: processedData.length,
      late: processedData.filter((d) => d.isLate && d.mora_status === "ACTIVO").length,
      grace: processedData.filter((d) => d.isGracePeriod && d.mora_status === "ACTIVO").length,
      upcoming: processedData.filter((d) => d.isUpcoming && d.mora_status === "ACTIVO").length,
      ok: processedData.filter((d) => d.status === "OK").length,
    };

    const result = { success: true, data: processedData, stats, project };
    memoryCache.set(cacheKey, result, CACHE_TTL);
    return result;
  } catch (error) {
    console.error("Error getting postventa data:", error);
    return { error: "Error al cargar datos", data: [], stats: null };
  }
}

/**
 * Gets available projects for the current admin.
 */
export async function getAdminProjects() {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado", projects: [] };
  }

  try {
    let where: any = { status: "ACTIVE" };
    if (user.allowedProjects && Array.isArray(user.allowedProjects)) {
      where.slug = { in: user.allowedProjects };
    }

    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        _count: { select: { lots: true, reservations: true } },
      },
    });

    return { success: true, projects };
  } catch (error) {
    console.error("Error getting admin projects:", error);
    return { error: "Error al cargar proyectos", projects: [] };
  }
}

/**
 * Updates a reservation's data (admin only).
 */
export async function updateReservation(
  reservationId: string,
  data: Record<string, any>
) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    await prisma.reservation.update({
      where: { id: reservationId },
      data,
    });

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin");

    return { success: true };
  } catch (error) {
    console.error("Error updating reservation:", error);
    return { error: "Error al actualizar" };
  }
}

/**
 * Approves a payment receipt.
 */
export async function approveReceipt(receiptId: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id: receiptId },
      include: { 
        reservation: {
          include: { 
            user: true,
            project: true,
            lot: true
          }
        } 
      },
    });

    if (!receipt) return { error: "Comprobante no encontrado" };

    await prisma.paymentReceipt.update({
      where: { id: receiptId },
      data: { status: "APPROVED", processed_at: new Date() },
    });

    // Send Notification
    if (receipt.reservation.user.fcm_token) {
      const { sendPushNotification } = await import("@/lib/notifications");
      sendPushNotification({
        token: receipt.reservation.user.fcm_token,
        title: "¡Pago Aprobado!",
        body: `Tu pago de ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(receipt.amount_clp)} ha sido procesado con éxito.`,
      });
    }

    // Update reservation state and Ledger
    if (receipt.scope === "PIE") {
      await prisma.$transaction([
        prisma.reservation.update({
          where: { id: receipt.reservation_id },
          data: { pie_status: "PAID" },
        }),
        prisma.financialLedger.create({
          data: {
            reservation_id: receipt.reservation_id,
            amount_clp: receipt.amount_clp,
            category: "PIE",
            description: "Pago de Pie Aprobado"
          }
        })
      ]);
    } else if (receipt.scope === "INSTALLMENT") {
      // Get reservation with lot to calculate expected amount
      const res = receipt.reservation;

      if (res) {
        // Calculate what should have been paid (cuota base + penalty)
        let expectedCuotaBase = res.lot.valor_cuota || 0;
        const ranges = res.installment_ranges
          ? (typeof res.installment_ranges === "string"
              ? JSON.parse(res.installment_ranges)
              : res.installment_ranges)
          : [];
        const nextInstNum = (res.installments_paid || 0) + 1;
        const range = (ranges as any[]).find((r: any) => nextInstNum >= Number(r.from) && nextInstNum <= Number(r.to));
        if (range) expectedCuotaBase = Number(range.amount);

        const totalExpectedPerCuota = expectedCuotaBase * (receipt.installments_count || 1);
        const currentPenalty = res.manual_penalty || 0; // The penalty currently registered as fixed if any
        // User requested: "primero a la cuota y luego al interes"
        const paid = receipt.amount_clp;
        const cuotaPaidAmount = Math.min(paid, totalExpectedPerCuota);
        const penaltyPaidAmount = Math.max(0, paid - totalExpectedPerCuota);
        
        // Calculate new shortfall based on whatever penalty they ACTUALLY owed
        let penaltyOwed = 0;
        if (res.penalty_mode === "FIXED" && res.manual_penalty) {
          penaltyOwed = res.manual_penalty;
        } else {
          // If purely AUTO, they owe whatever the system demanded at the time they uploaded the receipt
          // But since we don't have historical snapshot, we assume if they paid extra, it was for the penalty
          // and if they didn't, the shortfall becomes the new fixed penalty if we need to carry it over.
          // To be safe, if they owe a dynamic amount, whatever wasn't paid of the dynamic amount becomes FIXED.
          // Wait, the client usually pays exactly the requested amount.
          // Let's assume shortfall is intended for the old manual penalty, or if not enough, we just carry the remainder.
          // The user specifically said "si no cumple con el interes acomulado se le suma lo restante a los intereses que vaya acomulando".
        }
        // Since calculating exact historical AUTO penalty here is complex, we just calculate raw shortfall vs current total expected (base + fixed).
        const totalExpected = totalExpectedPerCuota + currentPenalty;
        const shortfall = totalExpected - paid;

        const operations = [];

        let nextPenaltyMode = "AUTO";
        if (shortfall > 0) {
          nextPenaltyMode = res.penalty_mode === "MIXED" ? "MIXED" : "FIXED";
        }

        operations.push(prisma.reservation.update({
          where: { id: receipt.reservation_id },
          data: {
            installments_paid: {
              increment: receipt.installments_count || 1,
            },
            next_payment_date: null,
            manual_penalty: shortfall > 0 ? shortfall : null,
            penalty_mode: nextPenaltyMode,
            debt_start_date: null,
          },
        }));

        if (cuotaPaidAmount > 0) {
          operations.push(prisma.financialLedger.create({
            data: {
              reservation_id: receipt.reservation_id,
              amount_clp: cuotaPaidAmount,
              category: "CUOTA",
              description: `Pago Cuota x${receipt.installments_count || 1} Aprobado`
            }
          }));
        }

        if (penaltyPaidAmount > 0) {
          operations.push(prisma.financialLedger.create({
            data: {
              reservation_id: receipt.reservation_id,
              amount_clp: penaltyPaidAmount,
              category: "PENALTY",
              description: `Pago Mora Aprobada`
            }
          }));
        }

        await prisma.$transaction(operations);
      } else {
        // Fallback if reservation not found
        await prisma.$transaction([
          prisma.reservation.update({
            where: { id: receipt.reservation_id },
            data: {
              installments_paid: {
                increment: receipt.installments_count || 1,
              },
              next_payment_date: null,
              manual_penalty: null,
              penalty_mode: "AUTO",
            },
          }),
          prisma.financialLedger.create({
            data: {
              reservation_id: receipt.reservation_id,
              amount_clp: receipt.amount_clp,
              category: "CUOTA",
              description: `Pago Cuota (Fallback) Aprobado`
            }
          })
        ]);
      }

    }

    // Auto-generate Digital Payment Receipt PDF
    try {
      const { generateReceiptPDF } = await import("@/lib/pdfGenerator");
      
      const clientName = receipt.reservation.user?.name || receipt.reservation.name || "Cliente Alimin";
      const rut = receipt.reservation.rut || "No registrado";
      const email = receipt.reservation.user?.email || receipt.reservation.email || "No registrado";
      const projectName = receipt.reservation.project?.name || "Alimin SPA";
      const lotNumber = (receipt.reservation.lot as any)?.number || receipt.lot_id.toString();
      const stage = receipt.reservation.lot?.stage || "";
      const concept = receipt.scope === "PIE" ? "Pago de Pie" : `Pago Cuota(s) x${receipt.installments_count || 1}`;
      
      const pdfBase64 = await generateReceiptPDF({
        clientName,
        rut,
        email,
        projectName,
        lotNumber,
        stage,
        concept,
        amount: receipt.amount_clp,
        date: new Date(),
        receiptId: receipt.id.substring(0, 8).toUpperCase(),
      });

      await prisma.reservationDocument.create({
        data: {
          reservation_id: receipt.reservation_id,
          name: `Comprobante_Pago_${receipt.id.substring(0, 6)}.pdf`,
          file_type: "application/pdf",
          base64_content: `data:application/pdf;base64,${pdfBase64}`,
        }
      });
    } catch (err) {
      console.error("Failed to generate and save PDF receipt:", err);
    }

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    memoryCache.deleteByPrefix("receipts_");
    revalidatePath("/admin");

    return { success: true };
  } catch (error) {
    console.error("Error approving receipt:", error);
    return { error: "Error al aprobar" };
  }
}

/**
 * Rejects a payment receipt.
 */
export async function rejectReceipt(receiptId: string, reason: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id: receiptId },
      include: { 
        reservation: {
          include: { user: { select: { fcm_token: true } } }
        } 
      },
    });

    await prisma.paymentReceipt.update({
      where: { id: receiptId },
      data: {
        status: "REJECTED",
        rejection_reason: reason,
        processed_at: new Date(),
      },
    });

    // Create persistent notification in DB
    if (receipt?.reservation?.user_id) {
      await prisma.notification.create({
        data: {
          user_id: receipt.reservation.user_id,
          type: "PAYMENT_REJECTED",
          title: "Pago Observado",
          message: `Tu comprobante de ${receipt.scope === 'PIE' ? 'Pie' : 'Cuota'} por $${receipt.amount_clp.toLocaleString('es-CL')} fue rechazado: ${reason}`,
        }
      });
    }

    // Send Push Notification
    if (receipt?.reservation?.user?.fcm_token) {
      const { sendPushNotification } = await import("@/lib/notifications");
      sendPushNotification({
        token: receipt.reservation.user.fcm_token,
        title: "Observación en tu Pago",
        body: `Tu comprobante ha sido rechazado: ${reason}. Por favor, revisa los detalles.`,
      });
    }

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("receipts_");
    revalidatePath("/admin");

    return { success: true };
  } catch (error) {
    console.error("Error rejecting receipt:", error);
    return { error: "Error al rechazar" };
  }
}

/**
 * Gets pending receipts for admin inbox.
 */
export async function getPendingReceipts(projectSlug: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado", receipts: [] };
  }

  try {
    const project = await prisma.project.findUnique({
      where: { slug: projectSlug },
    });
    if (!project) return { error: "Proyecto no encontrado", receipts: [] };

    const receipts = await prisma.paymentReceipt.findMany({
      where: {
        reservation: { project_id: project.id },
        status: "PENDING",
      },
      orderBy: { created_at: "desc" },
      include: {
        reservation: {
          select: {
            name: true,
            last_name: true,
            email: true,
            phone: true,
          },
        },
        lot: {
          select: { number: true, stage: true },
        },
      },
    });

    return { success: true, receipts };
  } catch (error) {
    console.error("Error getting pending receipts:", error);
    return { error: "Error al cargar comprobantes", receipts: [] };
  }
}

/**
 * Gets all receipts (history) for a project.
 */
export async function getAllReceipts(projectSlug: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado", receipts: [] };
  }

  try {
    const project = await prisma.project.findUnique({
      where: { slug: projectSlug },
    });
    if (!project) return { error: "Proyecto no encontrado", receipts: [] };

    const receipts = await prisma.paymentReceipt.findMany({
      where: {
        reservation: { project_id: project.id },
      },
      orderBy: { created_at: "desc" },
      include: {
        reservation: {
          select: {
            name: true,
            last_name: true,
            email: true,
            phone: true,
          },
        },
        lot: {
          select: { number: true, stage: true },
        },
      },
    });

    return { success: true, receipts };
  } catch (error) {
    console.error("Error getting all receipts:", error);
    return { error: "Error al cargar historial de comprobantes", receipts: [] };
  }
}

/**
 * Gets all reservations for a project (admin reservas view).
 */
export async function getProjectReservations(projectSlug: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado", reservations: [] };
  }
  if (user.allowedProjects && !user.allowedProjects.includes(projectSlug)) {
    return { error: "No tienes acceso a este proyecto", reservations: [] };
  }
  try {
    const project = await prisma.project.findUnique({ where: { slug: projectSlug } });
    if (!project) return { error: "Proyecto no encontrado", reservations: [] };
    const reservations = await prisma.reservation.findMany({
      where: { project_id: project.id },
      orderBy: { created_at: "desc" },
      include: {
        lot: { select: { id: true, number: true, stage: true, price_total_clp: true, reservation_amount_clp: true } },
        user: { select: { id: true, name: true, email: true, portal_active: true } },
        project: { select: { name: true, slug: true } },
      },
    });
    const mapped = reservations.map((res) => ({
      id: res.id, name: res.name, last_name: res.last_name,
      fullName: res.last_name ? `${res.name} ${res.last_name}`.trim() : res.name,
      email: res.email, phone: res.phone, rut: res.rut, advisor: res.advisor,
      observation: res.observation, notes: res.notes, status: res.status,
      pie_status: res.pie_status, pie: res.pie, reservation_price: res.reservation_price,
      installments_paid: res.installments_paid || 0, created_at: res.created_at,
      lotNumber: res.lot.number, lotStage: res.lot.stage, lotId: res.lot.id,
      lotPrice: res.lot.price_total_clp, projectName: res.project.name,
      portalActive: res.user?.portal_active || false,
      marital_status: res.marital_status, profession: res.profession,
      nationality: res.nationality, address_street: res.address_street,
      address_commune: res.address_commune, address_region: res.address_region,
    }));
    return { success: true, reservations: mapped, projectName: project.name };
  } catch (error) {
    console.error("Error getting project reservations:", error);
    return { error: "Error al cargar reservas", reservations: [] };
  }
}

/**
 * Gets financial history (ledger) for a specific reservation.
 */
export async function getFinancialHistory(reservationId: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado", history: [] };
  }

  try {
    const history = await prisma.financialLedger.findMany({
      where: { reservation_id: reservationId },
      orderBy: { paid_at: "desc" },
    });

    return { success: true, history };
  } catch (error) {
    console.error("Error getting financial history:", error);
    return { error: "Error al cargar historial financiero", history: [] };
  }
}

/**
 * Gets all lots for a project (admin inventory view).
 */
export async function getAdminLots(projectSlug: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado", lots: [] };
  }

  try {
    const project = await prisma.project.findUnique({
      where: { slug: projectSlug },
    });
    if (!project) return { error: "Proyecto no encontrado", lots: [] };

    const lots = await prisma.lot.findMany({
      where: { project_id: project.id },
      include: { 
        reservations: {
          where: { status: { in: ["active", "COMPLETED", "ARCHIVED"] } },
          select: { name: true, last_name: true, status: true }
        }
      },
      orderBy: { number: "asc" },
    });

    const processedLots = lots.map(l => {
      const activeRes = l.reservations[0]; // Take the primary/most recent assignment
      return {
        ...l,
        assignedClient: activeRes ? `${activeRes.name} ${activeRes.last_name || ""}`.trim() : null,
        assignmentStatus: activeRes ? activeRes.status : null
      };
    });

    return { success: true, lots: processedLots };
  } catch (error) {
    console.error("Error getting admin lots:", error);
    return { error: "Error al cargar lotes", lots: [] };
  }
}

/**
 * Updates a client's profile data, updating both Reservation and underlying User login email.
 */
export async function updateClientProfile(reservationId: string, data: { name: string, email: string, rut: string, phone: string, observation?: string }) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { user: true }
    });

    if (!reservation) {
      return { error: "Reserva no encontrada" };
    }

    // Check if new email conflicts with another user (excluding the current one)
    if (data.email !== reservation.user.email) {
      const existingUserWithNewEmail = await prisma.user.findUnique({ where: { email: data.email } });
      if (existingUserWithNewEmail) {
        return { error: "Ese correo electrónico ya está registrado por otro usuario en la plataforma." };
      }
    }

    // Check for shared users (decoupling logic)
    const otherReservationsWithSameUser = await prisma.reservation.findMany({
      where: { 
        user_id: reservation.user_id,
        id: { not: reservationId }
      }
    });

    const isSharedUser = otherReservationsWithSameUser.length > 0;
    
    // We decouple if it's shared AND (email is changing OR names are different)
    const shouldDecouple = isSharedUser && (
      data.email !== reservation.user.email || 
      data.name.toLowerCase() !== reservation.user.name.toLowerCase()
    );

    if (shouldDecouple) {
      console.log(`Decoupling reservation ${reservationId} from shared user ${reservation.user_id}`);
      
      // Create a NEW user for this reservation
      const newUser = await prisma.user.create({
        data: {
          email: data.email,
          name: data.name,
          password: reservation.user.password, // Inherit password
          role: "USER",
          portal_active: reservation.user.portal_active,
          fcm_token: null, // Don't inherit push token as it's device-specific
        }
      });

      await prisma.reservation.update({
        where: { id: reservationId },
        data: {
          user_id: newUser.id,
          name: data.name,
          email: data.email,
          rut: data.rut,
          phone: data.phone,
          observation: data.observation
        }
      });
    } else {
      // Regular update (either not shared, or same person with multiple lots)
      await prisma.$transaction([
        prisma.user.update({
          where: { id: reservation.user_id },
          data: {
            email: data.email,
            name: data.name
          }
        }),
        prisma.reservation.update({
          where: { id: reservationId },
          data: {
            name: data.name,
            email: data.email,
            rut: data.rut,
            phone: data.phone,
            observation: data.observation
          }
        })
      ]);
    }

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Error updating client profile:", error);
    return { error: "Error interno del servidor actualizando perfil" };
  }
}

/**
 * Updates a client's financial data (admin only).
 */
export async function updateClientFinancials(reservationId: string, lotId: number, data: {
  cuotas?: number;
  valor_cuota?: number;
  price_total_clp?: number;
  reservation_price?: number;
  pie?: number;
  last_installment_value?: number;
  installments_paid?: number;
  installment_start_date?: string;
  daily_penalty?: number;
  due_day?: number;
  grace_days?: number;
  mora_frozen?: boolean;
  mora_status?: string;
  penalty_mode?: string;
  manual_penalty?: number | null;
  debt_start_date?: string | null;
  debt_end_date?: string | null;
  next_payment_date?: string | null;
  extra_paid_amount?: number;
  installment_ranges?: any[];
}) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { lot: true }
    });

    if (!reservation) return { error: "Reserva no encontrada" };

    // Set dates
    let startDateObj: Date | null = null;
    let nextDateObj: Date | null = null;
    
    if (data.installment_start_date) {
        const enteredDate = new Date(data.installment_start_date + "T12:00:00");
        const paidCount = Number(data.installments_paid) || 0;
        
        // We want: AnchorDate + PaidCount = EnteredDate
        // Therefore: AnchorDate = EnteredDate - PaidCount
        const calculatedAnchor = new Date(enteredDate);
        calculatedAnchor.setMonth(calculatedAnchor.getMonth() - paidCount);
        
        startDateObj = calculatedAnchor;
        nextDateObj = enteredDate;
    }

    await prisma.$transaction([
      prisma.lot.update({
        where: { id: Number(lotId) || lotId },
        data: {
          price_total_clp: Number(data.price_total_clp) || 0,
          cuotas: Number(data.cuotas) || 0,
          valor_cuota: Number(data.valor_cuota) || 0,
          pie: Number(data.pie) || 0
        }
      }),
      prisma.reservation.update({
        where: { id: reservationId },
        data: {
          reservation_price: Number(data.reservation_price) || 0,
          pie: Number(data.pie) || 0,
          last_installment_value: Number(data.last_installment_value) || 0,
          daily_penalty: Number(data.daily_penalty) || 0,
          due_day: (data.next_payment_date && data.next_payment_date.trim() !== "") 
            ? new Date(data.next_payment_date + "T12:00:00").getDate() 
            : (Number(data.due_day) || 5),
          grace_days: Number(data.grace_days) || 0,
          mora_frozen: data.mora_status === "CONGELADO",
          mora_status: data.mora_status,
          debt_start_date: (data.debt_start_date && data.debt_start_date.trim() !== "") 
            ? new Date(data.debt_start_date + "T12:00:00") 
            : null,
          debt_end_date: (data.debt_end_date && data.debt_end_date.trim() !== "") 
            ? new Date(data.debt_end_date + "T12:00:00") 
            : null,
          next_payment_date: nextDateObj || null,
          installments_paid: Number(data.installments_paid) || 0,
          penalty_mode: data.penalty_mode || "AUTO",
          manual_penalty: (data.penalty_mode === "FIXED" || data.penalty_mode === "MIXED") ? (Number(data.manual_penalty) || null) : null,
          extra_paid_amount: Number(data.extra_paid_amount) || 0,
          installment_ranges: data.installment_ranges || [],
          ...(startDateObj && { installment_start_date: startDateObj }),
        }
      })
    ]);

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Error updating client financials:", error);
    return { error: "Error interno actualizando finanzas" };
  }
}

/**
 * Toggles the multi-lot status for a reservation.
 */
export async function toggleMultiLot(reservationId: string, status: boolean) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { is_multilote: status }
    });

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Error toggling multi-lot:", error);
    return { error: "Error al cambiar estado multi-lote" };
  }
}

/**
 * Toggles the Al Contado status for a reservation (mark as COMPLETED or active).
 */
export async function toggleAlContado(reservationId: string, isAlContado: boolean) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: isAlContado ? "COMPLETED" : "active" }
    });

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Error toggling al contado:", error);
    return { error: "Error al cambiar estado al contado" };
  }
}

/**
 * Registers a manual payment (e.g. offline transfer, cash) and adds it to the ledger.
 */
export async function registerManualPayment(
  reservationId: string,
  data: {
    amount: number;
    installmentsCount: number;
    paidAt: string;
    isPie: boolean;
    receiptUrl?: string;
  }
) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { lot: true },
    });

    if (!res) return { error: "Reserva no encontrada" };

    const paymentDate = new Date(data.paidAt + "T12:00:00");

    if (data.isPie) {
      const operations: any[] = [
        prisma.reservation.update({
          where: { id: reservationId },
          data: { pie_status: "PAID" },
        }),
        prisma.financialLedger.create({
          data: {
            reservation_id: reservationId,
            amount_clp: data.amount,
            category: "PIE",
            description: "Pago Manual de Pie",
            paid_at: paymentDate,
          },
        }),
      ];

      if (data.receiptUrl) {
        operations.push(
          prisma.paymentReceipt.create({
            data: {
              reservation_id: reservationId,
              lot_id: res.lot_id,
              amount_clp: data.amount,
              receipt_url: data.receiptUrl,
              scope: "PIE",
              status: "APPROVED",
              processed_at: new Date(),
            },
          })
        );
      }

      await prisma.$transaction(operations);
    } else {
      let expectedCuotaBase = res.lot.valor_cuota || 0;
      const ranges = res.installment_ranges
        ? typeof res.installment_ranges === "string"
          ? JSON.parse(res.installment_ranges)
          : res.installment_ranges
        : [];
      const nextInstNum = (res.installments_paid || 0) + 1;
      const range = (ranges as any[]).find(
        (r: any) => nextInstNum >= Number(r.from) && nextInstNum <= Number(r.to)
      );
      if (range) expectedCuotaBase = Number(range.amount);

      const totalExpectedPerCuota = expectedCuotaBase * data.installmentsCount;
      const currentPenalty = res.manual_penalty || 0;

      const paid = data.amount;
      const cuotaPaidAmount = Math.min(paid, totalExpectedPerCuota);
      const penaltyPaidAmount = Math.max(0, paid - totalExpectedPerCuota);

      const totalExpected = totalExpectedPerCuota + currentPenalty;
      const shortfall = totalExpected - paid;

      const operations = [];

      operations.push(
        prisma.reservation.update({
          where: { id: reservationId },
          data: {
            installments_paid: {
              increment: data.installmentsCount,
            },
            next_payment_date: null,
            manual_penalty: shortfall > 0 ? shortfall : null,
            penalty_mode: shortfall > 0 ? "FIXED" : "AUTO",
            debt_start_date: null,
          },
        })
      );

      if (cuotaPaidAmount > 0) {
        operations.push(
          prisma.financialLedger.create({
            data: {
              reservation_id: reservationId,
              amount_clp: cuotaPaidAmount,
              category: "CUOTA",
              description: `Pago Manual Cuota x${data.installmentsCount}`,
              paid_at: paymentDate,
            },
          })
        );
      }

      if (penaltyPaidAmount > 0) {
        operations.push(
          prisma.financialLedger.create({
            data: {
              reservation_id: reservationId,
              amount_clp: penaltyPaidAmount,
              category: "PENALTY",
              description: `Pago Manual Mora`,
              paid_at: paymentDate,
            },
          })
        );
      }

      if (data.receiptUrl) {
        operations.push(
          prisma.paymentReceipt.create({
            data: {
              reservation_id: reservationId,
              lot_id: res.lot_id,
              amount_clp: data.amount,
              receipt_url: data.receiptUrl,
              scope: "INSTALLMENT",
              installments_count: data.installmentsCount,
              status: "APPROVED",
              processed_at: new Date(),
              nominal_installment_number: nextInstNum,
              nominal_installment_range:
                data.installmentsCount > 1
                  ? `${nextInstNum}-${nextInstNum + data.installmentsCount - 1}`
                  : null,
            },
          })
        );
      }

      await prisma.$transaction(operations);
    }

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Error adding manual payment:", error);
    return { error: "Error al registrar pago manual" };
  }
}

/**
 * Gets the client's Point-of-View data for a reservation.
 * Admin-only. Returns the same data structure the user portal displays.
 */
export async function getClientPOV(reservationId: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
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

    if (!res) return { error: "Reservación no encontrada" };

    const lot = res.lot;
    const project = res.project;
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    const paidCuotas = res.installments_paid || 0;
    const totalCuotas = lot.cuotas || 0;
    const pieAmount = res.pie || lot.pie || 0;
    
    // Sum approved PIE receipts for more accuracy, or fallback to full pie if status is PAID
    const piePaidFromReceipts = res.receipts
      ?.filter((r) => r.scope === "PIE")
      .reduce((acc, r) => acc + (r.amount_clp || 0), 0) || 0;
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

    const extraPaid = res.extra_paid_amount || 0;
    const totalPaid = calculatedCuotasTotal + pieAmount + extraPaid;
    const totalToPay = lot.price_total_clp || 0;
    const pendingBalance = totalToPay - totalPaid;

    // Calculate Acquisition Progress based on milestones (Steps in the plan)
    // Milestone 1: PIE, Milestones 2..N: Installments
    const hasPie = pieAmount > 0;
    const pieStepPaid = actualPie > 0 || paidCuotas > 0; // If they are paying installments, PIE is assumed settled in progress
    const totalSteps = (hasPie ? 1 : 0) + totalCuotas;
    const completedSteps = (pieStepPaid ? 1 : 0) + paidCuotas;
    const acquisitionProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    let nextDueDate: Date | null = null;
    let penaltyAmount = 0;
    let lateDays = 0;
    let upcomingInstallments: any[] = [];
    const activeDailyPenalty = res.daily_penalty ?? project.daily_penalty_amount ?? 10000;

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

      // Penalty calculation
      if (res.penalty_mode === "FIXED" && res.manual_penalty != null && res.manual_penalty > 0) {
        penaltyAmount = res.manual_penalty;
        if (activeDailyPenalty > 0) {
          lateDays = Math.round(penaltyAmount / activeDailyPenalty);
        }
      } else if (res.penalty_mode === "MIXED") {
        const { totalPenaltyAmount: autoPenalty, totalLateDays: autoLateDays } = calculateAggregatedAutoPenalty(
          totalCuotas - paidCuotas,
          paidCuotas,
          res.installment_start_date,
          res.due_day ?? project.due_day_of_month ?? 5,
          currentDate,
          res.mora_status === "CONGELADO" || res.mora_status === "AL_DIA" || (res.mora_frozen || false),
          res.grace_days ?? project.grace_period_days ?? 5,
          activeDailyPenalty,
          res.debt_start_date,
          project.penalty_start_date,
          res.debt_end_date,
          res.next_payment_date
        );
        const fixedPenalty = (res.manual_penalty != null && res.manual_penalty > 0) ? res.manual_penalty : 0;
        penaltyAmount = autoPenalty + fixedPenalty;

        if (penaltyAmount > 0 && activeDailyPenalty > 0) {
          lateDays = Math.round(penaltyAmount / activeDailyPenalty);
        }
      } else {
        const { totalPenaltyAmount: autoPenalty, totalLateDays: autoLateDays } = calculateAggregatedAutoPenalty(
          totalCuotas - paidCuotas,
          paidCuotas,
          res.installment_start_date,
          res.due_day ?? project.due_day_of_month ?? 5,
          currentDate,
          res.mora_status === "CONGELADO" || res.mora_status === "AL_DIA" || (res.mora_frozen || false),
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

      // Upcoming installments
      const totalPendingRemaining = totalCuotas - paidCuotas;
      const maxToShow = totalPendingRemaining;
      const formatMonth = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' });

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
          if (range) installmentBaseAmount = Number(range.amount);
        }

        let finalAmount = installmentBaseAmount;
        let hasPenalty = false;
        let installmentPenaltyAmount = 0;
        let installmentLateDays = 0;

        // Calculate auto penalty for this specific installment
        let autoPenaltyForThis = 0;
        if (res.penalty_mode !== "FIXED" && res.mora_status === "ACTIVO") {
          autoPenaltyForThis = calculateTotalInterest(
            currentDue,
            currentDate,
            res.mora_frozen || false,
            res.grace_days ?? project.grace_period_days ?? 5,
            activeDailyPenalty,
            i === 0 ? res.debt_start_date : null,
            project.penalty_start_date,
            res.debt_end_date
          );
        }

        installmentPenaltyAmount = autoPenaltyForThis;

        if (installmentPenaltyAmount > 0) {
          finalAmount += installmentPenaltyAmount;
          hasPenalty = true;
          // Calculate late days specifically for the auto penalty part
          installmentLateDays = Math.round(installmentPenaltyAmount / activeDailyPenalty);
        }

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
          dailyPenalty: hasPenalty ? activeDailyPenalty : 0,
          isOverdue
        });
      }
    }

    // Documents
    let documents: any[] = [];
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
    if (res.documents && res.documents.length > 0) {
      const newDocs = res.documents.map((d: any) => ({
        name: d.name,
        category: d.category,
        uploadedAt: d.created_at,
        url: `/api/documents/${d.id}`,
      }));
      documents = [...newDocs, ...documents];
    }

    const formatMonth = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const nextInstallmentMonth = nextDueDate ? formatMonth.format(nextDueDate).toUpperCase() : null;

    return {
      success: true,
      data: {
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
        nextInstallmentMonth,
        pieStatus: res.pie_status,
        pieAmount,
        valor_cuota: lot.valor_cuota || 0,
        nextDueDate,
        penaltyAmount,
        lateDays,
        isLate: penaltyAmount > 0 && res.mora_status === "ACTIVO",
        isMoraFrozen: res.mora_status === "CONGELADO" || res.mora_frozen,
        isUpToDate: res.mora_status === "AL_DIA",
        dailyPenalty: activeDailyPenalty,
        upcomingInstallments,
        documents,
        bank: {
          name: project.bank_name,
          type: project.bank_type,
          account: project.bank_account,
          holder: project.bank_holder,
          rut: project.bank_rut,
          email: project.bank_email,
        },
        clientName: res.last_name ? `${res.name} ${res.last_name}`.trim() : res.name,
        clientEmail: res.email,
      },
    };
  } catch (error) {
    console.error("Error getting client POV:", error);
    return { error: "Error al cargar vista del cliente" };
  }
}

/**
 * Gets aggregated ledger statistics for the dashboard, optionally filtered by month and year.
 */
export async function getProjectLedgerStats(projectSlug: string, month?: number, year?: number) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const project = await prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true },
    });

    if (!project) return { error: "Proyecto no encontrado" };

    let dateFilter = {};
    if (month !== undefined && year !== undefined) {
      const startDate = new Date(year, month - 1, 1, 0, 0, 0);
      const endDate = new Date(year, month, 1, 0, 0, 0);
      dateFilter = {
        paid_at: {
          gte: startDate,
          lt: endDate,
        },
      };
    }

    const recauAgg = await prisma.financialLedger.aggregate({
      where: {
        reservation: { project_id: project.id },
        category: { in: ["CUOTA", "PIE"] },
        ...dateFilter,
      },
      _sum: { amount_clp: true },
    });

    const moraAgg = await prisma.financialLedger.aggregate({
      where: {
        reservation: { project_id: project.id },
        category: "PENALTY",
        ...dateFilter,
      },
      _sum: { amount_clp: true },
    });

    return {
      revenue: recauAgg._sum.amount_clp || 0,
      penalty: moraAgg._sum.amount_clp || 0,
    };
  } catch (error) {
    console.error("Error getting ledger stats:", error);
    return { error: "Error interno al cargar caja" };
  }
}

/**
 * Activates a client's portal access.
 * Generates a temporary password, updates the DB, and triggers the webhook.
 */
export async function activateClientProfile(reservationId: string) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { user: true, project: true }
    });

    if (!reservation) {
      return { error: "Reserva no encontrada" };
    }

    const isTestClient = reservation.name.toLowerCase().includes("nicolas cabrera") || reservation.user.email.toLowerCase().includes("nicolas");
    if (reservation.user.portal_active && !isTestClient) {
      return { error: "El cliente ya ha sido activado" };
    }

    // Generate random 8-character temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await hash(tempPassword, 10);

    // Update user record
    await prisma.user.update({
      where: { id: reservation.user_id },
      data: {
        password: hashedPassword,
        must_change_password: true,
        portal_active: true,
        temp_password: tempPassword
      }
    });

    // Determine webhook URL based on project
    let webhookUrl = "";
    if (reservation.project.slug === "arena-y-sol") {
      webhookUrl = "https://n8n.aliminlomasdelmar.com/webhook/517e9ba2-64af-4b34-b926-c9265cbfed88";
    } else if (reservation.project.slug === "libertad-y-alegria") {
      webhookUrl = "https://n8n.aliminlomasdelmar.com/webhook/8aa897b9-d275-401c-a32b-333bbc0b20ee";
    } else {
      webhookUrl = "https://n8n.aliminlomasdelmar.com/webhook/517e9ba2-64af-4b34-b926-c9265cbfed88"; // Fallback
    }

    // Prepare payload with HTML template
    const subject = `✨ ¡Bienvenido! Tu acceso al Portal de Pagos de ${reservation.project.name} ya está activo`;
    
    const htmlTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: #fff; }
        .header { background: linear-gradient(135deg, #1a5f2a 0%, #2d8f4a 100%); color: #fff; padding: 35px 30px; text-align: center; }
        .header img { max-width: 130px; height: auto; margin-bottom: 15px; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .content { padding: 40px 30px; }
        .welcome-badge { background: #e8f5e9; border: 1px solid #4caf50; border-radius: 50px; padding: 8px 18px; display: inline-block; margin-bottom: 25px; }
        .welcome-badge span { color: #2e7d32; font-weight: 600; font-size: 13px; text-transform: uppercase; }
        .greeting { font-size: 22px; color: #1a5f2a; margin-bottom: 20px; font-weight: 600; }
        .login-card { background: #f8faf8; border: 1px solid #e0e0e0; border-radius: 12px; padding: 30px; margin: 25px 0; border-left: 5px solid #1a5f2a; }
        .login-item { margin-bottom: 15px; }
        .login-item:last-child { margin-bottom: 0; }
        .login-label { color: #777; font-size: 13px; text-transform: uppercase; display: block; margin-bottom: 5px; font-weight: bold; }
        .login-value { color: #333; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px solid #eee; display: inline-block; min-width: 200px; }
        .btn-container { text-align: center; margin: 40px 0; }
        .btn-portal { background-color: #1a5f2a; color: #ffffff !important; padding: 18px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 10px rgba(26,95,42,0.2); transition: all 0.3s ease; }
        .security-note { background: #fff3e0; border-radius: 8px; padding: 15px 20px; font-size: 14px; color: #666; margin-top: 30px; }
        .footer { background: #1a5f2a; color: #fff; padding: 30px; text-align: center; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="https://lh3.googleusercontent.com/d/1yWAhY7_vZVJOVwyxZsgILoKd58_na516" alt="ALIMIN Logo">
            <h1>Portal de Pagos</h1>
        </div>
        <div class="content">
            <div class="welcome-badge">
                <span>✨ Nueva plataforma disponible</span>
            </div>
            <p class="greeting">¡Hola ${reservation.name}!</p>
            <p>Estamos felices de presentarte nuestro nuevo <strong>Portal de Pagos Oficial</strong>. A partir de ahora, podrás gestionar tus cuotas, revisar tus estados de cuenta y realizar pagos de forma más rápida y segura.</p>
            <p style="margin-top: 25px; color: #555;">Aquí tienes tus credenciales de acceso:</p>
            <div class="login-card">
                <div class="login-item">
                    <span class="login-label">Usuario / Correo:</span>
                    <span class="login-value">${reservation.user.email}</span>
                </div>
                <div class="login-item">
                    <span class="login-label">Contraseña Temporal:</span>
                    <span class="login-value">${tempPassword}</span>
                </div>
            </div>
            <div class="btn-container">
                <a href="https://pagos.aliminspa.cl" class="btn-portal">
                    IR A MI PORTAL
                </a>
            </div>
            <div class="security-note">
                <p style="margin: 0;"><strong>🔐 Nota de seguridad:</strong> Por tu protección, el sistema te solicitará cambiar esta contraseña temporal al momento de ingresar por primera vez.</p>
            </div>
        </div>
        <div class="footer">
            <p><strong>ALIMIN SPA</strong><br>Gestión Inmobiliaria y Financiera</p>
            <p style="opacity: 0.6; margin-top: 10px;">Este correo contiene información confidencial. Si no eres el destinatario, por favor ignóralo.</p>
        </div>
    </div>
</body>
</html>`;

    const payload = {
      asunto: subject,
      nombre: reservation.name,
      correo: reservation.user.email,
      contraseña: tempPassword,
      proyecto: reservation.project.name,
      html: htmlTemplate
    };

    // Trigger webhook in background (don't await to avoid blocking)
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(err => console.error("Error triggering webhook:", err));

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Error activating client:", error);
    return { error: "Error interno del servidor al activar cliente" };
  }
}

export async function generateTemporaryPassword(reservationId: string) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { user: true }
    });

    if (!reservation) return { error: "Reserva no encontrada" };

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: reservation.user_id },
      data: {
        password: hashedPassword,
        must_change_password: true,
        temp_password: tempPassword,
        portal_active: true
      }
    });

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true, tempPassword, email: reservation.user.email };
  } catch (error) {
    console.error("Error generating password:", error);
    return { error: "Error al generar contraseña" };
  }
}

export async function deletePaymentReceipt(receiptId: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id: receiptId },
      include: { reservation: true },
    });

    if (!receipt) return { error: "Comprobante no encontrado" };

    // Revert reservation state if approved
    if (receipt.status === "APPROVED") {
      if (receipt.scope === "INSTALLMENT") {
        await prisma.reservation.update({
          where: { id: receipt.reservation_id },
          data: {
            installments_paid: { decrement: receipt.installments_count || 1 },
          },
        });
      } else if (receipt.scope === "PIE") {
        await prisma.reservation.update({
          where: { id: receipt.reservation_id },
          data: { pie_status: "PENDING" },
        });
      }

      // Also remove from financial ledger if it was added
      await prisma.financialLedger.deleteMany({
        where: {
          reservation_id: receipt.reservation_id,
          amount_clp: receipt.amount_clp,
          created_at: {
            gte: new Date(receipt.processed_at!.getTime() - 5000),
            lte: new Date(receipt.processed_at!.getTime() + 5000),
          },
        },
      });
    }

    await prisma.paymentReceipt.delete({
      where: { id: receiptId },
    });

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    memoryCache.deleteByPrefix("receipts_");
    revalidatePath("/admin");

    return { success: true };
  } catch (error) {
    console.error("Error deleting receipt:", error);
    return { error: "Error al eliminar el comprobante" };
  }
}

export async function updateMoraDates(
  reservationId: string,
  startDate: string | null,
  endDate: string | null
) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        debt_start_date: startDate ? new Date(startDate) : null,
        debt_end_date: endDate ? new Date(endDate) : null,
      },
    });

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin");

    return { success: true, message: "Fechas de mora actualizadas" };
  } catch (error) {
    console.error("Error updating mora dates:", error);
    return { error: "Error al actualizar fechas de mora" };
  }
}

/**
 * Gets income analytics data for the dashboard income page.
 * Groups FinancialLedger entries by month, providing totals for cuotas, PIE, and penalties.
 * Uses cash-basis accounting: the paid_at date determines which month a payment belongs to.
 */
export async function getIncomeAnalytics(projectSlug: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const project = await prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true, name: true },
    });

    if (!project) return { error: "Proyecto no encontrado" };

    // Get all ledger entries for this project with reservation+user info
    // Filter: From May 1st, 2026 onwards
    const filterDate = new Date(2026, 4, 1); // May 1st, 2026

    const ledgerEntries = await prisma.financialLedger.findMany({
      where: {
        reservation: { project_id: project.id },
        category: { not: "PIE" },
        OR: [
          { paid_at: { gte: filterDate } },
          { 
            AND: [
              { paid_at: null },
              { created_at: { gte: filterDate } }
            ]
          }
        ]
      },
      include: {
        reservation: {
          select: {
            name: true,
            last_name: true,
            lot: { select: { number: true, stage: true } },
          },
        },
      },
      orderBy: { paid_at: "desc" },
    });

    // Build monthly aggregation
    const monthlyMap = new Map<string, {
      key: string;
      year: number;
      month: number;
      label: string;
      cuotas: number;
      pie: number;
      penalty: number;
      total: number;
      paymentCount: number;
    }>();

    const monthNames = [
      "Ene", "Feb", "Mar", "Abr", "May", "Jun",
      "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
    ];

    // Detailed records for the table
    const detailedRecords: any[] = [];

    for (const entry of ledgerEntries) {
      const paidAt = entry.paid_at ? new Date(entry.paid_at) : new Date(entry.created_at!);
      const year = paidAt.getFullYear();
      const month = paidAt.getMonth(); // 0-indexed
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      const label = `${monthNames[month]} ${year}`;

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          key,
          year,
          month: month + 1,
          label,
          cuotas: 0,
          pie: 0,
          penalty: 0,
          total: 0,
          paymentCount: 0,
        });
      }

      const bucket = monthlyMap.get(key)!;
      const amount = entry.amount_clp;

      if (entry.category === "CUOTA") {
        bucket.cuotas += amount;
      } else if (entry.category === "PIE") {
        bucket.pie += amount;
      } else if (entry.category === "PENALTY") {
        bucket.penalty += amount;
      }
      bucket.total += amount;
      bucket.paymentCount += 1;

      // Build detailed record
      const clientName = entry.reservation.last_name
        ? `${entry.reservation.name} ${entry.reservation.last_name}`.trim()
        : entry.reservation.name;

      detailedRecords.push({
        id: entry.id,
        clientName,
        lotNumber: entry.reservation.lot.number,
        lotStage: entry.reservation.lot.stage,
        amount: entry.amount_clp,
        category: entry.category,
        description: entry.description,
        paidAt: paidAt.toISOString(),
        monthKey: key,
      });
    }

    // Convert map to sorted array (chronological)
    const monthlyData = Array.from(monthlyMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    // Calculate grand totals
    const grandTotal = {
      cuotas: monthlyData.reduce((s, m) => s + m.cuotas, 0),
      pie: monthlyData.reduce((s, m) => s + m.pie, 0),
      penalty: monthlyData.reduce((s, m) => s + m.penalty, 0),
      total: monthlyData.reduce((s, m) => s + m.total, 0),
      paymentCount: monthlyData.reduce((s, m) => s + m.paymentCount, 0),
    };

    return {
      projectName: project.name,
      monthlyData,
      detailedRecords,
      grandTotal,
    };
  } catch (error) {
    console.error("Error getting income analytics:", error);
    return { error: "Error interno al cargar analítica de ingresos" };
  }
}

/**
 * Creates a new lot in a project (admin only).
 */
export async function createLot(data: {
  projectSlug: string;
  number: string;
  stage?: string;
  area_m2?: number;
  price_total_clp: number;
  reservation_amount_clp?: number;
  pie?: number;
  cuotas?: number;
  valor_cuota?: number;
  last_installment_amount?: number;
}) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const project = await prisma.project.findUnique({
      where: { slug: data.projectSlug },
    });
    if (!project) return { error: "Proyecto no encontrado" };

    // Check if lot number already exists in this project (with same stage)
    const existing = await prisma.lot.findFirst({
      where: {
        project_id: project.id,
        number: data.number,
        stage: data.stage || null,
      },
    });
    if (existing) {
      return { error: `El lote ${data.number} ya existe en este proyecto${data.stage ? ` (etapa ${data.stage})` : ""}.` };
    }

    const lot = await prisma.lot.create({
      data: {
        project_id: project.id,
        number: data.number,
        stage: data.stage || null,
        area_m2: data.area_m2 || null,
        price_total_clp: data.price_total_clp,
        reservation_amount_clp: data.reservation_amount_clp || 0,
        pie: data.pie || 0,
        cuotas: data.cuotas || null,
        valor_cuota: data.valor_cuota || null,
        last_installment_amount: data.last_installment_amount || null,
        status: "available",
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "CREATE",
        entity: "Lot",
        entity_id: lot.id.toString(),
        details: `Lote ${data.number} creado en proyecto ${project.name}`,
        user_id: user.id,
        user_email: user.email,
      },
    });

    memoryCache.deleteByPrefix("postventa_");
    revalidatePath("/admin/lots");

    return { success: true, lot };
  } catch (error) {
    console.error("Error creating lot:", error);
    return { error: "Error al crear el lote" };
  }
}

/**
 * Updates a lot's status and basic financial data (admin only).
 */
export async function updateLot(
  lotId: number,
  data: {
    status?: string;
    price_total_clp?: number;
    reservation_amount_clp?: number;
    pie?: number;
    cuotas?: number;
    valor_cuota?: number;
    last_installment_amount?: number;
    area_m2?: number;
    stage?: string;
  }
) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const lot = await prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot) return { error: "Lote no encontrado" };

    await prisma.lot.update({
      where: { id: lotId },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.price_total_clp !== undefined && { price_total_clp: data.price_total_clp }),
        ...(data.reservation_amount_clp !== undefined && { reservation_amount_clp: data.reservation_amount_clp }),
        ...(data.pie !== undefined && { pie: data.pie }),
        ...(data.cuotas !== undefined && { cuotas: data.cuotas }),
        ...(data.valor_cuota !== undefined && { valor_cuota: data.valor_cuota }),
        ...(data.last_installment_amount !== undefined && { last_installment_amount: data.last_installment_amount }),
        ...(data.area_m2 !== undefined && { area_m2: data.area_m2 }),
        ...(data.stage !== undefined && { stage: data.stage || null }),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Lot",
        entity_id: lotId.toString(),
        details: `Lote ${lot.number} actualizado: ${JSON.stringify(data)}`,
        user_id: user.id,
        user_email: user.email,
      },
    });

    memoryCache.deleteByPrefix("postventa_");
    revalidatePath("/admin/lots");

    return { success: true };
  } catch (error) {
    console.error("Error updating lot:", error);
    return { error: "Error al actualizar el lote" };
  }
}

/**
 * Assigns an owner to a lot — creates a User (or reuses existing) and a Reservation.
 */
export async function assignLotOwner(data: {
  lotId: number;
  projectSlug: string;
  // Client personal info
  name: string;
  lastName?: string;
  email: string;
  phone: string;
  rut?: string;
  // Address
  address_street?: string;
  address_number?: string;
  address_commune?: string;
  address_region?: string;
  // Personal details
  marital_status?: string;
  profession?: string;
  nationality?: string;
  // Financial
  pie: number;
  pie_status?: string;
  reservation_price?: number;
  cuotas?: number;
  valor_cuota?: number;
  last_installment_value?: number;
  installments_paid?: number;
  installment_start_date?: string;
  daily_penalty?: number;
  due_day?: number;
  grace_days?: number;
  advisor?: string;
  observation?: string;
}) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const project = await prisma.project.findUnique({
      where: { slug: data.projectSlug },
    });
    if (!project) return { error: "Proyecto no encontrado" };

    const lot = await prisma.lot.findUnique({ where: { id: data.lotId } });
    if (!lot) return { error: "Lote no encontrado" };

    // Check if lot already has an active reservation
    const existingReservation = await prisma.reservation.findFirst({
      where: { lot_id: lot.id, project_id: project.id, status: "active" },
    });
    if (existingReservation) {
      return { error: "Este lote ya tiene un cliente asignado activo." };
    }

    // Find or create User
    let user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      const hashedPassword = await hash("alimin123", 10);
      user = await prisma.user.create({
        data: {
          email: data.email,
          name: `${data.name}${data.lastName ? ` ${data.lastName}` : ""}`.trim(),
          password: hashedPassword,
          role: "USER",
        },
      });
    }

    // Parse installment start date
    let installmentStartDate: Date | null = null;
    if (data.installment_start_date) {
      installmentStartDate = new Date(data.installment_start_date + "T12:00:00Z");
    }

    // Create reservation
    const reservation = await prisma.reservation.create({
      data: {
        project_id: project.id,
        lot_id: lot.id,
        user_id: user.id,
        name: data.name,
        last_name: data.lastName || null,
        email: data.email,
        phone: data.phone,
        rut: data.rut || null,
        status: "active",
        pie: data.pie,
        pie_status: data.pie_status || "APPROVED",
        reservation_price: data.reservation_price || 0,
        installments_paid: data.installments_paid || 0,
        installment_start_date: installmentStartDate,
        debt_start_date: installmentStartDate,
        daily_penalty: data.daily_penalty ?? project.daily_penalty_amount ?? 10000,
        due_day: data.due_day ?? project.due_day_of_month ?? 5,
        grace_days: data.grace_days ?? project.grace_period_days ?? 5,
        last_installment_value: data.last_installment_value || null,
        advisor: data.advisor || null,
        observation: data.observation || null,
        address_street: data.address_street || null,
        address_number: data.address_number || null,
        address_commune: data.address_commune || null,
        address_region: data.address_region || null,
        marital_status: data.marital_status || null,
        profession: data.profession || null,
        nationality: data.nationality || "Chilena",
      },
    });

    // Update lot status to sold and sync financial data
    await prisma.lot.update({
      where: { id: lot.id },
      data: {
        status: "sold",
        ...(data.cuotas !== undefined && { cuotas: data.cuotas }),
        ...(data.valor_cuota !== undefined && { valor_cuota: data.valor_cuota }),
        ...(data.last_installment_value !== undefined && { last_installment_amount: data.last_installment_value }),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "CREATE",
        entity: "Reservation",
        entity_id: reservation.id,
        details: `Dueño asignado a Lote ${lot.number}: ${data.name} ${data.lastName || ""} (${data.email})`,
        user_id: adminUser.id,
        user_email: adminUser.email,
      },
    });

    // Create PIE entry in financial ledger if pie is paid
    if (data.pie > 0 && (data.pie_status === "PAID" || data.pie_status === "APPROVED")) {
      await prisma.financialLedger.create({
        data: {
          reservation_id: reservation.id,
          amount_clp: data.pie,
          category: "PIE",
          description: "Pie registrado al asignar dueño",
        },
      });
    }

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/lots");
    revalidatePath("/admin/clients");

    return { success: true, reservation };
  } catch (error) {
    console.error("Error assigning lot owner:", error);
    return { error: "Error al asignar dueño al lote" };
  }
}
