
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const res = await prisma.reservation.findFirst({
    where: { lot: { number: 'L-40' } },
    include: { lot: true }
  });
  console.log(JSON.stringify(res, null, 2));
}
main().finally(() => prisma.$disconnect());
