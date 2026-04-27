
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const reservations = await prisma.reservation.findMany({
    where: { 
      status: 'COMPLETED',
      project: { name: 'Arena y Sol' }
    },
    include: { lot: true }
  });

  for (const res of reservations) {
    const totalGoal = res.lot.price_total_clp || 0;
    const currentPie = res.pie || 0;
    const resPrice = res.reservation_price || 0;
    
    if (currentPie < totalGoal && (currentPie + resPrice) >= totalGoal) {
      console.log(`Corrigiendo ${res.name}: Pie ${currentPie} -> ${totalGoal}`);
      await prisma.reservation.update({
        where: { id: res.id },
        data: { pie: totalGoal }
      });
    }
  }
}
main().finally(() => prisma.$disconnect());
