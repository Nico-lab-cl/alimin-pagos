"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getInstallmentDueDate,
  calculateTotalInterest,
  calculateLomasInterest,
  calculateAggregatedAutoPenalty,
  calculateGrowingFixedPenalty,
  getProjectConfig,
  getChileToday,
} from "@/lib/financials";
import { memoryCache } from "@/lib/cache";
import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import crypto from "crypto";
import { ENTITY_GROUPS, getEntityLabel, getEntityGroupKey } from "@/lib/auditLabels";

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
  if (!session?.user || (user?.role !== "ADMIN" && user?.role !== "LEGAL")) {
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
        user: { select: { id: true, name: true, email: true, portal_active: true, temp_password: true, activated_at: true, password_changed_at: true, last_login_at: true } },
        receipts: {
          where: { status: "APPROVED" },
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            amount_clp: true,
            scope: true,
            created_at: true,
            nominal_installment_number: true,
          },
        },
      },
    });

    const currentDate = getChileToday();
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

      const extraPaid = res.extra_paid_amount || 0;
      const totalToPay = lot.price_total_clp || 0;

      let totalPaid: number;
      let pendingBalance: number;

      if (projectSlug === "lomas-del-mar") {
        // Replica EXACTA de la formula de Total Invertido / Saldo Pendiente que usa
        // aliminlomasdelmar.com, para que los saldos coincidan al peso:
        //   1) Suma el pago de RESERVA inicial (lot.reservation_amount_clp).
        //   2) Cuenta el PIE solo si esta efectivamente pagado (monto pactado o recibos),
        //      no lo asume pagado como hace el resto de los proyectos.
        // Es solo el calculo del monto mostrado; no toca ningun dato del cliente.
        const manualPie = res.pie || 0;
        const targetGrossPie = manualPie || lot.pie || 0;
        let actualPieComponent = 0;
        if (manualPie > 0) actualPieComponent = manualPie;
        else if (piePaidFromReceipts > 0) actualPieComponent = piePaidFromReceipts;
        else if ((res.pie_status || "").toUpperCase() === "PAID") actualPieComponent = targetGrossPie;

        const reservationAmountPaid = lot.reservation_amount_clp ?? 500000;

        totalPaid = totalCuotas === 0
          ? totalToPay + extraPaid
          : reservationAmountPaid + actualPieComponent + calculatedCuotasTotal + extraPaid;
        pendingBalance = Math.max(0, totalToPay - totalPaid + (res.pending_amount || 0));
      } else {
        // Resto de proyectos (Arena y Sol, Libertad y Alegria): sin cambios.
        // Total Invertido = Cuotas + Pie (siempre) + Extra.
        totalPaid = calculatedCuotasTotal + pieAmount + extraPaid;
        pendingBalance = totalToPay - totalPaid;
      }

      // Due date & penalty
      let nextDueDate: Date | null = null;
      let lateDays = 0;
      let penaltyAmount = 0;
      let overdueInstallments: { number: number; dueDate: string; interestStartDate: string; monthName: string; lateDays: number; penaltyAmount: number; moraCredit: number }[] = [];
      const activeDailyPenalty = res.daily_penalty ?? project.daily_penalty_amount ?? 10000;
      // Lomas del Mar usa la formula de mora identica a aliminlomasdelmar.com
      // (ver calculateLomasInterest): sin "+1 dia", ancla -1 con fecha de deuda,
      // y la fecha de deuda aplica a TODAS las cuotas. Solo para este proyecto.
      const isLomasProject = projectSlug === "lomas-del-mar";

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

        // Determine penalty: FIXED/MIXED (manual + auto) or AUTO (date-based)
        if (res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED") {
          // Both FIXED and MIXED: fixed penalty + auto penalty for currently-late installments
          // Pass null for debt_start_date so auto calc uses normal grace period,
          // because the fixed amount already covers historical debt.
          const { totalPenaltyAmount: autoPenalty, totalLateDays: autoLateDays } = calculateAggregatedAutoPenalty(
            totalCuotas - paidCuotas,
            paidCuotas,
            res.installment_start_date,
            res.due_day ?? project.due_day_of_month ?? 5,
            currentDate,
            res.mora_frozen || false,
            res.grace_days ?? project.grace_period_days ?? 5,
            activeDailyPenalty,
            null, // Don't use debt_start_date — fixed penalty covers historical debt
            project.penalty_start_date,
            res.debt_end_date,
            res.next_payment_date
          );
          // La multa fija/pactada crece día a día desde debt_start_date (re-fijado
          // cada vez que un pago la toca), en vez de quedar congelada para siempre.
          const { amount: fixedPenalty, growthDays: fixedGrowthDays } = calculateGrowingFixedPenalty(
            res.manual_penalty,
            res.debt_start_date,
            activeDailyPenalty,
            currentDate
          );
          penaltyAmount = autoPenalty + fixedPenalty;
          lateDays = autoLateDays + fixedGrowthDays;
        } else if (isLomasProject) {
          // Lomas del Mar: replica exacta de la mora de aliminlomasdelmar.com.
          // La fecha de deuda (debt_start_date) aplica a TODAS las cuotas.
          const graceDays = res.grace_days ?? project.grace_period_days ?? 5;
          const dueDay = res.due_day ?? project.due_day_of_month ?? 5;
          let lomasPenalty = 0;
          let lomasLateDays = 0;
          for (let i = 0; i < totalCuotas - paidCuotas; i++) {
            const instNum = paidCuotas + 1 + i;
            const iDue = getInstallmentDueDate(res.installment_start_date, instNum, dueDay);
            const interest = calculateLomasInterest(
              iDue,
              currentDate,
              res.mora_frozen || false,
              graceDays,
              activeDailyPenalty,
              res.debt_start_date,
              project.penalty_start_date,
              res.debt_end_date
            );
            if (interest > 0) {
              lomasPenalty += interest;
              lomasLateDays += Math.round(interest / activeDailyPenalty);
            } else if (iDue >= currentDate) {
              break; // cuota futura sin mora: dejamos de escanear
            }
          }
          penaltyAmount = lomasPenalty;
          lateDays = lomasLateDays;
        } else {
          // AUTO: pure automatic penalty based on dates
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

        // Abonos/condonaciones de mora (scope=MORA) reducen el interes efectivo adeudado.
        const moraCredits = (res.receipts || [])
          .filter((r: any) => r.scope === "MORA")
          .reduce((sum: number, r: any) => sum + (r.amount_clp || 0), 0);
        penaltyAmount = Math.max(0, penaltyAmount - moraCredits);

        // Build per-installment overdue breakdown for admin display
        const formatMonthAdmin = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'America/Santiago' });
        const totalPendingRemaining = totalCuotas - paidCuotas;
        for (let i = 0; i < totalPendingRemaining; i++) {
          const installmentNumber = paidCuotas + 1 + i;
          let currentDue: Date;
          if (i === 0 && res.next_payment_date) {
            currentDue = new Date(res.next_payment_date);
          } else {
            currentDue = getInstallmentDueDate(
              res.installment_start_date,
              installmentNumber,
              res.due_day ?? project.due_day_of_month ?? 5
            );
          }

          // Only auto penalty per installment
          let autoPenaltyForThis = 0;
          if (res.mora_status !== "CONGELADO" && !res.mora_frozen) {
            if (isLomasProject) {
              // Lomas del Mar: misma formula que aliminlomasdelmar.com.
              // La fecha de deuda aplica a TODAS las cuotas.
              autoPenaltyForThis = calculateLomasInterest(
                currentDue,
                currentDate,
                false,
                res.grace_days ?? project.grace_period_days ?? 5,
                activeDailyPenalty,
                res.debt_start_date,
                project.penalty_start_date,
                res.debt_end_date
              );
            } else {
              autoPenaltyForThis = calculateTotalInterest(
                currentDue,
                currentDate,
                false,
                res.grace_days ?? project.grace_period_days ?? 5,
                activeDailyPenalty,
                (res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED") ? null : (i === 0 ? res.debt_start_date : null),
                project.penalty_start_date,
                res.debt_end_date
              );
            }
          }

          if (autoPenaltyForThis > 0) {
            const days = Math.round(autoPenaltyForThis / activeDailyPenalty);
            const monthRaw = formatMonthAdmin.format(currentDue);
            const graceDays = res.grace_days ?? project.grace_period_days ?? 5;
            const interestStart = new Date(currentDue);
            interestStart.setDate(interestStart.getDate() + graceDays + 1);
            // Abonos/condonaciones de mora registrados especificamente para esta cuota
            const instMoraCredits = (res.receipts || [])
              .filter((r: any) => r.scope === "MORA" && r.nominal_installment_number === installmentNumber)
              .reduce((sum: number, r: any) => sum + (r.amount_clp || 0), 0);
            overdueInstallments.push({
              number: installmentNumber,
              dueDate: currentDue.toISOString(),
              interestStartDate: interestStart.toISOString(),
              monthName: monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1),
              lateDays: days,
              penaltyAmount: Math.max(0, autoPenaltyForThis - instMoraCredits),
              moraCredit: instMoraCredits,
            });
          } else {
            // Stop once we hit installments that are not overdue
            break;
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
      
      // Override logic for COMPLETED and CONGELADO
      if (res.status === "COMPLETED") {
        status = "COMPLETED";
        penaltyAmount = 0;
        pendingBalance = 0; // Ensure balance is 0 for paid in full
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
        clientName: (res.last_name && res.last_name !== "null")
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
        overdueInstallments,
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
        activated_at: res.user?.activated_at || null,
        password_changed_at: res.user?.password_changed_at || null,
        last_login_at: res.user?.last_login_at || null,
      };
    });

    const stats = {
      total: processedData.length,
      late: processedData.filter((d) => d.status === "LATE").length,
      grace: processedData.filter((d) => d.status === "GRACE").length,
      upcoming: processedData.filter((d) => d.status === "UPCOMING").length,
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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
      await tx.reservation.update({
        where: { id: reservationId },
        data,
      });
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
/**
 * Calcula la mora REAL total que un cliente debe hoy (automática + fija),
 * usando exactamente la misma fórmula que ya se le muestra en pantalla al
 * cliente y a postventa (getFullPostventaData / getUserLots). Antes, el
 * cálculo de pagos solo miraba `manual_penalty` (la mora fija guardada) e
 * ignoraba la mora automática acumulada de clientes en modo AUTO — por eso
 * un cliente que pagaba justo su cuota, sin cubrir esa mora, se la veía
 * borrada silenciosamente. Esta función centraliza el cálculo correcto
 * para que approveReceipt, registerManualPayment y las nuevas funciones de
 * abono de intereses usen siempre el mismo número real.
 */
function calculateCurrentMoraOwed(
  res: {
    installments_paid: number | null;
    lot: { cuotas: number | null };
    installment_start_date: Date | null;
    due_day: number | null;
    mora_frozen: boolean | null;
    grace_days: number | null;
    daily_penalty: number | null;
    penalty_mode: string | null;
    manual_penalty: number | null;
    debt_start_date: Date | null;
    debt_end_date: Date | null;
    next_payment_date: Date | null;
    receipts?: { scope: string; status: string | null; amount_clp: number }[] | null;
  },
  project: {
    due_day_of_month: number | null;
    grace_period_days: number | null;
    daily_penalty_amount: number | null;
    penalty_start_date: Date | null;
  },
  // Fecha de referencia para el calculo (por defecto, hoy). Al REGISTRAR un pago
  // que ocurrio en el pasado, hay que pasar la fecha real del pago para no
  // comparar el monto pagado contra la mora de HOY (que sigue creciendo dia a
  // dia) en vez de la mora vigente el dia que efectivamente se pago.
  asOfDate: Date = getChileToday()
): number {
  const paidCuotas = res.installments_paid || 0;
  const totalCuotas = res.lot.cuotas || 0;
  const fixedMode = res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED";
  const currentDate = asOfDate;
  const activeDailyPenalty = res.daily_penalty ?? project.daily_penalty_amount ?? 10000;
  const { amount: fixedPenalty } = fixedMode
    ? calculateGrowingFixedPenalty(res.manual_penalty, res.debt_start_date, activeDailyPenalty, currentDate)
    : { amount: 0 };

  // Abonos/condonaciones de mora (scope=MORA) reducen el interes efectivo adeudado.
  const moraCredits = (res.receipts || [])
    .filter((r) => r.scope === "MORA" && r.status === "APPROVED")
    .reduce((sum, r) => sum + (r.amount_clp || 0), 0);

  if (paidCuotas >= totalCuotas || !res.installment_start_date) {
    return Math.max(0, fixedPenalty - moraCredits);
  }

  const { totalPenaltyAmount: autoPenalty } = calculateAggregatedAutoPenalty(
    totalCuotas - paidCuotas,
    paidCuotas,
    res.installment_start_date,
    res.due_day ?? project.due_day_of_month ?? 5,
    currentDate,
    res.mora_frozen || false,
    res.grace_days ?? project.grace_period_days ?? 5,
    activeDailyPenalty,
    fixedMode ? null : res.debt_start_date,
    project.penalty_start_date,
    res.debt_end_date,
    res.next_payment_date
  );

  return Math.max(0, autoPenalty + fixedPenalty - moraCredits);
}

/**
 * Mora vigente SOLO de la(s) cuota(s) que se estan pagando ahora mismo (no de
 * TODA la mora pendiente de la reserva). Se usa al registrar un pago manual
 * de cuota: si el cliente paga la cuota N + su propio interes, el "faltante"
 * no debe mezclarse con la mora de otras cuotas que sigan pendientes por su
 * cuenta (eso ya lo trackea el calculo automatico normal para esas cuotas).
 */
function calculateMoraForInstallmentsBeingPaid(
  res: {
    installments_paid: number | null;
    installment_start_date: Date | null;
    due_day: number | null;
    grace_days: number | null;
    daily_penalty: number | null;
    debt_start_date: Date | null;
    debt_end_date: Date | null;
    next_payment_date: Date | null;
  },
  project: {
    slug: string;
    due_day_of_month: number | null;
    grace_period_days: number | null;
    daily_penalty_amount: number | null;
    penalty_start_date: Date | null;
  },
  installmentsCount: number,
  asOfDate: Date
): number {
  if (!res.installment_start_date || installmentsCount <= 0) return 0;
  const isLomasProject = project.slug === "lomas-del-mar";
  const paidCuotas = res.installments_paid || 0;
  const graceDays = res.grace_days ?? project.grace_period_days ?? 5;
  const dueDay = res.due_day ?? project.due_day_of_month ?? 5;
  const activeDailyPenalty = res.daily_penalty ?? project.daily_penalty_amount ?? 10000;

  let total = 0;
  for (let i = 0; i < installmentsCount; i++) {
    const installmentNumber = paidCuotas + 1 + i;
    const currentDue =
      i === 0 && res.next_payment_date
        ? new Date(res.next_payment_date)
        : getInstallmentDueDate(res.installment_start_date, installmentNumber, dueDay);

    total += isLomasProject
      ? calculateLomasInterest(
          currentDue,
          asOfDate,
          false,
          graceDays,
          activeDailyPenalty,
          res.debt_start_date,
          project.penalty_start_date,
          res.debt_end_date
        )
      : calculateTotalInterest(
          currentDue,
          asOfDate,
          false,
          graceDays,
          activeDailyPenalty,
          i === 0 ? res.debt_start_date : null,
          project.penalty_start_date,
          res.debt_end_date
        );
  }
  return total;
}

/**
 * Arma un texto legible con el desglose de qué cuota(s) está generando
 * el interés automático vigente y cuántos días de mora lleva cada una.
 * Se usa para dejar registrado en la bitácora, al momento de cristalizar
 * un saldo de mora en manual_penalty, DE DÓNDE viene ese monto — porque
 * una vez guardado como monto fijo, esa trazabilidad se pierde.
 */
function getMoraBreakdownText(
  res: {
    installments_paid: number | null;
    lot: { cuotas: number | null };
    installment_start_date: Date | null;
    due_day: number | null;
    mora_frozen: boolean | null;
    mora_status: string | null;
    grace_days: number | null;
    daily_penalty: number | null;
    penalty_mode: string | null;
    debt_start_date: Date | null;
    debt_end_date: Date | null;
    next_payment_date: Date | null;
  },
  project: {
    due_day_of_month: number | null;
    grace_period_days: number | null;
    daily_penalty_amount: number | null;
    penalty_start_date: Date | null;
  }
): string {
  const paidCuotas = res.installments_paid || 0;
  const totalCuotas = res.lot.cuotas || 0;
  if (paidCuotas >= totalCuotas || !res.installment_start_date) return "";
  if (res.mora_status === "CONGELADO" || res.mora_frozen) return "";

  const currentDate = getChileToday();
  const activeDailyPenalty = res.daily_penalty ?? project.daily_penalty_amount ?? 10000;
  const graceDays = res.grace_days ?? project.grace_period_days ?? 5;
  const fixedMode = res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED";
  const formatMonth = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "America/Santiago" });

  const lines: string[] = [];
  const totalPendingRemaining = totalCuotas - paidCuotas;
  for (let i = 0; i < totalPendingRemaining; i++) {
    const installmentNumber = paidCuotas + 1 + i;
    let currentDue: Date;
    if (i === 0 && res.next_payment_date) {
      currentDue = new Date(res.next_payment_date);
    } else {
      currentDue = getInstallmentDueDate(res.installment_start_date, installmentNumber, res.due_day ?? project.due_day_of_month ?? 5);
    }

    const penaltyForThis = calculateTotalInterest(
      currentDue,
      currentDate,
      false,
      graceDays,
      activeDailyPenalty,
      fixedMode ? null : (i === 0 ? res.debt_start_date : null),
      project.penalty_start_date,
      res.debt_end_date
    );

    if (penaltyForThis > 0) {
      const days = Math.round(penaltyForThis / activeDailyPenalty);
      const monthRaw = formatMonth.format(currentDue);
      const monthName = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1);
      lines.push(`Cuota #${installmentNumber} (${monthName}, venció ${currentDue.toLocaleDateString("es-CL")}): ${days} día${days === 1 ? "" : "s"} de mora = $${penaltyForThis.toLocaleString("es-CL")}`);
    }
  }

  if (lines.length === 0) return "";
  return `Desglose del interés automático vigente:\n${lines.join("\n")}`;
}

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
            lot: true,
            receipts: true
          }
        }
      },
    });

    if (!receipt) return { error: "Comprobante no encontrado" };

    // IMPORTANTE: el marcado del recibo como APROBADO se hace DENTRO de la misma
    // transacción que actualiza la reserva (incremento de cuotas / pie) + ledger.
    // Así es atómico: si el incremento falla (p.ej. por los triggers de protección
    // financiera), el recibo tampoco queda aprobado y no se desincroniza en silencio.

    // Update reservation state and Ledger
    if (receipt.scope === "PIE") {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
        await tx.paymentReceipt.update({
          where: { id: receiptId },
          data: { status: "APPROVED", processed_at: new Date() },
        });
        await tx.reservation.update({
          where: { id: receipt.reservation_id },
          data: { pie_status: "PAID" },
        });
        await tx.financialLedger.create({
          data: {
            reservation_id: receipt.reservation_id,
            amount_clp: receipt.amount_clp,
            category: "PIE",
            description: "Pago de Pie Aprobado"
          }
        });
      });
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
        // Mora REAL total que debe hoy (automática + fija), no solo manual_penalty.
        // Si el cliente paga justo la cuota sin cubrir esta mora, el faltante
        // (shortfall) la va a preservar como mora fija en vez de borrarla.
        const currentPenalty = calculateCurrentMoraOwed(res, res.project);
        // User requested: "primero a la cuota y luego al interes"
        const paid = receipt.amount_clp;
        const cuotaPaidAmount = Math.min(paid, totalExpectedPerCuota);
        const penaltyPaidAmount = Math.max(0, paid - totalExpectedPerCuota);

        const totalExpected = totalExpectedPerCuota + currentPenalty;
        const shortfall = totalExpected - paid;

        let nextPenaltyMode = "AUTO";
        if (shortfall > 0) {
          nextPenaltyMode = res.penalty_mode === "MIXED" ? "MIXED" : "FIXED";
        }
        // Capturar el desglose ANTES de la transacción, con el estado pre-pago,
        // porque una vez guardado el shortfall como manual_penalty se pierde de qué cuota venía.
        const moraBreakdownText = shortfall > 0 ? getMoraBreakdownText(res, res.project) : "";

        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
          await tx.paymentReceipt.update({
            where: { id: receiptId },
            data: { status: "APPROVED", processed_at: new Date() },
          });
          await tx.reservation.update({
            where: { id: receipt.reservation_id },
            data: {
              installments_paid: {
                increment: receipt.installments_count || 1,
              },
              next_payment_date: null,
              manual_penalty: shortfall > 0 ? shortfall : null,
              penalty_mode: nextPenaltyMode,
              // Re-fija la fecha desde la que la multa empieza a crecer día a día.
              debt_start_date: shortfall > 0 ? getChileToday() : null,
              debt_end_date: null,
            },
          });

          if (cuotaPaidAmount > 0) {
            await tx.financialLedger.create({
              data: {
                reservation_id: receipt.reservation_id,
                amount_clp: cuotaPaidAmount,
                category: "CUOTA",
                description: `Pago Cuota x${receipt.installments_count || 1} Aprobado`
              }
            });
          }

          if (penaltyPaidAmount > 0) {
            await tx.financialLedger.create({
              data: {
                reservation_id: receipt.reservation_id,
                amount_clp: penaltyPaidAmount,
                category: "PENALTY",
                description: `Pago Mora Aprobada`
              }
            });
          }
        });

        if (shortfall > 0) {
          const noteText = `Multa fija actualizada a $${shortfall.toLocaleString("es-CL")} (el pago cubrió la cuota pero no el interés acumulado).${moraBreakdownText ? "\n\n" + moraBreakdownText : ""}`;
          await logSystemNote(receipt.reservation_id, noteText, "Reservation");
        }
      } else {
        // Fallback if reservation not found
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
          await tx.paymentReceipt.update({
            where: { id: receiptId },
            data: { status: "APPROVED", processed_at: new Date() },
          });
          await tx.reservation.update({
            where: { id: receipt.reservation_id },
            data: {
              installments_paid: {
                increment: receipt.installments_count || 1,
              },
              next_payment_date: null,
              manual_penalty: null,
              penalty_mode: "AUTO",
              debt_start_date: null,
              debt_end_date: null,
            },
          });
          await tx.financialLedger.create({
            data: {
              reservation_id: receipt.reservation_id,
              amount_clp: receipt.amount_clp,
              category: "CUOTA",
              description: `Pago Cuota (Fallback) Aprobado`
            }
          });
        });
      }
    }

    // Notificación: se envía solo si la transacción anterior tuvo éxito (si hubiese
    // fallado, ya habríamos salido por el catch y el recibo seguiría PENDIENTE).
    if (receipt.reservation.user.fcm_token) {
      const { sendPushNotification } = await import("@/lib/notifications");
      sendPushNotification({
        token: receipt.reservation.user.fcm_token,
        title: "¡Pago Aprobado!",
        body: `Tu pago de ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(receipt.amount_clp)} ha sido procesado con éxito.`,
      });
    }

    // Auto-generate Digital Payment Receipt PDF
    try {
      const { generateReceiptPDF } = await import("@/lib/pdfGenerator");
      
      const clientName = (receipt.reservation.last_name && receipt.reservation.last_name !== "null")
        ? `${receipt.reservation.name} ${receipt.reservation.last_name}`.trim()
        : (receipt.reservation.user?.name || receipt.reservation.name || "Cliente Alimin");
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
 * Aprueba un comprobante subido por el cliente, pero en vez de repartirlo
 * cuota-primero-luego-mora, aplica el MONTO COMPLETO directo a la mora
 * (automática + fija), sin tocar installments_paid. Si el monto supera la
 * mora que el cliente debe, se topa en la mora total y se informa el
 * excedente para que postventa lo registre aparte como pago de cuota.
 * No modifica ningún otro dato de la reserva.
 */
export async function approveReceiptAsInterestPayment(receiptId: string) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  try {
    const receipt = await prisma.paymentReceipt.findUnique({
      where: { id: receiptId },
      include: { reservation: { include: { user: true, project: true, lot: true, receipts: true } } },
    });

    if (!receipt) return { error: "Comprobante no encontrado" };
    if (receipt.status !== "PENDING") return { error: "Este comprobante ya fue procesado" };
    if (receipt.scope !== "INSTALLMENT") return { error: "Solo se puede abonar a intereses un comprobante de cuota" };

    const res = receipt.reservation;
    const currentMora = calculateCurrentMoraOwed(res, res.project);

    if (currentMora <= 0) {
      return { error: "Este cliente no tiene mora pendiente por abonar" };
    }

    const paid = receipt.amount_clp;
    const appliedToMora = Math.min(paid, currentMora);
    const excess = Math.max(0, paid - currentMora);
    const remainingMora = currentMora - appliedToMora;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
      await tx.paymentReceipt.update({
        where: { id: receiptId },
        data: { status: "APPROVED", processed_at: new Date() },
      });
      await tx.reservation.update({
        where: { id: receipt.reservation_id },
        data: {
          manual_penalty: remainingMora > 0 ? remainingMora : null,
          penalty_mode: remainingMora > 0 ? "MIXED" : "AUTO",
          // Re-fija la fecha desde la que la mora restante sigue creciendo día a día.
          debt_start_date: remainingMora > 0 ? getChileToday() : null,
          debt_end_date: null,
        },
      });
      await tx.financialLedger.create({
        data: {
          reservation_id: receipt.reservation_id,
          amount_clp: appliedToMora,
          category: "PENALTY",
          description: "Abono de Intereses Aprobado (Bandeja de Pagos)",
        },
      });
    });

    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Reservation",
        entity_id: receipt.reservation_id,
        details: `Abono de intereses aprobado desde bandeja: $${appliedToMora.toLocaleString("es-CL")} aplicados a mora. Mora restante: $${remainingMora.toLocaleString("es-CL")}.${excess > 0 ? ` Excedente sin aplicar: $${excess.toLocaleString("es-CL")}.` : ""}`,
        user_id: adminUser.id,
        user_email: adminUser.email,
      },
    });

    if (receipt.reservation.user.fcm_token) {
      const { sendPushNotification } = await import("@/lib/notifications");
      sendPushNotification({
        token: receipt.reservation.user.fcm_token,
        title: "¡Abono a intereses aprobado!",
        body: `Tu pago de ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(appliedToMora)} fue aplicado a tu mora.`,
      });
    }

    // Comprobante digital PDF
    try {
      const { generateReceiptPDF } = await import("@/lib/pdfGenerator");
      const clientName = (receipt.reservation.last_name && receipt.reservation.last_name !== "null")
        ? `${receipt.reservation.name} ${receipt.reservation.last_name}`.trim()
        : (receipt.reservation.user?.name || receipt.reservation.name || "Cliente Alimin");
      const rut = receipt.reservation.rut || "No registrado";
      const email = receipt.reservation.user?.email || receipt.reservation.email || "No registrado";
      const projectName = receipt.reservation.project?.name || "Alimin SPA";
      const lotNumber = (receipt.reservation.lot as any)?.number || receipt.lot_id.toString();
      const stage = receipt.reservation.lot?.stage || "";

      const pdfBase64 = await generateReceiptPDF({
        clientName,
        rut,
        email,
        projectName,
        lotNumber,
        stage,
        concept: "Abono de Intereses",
        amount: appliedToMora,
        date: new Date(),
        receiptId: receipt.id.substring(0, 8).toUpperCase(),
      });

      await prisma.reservationDocument.create({
        data: {
          reservation_id: receipt.reservation_id,
          name: `Comprobante_Abono_Intereses_${receipt.id.substring(0, 6)}.pdf`,
          file_type: "application/pdf",
          base64_content: `data:application/pdf;base64,${pdfBase64}`,
        },
      });
    } catch (err) {
      console.error("Failed to generate PDF for interest payment:", err);
    }

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    memoryCache.deleteByPrefix("receipts_");
    revalidatePath("/admin");

    return { success: true, appliedToMora, remainingMora, excess };
  } catch (error) {
    console.error("Error approving receipt as interest payment:", error);
    return { error: "Error al aprobar el abono de intereses" };
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
            documents: {
              select: {
                id: true,
                name: true,
              },
            },
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
    let where: any = {};
    if (projectSlug && projectSlug !== "all") {
      const project = await prisma.project.findUnique({
        where: { slug: projectSlug },
      });
      if (!project) return { error: "Proyecto no encontrado", receipts: [] };
      where.reservation = { project_id: project.id };
    } else if (user.allowedProjects && Array.isArray(user.allowedProjects)) {
      where.reservation = {
        project: {
          slug: { in: user.allowedProjects }
        }
      };
    }

    const receipts = await prisma.paymentReceipt.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: {
        reservation: {
          select: {
            name: true,
            last_name: true,
            email: true,
            phone: true,
            rut: true,
            installment_start_date: true,
            due_day: true,
            documents: {
              select: {
                id: true,
                name: true,
              },
            },
            project: {
              select: {
                name: true,
                slug: true,
                due_day_of_month: true,
              }
            }
          },
        },
        lot: {
          select: { number: true, stage: true, cuotas: true },
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
  
  // Temporarily returning empty as requested until CRM routes are configured
  return { success: true, reservations: [], projectName: "Proyecto" };
}

/**
 * Gets financial history (ledger) for a specific reservation.
 */
export async function getFinancialHistory(reservationId: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || (user?.role !== "ADMIN" && user?.role !== "LEGAL")) {
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

export async function updateFinancialLedgerAmount(
  ledgerId: string,
  newAmount: number,
  reason: string,
  newInstallmentsCount?: number
) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  if (newAmount < 0) {
    return { error: "El monto no puede ser negativo" };
  }

  try {
    const entry = await prisma.financialLedger.findUnique({
      where: { id: ledgerId },
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

    if (!entry) {
      return { error: "Entrada del historial financiero no encontrada" };
    }

    const oldAmount = entry.amount_clp;

    let oldInstallmentsCount = 1;
    if (entry.category === "CUOTA") {
      const descMatch = entry.description?.match(/Cuota\s*x\s*(\d+)/i);
      if (descMatch) {
        oldInstallmentsCount = parseInt(descMatch[1], 10);
      }
    }

    const installmentsCountToUse = newInstallmentsCount !== undefined ? newInstallmentsCount : oldInstallmentsCount;
    const diff = installmentsCountToUse - oldInstallmentsCount;

    // Update Reservation installments_paid count if changed
    if (entry.category === "CUOTA" && diff !== 0) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
        await tx.reservation.update({
          where: { id: entry.reservation_id },
          data: {
            installments_paid: {
              increment: diff
            }
          }
        });
      });
    }

    // Generate updated description text
    let updatedDescription = `${entry.description || ""} (Monto modificado de $${oldAmount.toLocaleString("es-CL")} a $${newAmount.toLocaleString("es-CL")}. Motivo: ${reason})`;
    if (entry.category === "CUOTA") {
      const baseDesc = entry.description || "Pago Manual Cuota";
      const cleanedBaseDesc = baseDesc.replace(/Cuota\s*x\s*\d+/i, `Cuota x${installmentsCountToUse}`);
      updatedDescription = `${cleanedBaseDesc} (Monto modificado de $${oldAmount.toLocaleString("es-CL")} a $${newAmount.toLocaleString("es-CL")}. Motivo: ${reason})`;
    }

    // Update the ledger amount and description
    await prisma.financialLedger.update({
      where: { id: ledgerId },
      data: {
        amount_clp: newAmount,
        description: updatedDescription,
      },
    });

    // Try to find the corresponding PaymentReceipt and update it + its PDF document
    try {
      const ledgerCreatedAt = entry.created_at || entry.paid_at || new Date();
      // Search for receipts of the same reservation created within 2 minutes of the ledger entry's creation time
      const receipt = await prisma.paymentReceipt.findFirst({
        where: {
          reservation_id: entry.reservation_id,
          scope: entry.category === "PIE" ? "PIE" : "INSTALLMENT",
          created_at: {
            gte: new Date(ledgerCreatedAt.getTime() - 120000),
            lte: new Date(ledgerCreatedAt.getTime() + 120000),
          }
        }
      });

      if (receipt) {
        // Calculate nominal installment range if count changed
        const newRange = (receipt.scope === "INSTALLMENT" && installmentsCountToUse > 1 && receipt.nominal_installment_number)
          ? `${receipt.nominal_installment_number}-${receipt.nominal_installment_number + installmentsCountToUse - 1}`
          : null;

        // Update the PaymentReceipt record
        await prisma.paymentReceipt.update({
          where: { id: receipt.id },
          data: { 
            amount_clp: newAmount,
            installments_count: installmentsCountToUse,
            nominal_installment_range: newRange
          }
        });

        // Find the PDF document associated with this receipt
        const docName = `Comprobante_Pago_${receipt.id.substring(0, 6)}.pdf`;
        const document = await prisma.reservationDocument.findFirst({
          where: {
            reservation_id: entry.reservation_id,
            name: docName
          }
        });

        if (document) {
          const res = entry.reservation;
          const clientName = res.last_name && res.last_name !== "null"
            ? `${res.name} ${res.last_name}`.trim()
            : (res.user?.name || res.name || "Cliente Alimin");
          const rut = res.rut || "No registrado";
          const email = res.user?.email || res.email || "No registrado";
          const projectName = res.project?.name || "Alimin SPA";
          const lotNumber = res.lot?.number || res.lot_id.toString();
          const stage = res.lot?.stage || "";
          const concept = receipt.scope === "PIE" ? "Pago de Pie" : `Pago Cuota(s) x${installmentsCountToUse}`;

          const { generateReceiptPDF } = await import("@/lib/pdfGenerator");
          const pdfBase64 = await generateReceiptPDF({
            clientName,
            rut,
            email,
            projectName,
            lotNumber,
            stage,
            concept,
            amount: newAmount,
            date: receipt.created_at || entry.paid_at || new Date(),
            receiptId: receipt.id.substring(0, 8).toUpperCase(),
          });

          await prisma.reservationDocument.update({
            where: { id: document.id },
            data: {
              base64_content: `data:application/pdf;base64,${pdfBase64}`
            }
          });
          console.log(`Regenerated PDF receipt ${docName} with amount ${newAmount}`);
        }
      }
    } catch (receiptError) {
      console.error("Error updating corresponding PaymentReceipt or PDF document:", receiptError);
    }

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "FinancialLedger",
        entity_id: ledgerId,
        details: `Monto de registro financiero modificado de $${oldAmount.toLocaleString("es-CL")} a $${newAmount.toLocaleString("es-CL")}. Motivo: ${reason}. ID Reserva: ${entry.reservation_id}`,
        user_id: user.id,
        user_email: user.email,
      },
    });

    // Invalidate caches
    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Error updating financial ledger amount:", error);
    return { error: "Error al actualizar el monto del registro" };
  }
}

