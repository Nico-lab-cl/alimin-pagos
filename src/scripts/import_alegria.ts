import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function parseMoney(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

function parseSpanishDate(dateString: string | undefined): Date | null {
  if (!dateString || dateString.trim() === '') return null;
  const months: Record<string, number> = {
    enero: 0, feb: 1, febrero: 1, marzo: 2, abril: 3, mayo: 4, juno: 5, junio: 5, 
    julio: 6, agos: 7, agosto: 7, sep: 8, septiembre: 8, oct: 9, octubre: 9, 
    nov: 10, noviembre: 10, dic: 11, diciembre: 11
  };
  
  const lower = dateString.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = lower.split(' ');
  
  let day = 5;
  let month = 0;
  let year = new Date().getFullYear();

  parts.forEach(part => {
    if (!isNaN(parseInt(part))) {
      const num = parseInt(part);
      if (num >= 2000) year = num;
      else if (num > 0 && num <= 31) day = num;
    } else {
      for (const [mName, mIndex] of Object.entries(months)) {
        if (part.includes(mName)) {
          month = mIndex;
          break;
        }
      }
    }
  });

  return new Date(Date.UTC(year, month, day));
}

function parseInstallments(totalCuotasStr: string, valorCuotaStr: string) {
  let cuotas = 0;
  let valor_cuota = 0;
  let last_installment_amount = 0;

  if (totalCuotasStr.toLowerCase().includes('contado')) {
    return { cuotas: 1, valor_cuota: parseMoney(valorCuotaStr), last_installment_amount: 0, isContado: true };
  }

  const match = totalCuotasStr.match(/(\d+)/);
  if (match) {
    cuotas = parseInt(match[1], 10);
  }

  valor_cuota = parseMoney(valorCuotaStr);
  
  const ultimaMatch = totalCuotasStr.match(/ultima\s+([\d.,]+)/i);
  if (ultimaMatch) {
    last_installment_amount = parseMoney(ultimaMatch[1]);
  }

  return { cuotas, valor_cuota, last_installment_amount, isContado: false };
}

function extractPaidInstallments(str: string): number {
  if (!str) return 0;
  // Parse "marzo 2026: 22" or "N°24 marzo" or "N°22 FEB"
  let match = str.match(/:\s*(\d+)/);
  if (match) return parseInt(match[1], 10);
  match = str.match(/N°(\d+)/i);
  if (match) return parseInt(match[1], 10);
  return 0;
}

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

async function main() {
  console.log("Iniciando importación ALEGRIA...");
  const projectSlug = 'libertad-y-alegria';
  let project = await prisma.project.findUnique({ where: { slug: projectSlug } });
  
  const csvPath = path.join(process.cwd(), 'Clientes Libertad y Alegria a marzo 2026 (confirmar pagos de abril 2026).xlsx - ALEGRIA.csv');
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split('\n');
  
  for (let idx = 1; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    const cols = csvLineToArray(line);
    
    // 1: N°
    // 2: NOMBRE
    // 3: RUT
    // 4: CORREO
    // 5: TELEFONO
    // 6: PROYECTO
    // 7: VALOR TERRENO
    // 8: PIE (columna vacía en CSV pero tiene datos)
    // 9: N° TOTAL CUOTAS
    // 10: VALOR CUOTA
    // 11: RESERVA
    // 12: INICIO PAGO
    // 13: INTERES X DIA
    // 14: N° CUOTA (FEB)
    // 16: N°CUOTA (MARZO)
    // 18: N° CUOTA ABRIL
    
    const lotNumber = cols[1]?.trim();
    if (!lotNumber || lotNumber === '' || lotNumber === 'L01' && !cols[2]) continue;

    const nameStr = cols[2]?.trim() || 'Cliente Sin Nombre';
    const rutParam = cols[3]?.trim() || '';
    let emailStr = cols[4]?.trim() || '';
    const phoneStr = cols[5]?.trim() || '';
    const valorTerrenoStr = cols[7] || '';
    const pieStr = cols[8] || '';
    const cuotasStr = cols[9] || '';
    const valorCuotaStr = cols[10] || '';
    const reservaStr = cols[11] || '';
    const primeraCuotaStr = cols[12] || '';
    const valorInteresStr = cols[13] || '';
    const nCuotaMarzoStr = cols[16] || cols[14] || ''; 
    const estadoAbrilStr = cols[18] || '';

    if (nameStr === 'Cliente Sin Nombre' && rutParam === '') continue; // Fila vacía

    if (emailStr === '') {
      emailStr = `lote${lotNumber.toLowerCase()}@libertadyalegria.cl`;
    }

    let user = await prisma.user.findUnique({ where: { email: emailStr } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: emailStr,
          name: nameStr,
          password: bcrypt.hashSync('alimin123', 10),
          role: "USER"
        }
      });
    }

    const { cuotas, valor_cuota, last_installment_amount, isContado } = parseInstallments(cuotasStr, valorCuotaStr);
    const daily_penalty = parseMoney(valorInteresStr);
    const installment_start_date = parseSpanishDate(primeraCuotaStr);

    let installments_paid = extractPaidInstallments(nCuotaMarzoStr);
    if (isContado) {
      installments_paid = cuotas;
    }

    let lot = await prisma.lot.findFirst({
      where: { project_id: project!.id, number: lotNumber, stage: "Alegria" }
    });

    if (!lot) {
      lot = await prisma.lot.create({
        data: {
          project_id: project!.id,
          number: lotNumber,
          stage: "Alegria", // Cambiado a Alegria
          price_total_clp: parseMoney(valorTerrenoStr),
          reservation_amount_clp: parseMoney(reservaStr),
          pie: parseMoney(pieStr),
          cuotas: cuotas,
          valor_cuota: valorCuotaStr.toLowerCase().includes('contado') ? parseMoney(valorTerrenoStr) : valor_cuota,
          last_installment_amount: last_installment_amount || null,
          status: "sold"
        }
      });
      console.log(`Lote Creado: ${lotNumber}`);
    } else {
        // En caso de querer actualizar
        console.log(`Lote ya existía: ${lotNumber}`);
    }

    const existReservation = await prisma.reservation.findFirst({
      where: { project_id: project!.id, lot_id: lot.id, user_id: user.id }
    });

    if (!existReservation) {
      await prisma.reservation.create({
        data: {
          project_id: project!.id,
          lot_id: lot.id,
          user_id: user.id,
          name: nameStr,
          email: emailStr,
          phone: phoneStr,
          rut: rutParam.length > 5 ? rutParam : null,
          pie: parseMoney(pieStr),
          pie_status: "APPROVED",
          status: 'active',
          installments_paid: installments_paid,
          installment_start_date: installment_start_date,
          debt_start_date: installment_start_date,
          daily_penalty: daily_penalty,
        }
      });
      console.log(`Reserva Creada para Lote Alegría: ${lotNumber}`);
    }
  }
  console.log("¡Migración ALEGRIA Finalizada!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
