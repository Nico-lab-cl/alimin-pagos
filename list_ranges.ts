import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const res = await prisma.reservation.findMany({
    include: { lot: true }
  });
  
  for (const r of res) {
    if (r.installment_ranges && (r.installment_ranges as any[]).length > 0) {
      console.log(`Client: ${r.name} ${r.last_name || ''} (Lot: ${r.lot.number})`);
      console.log(`Ranges: ${JSON.stringify(r.installment_ranges)}`);
      console.log(`---`);
    }
  }
}
main().finally(() => prisma.$disconnect());
