
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const res = await prisma.reservation.findFirst({
    where: { name: { contains: 'María José Gaete', mode: 'insensitive' } },
    include: { lot: true }
  });
  if (res) {
    console.log(JSON.stringify({
      Nombre: res.name,
      PrecioTotal: res.lot.price_total_clp,
      Reserva: res.lot.reservation_amount_clp,
      Pie: res.pie,
      Extra: res.extra_paid_amount,
      CuotasPagadas: res.installments_paid
    }, null, 2));
  }
}
main().finally(() => prisma.$disconnect());
