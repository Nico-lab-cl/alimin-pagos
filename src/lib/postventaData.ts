import { prisma } from "@/lib/prisma";
import {
  getInstallmentDueDate,
  calculateTotalInterest,
  calculateLomasInterest,
  calculateAggregatedAutoPenalty,
  calculateGrowingFixedPenalty,
  crearAplicadorDeAbonosMora,
  getChileToday,
} from "@/lib/financials";
import { memoryCache } from "@/lib/cache";
import { detectarFichasFantasma } from "@/lib/fichasDuplicadas";

const CACHE_TTL = 300; // 5 minutes

/**
 * Calculo de la cartera de un proyecto: saldo, mora y estado de cada ficha
 * (OK, UPCOMING, GRACE, LATE, FROZEN, COMPLETED), mas los contadores del panel.
 *
 * Vive fuera de actions/ a proposito: todo lo exportado desde un archivo
 * "use server" queda llamable desde el navegador, y esta funcion NO revisa
 * sesion. La pantalla de clientes entra por getFullPostventaData (que si la
 * revisa) y el resumen semanal de WhatsApp entra por aca desde el cron, asi
 * los dos cuentan "al dia" y "en mora" con la misma regla.
 */
export async function computePostventaData(projectSlug: string) {
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
        // Total Invertido de Lomas del Mar. Cuenta el PIE solo si esta
        // efectivamente pagado (monto pactado o recibos), no lo asume pagado
        // como el resto de los proyectos.
        //
        // La reserva NO se suma aparte: es parte de pago del pie (regla de
        // postventa, 27-09-2026, igual para todos los proyectos). Antes se
        // sumaba lot.reservation_amount_clp -o $500.000 si venia vacio- encima
        // del pie, replicando aliminlomasdelmar.com, y a las fichas con el pie
        // guardado bruto la reserva se les contaba dos veces. El portal del
        // cliente (actions/user.ts) ya contaba pie + cuotas: ahora el panel, y
        // el {saldo} de WhatsApp y correo que sale de aca, dicen lo mismo.
        // Las fichas con el pie guardado SIN la reserva se corrigen desde
        // /admin/cuadre-caja, que las marca como "pie guardado sin la reserva".
        // Es solo el calculo del monto mostrado; no toca ningun dato del cliente.
        const manualPie = res.pie || 0;
        const targetGrossPie = manualPie || lot.pie || 0;
        let actualPieComponent = 0;
        if (manualPie > 0) actualPieComponent = manualPie;
        else if (piePaidFromReceipts > 0) actualPieComponent = piePaidFromReceipts;
        else if ((res.pie_status || "").toUpperCase() === "PAID") actualPieComponent = targetGrossPie;

        totalPaid = totalCuotas === 0
          ? totalToPay + extraPaid
          : actualPieComponent + calculatedCuotasTotal + extraPaid;
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
      let overdueInstallments: { number: number; dueDate: string; interestStartDate: string; monthName: string; lateDays: number; penaltyAmount: number; moraCredit: number; baseAmount: number }[] = [];
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

        // Abonos/condonaciones de mora (scope=MORA). El descuento al total se hace
        // DESPUES del loop, con lo que cada abono cubrio realmente: un abono solo
        // puede pagar interes que ya existia el dia en que se abono. Ver
        // crearAplicadorDeAbonosMora. La query ya trae solo recibos APROBADOS.
        const aplicadorAbonos = crearAplicadorDeAbonosMora(
          (res.receipts || []).filter((r: any) => r.scope === "MORA")
        );

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

          let installmentBaseAmount = lot.valor_cuota || 0;
          if (ranges && ranges.length > 0) {
            const range = (ranges as any[]).find((r: any) => installmentNumber >= Number(r.from ?? r.start ?? 0) && installmentNumber <= Number(r.to ?? r.end ?? 0));
            if (range) installmentBaseAmount = Number(range.amount ?? range.value ?? installmentBaseAmount);
          }

          // Only auto penalty per installment
          let autoPenaltyForThis = 0;
          if (res.mora_status !== "CONGELADO" && !res.mora_frozen) {
            if (isLomasProject) {
              // Lomas del Mar: misma formula que aliminlomasdelmar.com.
              // La fecha de deuda aplica a TODAS las cuotas -- EXCEPTO en modo
              // FIXED/MIXED, donde la multa fija ya cubre la deuda historica.
              // Sin este null, cada vez que se registra un pago o un abono
              // (que re-fija debt_start_date a hoy) TODAS las cuotas pendientes
              // se veian con "1 dia de atraso" sin importar cuanto llevaran
              // vencidas de verdad -- este desglose es lo que ve postventa.
              autoPenaltyForThis = calculateLomasInterest(
                currentDue,
                currentDate,
                false,
                res.grace_days ?? project.grace_period_days ?? 5,
                activeDailyPenalty,
                (res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED") ? null : res.debt_start_date,
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
            // Cuanto de la mora de ESTA cuota alcanzan a cubrir los abonos. El tope
            // se evalua con la misma formula de arriba, movida a la fecha del abono.
            const instMoraCredits = aplicadorAbonos.aplicar(
              installmentNumber,
              autoPenaltyForThis,
              (fecha) =>
                isLomasProject
                  ? calculateLomasInterest(
                      currentDue,
                      fecha,
                      false,
                      res.grace_days ?? project.grace_period_days ?? 5,
                      activeDailyPenalty,
                      (res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED") ? null : res.debt_start_date,
                      project.penalty_start_date,
                      res.debt_end_date
                    )
                  : calculateTotalInterest(
                      currentDue,
                      fecha,
                      false,
                      res.grace_days ?? project.grace_period_days ?? 5,
                      activeDailyPenalty,
                      (res.penalty_mode === "FIXED" || res.penalty_mode === "MIXED") ? null : (i === 0 ? res.debt_start_date : null),
                      project.penalty_start_date,
                      res.debt_end_date
                    )
            );
            overdueInstallments.push({
              number: installmentNumber,
              dueDate: currentDue.toISOString(),
              interestStartDate: interestStart.toISOString(),
              monthName: monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1),
              lateDays: days,
              penaltyAmount: Math.max(0, autoPenaltyForThis - instMoraCredits),
              moraCredit: instMoraCredits,
              baseAmount: installmentBaseAmount,
            });
          } else {
            // Stop once we hit installments that are not overdue
            break;
          }
        }

        // El total solo descuenta lo que los abonos cubrieron de verdad. Lo que
        // sobre queda sin usar: es plata que ya pago la mora de su momento.
        penaltyAmount = Math.max(0, penaltyAmount - aplicadorAbonos.totalAplicado);
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

      // Datos del plan de pago para los exportables. Son solo lectura: repiten la
      // misma regla que ya usa el desglose de cuotas vencidas (rangos pactados y,
      // si no hay rango, el valor_cuota del lote). No tocan saldo, pie ni mora.
      const montoDeCuota = (numeroCuota: number): number => {
        let monto = lot.valor_cuota || 0;
        const listaRangos = (ranges as any[]) || [];
        if (listaRangos.length > 0) {
          const range = listaRangos.find(
            (r: any) =>
              numeroCuota >= Number(r.from ?? r.start ?? 0) &&
              numeroCuota <= Number(r.to ?? r.end ?? 0)
          );
          if (range) monto = Number(range.amount ?? range.value ?? monto);
        }
        return monto;
      };

      // La cuota vigente es la que sigue a las ya pagadas; la siguiente es la de
      // despues. next_payment_date (override del admin) solo mueve a la vigente,
      // igual que en el desglose de cuotas vencidas.
      const currentInstallmentNumber = paidCuotas < totalCuotas ? paidCuotas + 1 : null;
      const followingInstallmentNumber =
        currentInstallmentNumber && currentInstallmentNumber < totalCuotas
          ? currentInstallmentNumber + 1
          : null;
      const followingDueDate =
        followingInstallmentNumber && res.installment_start_date
          ? getInstallmentDueDate(
              res.installment_start_date,
              followingInstallmentNumber,
              res.due_day ?? project.due_day_of_month ?? 5
            )
          : null;
      const currentInstallmentAmount = currentInstallmentNumber
        ? montoDeCuota(currentInstallmentNumber)
        : 0;

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
        secondaryEmail: res.secondary_email,
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
        followingInstallmentNumber,
        followingDueDate,
        currentInstallmentAmount,
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
        advisor: res.advisor,
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

    // Fichas fantasma del puente Lomas: la misma persona repetida en el mismo
    // lote. La copia viene congelada en el avance de cuotas de Lomas, que va
    // atrasado, asi que aparece "en mora" por una cuota que postventa ya cobro.
    // Se marcan (no se esconden: postventa tiene que poder verlas y archivarlas)
    // y quedan fuera de los contadores y de las audiencias de cobranza.
    const fantasmas = detectarFichasFantasma(processedData);
    for (const ficha of processedData) {
      (ficha as any).isGhostDuplicate = fantasmas.has(ficha.id);
    }
    const fichasReales = processedData.filter((d) => !fantasmas.has(d.id));

    const stats = {
      total: fichasReales.length,
      late: fichasReales.filter((d) => d.status === "LATE").length,
      grace: fichasReales.filter((d) => d.status === "GRACE").length,
      upcoming: fichasReales.filter((d) => d.status === "UPCOMING").length,
      ok: fichasReales.filter((d) => d.status === "OK").length,
      fantasmas: fantasmas.size,
    };

    const result = { success: true, data: processedData, stats, project };
    memoryCache.set(cacheKey, result, CACHE_TTL);
    return result;
  } catch (error) {
    console.error("Error getting postventa data:", error);
    return { error: "Error al cargar datos", data: [], stats: null };
  }
}
