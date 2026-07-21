import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const queries = [
  // 1. Proyectos: Función
  `CREATE OR REPLACE FUNCTION check_project_financial_edit() RETURNS TRIGGER AS $$
  BEGIN
    IF current_setting('app.postventa_authorized', true) IS DISTINCT FROM 'true' THEN
      IF (OLD.grace_period_days IS DISTINCT FROM NEW.grace_period_days OR
          OLD.daily_penalty_amount IS DISTINCT FROM NEW.daily_penalty_amount OR
          OLD.due_day_of_month IS DISTINCT FROM NEW.due_day_of_month) THEN
        RAISE EXCEPTION 'ERROR DE SEGURIDAD (Postgres): Modificación de campos financieros de Proyecto bloqueada para esta sesión.';
      END IF;
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;`,

  // 2. Proyectos: Drop Trigger
  `DROP TRIGGER IF EXISTS trg_check_project_financial_edit ON pagos.projects;`,

  // 3. Proyectos: Create Trigger
  `CREATE TRIGGER trg_check_project_financial_edit
  BEFORE UPDATE ON pagos.projects
  FOR EACH ROW EXECUTE FUNCTION check_project_financial_edit();`,

  // 4. Lotes: Función
  `CREATE OR REPLACE FUNCTION check_lot_financial_edit() RETURNS TRIGGER AS $$
  BEGIN
    IF current_setting('app.postventa_authorized', true) IS DISTINCT FROM 'true' THEN
      IF (OLD.price_total_clp IS DISTINCT FROM NEW.price_total_clp OR
          OLD.reservation_amount_clp IS DISTINCT FROM NEW.reservation_amount_clp OR
          OLD.pie IS DISTINCT FROM NEW.pie OR
          OLD.cuotas IS DISTINCT FROM NEW.cuotas OR
          OLD.valor_cuota IS DISTINCT FROM NEW.valor_cuota OR
          OLD.last_installment_amount IS DISTINCT FROM NEW.last_installment_amount) THEN
        RAISE EXCEPTION 'ERROR DE SEGURIDAD (Postgres): Modificación de campos financieros de Lote bloqueada para esta sesión.';
      END IF;
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;`,

  // 5. Lotes: Drop Trigger
  `DROP TRIGGER IF EXISTS trg_check_lot_financial_edit ON pagos.lots;`,

  // 6. Lotes: Create Trigger
  `CREATE TRIGGER trg_check_lot_financial_edit
  BEFORE UPDATE ON pagos.lots
  FOR EACH ROW EXECUTE FUNCTION check_lot_financial_edit();`,

  // 7. Reservas: Función
  `CREATE OR REPLACE FUNCTION check_reservation_financial_edit() RETURNS TRIGGER AS $$
  BEGIN
    IF current_setting('app.postventa_authorized', true) IS DISTINCT FROM 'true' THEN
      IF (OLD.pie IS DISTINCT FROM NEW.pie OR
          OLD.installments_paid IS DISTINCT FROM NEW.installments_paid OR
          OLD.extra_paid_amount IS DISTINCT FROM NEW.extra_paid_amount OR
          OLD.pending_amount IS DISTINCT FROM NEW.pending_amount OR
          OLD.daily_penalty IS DISTINCT FROM NEW.daily_penalty OR
          OLD.reservation_price IS DISTINCT FROM NEW.reservation_price OR
          OLD.last_installment_value IS DISTINCT FROM NEW.last_installment_value OR
          OLD.due_day IS DISTINCT FROM NEW.due_day OR
          OLD.grace_days IS DISTINCT FROM NEW.grace_days) THEN
        RAISE EXCEPTION 'ERROR DE SEGURIDAD (Postgres): Modificación de campos financieros de Reserva bloqueada para esta sesión.';
      END IF;
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;`,

  // 8. Reservas: Drop Trigger
  `DROP TRIGGER IF EXISTS trg_check_reservation_financial_edit ON pagos.reservations;`,

  // 9. Reservas: Create Trigger
  `CREATE TRIGGER trg_check_reservation_financial_edit
  BEFORE UPDATE ON pagos.reservations
  FOR EACH ROW EXECUTE FUNCTION check_reservation_financial_edit();`
];

async function main() {
  console.log("Applying triggers to the database...");
  for (let i = 0; i < queries.length; i++) {
    console.log(`Executing query ${i + 1}/${queries.length}...`);
    await prisma.$executeRawUnsafe(queries[i]);
  }
  console.log("Triggers applied successfully!");
}

main()
  .catch((e) => {
    console.error("Error applying triggers:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
