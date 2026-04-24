import { prisma } from "../lib/prisma";
import { getInstallmentDueDate, calculateTotalInterest } from "../lib/financials";
import { sendPushNotification } from "../lib/notifications";

async function runDailyAlerts() {
  console.log("Starting daily alerts check...");
  
  const reservations = await prisma.reservation.findMany({
    where: { status: "active" },
    include: {
      project: true,
      lot: true,
      user: { select: { fcm_token: true } },
    },
  });

  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  for (const res of reservations) {
    if (!res.user.fcm_token) continue;

    const project = res.project;
    const lot = res.lot;
    const paidCuotas = res.installments_paid || 0;
    const totalCuotas = lot.cuotas || 0;

    if (paidCuotas >= totalCuotas) continue;

    const nextDueDate = getInstallmentDueDate(
      res.installment_start_date!,
      paidCuotas + 1,
      res.due_day ?? project.due_day_of_month ?? 5
    );

    const activeDailyPenalty = res.daily_penalty ?? project.daily_penalty_amount ?? 10000;
    
    const penaltyAmount = calculateTotalInterest(
      nextDueDate,
      currentDate,
      res.mora_frozen || false,
      res.grace_days ?? project.grace_period_days ?? 5,
      activeDailyPenalty,
      res.debt_start_date,
      project.penalty_start_date
    );

    let status = "OK";
    if (penaltyAmount > 0) status = "LATE";
    else if (currentDate >= nextDueDate) status = "GRACE";

    // Only notify if the status has changed to something "worse"
    if (status !== res.last_notified_status) {
      if (status === "LATE") {
        await sendPushNotification({
          token: res.user.fcm_token,
          title: "¡Alerta de Mora!",
          body: "Tu cuota presenta retrasos. Por favor regulariza tu situación para evitar cargos adicionales.",
        });
      } else if (status === "GRACE") {
        await sendPushNotification({
          token: res.user.fcm_token,
          title: "Periodo de Gracia",
          body: "Tu cuota venció hoy. Tienes unos días de gracia para pagar sin multas.",
        });
      }

      // Update last notified status
      await prisma.reservation.update({
        where: { id: res.id },
        data: { last_notified_status: status },
      });
    }
  }

  console.log("Daily alerts check completed.");
}

runDailyAlerts()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