/**
 * Elimina una entrada del Historial de Pagos (FinancialLedger) y revierte
 * EXACTAMENTE su efecto según la categoría:
 * - CUOTA: resta la cantidad de cuotas que representaba a installments_paid
 *   (parseada de la descripción, igual que ya hace updateFinancialLedgerAmount).
 * - PIE: vuelve pie_status a PENDING.
 * - PENALTY (mora, incluye los abonos de intereses): devuelve el monto a
 *   manual_penalty (mora pactada), pasando a modo Mixto si estaba en Automático.
 *
 * No toca el comprobante (PaymentReceipt) ni el PDF asociado: no existe una
 * relación directa en la base de datos entre un registro de caja y su
 * comprobante, y adivinar por monto+fecha (como hacía deletePaymentReceipt)
 * arriesga borrar el comprobante equivocado. El comprobante queda como
 * historial, y el detalle de auditoría deja explícito que no se tocó.
 */
export async function deleteFinancialLedgerEntry(ledgerId: string, reason: string) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  if (!reason || !reason.trim()) {
    return { error: "Debes indicar el motivo de la eliminación" };
  }

  try {
    const entry = await prisma.financialLedger.findUnique({
      where: { id: ledgerId },
      include: { reservation: true },
    });

    if (!entry) return { error: "Registro no encontrado" };

    const res = entry.reservation;
    let reversalDetail = "";

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);

      if (entry.category === "CUOTA") {
        const descMatch = entry.description?.match(/Cuota\s*x\s*(\d+)/i);
        const count = descMatch ? parseInt(descMatch[1], 10) : 1;
        const newInstallmentsPaid = Math.max(0, (res.installments_paid || 0) - count);
        await tx.reservation.update({
          where: { id: entry.reservation_id },
          data: { installments_paid: newInstallmentsPaid },
        });
        reversalDetail = `Cuotas pagadas revertidas de ${res.installments_paid || 0} a ${newInstallmentsPaid}.`;
      } else if (entry.category === "PIE") {
        await tx.reservation.update({
          where: { id: entry.reservation_id },
          data: { pie_status: "PENDING" },
        });
        reversalDetail = "Pie vuelve a estado PENDIENTE.";
      } else if (entry.category === "PENALTY") {
        const newManualPenalty = (res.manual_penalty || 0) + entry.amount_clp;
        const newMode = res.penalty_mode === "AUTO" ? "MIXED" : (res.penalty_mode || "MIXED");
        await tx.reservation.update({
          where: { id: entry.reservation_id },
          // Re-fija la fecha desde la que la mora restaurada sigue creciendo día a día.
          data: { manual_penalty: newManualPenalty, penalty_mode: newMode, debt_start_date: getChileToday() },
        });
        reversalDetail = `Mora pactada devuelta de $${(res.manual_penalty || 0).toLocaleString("es-CL")} a $${newManualPenalty.toLocaleString("es-CL")}.`;
      }

      await tx.financialLedger.delete({ where: { id: ledgerId } });
    });

    await prisma.auditLog.create({
      data: {
        action: "DELETE",
        entity: "FinancialLedger",
        entity_id: ledgerId,
        details: `Registro de caja eliminado: ${entry.category} $${entry.amount_clp.toLocaleString("es-CL")} ("${entry.description || ""}"). ${reversalDetail} Motivo: ${reason}. El comprobante/PDF asociado (si existe) NO se modificó. ID Reserva: ${entry.reservation_id}`,
        user_id: adminUser.id,
        user_email: adminUser.email,
      },
    });

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Error deleting financial ledger entry:", error);
    return { error: "Error al eliminar el registro" };
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
export async function updateClientProfile(reservationId: string, data: { name: string, email: string, rut: string, phone: string, observation?: string, marital_status?: string, profession?: string, nationality?: string, address_street?: string, address_number?: string, address_region?: string, address_commune?: string }) {
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

    const sanitizedEmail = data.email.toLowerCase().trim();

    // Check if new email conflicts with another user (excluding the current one)
    if (sanitizedEmail !== reservation.user.email) {
      const existingUserWithNewEmail = await prisma.user.findUnique({ where: { email: sanitizedEmail } });
      if (existingUserWithNewEmail) {
        return { error: "Ese correo electrónico ya está registrado por otro usuario en la plataforma." };
      }
    }

    // Comparison for logging
    const changes: string[] = [];
    if (data.name !== undefined && data.name !== reservation.name) {
      changes.push(`Nombre: "${reservation.name}" -> "${data.name}"`);
    }
    if (data.email !== undefined && sanitizedEmail !== reservation.email) {
      changes.push(`Email: "${reservation.email}" -> "${sanitizedEmail}"`);
    }
    if (data.rut !== undefined && data.rut !== reservation.rut) {
      changes.push(`RUT: "${reservation.rut || 'No registrado'}" -> "${data.rut}"`);
    }
    if (data.phone !== undefined && data.phone !== reservation.phone) {
      changes.push(`Teléfono: "${reservation.phone || 'No registrado'}" -> "${data.phone}"`);
    }
    if (data.observation !== undefined && data.observation !== reservation.observation) {
      changes.push(`Observación: "${reservation.observation || 'No registrado'}" -> "${data.observation}"`);
    }
    if (data.address_street !== undefined && data.address_street !== reservation.address_street) {
      changes.push(`Calle: "${reservation.address_street || 'No registrada'}" -> "${data.address_street}"`);
    }
    if (data.address_number !== undefined && data.address_number !== reservation.address_number) {
      changes.push(`Número: "${reservation.address_number || 'No registrado'}" -> "${data.address_number}"`);
    }
    if (data.address_commune !== undefined && data.address_commune !== reservation.address_commune) {
      changes.push(`Comuna: "${reservation.address_commune || 'No registrada'}" -> "${data.address_commune}"`);
    }
    if (data.address_region !== undefined && data.address_region !== reservation.address_region) {
      changes.push(`Región: "${reservation.address_region || 'No registrada'}" -> "${data.address_region}"`);
    }
    if (data.marital_status !== undefined && data.marital_status !== reservation.marital_status) {
      changes.push(`Estado civil: "${reservation.marital_status || 'No registrado'}" -> "${data.marital_status}"`);
    }
    if (data.profession !== undefined && data.profession !== reservation.profession) {
      changes.push(`Profesión: "${reservation.profession || 'No registrada'}" -> "${data.profession}"`);
    }
    if (data.nationality !== undefined && data.nationality !== reservation.nationality) {
      changes.push(`Nacionalidad: "${reservation.nationality || 'No registrada'}" -> "${data.nationality}"`);
    }

    let updatedNotes = reservation.notes || "[]";
    if (changes.length > 0) {
      let parsedNotes = [];
      try {
        parsedNotes = JSON.parse(updatedNotes);
      } catch (e) {
        parsedNotes = [];
      }
      const logNote = {
        id: Math.random().toString(36).substring(7),
        text: `Perfil de cliente editado:\n- ${changes.join('\n- ')}`,
        type: "Registro",
        date: new Date().toISOString(),
        author: adminUser.name || adminUser.email || "Administrador"
      };
      parsedNotes.unshift(logNote);
      updatedNotes = JSON.stringify(parsedNotes);
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
      sanitizedEmail !== reservation.user.email || 
      data.name.toLowerCase() !== reservation.user.name.toLowerCase()
    );

    if (shouldDecouple) {
      console.log(`Decoupling reservation ${reservationId} from shared user ${reservation.user_id}`);
      
      // Create a NEW user for this reservation
      const newUser = await prisma.user.create({
        data: {
          email: sanitizedEmail,
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
          last_name: null,
          email: sanitizedEmail,
          rut: data.rut,
          phone: data.phone,
          observation: data.observation,
          marital_status: data.marital_status,
          profession: data.profession,
          nationality: data.nationality,
          address_street: data.address_street,
          address_number: data.address_number,
          address_region: data.address_region,
          address_commune: data.address_commune,
          notes: updatedNotes
        }
      });
    } else {
      // Regular update (either not shared, or same person with multiple lots)
      await prisma.$transaction([
        prisma.user.update({
          where: { id: reservation.user_id },
          data: {
            email: sanitizedEmail,
            name: data.name
          }
        }),
        prisma.reservation.update({
          where: { id: reservationId },
          data: {
            name: data.name,
            // El formulario edita el nombre como un solo campo "Nombre Completo".
            // Se limpia last_name para que no quede un apellido viejo que se
            // vuelva a pegar en la concatenacion (name + " " + last_name) la
            // proxima vez que se muestre el cliente.
            last_name: null,
            email: sanitizedEmail,
            rut: data.rut,
            phone: data.phone,
            observation: data.observation,
            marital_status: data.marital_status,
            profession: data.profession,
            nationality: data.nationality,
            address_street: data.address_street,
            address_number: data.address_number,
            address_region: data.address_region,
            address_commune: data.address_commune,
            notes: updatedNotes
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

    // Comparison for logging
    const changes: string[] = [];
    const formatCLP = (val: number | null | undefined) => {
      if (val === null || val === undefined) return "$0";
      return `$${Math.round(val).toLocaleString('de-DE')}`;
    };

    if (data.price_total_clp !== undefined && Number(data.price_total_clp) !== (reservation.lot.price_total_clp || 0)) {
      changes.push(`Valor Total Lote: ${formatCLP(reservation.lot.price_total_clp)} -> ${formatCLP(data.price_total_clp)}`);
    }
    if (data.cuotas !== undefined && Number(data.cuotas) !== (reservation.lot.cuotas || 0)) {
      changes.push(`Cantidad de Cuotas: ${reservation.lot.cuotas || 0} -> ${data.cuotas}`);
    }
    if (data.valor_cuota !== undefined && Number(data.valor_cuota) !== (reservation.lot.valor_cuota || 0)) {
      changes.push(`Valor de Cuota: ${formatCLP(reservation.lot.valor_cuota)} -> ${formatCLP(data.valor_cuota)}`);
    }
    if (data.pie !== undefined && Number(data.pie) !== (reservation.pie || reservation.lot.pie || 0)) {
      const oldPie = reservation.pie || reservation.lot.pie || 0;
      changes.push(`Pie: ${formatCLP(oldPie)} -> ${formatCLP(data.pie)}`);
    }
    if (data.reservation_price !== undefined && Number(data.reservation_price) !== (reservation.reservation_price || 0)) {
      changes.push(`Reserva: ${formatCLP(reservation.reservation_price)} -> ${formatCLP(data.reservation_price)}`);
    }
    if (data.last_installment_value !== undefined && Number(data.last_installment_value) !== (reservation.last_installment_value || 0)) {
      changes.push(`Valor Última Cuota: ${formatCLP(reservation.last_installment_value)} -> ${formatCLP(data.last_installment_value)}`);
    }
    if (data.daily_penalty !== undefined && Number(data.daily_penalty) !== (reservation.daily_penalty || 0)) {
      changes.push(`Interés (multa por día): ${formatCLP(reservation.daily_penalty)} -> ${formatCLP(data.daily_penalty)}`);
    }
    if (data.due_day !== undefined && Number(data.due_day) !== (reservation.due_day || 0)) {
      changes.push(`Día de Pago: ${reservation.due_day || 0} -> ${data.due_day}`);
    }
    if (data.grace_days !== undefined && Number(data.grace_days) !== (reservation.grace_days || 0)) {
      changes.push(`Días de Gracia: ${reservation.grace_days || 0} -> ${data.grace_days}`);
    }
    if (data.installments_paid !== undefined && Number(data.installments_paid) !== (reservation.installments_paid || 0)) {
      changes.push(`Cuotas Pagadas: ${reservation.installments_paid || 0} -> ${data.installments_paid}`);
    }
    if (data.mora_status !== undefined && data.mora_status !== reservation.mora_status) {
      changes.push(`Estado Mora: "${reservation.mora_status || 'No definido'}" -> "${data.mora_status}"`);
    }
    if (data.penalty_mode !== undefined && data.penalty_mode !== reservation.penalty_mode) {
      changes.push(`Modo Multa: "${reservation.penalty_mode || 'AUTO'}" -> "${data.penalty_mode}"`);
    }
    if (data.manual_penalty !== undefined && data.manual_penalty !== reservation.manual_penalty) {
      changes.push(`Multa Manual: ${formatCLP(reservation.manual_penalty)} -> ${formatCLP(data.manual_penalty)}`);
    }
    if (data.extra_paid_amount !== undefined && Number(data.extra_paid_amount) !== (reservation.extra_paid_amount || 0)) {
      changes.push(`Monto Extra Pagado: ${formatCLP(reservation.extra_paid_amount)} -> ${formatCLP(data.extra_paid_amount)}`);
    }

    if (data.installment_start_date) {
      const oldStartDate = reservation.installment_start_date 
        ? new Date(reservation.installment_start_date).toISOString().split('T')[0] 
        : 'No registrada';
      if (oldStartDate !== data.installment_start_date) {
        changes.push(`Próximo Vencimiento (Fecha seleccionada): "${oldStartDate}" -> "${data.installment_start_date}"`);
      }
    }

    let updatedNotes = reservation.notes || "[]";
    if (changes.length > 0) {
      let parsedNotes = [];
      try {
        parsedNotes = JSON.parse(updatedNotes);
      } catch (e) {
        parsedNotes = [];
      }
      const logNote = {
        id: Math.random().toString(36).substring(7),
        text: `Datos financieros editados:\n- ${changes.join('\n- ')}`,
        type: "Registro",
        date: new Date().toISOString(),
        author: adminUser.name || adminUser.email || "Administrador"
      };
      parsedNotes.unshift(logNote);
      updatedNotes = JSON.stringify(parsedNotes);
    }

    // Build update objects dynamically based on provided fields
    const lotUpdateData: any = {};
    if (data.price_total_clp !== undefined) lotUpdateData.price_total_clp = Number(data.price_total_clp);
    if (data.cuotas !== undefined) lotUpdateData.cuotas = Number(data.cuotas);
    if (data.valor_cuota !== undefined) lotUpdateData.valor_cuota = Number(data.valor_cuota);
    if (data.pie !== undefined) lotUpdateData.pie = Number(data.pie);

    const reservationUpdateData: any = {};
    if (changes.length > 0) {
      reservationUpdateData.notes = updatedNotes;
    }
    if (data.reservation_price !== undefined) reservationUpdateData.reservation_price = Number(data.reservation_price);
    if (data.pie !== undefined) reservationUpdateData.pie = Number(data.pie);
    if (data.last_installment_value !== undefined) reservationUpdateData.last_installment_value = Number(data.last_installment_value);
    if (data.daily_penalty !== undefined) reservationUpdateData.daily_penalty = Number(data.daily_penalty);
    if (data.due_day !== undefined) reservationUpdateData.due_day = Number(data.due_day);
    if (data.grace_days !== undefined) reservationUpdateData.grace_days = Number(data.grace_days);
    
    if (data.mora_status !== undefined) {
      reservationUpdateData.mora_status = data.mora_status;
      reservationUpdateData.mora_frozen = data.mora_status === "CONGELADO";
    } else if (data.mora_frozen !== undefined) {
      reservationUpdateData.mora_frozen = data.mora_frozen;
      reservationUpdateData.mora_status = data.mora_frozen ? "CONGELADO" : "ACTIVO";
    }

    if (data.debt_start_date !== undefined) {
      reservationUpdateData.debt_start_date = (data.debt_start_date && data.debt_start_date.trim() !== "") 
        ? new Date(data.debt_start_date + "T12:00:00") 
        : null;
    }
    if (data.debt_end_date !== undefined) {
      reservationUpdateData.debt_end_date = (data.debt_end_date && data.debt_end_date.trim() !== "") 
        ? new Date(data.debt_end_date + "T12:00:00") 
        : null;
    }

    if (data.installments_paid !== undefined) {
      reservationUpdateData.installments_paid = Number(data.installments_paid);
    }

    if (data.installment_start_date !== undefined) {
      if (data.installment_start_date) {
        const [y, m, d] = data.installment_start_date.split("-").map(Number);
        const targetDay = d || Number(data.due_day) || reservation.due_day || 5;
        const enteredDate = new Date(Date.UTC(y, m - 1, targetDay, 12, 0, 0, 0));
        
        const paidCount = data.installments_paid !== undefined ? Number(data.installments_paid) : (reservation.installments_paid || 0);
        const calculatedAnchor = new Date(enteredDate);
        calculatedAnchor.setUTCMonth(calculatedAnchor.getUTCMonth() - paidCount);
        
        reservationUpdateData.installment_start_date = calculatedAnchor;
        reservationUpdateData.next_payment_date = enteredDate;
      } else {
        reservationUpdateData.next_payment_date = null;
      }
    } else if (data.next_payment_date !== undefined) {
      reservationUpdateData.next_payment_date = data.next_payment_date ? new Date(data.next_payment_date + "T12:00:00") : null;
    }

    if (data.penalty_mode !== undefined) {
      reservationUpdateData.penalty_mode = data.penalty_mode;
    }
    
    if (data.manual_penalty !== undefined) {
      const activeMode = data.penalty_mode !== undefined ? data.penalty_mode : reservation.penalty_mode;
      reservationUpdateData.manual_penalty = (activeMode === "FIXED" || activeMode === "MIXED") ? (Number(data.manual_penalty) || null) : null;
    } else if (data.penalty_mode !== undefined) {
      if (data.penalty_mode === "AUTO") {
        reservationUpdateData.manual_penalty = null;
      }
    }

    if (data.extra_paid_amount !== undefined) reservationUpdateData.extra_paid_amount = Number(data.extra_paid_amount);
    if (data.installment_ranges !== undefined) reservationUpdateData.installment_ranges = data.installment_ranges;

    const hasLotUpdate = Object.keys(lotUpdateData).length > 0;
    const hasReservationUpdate = Object.keys(reservationUpdateData).length > 0;

    if (hasLotUpdate || hasReservationUpdate) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
        if (hasLotUpdate) {
          await tx.lot.update({
            where: { id: Number(lotId) || lotId },
            data: lotUpdateData
          });
        }
        if (hasReservationUpdate) {
          await tx.reservation.update({
            where: { id: reservationId },
            data: reservationUpdateData
          });
        }
      });
    }

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
    const before = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { is_multilote: true },
    });

    await prisma.reservation.update({
      where: { id: reservationId },
      data: { is_multilote: status }
    });

    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Reservation",
        entity_id: reservationId,
        details: `Estado Multi-Lote cambiado de "${before?.is_multilote ?? false}" a "${status}"`,
        user_id: adminUser.id,
        user_email: adminUser.email,
      },
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
    const before = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { status: true },
    });

    const newStatus = isAlContado ? "COMPLETED" : "active";

    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: newStatus }
    });

    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Reservation",
        entity_id: reservationId,
        details: `Estado Al Contado cambiado: status de "${before?.status || "active"}" a "${newStatus}" (afecta saldo pendiente y mora mostrados al cliente)`,
        user_id: adminUser.id,
        user_email: adminUser.email,
      },
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
      include: { lot: true, user: true, project: true, receipts: true },
    });

    if (!res) return { error: "Reserva no encontrada" };

    const paymentDate = new Date(data.paidAt + "T12:00:00");
    const receiptId = crypto.randomUUID();

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
              id: receiptId,
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
      // Mora de SOLO la(s) cuota(s) que se estan pagando ahora, A LA FECHA DEL
      // PAGO (no "hoy", no la mora de TODA la reserva). Si se usara la mora
      // agregada de toda la reserva, un pago que cubre exactamente la cuota +
      // su interes igual mostraria un "faltante" que en realidad es la mora de
      // OTRA cuota (que sigue pendiente por su cuenta, sin relacion con este pago).
      const currentPenalty = calculateMoraForInstallmentsBeingPaid(
        res,
        res.project,
        data.installmentsCount,
        paymentDate
      );

      const paid = data.amount;
      const cuotaPaidAmount = Math.min(paid, totalExpectedPerCuota);
      const penaltyPaidAmount = Math.max(0, paid - totalExpectedPerCuota);

      const totalExpected = totalExpectedPerCuota + currentPenalty;
      const shortfall = totalExpected - paid;
      // Capturar el desglose ANTES de la transacción, con el estado pre-pago,
      // porque una vez guardado el shortfall como manual_penalty se pierde de qué cuota venía.
      const moraBreakdownText = shortfall > 0 ? getMoraBreakdownText(res, res.project) : "";

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
        await tx.reservation.update({
          where: { id: reservationId },
          data: {
            installments_paid: {
              increment: data.installmentsCount,
            },
            next_payment_date: null,
            manual_penalty: shortfall > 0 ? shortfall : null,
            penalty_mode: shortfall > 0 ? (res.penalty_mode === "MIXED" ? "MIXED" : "FIXED") : "AUTO",
            // El faltante se calculo A LA FECHA DEL PAGO (paymentDate), asi que
            // debe empezar a crecer desde ese mismo dia, no desde hoy — sino el
            // saldo restante queda atrasado respecto a lo que realmente debe.
            debt_start_date: shortfall > 0 ? paymentDate : null,
            debt_end_date: null,
          },
        });

        if (cuotaPaidAmount > 0) {
          await tx.financialLedger.create({
            data: {
              reservation_id: reservationId,
              amount_clp: cuotaPaidAmount,
              category: "CUOTA",
              description: `Pago Manual Cuota x${data.installmentsCount}`,
              paid_at: paymentDate,
            },
          });
        }

        if (penaltyPaidAmount > 0) {
          await tx.financialLedger.create({
            data: {
              reservation_id: reservationId,
              amount_clp: penaltyPaidAmount,
              category: "PENALTY",
              description: `Pago Manual Mora`,
              paid_at: paymentDate,
            },
          });
        }

        if (data.receiptUrl) {
          await tx.paymentReceipt.create({
            data: {
              id: receiptId,
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
          });
        }
      });

      if (shortfall > 0) {
        const noteText = `Multa fija actualizada a $${shortfall.toLocaleString("es-CL")} (el pago cubrió la cuota pero no el interés acumulado).${moraBreakdownText ? "\n\n" + moraBreakdownText : ""}`;
        await logSystemNote(reservationId, noteText, "Reservation");
      }
    }

    // Auto-generate Digital Payment Receipt PDF for Manual Payment
    if (data.receiptUrl) {
      try {
        const { generateReceiptPDF } = await import("@/lib/pdfGenerator");
        
        const clientName = res.last_name 
          ? `${res.name} ${res.last_name}`.trim()
          : (res.user?.name || res.name || "Cliente Alimin");
        const rut = res.rut || "No registrado";
        const email = res.user?.email || res.email || "No registrado";
        const projectName = res.project?.name || "Alimin SPA";
        const lotNumber = (res.lot as any)?.number || res.lot_id.toString();
        const stage = res.lot?.stage || "";
        const concept = data.isPie ? "Pago de Pie" : `Pago Cuota(s) x${data.installmentsCount || 1}`;
        
        const pdfBase64 = await generateReceiptPDF({
          clientName,
          rut,
          email,
          projectName,
          lotNumber,
          stage,
          concept,
          amount: data.amount,
          date: paymentDate,
          receiptId: receiptId.substring(0, 8).toUpperCase(),
        });

        await prisma.reservationDocument.create({
          data: {
            reservation_id: reservationId,
            name: `Comprobante_Pago_${receiptId.substring(0, 6)}.pdf`,
            file_type: "application/pdf",
            base64_content: `data:application/pdf;base64,${pdfBase64}`,
            created_at: paymentDate,
          }
        });
      } catch (err) {
        console.error("Failed to generate and save PDF receipt for manual payment:", err);
      }
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
 * Registra un pago manual/offline (ej. depósito que le llegó a postventa
 * fuera del portal) y lo aplica ÍNTEGRO a la mora, sin tocar cuotas.
 * Si el monto supera la mora que el cliente debe, se topa en la mora total
 * y se informa el excedente para que postventa lo registre aparte como
 * pago de cuota. No modifica ningún otro dato de la reserva.
 */
export async function registerInterestPayment(
  reservationId: string,
  data: {
    amount: number;
    paidAt: string;
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
      include: { lot: true, user: true, project: true, receipts: true },
    });

    if (!res) return { error: "Reserva no encontrada" };

    const paymentDate = new Date(data.paidAt + "T12:00:00");
    // Mora vigente A LA FECHA DEL PAGO, no "hoy" (ver registerManualPayment).
    const currentMora = calculateCurrentMoraOwed(res, res.project, paymentDate);
    if (currentMora <= 0) {
      return { error: "Este cliente no tiene mora pendiente por abonar" };
    }

    const receiptId = crypto.randomUUID();

    const paid = data.amount;
    const appliedToMora = Math.min(paid, currentMora);
    const excess = Math.max(0, paid - currentMora);
    const remainingMora = currentMora - appliedToMora;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          manual_penalty: remainingMora > 0 ? remainingMora : null,
          penalty_mode: remainingMora > 0 ? "MIXED" : "AUTO",
          // Re-fija la fecha desde la que la mora restante sigue creciendo día a día.
          debt_start_date: remainingMora > 0 ? getChileToday() : null,
          debt_end_date: null,
        },
      });
      await tx.financialLedger.create({
        data: {
          reservation_id: reservationId,
          amount_clp: appliedToMora,
          category: "PENALTY",
          description: "Abono Manual de Intereses",
          paid_at: paymentDate,
        },
      });
      if (data.receiptUrl) {
        await tx.paymentReceipt.create({
          data: {
            id: receiptId,
            reservation_id: reservationId,
            lot_id: res.lot_id,
            amount_clp: appliedToMora,
            receipt_url: data.receiptUrl,
            scope: "INSTALLMENT",
            status: "APPROVED",
            processed_at: new Date(),
          },
        });
      }
    });

    await prisma.auditLog.create({
      data: {
        action: "CREATE",
        entity: "Reservation",
        entity_id: reservationId,
        details: `Abono manual de intereses registrado: $${appliedToMora.toLocaleString("es-CL")} aplicados a mora. Mora restante: $${remainingMora.toLocaleString("es-CL")}.${excess > 0 ? ` Excedente sin aplicar: $${excess.toLocaleString("es-CL")}.` : ""}`,
        user_id: adminUser.id,
        user_email: adminUser.email,
      },
    });

    if (data.receiptUrl) {
      try {
        const { generateReceiptPDF } = await import("@/lib/pdfGenerator");
        const clientName = res.last_name
          ? `${res.name} ${res.last_name}`.trim()
          : (res.user?.name || res.name || "Cliente Alimin");
        const rut = res.rut || "No registrado";
        const email = res.user?.email || res.email || "No registrado";
        const projectName = res.project?.name || "Alimin SPA";
        const lotNumber = (res.lot as any)?.number || res.lot_id.toString();
        const stage = res.lot?.stage || "";

        const pdfBase64 = await generateReceiptPDF({
          clientName,
          rut,
          email,
          projectName,
          lotNumber,
          stage,
          concept: "Abono de Intereses",
          amount: appliedToMora,
          date: paymentDate,
          receiptId: receiptId.substring(0, 8).toUpperCase(),
        });

        await prisma.reservationDocument.create({
          data: {
            reservation_id: reservationId,
            name: `Comprobante_Abono_Intereses_${receiptId.substring(0, 6)}.pdf`,
            file_type: "application/pdf",
            base64_content: `data:application/pdf;base64,${pdfBase64}`,
            created_at: paymentDate,
          },
        });
      } catch (err) {
        console.error("Failed to generate PDF for manual interest payment:", err);
      }
    }

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true, appliedToMora, remainingMora, excess };
  } catch (error) {
    console.error("Error registering interest payment:", error);
    return { error: "Error al registrar el abono de intereses" };
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
    const currentDate = getChileToday();

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

      // Penalty calculation: FIXED/MIXED (manual + auto) or AUTO (date-based)
      if (res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED") {
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
      } else if (project.slug === "lomas-del-mar") {
        // Lomas del Mar: mora con la formula exacta de aliminlomasdelmar.com
        // (debt_start_date aplica a TODAS las cuotas).
        const graceDays = res.grace_days ?? project.grace_period_days ?? 5;
        const dueDay = res.due_day ?? project.due_day_of_month ?? 5;
        let lomasPenalty = 0;
        let lomasLateDays = 0;
        for (let i = 0; i < totalCuotas - paidCuotas; i++) {
          const instNum = paidCuotas + 1 + i;
          const iDue = getInstallmentDueDate(res.installment_start_date, instNum, dueDay);
          const interest = calculateLomasInterest(
            iDue,
            currentDate,
            res.mora_status === "CONGELADO" || (res.mora_frozen || false),
            graceDays,
            activeDailyPenalty,
            res.debt_start_date,
            project.penalty_start_date,
            res.debt_end_date
          );
          if (interest > 0) {
            lomasPenalty += interest;
            lomasLateDays += Math.round(interest / activeDailyPenalty);
          } else if (iDue >= currentDate) {
            break;
          }
        }
        penaltyAmount = lomasPenalty;
        lateDays = lomasLateDays;
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

      // Abonos/condonaciones de mora (scope=MORA) reducen el interes efectivo adeudado.
      const moraCreditsTotal = (res.receipts || [])
        .filter((r: any) => r.scope === "MORA")
        .reduce((sum: number, r: any) => sum + (r.amount_clp || 0), 0);
      penaltyAmount = Math.max(0, penaltyAmount - moraCreditsTotal);

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

        // Calculate auto penalty for this specific installment (always, regardless of penalty_mode)
        let autoPenaltyForThis = 0;
        if (res.mora_status !== "CONGELADO" && !res.mora_frozen) {
          if (project.slug === "lomas-del-mar") {
            autoPenaltyForThis = calculateLomasInterest(
              currentDue,
              currentDate,
              res.mora_frozen || false,
              res.grace_days ?? project.grace_period_days ?? 5,
              activeDailyPenalty,
              res.debt_start_date,
              project.penalty_start_date,
              res.debt_end_date
            );
          } else {
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
        }

        // Abonos/condonaciones de mora registrados especificamente para esta cuota
        const instMoraCredits = (res.receipts || [])
          .filter((r: any) => r.scope === "MORA" && r.nominal_installment_number === installmentNumber)
          .reduce((sum: number, r: any) => sum + (r.amount_clp || 0), 0);
        installmentPenaltyAmount = Math.max(0, autoPenaltyForThis - instMoraCredits);

        if (autoPenaltyForThis > 0) {
          finalAmount += installmentPenaltyAmount;
          hasPenalty = installmentPenaltyAmount > 0;
          // Los dias de atraso reflejan el interes bruto (fechas reales), no el neto
          // despues de aplicar abonos -- de lo contrario un abono parcial hace parecer
          // que hay menos dias de atraso de los que realmente hay.
          installmentLateDays = Math.round(autoPenaltyForThis / activeDailyPenalty);
        }

        // Status flags
        let isGracePeriod = false;
        const graceDays = res.grace_days ?? project.grace_period_days ?? 5;
        const graceEnd = new Date(currentDue);
        graceEnd.setDate(currentDue.getDate() + graceDays);
        graceEnd.setHours(23, 59, 59, 999);

        let interestStartDate = new Date(currentDue);
        interestStartDate.setDate(currentDue.getDate() + graceDays + 1);

        const appliedDebtStartDate = (res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED") ? null : (i === 0 ? res.debt_start_date : null);
        if (appliedDebtStartDate) {
          const dStart = new Date(appliedDebtStartDate);
          if (dStart >= currentDue) {
            interestStartDate = dStart;
          }
        }

        if (project.penalty_start_date) {
          const cutoff = new Date(project.penalty_start_date);
          if (interestStartDate < cutoff) {
            interestStartDate = cutoff;
          }
        }

        if (currentDate >= currentDue && installmentPenaltyAmount === 0 && !res.mora_frozen && currentDate <= graceEnd) {
          isGracePeriod = true;
        }

        const isOverdue = currentDate >= currentDue;

        const monthNameRaw = formatMonth.format(currentDue);
        upcomingInstallments.push({
          number: installmentNumber,
          dueDate: currentDue.toISOString(),
          interestStartDate: interestStartDate.toISOString(),
          baseAmount: installmentBaseAmount,
          amount: finalAmount,
          monthName: monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1),
          hasPenalty,
          penaltyAmount: installmentPenaltyAmount,
          moraCredit: instMoraCredits,
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
          fileType: d.fileType || d.file_type || null,
          url: `/api/documents/${res.id}?name=${encodeURIComponent(d.name)}`,
        }));
      } catch {}
    }
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

    // Approved Payment Receipts
    if (res.receipts && res.receipts.length > 0) {
      const receiptDocs = res.receipts.map((r: any) => {
        let ext = "pdf";
        let fileType = "application/pdf";
        if (r.receipt_url && r.receipt_url.startsWith("data:")) {
          const parts = r.receipt_url.split(";");
          if (parts[0]) {
            fileType = parts[0].substring(5);
            if (fileType === "image/png") ext = "png";
            else if (fileType === "image/jpeg") ext = "jpg";
            else if (fileType === "image/webp") ext = "webp";
            else if (fileType === "application/pdf") ext = "pdf";
          }
        }
        
        let docName = "Comprobante de Pago";
        if (r.scope === "PIE") {
          docName = `Comprobante_Pago_Pie.${ext}`;
        } else {
          docName = r.nominal_installment_range
            ? `Comprobante_Pago_Cuotas_${r.nominal_installment_range}.${ext}`
            : r.nominal_installment_number
              ? `Comprobante_Pago_Cuota_${r.nominal_installment_number}.${ext}`
              : `Comprobante_Pago_Cuota.${ext}`;
        }

        return {
          name: docName,
          category: "Comprobantes",
          uploadedAt: r.processed_at || r.created_at,
          fileType: fileType,
          url: `/api/documents/${r.id}`,
        };
      });
      documents = [...documents, ...receiptDocs];
    }

    // Sort combined documents by date descending
    documents.sort(
      (a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime()
    );

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
        isLate: penaltyAmount > 0,
        isMoraFrozen: res.mora_status === "CONGELADO" || res.mora_frozen,
        isUpToDate: penaltyAmount === 0 && !res.mora_frozen && res.mora_status !== "CONGELADO",
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
export async function getProjectLedgerStats(
  projectSlug: string, 
  month?: number, 
  year?: number,
  customStartDate?: string,
  customEndDate?: string
) {
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
    if (customStartDate || customEndDate) {
      const gte = customStartDate ? new Date(customStartDate + "T00:00:00") : undefined;
      const lte = customEndDate ? new Date(customEndDate + "T23:59:59") : undefined;
      dateFilter = {
        paid_at: {
          ...(gte ? { gte } : {}),
          ...(lte ? { lte } : {}),
        },
      };
    } else if (month !== undefined && year !== undefined) {
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
        category: "CUOTA",
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
    const tempPassword = crypto.randomBytes(4).toString("hex");
    const hashedPassword = await hash(tempPassword, 10);

    // Update user record
    await prisma.user.update({
      where: { id: reservation.user_id },
      data: {
        password: hashedPassword,
        must_change_password: true,
        portal_active: true,
        temp_password: tempPassword,
        activated_at: new Date()
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
      include: { user: true, project: true }
    });

    if (!reservation) return { error: "Reserva no encontrada" };

    const tempPassword = crypto.randomBytes(4).toString("hex");
    const hashedPassword = await hash(tempPassword, 10);

    await prisma.user.update({
      where: { id: reservation.user_id },
      data: {
        password: hashedPassword,
        must_change_password: true,
        temp_password: tempPassword,
        portal_active: true,
        activated_at: new Date()
      }
    });

    // Send WhatsApp + email notification via n8n (same as initial activation)
    const webhookUrl = reservation.project?.slug === "libertad-y-alegria"
      ? "https://n8n.aliminlomasdelmar.com/webhook/8aa897b9-d275-401c-a32b-333bbc0b20ee"
      : "https://n8n.aliminlomasdelmar.com/webhook/517e9ba2-64af-4b34-b926-c9265cbfed88";

    const subject = `🔑 Tus nuevas credenciales de acceso al Portal de Pagos de ${reservation.project?.name}`;
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
        .greeting { font-size: 22px; color: #1a5f2a; margin-bottom: 20px; font-weight: 600; }
        .login-card { background: #f8faf8; border: 1px solid #e0e0e0; border-radius: 12px; padding: 30px; margin: 25px 0; border-left: 5px solid #1a5f2a; }
        .login-item { margin-bottom: 15px; }
        .login-item:last-child { margin-bottom: 0; }
        .login-label { color: #777; font-size: 13px; text-transform: uppercase; display: block; margin-bottom: 5px; font-weight: bold; }
        .login-value { color: #333; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px solid #eee; display: inline-block; min-width: 200px; }
        .btn-container { text-align: center; margin: 40px 0; }
        .btn-portal { background-color: #1a5f2a; color: #ffffff !important; padding: 18px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 10px rgba(26,95,42,0.2); }
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
            <p class="greeting">¡Hola ${reservation.name}!</p>
            <p>Hemos generado nuevas credenciales de acceso para tu cuenta en el Portal de Pagos de <strong>${reservation.project?.name}</strong>.</p>
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
                <a href="https://pagos.aliminspa.cl" class="btn-portal">IR A MI PORTAL</a>
            </div>
            <div class="security-note">
                <p style="margin: 0;"><strong>🔐 Nota de seguridad:</strong> El sistema te solicitará cambiar esta contraseña temporal al ingresar.</p>
            </div>
        </div>
        <div class="footer">
            <p><strong>ALIMIN SPA</strong><br>Gestión Inmobiliaria y Financiera</p>
        </div>
    </div>
</body>
</html>`;

    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asunto: subject,
        nombre: reservation.name,
        correo: reservation.user.email,
        contraseña: tempPassword,
        proyecto: reservation.project?.name,
        html: htmlTemplate
      })
    }).catch(err => console.error("Error triggering password reset webhook:", err));

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true, tempPassword, email: reservation.user.email };
  } catch (error) {
    console.error("Error generating password:", error);
    return { error: "Error al generar contraseña" };
  }
}

/**
 * Agrega una nota de sistema visible en la Bitácora del cliente y su espejo en AuditLog.
 * Usado por acciones administrativas (p.ej. eliminación de documentos/comprobantes) que
 * deben quedar registradas en el historial de actividad del cliente.
 */
export async function logSystemNote(reservationId: string, text: string, entity: string = "Reservation") {
  const session = await auth();
  const user = session?.user as any;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { notes: true },
    });

    let currentNotes: any[] = [];
    if (reservation?.notes) {
      try {
        currentNotes = JSON.parse(reservation.notes);
      } catch {
        currentNotes = [];
      }
    }

    const newNote = {
      id: Math.random().toString(36).substring(7),
      text,
      type: "Registro",
      date: new Date().toISOString(),
      author: user?.name || user?.email || "Sistema",
    };
    currentNotes.unshift(newNote);

    await prisma.reservation.update({
      where: { id: reservationId },
      data: { notes: JSON.stringify(currentNotes) },
    });

    await prisma.auditLog.create({
      data: {
        action: "DELETE",
        entity,
        entity_id: reservationId,
        details: text,
        user_id: user?.id || null,
        user_email: user?.email || null,
      },
    });
  } catch (err) {
    console.error("Error logging system note:", err);
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

    const wasApproved = receipt.status === "APPROVED";

    // Revert reservation state if approved
    if (wasApproved) {
      if (receipt.scope === "INSTALLMENT") {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
          await tx.reservation.update({
            where: { id: receipt.reservation_id },
            data: {
              installments_paid: { decrement: receipt.installments_count || 1 },
            },
          });
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

    const label = receipt.scope === "PIE"
      ? "Comprobante de Pie"
      : `Comprobante de Cuota ${receipt.nominal_installment_range || receipt.nominal_installment_number || ""}`.trim();
    await logSystemNote(
      receipt.reservation_id,
      `${label} eliminado (monto $${receipt.amount_clp.toLocaleString("es-CL")}, estado previo: ${receipt.status}).${wasApproved ? " Se revirtió el conteo de cuotas correspondiente." : ""}`,
      "PaymentReceipt"
    );

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

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
      await tx.lot.update({
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

    const sanitizedEmail = data.email.toLowerCase().trim();
    // Find or create User
    let user = await prisma.user.findUnique({ where: { email: sanitizedEmail } });
    if (!user) {
      const hashedPassword = await hash("alimin123", 10);
      user = await prisma.user.create({
        data: {
          email: sanitizedEmail,
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
        email: sanitizedEmail,
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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
      await tx.lot.update({
        where: { id: lot.id },
        data: {
          status: "sold",
          ...(data.cuotas !== undefined && { cuotas: data.cuotas }),
          ...(data.valor_cuota !== undefined && { valor_cuota: data.valor_cuota }),
          ...(data.last_installment_value !== undefined && { last_installment_amount: data.last_installment_value }),
        },
      });
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

export async function getClientNotes(clientId: string) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: clientId },
      select: { notes: true }
    });
    if (!reservation) return [];
    if (!reservation.notes) return [];
    return JSON.parse(reservation.notes);
  } catch (e) {
    return [];
  }
}

export async function addClientNote(clientId: string, noteText: string, noteType: string) {
  try {
    const session = await auth();
    const user = session?.user as any;
    if (!session?.user) {
      return { error: "No autorizado" };
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: clientId },
      select: { notes: true }
    });
    if (!reservation) return { error: "Cliente no encontrado" };

    let currentNotes = [];
    if (reservation.notes) {
      try {
        currentNotes = JSON.parse(reservation.notes);
      } catch (err) {
        currentNotes = [];
      }
    }

    const newNote = {
      id: Math.random().toString(36).substring(7),
      text: noteText,
      type: noteType,
      date: new Date().toISOString(),
      author: user.name || user.email || "Administrador"
    };

    currentNotes.unshift(newNote);

    await prisma.reservation.update({
      where: { id: clientId },
      data: { notes: JSON.stringify(currentNotes) }
    });

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Reservation",
        entity_id: clientId,
        details: `Nota interna agregada de tipo ${noteType}: "${noteText}"`,
        user_id: user.id || null,
        user_email: user.email,
      },
    });

    memoryCache.deleteByPrefix("postventa_");
    revalidatePath("/admin/clients");

    return { success: true, note: newNote };
  } catch (error) {
    console.error("Error adding client note:", error);
    return { error: "Error al agregar nota interna" };
  }
}

/**
 * Sends a client-facing "Observación" note: saves it in the Bitácora,
 * creates an in-portal notification for the client, and triggers an
 * "ALIMIN | IMPORTANTE" email via the n8n webhook.
 * Does not touch any financial field of the reservation.
 */
export async function sendClientObservation(clientId: string, observationText: string) {
  const session = await auth();
  const adminUser = session?.user as any;
  if (!session?.user || adminUser?.role !== "ADMIN") {
    return { error: "No autorizado" };
  }

  const trimmedText = observationText?.trim();
  if (!trimmedText) {
    return { error: "La observación no puede estar vacía" };
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: clientId },
      include: { user: true, project: true },
    });
    if (!reservation) return { error: "Cliente no encontrado" };

    // 1. Append the note to the Bitácora (non-financial field, no trigger involved)
    let currentNotes: any[] = [];
    if (reservation.notes) {
      try {
        currentNotes = JSON.parse(reservation.notes);
      } catch {
        currentNotes = [];
      }
    }
    const newNote = {
      id: Math.random().toString(36).substring(7),
      text: trimmedText,
      type: "Observación",
      date: new Date().toISOString(),
      author: adminUser.name || adminUser.email || "Administrador",
    };
    currentNotes.unshift(newNote);

    await prisma.reservation.update({
      where: { id: clientId },
      data: { notes: JSON.stringify(currentNotes) },
    });

    // 2. Create the in-portal notification for the client
    await prisma.notification.create({
      data: {
        user_id: reservation.user_id,
        type: "OBSERVATION",
        title: "Aviso importante de tu asesor",
        message: trimmedText,
      },
    });

    // 3. Trigger the "ALIMIN | IMPORTANTE" email via n8n (fire-and-forget)
    const clientName = (reservation.last_name && reservation.last_name !== "null")
      ? `${reservation.name} ${reservation.last_name}`.trim()
      : (reservation.user?.name || reservation.name || "Cliente Alimin");

    const escapedText = trimmedText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

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
        .greeting { font-size: 22px; color: #1a5f2a; margin-bottom: 20px; font-weight: 600; }
        .observation-box { background: #f8faf8; border: 1px solid #e0e0e0; border-radius: 12px; padding: 25px; margin: 25px 0; border-left: 5px solid #1a5f2a; font-size: 15px; color: #333; }
        .btn-container { text-align: center; margin: 40px 0; }
        .btn-portal { background-color: #1a5f2a; color: #ffffff !important; padding: 18px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 10px rgba(26,95,42,0.2); }
        .footer { background: #1a5f2a; color: #fff; padding: 30px; text-align: center; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="https://lh3.googleusercontent.com/d/1yWAhY7_vZVJOVwyxZsgILoKd58_na516" alt="ALIMIN Logo">
            <h1>Aviso Importante</h1>
        </div>
        <div class="content">
            <p class="greeting">¡Hola ${clientName}!</p>
            <p>Tu asesor de <strong>${reservation.project?.name || "Alimin"}</strong> dejó el siguiente aviso en tu cuenta:</p>
            <div class="observation-box">${escapedText}</div>
            <div class="btn-container">
                <a href="https://pagos.aliminspa.cl" class="btn-portal">IR A MI PORTAL</a>
            </div>
        </div>
        <div class="footer">
            <p><strong>ALIMIN SPA</strong><br>Gestión Inmobiliaria y Financiera</p>
        </div>
    </div>
</body>
</html>`;

    fetch("https://n8n.aliminlomasdelmar.com/webhook/f71ff8f7-bb15-4487-8199-02ac255fdbb0", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correo: reservation.email,
        asunto: "ALIMIN | IMPORTANTE",
        nombre: clientName,
        proyecto: reservation.project?.name,
        html: htmlTemplate,
      }),
    }).catch(err => console.error("Error triggering observation email webhook:", err));

    // 4. Audit trail
    await prisma.auditLog.create({
      data: {
        action: "CREATE",
        entity: "Reservation",
        entity_id: clientId,
        details: `Observación enviada al cliente (portal + correo "ALIMIN | IMPORTANTE"): "${trimmedText}"`,
        user_id: adminUser.id,
        user_email: adminUser.email,
      },
    });

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/clients");

    return { success: true, note: newNote };
  } catch (error) {
    console.error("Error sending client observation:", error);
    return { error: "Error al enviar la observación" };
  }
}

/**
 * Gets audit log entries (read-only). Never writes to Reservation, Lot,
 * PaymentReceipt or FinancialLedger — only SELECTs. The client name lookups
 * below (Reservation/Lot/FinancialLedger/ReservationDocument) are all plain
 * findMany() reads, done in bulk to avoid N+1 queries.
 * "Postventa" vs "Desarrollador" is derived from whether user_id is present
 * (a real admin session triggered it) or not (script/system origin).
 */
export async function getAuditLogs({
  startDate,
  endDate,
  entityGroup,
  origin,
  page = 1,
  pageSize = 30,
}: {
  startDate?: string;
  endDate?: string;
  entityGroup?: string;
  origin?: "MANUAL" | "AUTOMATICO";
  page?: number;
  pageSize?: number;
}) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return { error: "No autorizado", logs: [], total: 0, entityGroups: [] };
  }

  try {
    const where: any = {};

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(startDate + "T00:00:00");
      if (endDate) where.created_at.lte = new Date(endDate + "T23:59:59");
    }

    if (entityGroup && entityGroup !== "all") {
      const group = ENTITY_GROUPS.find((g) => g.key === entityGroup);
      if (group) where.entity = { in: group.matches };
    }

    if (origin === "MANUAL") {
      where.user_id = { not: null };
    } else if (origin === "AUTOMATICO") {
      where.user_id = null;
    }

    const [logs, total, distinctEntities] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        select: { entity: true },
        distinct: ["entity"],
      }),
    ]);

    // Resolve client names in bulk, grouped by entity type (read-only)
    const idsByGroup: Record<string, string[]> = { RESERVA: [], LOTE: [], CAJA: [], DOCUMENTO: [] };
    for (const log of logs) {
      if (!log.entity_id) continue;
      const key = getEntityGroupKey(log.entity);
      if (key && idsByGroup[key]) idsByGroup[key].push(log.entity_id);
    }

    const clientNameById: Record<string, string> = {};

    if (idsByGroup.RESERVA.length) {
      const reservations = await prisma.reservation.findMany({
        where: { id: { in: idsByGroup.RESERVA } },
        select: { id: true, name: true, last_name: true },
      });
      reservations.forEach((r) => {
        clientNameById[r.id] = (r.last_name && r.last_name !== "null") ? `${r.name} ${r.last_name}`.trim() : r.name;
      });
    }

    if (idsByGroup.LOTE.length) {
      const lotIds = idsByGroup.LOTE.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n));
      const lots = await prisma.lot.findMany({
        where: { id: { in: lotIds } },
        select: { id: true, number: true },
      });
      lots.forEach((l) => { clientNameById[String(l.id)] = `Lote ${l.number}`; });
    }

    if (idsByGroup.CAJA.length) {
      const ledgerEntries = await prisma.financialLedger.findMany({
        where: { id: { in: idsByGroup.CAJA } },
        select: { id: true, reservation: { select: { name: true, last_name: true } } },
      });
      ledgerEntries.forEach((l) => {
        if (l.reservation) {
          clientNameById[l.id] = (l.reservation.last_name && l.reservation.last_name !== "null")
            ? `${l.reservation.name} ${l.reservation.last_name}`.trim() : l.reservation.name;
        }
      });
    }

    if (idsByGroup.DOCUMENTO.length) {
      const docs = await prisma.reservationDocument.findMany({
        where: { id: { in: idsByGroup.DOCUMENTO } },
        select: { id: true, reservation: { select: { name: true, last_name: true } } },
      });
      docs.forEach((d) => {
        if (d.reservation) {
          clientNameById[d.id] = (d.reservation.last_name && d.reservation.last_name !== "null")
            ? `${d.reservation.name} ${d.reservation.last_name}`.trim() : d.reservation.name;
        }
      });
    }

    const processedLogs = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityLabel: getEntityLabel(log.entity),
      entity_id: log.entity_id,
      clientName: log.entity_id ? (clientNameById[log.entity_id] || null) : null,
      details: log.details,
      user_email: log.user_email,
      created_at: log.created_at,
      origin: log.user_id ? "MANUAL" : "AUTOMATICO",
    }));

    // Build entity group filter options only for groups actually present in the data
    const presentKeys = new Set<string>();
    distinctEntities.forEach((e) => {
      const key = getEntityGroupKey(e.entity);
      if (key) presentKeys.add(key);
    });
    const entityGroupOptions = ENTITY_GROUPS.filter((g) => presentKeys.has(g.key)).map((g) => ({ key: g.key, label: g.label }));

    return {
      success: true,
      logs: processedLogs,
      total,
      entityGroups: entityGroupOptions,
    };
  } catch (error) {
    console.error("Error getting audit logs:", error);
    return { error: "Error al cargar auditoría", logs: [], total: 0, entityGroups: [] };
  }
}
