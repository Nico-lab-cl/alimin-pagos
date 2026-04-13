import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Ayudante para parsear números con texto, comas y signos peso
function parseMoney(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

function parseSpanishDate(dateString: string | undefined): Date | null {
  if (!dateString || dateString.trim() === '') return null;
  // ej: "05 de junio 2024"
  const months: Record<string, number> = {
    enero: 0, feb: 1, febrero: 1, marzo: 2, abril: 3, mayo: 4, juno: 5, junio: 5, 
    julio: 6, agos: 7, agosto: 7, sep: 8, septiembre: 8, oct: 9, octubre: 9, 
    nov: 10, noviembre: 10, dic: 11, diciembre: 11
  };
  
  const lower = dateString.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = lower.split(' ');
  
  let day = 5; // Default day
  let month = 0;
  let year = new Date().getFullYear();

  parts.forEach(part => {
    if (!isNaN(parseInt(part))) {
      const num = parseInt(part);
      if (num >= 2000) year = num;
      else if (num > 0 && num <= 31) day = num;
    } else {
      // Find matching month
      for (const [mName, mIndex] of Object.entries(months)) {
        if (part.includes(mName)) {
          month = mIndex;
          break;
        }
      }
    }
  });

  return new Date(Date.UTC(year, month, day)); // Use UTC to avoid timezone shifts
}

function parseInstallments(totalCuotasStr: string, valorCuotaStr: string) {
  let cuotas = 0;
  let valor_cuota = 0;
  let last_installment_amount = 0;

  if (totalCuotasStr.toLowerCase().includes('contado')) {
    // If text says "CONTADO"
    return { cuotas: 1, valor_cuota: parseMoney(valorCuotaStr), last_installment_amount: 0, isContado: true };
  }

  // extract typical cuotas amount
  const match = totalCuotasStr.match(/(\d+)/);
  if (match) {
    cuotas = parseInt(match[1], 10);
  }

  valor_cuota = parseMoney(valorCuotaStr);
  
  // if text mentions "ultima" with another value
  const ultimaMatch = totalCuotasStr.match(/ultima\s+([\d.,]+)/i);
  if (ultimaMatch) {
    last_installment_amount = parseMoney(ultimaMatch[1]);
  }

  return { cuotas, valor_cuota, last_installment_amount, isContado: false };
}

function extractPaidInstallments(nCuotaStr: string): number {
  if (!nCuotaStr) return 0;
  // Parse "marzo 2026: 22" -> 22
  const match = nCuotaStr.match(/:\s*(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

// Para hacer parse del CSV con un split básico considerando comillas asumiendo estructura
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
  console.log("Iniciando importación...");

  // 1. Asegurar la existencia del Proyecto
  const projectSlug = 'libertad-y-alegria';
  let project = await prisma.project.findUnique({ where: { slug: projectSlug } });
  
  if (!project) {
    console.log("Creando proyecto Libertad y Alegría...");
    project = await prisma.project.create({
      data: {
        name: "Libertad y Alegría",
        slug: projectSlug,
        description: "Proyecto Libertad y Alegría importado desde CSV",
        status: "ACTIVE",
      }
    });
  }

  const csvPath = path.join(process.cwd(), 'Clientes Libertad y Alegria a marzo 2026 (confirmar pagos de abril 2026).xlsx - LIBERTAD.csv');
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  
  const lines = fileContent.split('\n');
  
  for (let idx = 1; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    const cols = csvLineToArray(line);
    
    // Ignorar si el N° (columna 1 asumiendo índice 0 por la coma inicial) está vacío
    // CSV original: ",N°,NOMBRE,,RUT,..."
    // indices reales:
    // 0: vacio
    // 1: N° (Lote)
    // 2: NOMBRE
    // 3: vacio
    // 4: RUT
    // 5: TELEFONO
    // 6: CORREO
    // 7: PROYECTO (Libertad)
    // 8: N° TOTAL DE CUOTAS
    // 9: valor terreno
    // 10: VALOR CUOTA
    // 11: RESERVA
    // 12: PIE
    // 13: VALOR INTERES
    // 14: PRIMERA CUOTA
    // 15: Numero Mes cuota
    // ...
    // 17: N° CUOTA (Ej. marzo 2026: 22)
    // ...
    // 20: N° CUOTA ABRIL (Ej. PAGADO)
    
    const lotNumber = cols[1]?.trim();
    if (!lotNumber || lotNumber === '') continue;

    const nameStr = cols[2]?.trim() || 'Cliente Sin Nombre';
    // algunos RUT están en la 3 o 4.
    let rutParam = cols[4]?.trim();
    if (rutParam === '') {
      // Intento arreglar columnas desplazadas
      if (cols[3]?.match(/[\d\.\-kK]+/)) {
        rutParam = cols[3].trim();
      }
    }

    const phoneStr = cols[5]?.trim() || '';
    let emailStr = cols[6]?.trim() || '';
    const cuotasStr = cols[8] || '';
    const valorTerrenoStr = cols[9] || '';
    const valorCuotaStr = cols[10] || '';
    const reservaStr = cols[11] || '';
    const pieStr = cols[12] || '';
    const valorInteresStr = cols[13] || '';
    const primeraCuotaStr = cols[14] || '';
    const nCuotaMarzoStr = cols[17] || '';
    const estadoAbrilStr = cols[20] || '';

    // Si el nombre está vacío y todos los campos vacíos, ignora?
    if (nameStr === 'Cliente Sin Nombre' && rutParam === '') continue; // Fila vacía (Ej. L33)

    if (emailStr === '') {
      emailStr = `lote${lotNumber.toLowerCase()}@libertadyalegria.cl`;
    }

    // Buscamos o Creamos Usuario
    let user = await prisma.user.findUnique({ where: { email: emailStr } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: emailStr,
          name: nameStr,
          password: bcrypt.hashSync('alimin123', 10), // constrasenal genérica inicial
          role: "USER"
        }
      });
      console.log(`Usuario Creado: ${emailStr}`);
    }

    const { cuotas, valor_cuota, last_installment_amount, isContado } = parseInstallments(cuotasStr, valorCuotaStr);
    
    // Calcular intereses diarios
    const daily_penalty = parseMoney(valorInteresStr);
    
    // Parse fecha inicio
    const installment_start_date = parseSpanishDate(primeraCuotaStr);

    let installments_paid = extractPaidInstallments(nCuotaMarzoStr);
    // Asumir completado si es CONTADO
    if (isContado) {
      installments_paid = cuotas;
    }

    const statusReservation = estadoAbrilStr.toUpperCase().includes('PAGADO') ? 'active' : 'active'; // Ambos son activos

    // Crear Lote
    // Chequear si existe
    let lot = await prisma.lot.findFirst({
      where: { project_id: project.id, number: lotNumber }
    });

    if (!lot) {
      lot = await prisma.lot.create({
        data: {
          project_id: project.id,
          number: lotNumber,
          stage: "Libertad",
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
    }

    // Crear Reservacion
    const existReservation = await prisma.reservation.findFirst({
      where: { project_id: project.id, lot_id: lot.id, user_id: user.id }
    });

    if (!existReservation) {
      await prisma.reservation.create({
        data: {
          project_id: project.id,
          lot_id: lot.id,
          user_id: user.id,
          name: nameStr,
          email: emailStr,
          phone: phoneStr,
          rut: rutParam,
          pie: parseMoney(pieStr),
          pie_status: "APPROVED",
          status: statusReservation,
          installments_paid: installments_paid,
          installment_start_date: installment_start_date,
          debt_start_date: installment_start_date, // Base
          daily_penalty: daily_penalty,
        }
      });
      console.log(`Reserva Creada para Lote: ${lotNumber}`);
    }
  }

  console.log("¡Migración Finalizada Exitosamente!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
