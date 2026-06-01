import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const affectedRuts = ["10629819-K"]; // Luis Bernal
  // We can also include:
  // - Amada Menares (L-37)
  // - Rosario Sanchez (L-28)
  // if they are also affected. Let's check them or fix them together.

  const clients = await prisma.reservation.findMany({
    where: {
      rut: {
        in: affectedRuts
      }
    }
  });

  for (const client of clients) {
    console.log(`Fixing client: ${client.name} ${client.last_name || ''} (RUT: ${client.rut})`);
    await prisma.reservation.update({
      where: { id: client.id },
      data: {
        // Clear the installment_ranges by setting them to empty array
        installment_ranges: []
      }
    });
  }
  console.log("Fix completed successfully.");
}

main().finally(() => prisma.$disconnect());
