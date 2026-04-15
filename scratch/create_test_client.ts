import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "nicolas.cab.v@gmail.com";
  const pass = "alimin2026";
  const hashed = hashSync(pass, 10);

  console.log("Creando/Actualizando usuario de prueba...");
  // 1. Create or get user
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name: "Nicolas (Cuenta de Pruebas)",
        role: "USER"
      }
    });
  } else {
    user = await prisma.user.update({
      where: { email },
      data: { password: hashed, role: "USER", name: "Nicolas (Cuenta de Pruebas)" }
    });
  }

  // 2. Create TEST project
  console.log("Configurando Proyecto Ficticio (Oculto en Admin)...");
  let project = await prisma.project.findUnique({ where: { slug: "demo-project" } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        slug: "demo-project",
        name: "Proyecto DEMO Pruebas",
        status: "TEST", // This prevents it from appearing in admin views
        due_day_of_month: 5,
        grace_period_days: 5,
        daily_penalty_amount: 10000,
        bank_name: "Banco Ficticio de Pruebas",
        bank_type: "Cuenta Corriente Ficticia",
        bank_account: "00012345678",
        bank_holder: "Demo Pruebas Limitada",
        bank_rut: "99.999.999-9",
        bank_email: "postventa@pruebas.cl",
      }
    });
  }

  // 3. Create Lot
  console.log("Configurando Lote Ficticio...");
  let lot = await prisma.lot.findFirst({ where: { project_id: project.id, number: "P-100" } });
  if (!lot) {
    lot = await prisma.lot.create({
      data: {
        project_id: project.id,
        number: "P-100",
        stage: "PRUEBAS",
        area_m2: 5000,
        price_total_clp: 18000000,
        pie: 3000000,
        cuotas: 60,
        valor_cuota: 250000,
        status: "reserved"
      }
    });
  }

  // 4. Create Reservation
  console.log("Vinculando Reserva...");
  let reservation = await prisma.reservation.findFirst({ where: { user_id: user.id, lot_id: lot.id } });
  
  // Set start date 4 months ago to force some "pending/late" cuotas for demonstration
  const startDate = new Date();
  startDate.setUTCMonth(startDate.getUTCMonth() - 4); 
  
  if (!reservation) {
    reservation = await prisma.reservation.create({
      data: {
        project_id: project.id,
        lot_id: lot.id,
        user_id: user.id,
        name: "Nicolas",
        last_name: "Demo",
        email: email,
        phone: "+56999999999",
        status: "active", // must be active so the user can see it in dashboard
        installments_paid: 2, // Paid 2, started 4 months ago -> Cuota 3 is late, Cuota 4 pending
        installment_start_date: startDate,
        due_day: 5,
        daily_penalty: 10000,
        mora_status: "ACTIVO",
        grace_days: 5,
        pie_status: "PAID",
      }
    });
  } else {
     // reset state to showcase pending stuff definitively
     await prisma.reservation.update({
        where: { id: reservation.id },
        data: {
           installments_paid: 2,
           installment_start_date: startDate,
           pie_status: "PAID",
           status: "active",
           mora_status: "ACTIVO"
        }
     });
  }
  
  console.log("==========================================");
  console.log("¡USUARIO DE PRUEBA CREADO EXITOSAMENTE!");
  console.log("Email: " + email);
  console.log("Clave: alimin2026");
  console.log("Aparecerá en el portal de cliente sin afectar el backend Administrativo del CRM real.");
  console.log("==========================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());
