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
        status: "active",
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
      const pendingBalance = Math.max(
        0,
        totalToPay - totalPaid + (res.pending_amount || 0)
      );

      // Due date & penalty
      let nextDueDate: Date | null = null;
      let lateDays = 0;
      let penaltyAmount = 0;

      if (paidCuotas < totalCuotas && res.installment_start_date) {
        if (res.next_payment_date) {
          nextDueDate = new Date(res.next_payment_date);
        } else {
          nextDueDate = getInstallmentDueDate(
            res.installment_start_date,
            paidCuotas + 1,
            res.due_day ?? project.due_day_of_month ?? 5
          );
        }

        penaltyAmount = calculateTotalInterest(
          nextDueDate,
          currentDate,
          res.mora_frozen,
          res.grace_days ?? project.grace_period_days ?? 5,
          res.daily_penalty ?? project.daily_penalty_amount ?? 10000,
          res.debt_start_date,
          project.penalty_start_date
        );

        if (penaltyAmount > 0 && project.daily_penalty_amount > 0) {
          lateDays = Math.round(penaltyAmount / project.daily_penalty_amount);
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
      if (res.mora_frozen) {
        status = "FROZEN";
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
        pieStatus: res.pie_status,
        nextDueDate,
        lateDays,
        penaltyAmount,
        isGracePeriod,
        isUpcoming,
        isLate: penaltyAmount > 0,
        mora_frozen: res.mora_frozen, // explicitly naming it here for the UI
        status,
        address_street: res.address_street,
        address_number: res.address_number,
        address_commune: res.address_commune,
        address_region: res.address_region,
        marital_status: res.marital_status,
        profession: res.profession,
        nationality: res.nationality,
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
        lot,
        buyer: res.user,
      };
    });

    const stats = {
      total: processedData.length,
      late: processedData.filter((d) => d.isLate && !d.mora_frozen).length,
      grace: processedData.filter((d) => d.isGracePeriod && !d.mora_frozen).length,
      upcoming: processedData.filter((d) => d.isUpcoming && !d.mora_frozen).length,
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

    // Update reservation state
    if (receipt.scope === "PIE") {
      await prisma.reservation.update({
        where: { id: receipt.reservation_id },
        data: { pie_status: "PAID" },
      });
    } else if (receipt.scope === "INSTALLMENT") {
      await prisma.reservation.update({
        where: { id: receipt.reservation_id },
        data: {
          installments_paid: {
            increment: receipt.installments_count || 1,
          },
          next_payment_date: null,
        },
      });
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
      orderBy: { number: "asc" },
    });

    return { success: true, lots };
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
        startDateObj = new Date(data.installment_start_date);
        // compute next date based on installments_paid
        const projectConfig = await getProjectConfig(reservation.project_id);
        const dueDay = Number(data.due_day) || (projectConfig?.due_day_of_month ?? 5);
        // The NEXT payment is (installments_paid + 1)
        nextDateObj = getInstallmentDueDate(startDateObj, (Number(data.installments_paid) ?? 0) + 1, dueDay);
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
          mora_frozen: Boolean(data.mora_frozen),
          debt_start_date: (data.debt_start_date && data.debt_start_date.trim() !== "") 
            ? new Date(data.debt_start_date + "T12:00:00") 
            : null,
          next_payment_date: (data.next_payment_date && data.next_payment_date.trim() !== "") 
            ? new Date(data.next_payment_date + "T12:00:00") 
            : (nextDateObj || null),
          installments_paid: Number(data.installments_paid) || 0,
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
