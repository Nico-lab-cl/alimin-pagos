import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function printUsage() {
  console.log(`
Uso del script de actualización segura:
npx ts-node src/scripts/safe_financial_update.ts <entidad> <id> '<json_datos>'

Argumentos:
  <entidad>     : 'Reservation', 'Lot' o 'Project'
  <id>          : ID del registro a actualizar (String UUID para Reservation/Project, número entero para Lot)
  <json_datos>  : Objeto JSON con los campos y valores a actualizar

Ejemplo:
  npx ts-node src/scripts/safe_financial_update.ts Reservation "27c3ea48-bd08-4100-be0f-8703138b1ce3" '{"installments_paid": 6}'
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    printUsage();
    process.exit(1);
  }

  const entity = args[0];
  const idStr = args[1];
  const dataJson = args[2];

  if (!['Reservation', 'Lot', 'Project'].includes(entity)) {
    console.error(`Error: Entidad no válida '${entity}'. Debe ser 'Reservation', 'Lot' o 'Project'.`);
    process.exit(1);
  }

  let data: Record<string, any>;
  try {
    data = JSON.parse(dataJson);
  } catch (e: any) {
    console.error("Error al parsear el JSON de datos:", e.message);
    process.exit(1);
  }

  // 1. Obtener y verificar el registro existente
  console.log(`Buscando ${entity} con ID: ${idStr}...`);
  let currentRecord: any = null;
  const where: any = {};

  if (entity === 'Lot') {
    const lotId = parseInt(idStr, 10);
    if (isNaN(lotId)) {
      console.error("Error: Para la entidad 'Lot', el ID debe ser un número entero.");
      process.exit(1);
    }
    where.id = lotId;
    currentRecord = await prisma.lot.findUnique({ where, include: { project: true } });
  } else if (entity === 'Reservation') {
    where.id = idStr;
    currentRecord = await prisma.reservation.findUnique({ where, include: { lot: true, project: true } });
  } else {
    where.id = idStr;
    currentRecord = await prisma.project.findUnique({ where });
  }

  if (!currentRecord) {
    console.error(`Error: No se encontró el registro de tipo ${entity} con ID: ${idStr}`);
    process.exit(1);
  }

  // 2. Crear respaldo en disco
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `backup_${entity}_${idStr}_${timestamp}.json`;
  const backupPath = path.join(backupDir, backupFilename);

  fs.writeFileSync(backupPath, JSON.stringify(currentRecord, null, 2), 'utf8');
  console.log(`✅ Respaldo guardado con éxito en: ${backupPath}`);

  // 3. Ejecutar transacción autorizada
  console.log("Aplicando cambios en la base de datos bajo transacción segura...");
  let updatedRecord: any = null;

  try {
    await prisma.$transaction(async (tx) => {
      // Bypass trigger
      await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);

      if (entity === 'Lot') {
        updatedRecord = await tx.lot.update({
          where: { id: parseInt(idStr, 10) },
          data,
          include: { project: true }
        });
      } else if (entity === 'Reservation') {
        updatedRecord = await tx.reservation.update({
          where: { id: idStr },
          data,
          include: { lot: true, project: true }
        });
      } else {
        updatedRecord = await tx.project.update({
          where: { id: idStr },
          data
        });
      }

      // 4. Escribir registro en la bitácora de auditoría
      await tx.auditLog.create({
        data: {
          action: 'UPDATE',
          entity: entity.toUpperCase(),
          entity_id: idStr,
          details: `Manual safe financial update via CLI script. Changes applied: ${JSON.stringify(data)}. Backup file: ${backupFilename}`,
          user_email: 'developer-script-executor@alimin.cl'
        }
      });
    });

    console.log("✅ Transacción completada con éxito!");

    // 5. Comparar cambios e imprimir DIFF en consola
    console.log("\n=======================================================");
    console.log("             DIFFERENCE DETECTED (BEFORE vs AFTER)     ");
    console.log("=======================================================");
    
    let hasChanges = false;
    for (const key of Object.keys({ ...currentRecord, ...updatedRecord })) {
      const beforeVal = currentRecord[key];
      const afterVal = updatedRecord[key];
      
      // Ignorar campos de fecha de actualización interna si no fueron editados
      if (['updated_at', 'updatedAt'].includes(key) && !data[key]) {
        continue;
      }

      if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
        hasChanges = true;
        console.log(`Field [${key}]:`);
        console.log(`  - ANTES: ${JSON.stringify(beforeVal)}`);
        console.log(`  + AHORA: ${JSON.stringify(afterVal)}`);
      }
    }

    if (!hasChanges) {
      console.log("Ningún valor financiero cambió en el registro.");
    }
    console.log("=======================================================\n");

  } catch (error: any) {
    console.error("❌ ERROR al realizar la actualización en la transacción:", error.message);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
