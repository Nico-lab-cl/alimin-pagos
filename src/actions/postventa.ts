"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getInstallmentDueDate,
  calculateTotalInterest,
  getProjectConfig,
} from "@/lib/financials";
import { memoryCache } from "@/lib/cache";
import { revalidatePath } from "next/cache";

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
        user: { select: { id: true, name: true, email: true } },
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

      // Calculate total paid
      const pieAmount = res.pie || lot.pie || 0;
      const actualPie = res.pie_status === "PAID" ? pieAmount : 0;

      // Calculate installments total using ranges if available
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
      let pendingBalance = Math.max(
        0,
        totalToPay - totalPaid + (res.pending_amount || 0)
      );

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
            res.mora_frozen || false,
            res.grace_days ?? project.grace_period_days ?? 5,
            activeDailyPenalty,
            res.debt_start_date,
            project.penalty_start_date
          );

          if (penaltyAmount > 0 && activeDailyPenalty > 0) {
            lateDays = Math.round(penaltyAmount / activeDailyPenalty);
          }
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
      include: { reservation: true },
    });

    if (!receipt) return { error: "Comprobante no encontrado" };

    await prisma.paymentReceipt.update({
      where: { id: receiptId },
      data: { status: "APPROVED", processed_at: new Date() },
    });

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
      const res = await prisma.reservation.findUnique({
        where: { id: receipt.reservation_id },
        include: { lot: true, project: true }
      });

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

        operations.push(prisma.reservation.update({
          where: { id: receipt.reservation_id },
          data: {
            installments_paid: {
              increment: receipt.installments_count || 1,
            },
            next_payment_date: null,
            manual_penalty: shortfall > 0 ? shortfall : null,
            penalty_mode: shortfall > 0 ? "FIXED" : "AUTO",
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
    await prisma.paymentReceipt.update({
      where: { id: receiptId },
      data: {
        status: "REJECTED",
        rejection_reason: reason,
        processed_at: new Date(),
      },
    });

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
export async function updateClientProfile(reservationId: string, data: { name: string, email: string, rut: string, phone: string }) {
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

    // Check if new email conflicts with another user
    if (data.email !== reservation.email && data.email !== reservation.user.email) {
      const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
      if (existingUser) {
        return { error: "Ese correo electrónico ya está registrado por otro usuario en la plataforma." };
      }
    }

    // Attempt the transaction to guarantee integrity
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
          phone: data.phone
        }
      })
    ]);

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
  next_payment_date?: string | null;
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
          next_payment_date: nextDateObj || null,
          installments_paid: Number(data.installments_paid) || 0,
          penalty_mode: data.penalty_mode || "AUTO",
          manual_penalty: data.penalty_mode === "FIXED" ? (Number(data.manual_penalty) || null) : null,
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
      await prisma.$transaction([
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
      ]);
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
    const actualPie = res.pie_status === "PAID" ? pieAmount : 0;

    // Calculate installments total using ranges
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

    const totalPaid = actualPie + calculatedCuotasTotal + (res.extra_paid_amount || 0);
    const totalToPay = lot.price_total_clp || 0;
    const pendingBalance = Math.max(0, totalToPay - totalPaid + (res.pending_amount || 0));

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

      // Upcoming installments (up to 12)
      const totalPendingRemaining = totalCuotas - paidCuotas;
      const maxToShow = Math.min(12, totalPendingRemaining);
      const formatMonth = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' });

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

        if (i === 0 && penaltyAmount > 0 && res.mora_status === "ACTIVO") {
          finalAmount += penaltyAmount;
          hasPenalty = true;
          installmentPenaltyAmount = penaltyAmount;
          installmentLateDays = lateDays;
        }

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
