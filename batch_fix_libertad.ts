
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const reservations = await prisma.reservation.findMany({
    where: { 
      status: 'COMPLETED',
      project: { name: 'Libertad y Alegría' }
    },
    include: { lot: true }
  });

  console.log(`Revisando ${reservations.length} clientes al contado en Libertad y Alegría...`);

  for (const res of reservations) {
    const totalGoal = res.lot.price_total_clp || 0;
    const currentPie = res.pie || 0;
    const resPrice = res.reservation_price || 0;
    
    if (totalGoal > 0 && currentPie < totalGoal) {
      // If adding the reservation price makes it reach or exceed the goal, fix it
      if ((currentPie + resPrice) >= totalGoal) {
        console.log(`Corrigiendo ${res.name}: Pie ${currentPie} -> ${totalGoal}`);
        await prisma.reservation.update({
          where: { id: res.id },
          data: { pie: totalGoal }
        });
      }
    }
  }
}
main().finally(() => prisma.$disconnect());
