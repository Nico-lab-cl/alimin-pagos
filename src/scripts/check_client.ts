import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx ts-node src/scripts/check_client.ts <email>');
    process.exit(1);
  }

  const reservation = await prisma.reservation.findFirst({
    where: {
      OR: [
        { email: { contains: email, mode: 'insensitive' } },
        { user: { email: { contains: email, mode: 'insensitive' } } }
      ]
    },
    include: {
      lot: true,
      user: true
    }
  });

  if (!reservation) {
    console.log('Client not found');
  } else {
    console.log(JSON.stringify(reservation, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
