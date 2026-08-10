/**
 * Aplica prisma/migrations_manual/02_feedback_table.sql (tabla `pagos.feedback`).
 * Es idempotente: todo va con IF NOT EXISTS, así que se puede correr de nuevo sin
 * romper nada. Uso: npx tsx src/scripts/apply_feedback_table.ts
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sqlPath = path.join(process.cwd(), "prisma", "migrations_manual", "02_feedback_table.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  console.log("Creando la tabla pagos.feedback...");
  await prisma.$executeRawUnsafe(sql);

  const columns = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'pagos' AND table_name = 'feedback' ORDER BY ordinal_position`
  );
  console.table(columns);
  console.log(`Listo: ${columns.length} columnas.`);
}

main()
  .catch((e) => {
    console.error("Error aplicando la tabla de feedback:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
