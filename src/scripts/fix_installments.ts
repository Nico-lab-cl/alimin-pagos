import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function csvLineToArray(text: string): string[] {
  let p = '', row = [''], i = 0, r = 0, s = !0, l;
  for (l of text) {
    if ('"' === l) {
      if (s && l === p) row[i] += l;
      s = !s;
    } else if (',' === l && s) l = row[++i] = '';
    else row[i] += l;
    p = l;
  }
  return row;
}

function extractDigits(str: string): number {
  if (!str) return 0;
  // prioritize: N°XX, then ": XX", then last number in string
  const afterNo = str.match(/N°\s*(\d+)/i);
  if (afterNo) return parseInt(afterNo[1], 10);

  const afterColon = str.match(/:\s*(\d+)/);
  if (afterColon) return parseInt(afterColon[1], 10);

  const digits = str.match(/\d+/g);
  if (digits) {
    // Find the one that isn't a year (4 digits >= 2000)
    for (const d of digits) {
      const n = parseInt(d, 10);
      if (n < 2000) return n;
    }
  }
  return 0;
}

async function fixFile(fileName: string) {
  console.log(`Fixing ${fileName}...`);
  const csvPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(csvPath)) {
    console.error(`File ${fileName} not found`);
    return;
  }
  
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split('\n');
  
  for (let idx = 1; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    const cols = csvLineToArray(line);
    const lotNumber = cols[1]?.trim();
    if (!lotNumber) continue;

    const nCuotaStr = cols[17] || '';
    let paid = extractDigits(nCuotaStr);
    
    // Check April status (Column 20)
    const statusAbril = cols[20]?.trim().toUpperCase() || '';
    if (statusAbril.includes('PAGADO')) {
      paid += 1;
    }
    
    if (paid > 0) {
      // Find the reservation and update it
      const reservations = await prisma.reservation.findMany({
        where: {
          lot: {
            number: lotNumber
          }
        }
      });
      
      for (const res of reservations) {
        // Update even if not 0, to correct the previous mistake
        await prisma.reservation.update({
          where: { id: res.id },
          data: { installments_paid: paid }
        });
        console.log(`Updated Lot ${lotNumber}: installments_paid = ${paid} (based on ${nCuotaStr} + April Status: ${statusAbril})`);
      }
    }
  }
}

async function main() {
  await fixFile('Clientes Libertad y Alegria a marzo 2026 (confirmar pagos de abril 2026).xlsx - LIBERTAD.csv');
  await fixFile('Clientes Libertad y Alegria a marzo 2026 (confirmar pagos de abril 2026).xlsx - ALEGRIA.csv');
  console.log('Finished fixing installments_paid');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
