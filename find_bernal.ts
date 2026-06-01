import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const res = await prisma.reservation.findFirst({
    where: { name: { contains: 'Luis', mode: 'insensitive' }, last_name: { contains: 'Bernal', mode: 'insensitive' } },
    include: {
      lot: true,
      project: true,
      financialLedgers: true
    }
  });
  console.log(JSON.stringify(res, null, 2));
}
main().finally(() => prisma.$disconnect());
