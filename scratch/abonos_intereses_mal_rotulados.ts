/**
 * Abonos de intereses que quedaron rotulados como cuota.
 *
 * ── Los dos pagos que llevan mora, y en qué se diferencian ────────────────
 *
 * A) CUOTA + INTERESES  -> `approveReceipt`
 *    El cliente paga la cuota con la mora encima. El monto se parte en dos:
 *      cuotaPaidAmount   = min(pagado, pactado)  -> caja CUOTA  "Pago Cuota xN Aprobado"
 *      penaltyPaidAmount = max(0, pagado-pactado)-> caja PENALTY "Pago Mora Aprobada"
 *    Sube `installments_paid` y el comprobante SE QUEDA con su cuota, porque
 *    de verdad la pagó. Estos NO se tocan. Ojo: su `amount_clp` es el total,
 *    cuota + mora.
 *
 * B) SOLO INTERESES     -> `approveReceiptAsInterestPayment`
 *    Todo el monto va a mora: una sola fila PENALTY "Abono de Intereses
 *    Aprobado (Bandeja de Pagos)", y `installments_paid` NO se mueve. Pero el
 *    comprobante lo subió el cliente eligiendo una cuota, y esa cuota se le
 *    quedaba pegada. Estos son los rotos.
 *
 *    (El tercer camino, `registerInterestPayment` -el abono manual desde la
 *    ficha-, crea el comprobante sin cuota desde el principio: está sano.)
 *
 * Con el número pegado, un pago del caso B se lee como si pagara esa cuota:
 * la cuota queda cubierta por DOS comprobantes (TRASLAPE en rojo), su plata se
 * suma a lo recibido por cuotas, y el recibo del cliente sale diciendo
 * "Cuota 5" cuando pagó intereses. El código ya no los crea así; este script
 * es para los que quedaron.
 *
 * ── Cómo distingue uno de otro, sin adivinar ─────────────────────────────
 *
 * Un comprobante se corrige SOLO si cumple las tres:
 *   1. hay una fila PENALTY "Abono de Intereses Aprobado (Bandeja de Pagos)"
 *      de esa reserva y esa fecha  -> la escribe únicamente el caso B;
 *   2. el monto del comprobante es EXACTO al de esa fila  -> en el caso A el
 *      comprobante siempre trae además la cuota, así que nunca coincide;
 *   3. esa reserva NO tiene ninguna fila CUOTA en la misma fecha  -> si ese
 *      día también se aprobó una cuota, no hay forma de estar seguro.
 *
 * Todo lo que no cumple las tres sale como DUDOSO y se saltea. Vale más
 * dejar un traslape en pantalla que desmarcar la cuota de alguien.
 *
 * NO ESCRIBE NADA salvo que se le pase --aplicar. Corré primero sin la
 * bandera y revisá la lista.
 *
 *   npx tsx scratch/abonos_intereses_mal_rotulados.ts
 *   npx tsx scratch/abonos_intereses_mal_rotulados.ts --aplicar
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");
const DESC_ABONO = "Abono de Intereses Aprobado (Bandeja de Pagos)";

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

async function main() {
  const abonos = await prisma.financialLedger.findMany({
    where: { category: "PENALTY", description: DESC_ABONO },
    select: { reservation_id: true, amount_clp: true, paid_at: true },
  });
  console.log(`Filas de caja por abono de intereses (caso B): ${abonos.length}\n`);
  if (abonos.length === 0) return;

  const reservas = [...new Set(abonos.map((a) => a.reservation_id))];

  // Días en que esa reserva tuvo una cuota aprobada (caso A). Si el día coincide
  // con el del abono, no se toca nada.
  const diasConCuota = new Set<string>();
  const filasCuota = await prisma.financialLedger.findMany({
    where: { reservation_id: { in: reservas }, category: "CUOTA" },
    select: { reservation_id: true, paid_at: true },
  });
  for (const f of filasCuota) diasConCuota.add(`${f.reservation_id}|${dia(f.paid_at)}`);

  const recibos = await prisma.paymentReceipt.findMany({
    where: {
      reservation_id: { in: reservas },
      status: "APPROVED",
      scope: "INSTALLMENT",
      OR: [
        { nominal_installment_number: { not: null } },
        { nominal_installment_range: { not: null } },
      ],
    },
    select: {
      id: true,
      reservation_id: true,
      amount_clp: true,
      paid_at: true,
      processed_at: true,
      nominal_installment_number: true,
      nominal_installment_range: true,
      reservation: {
        select: { name: true, last_name: true, project: { select: { name: true } } },
      },
    },
  });

  const porReserva = new Map<string, typeof recibos>();
  for (const r of recibos) {
    porReserva.set(r.reservation_id, [...(porReserva.get(r.reservation_id) || []), r]);
  }

  const etiqueta = (r: (typeof recibos)[number]) =>
    r.nominal_installment_range ? `cuotas ${r.nominal_installment_range}` : `cuota ${r.nominal_installment_number}`;
  const quienEs = (r: (typeof recibos)[number]) =>
    `${`${r.reservation.name || ""} ${r.reservation.last_name || ""}`.trim()} (${r.reservation.project?.name})`;

  const aCorregir: { id: string; linea: string }[] = [];
  const dudosos: string[] = [];

  for (const abono of abonos) {
    const fecha = dia(abono.paid_at);
    const delDia = (porReserva.get(abono.reservation_id) || []).filter(
      (r) => dia(r.paid_at || r.processed_at) === fecha
    );
    if (delDia.length === 0) continue;

    const quien = quienEs(delDia[0]);
    const nota = (motivo: string) =>
      dudosos.push(
        `DUDOSO  ${quien} · ${fecha} · abono ${clp(abono.amount_clp)}\n` +
          delDia.map((r) => `          ${r.id.slice(0, 8)} · ${etiqueta(r)} · ${clp(r.amount_clp)}`).join("\n") +
          `\n          -> ${motivo}; se saltea, resolver a mano`
      );

    // Regla 3: ese día también entró una cuota.
    if (diasConCuota.has(`${abono.reservation_id}|${fecha}`)) {
      nota("ese día también se aprobó una cuota (caso A)");
      continue;
    }

    // Regla 2: el monto del comprobante tiene que ser exacto al de la caja.
    const exactos = delDia.filter((r) => r.amount_clp === abono.amount_clp);
    if (exactos.length !== 1) {
      nota(
        exactos.length === 0
          ? "ningún comprobante de ese día coincide en monto con el abono"
          : `${exactos.length} comprobantes coinciden en monto`
      );
      continue;
    }

    const r = exactos[0];
    aCorregir.push({
      id: r.id,
      linea: `${quien} · ${fecha} · ${r.id.slice(0, 8)} · rotulado ${etiqueta(r)} · ${clp(r.amount_clp)} → abono de intereses`,
    });
  }

  console.log(`Para corregir: ${aCorregir.length}   ·   Dudosos (sin tocar): ${dudosos.length}\n`);
  for (const c of aCorregir) console.log("  " + c.linea);
  if (dudosos.length) {
    console.log("\n" + dudosos.join("\n\n"));
  }

  if (!APLICAR) {
    console.log("\nSimulación. No se escribió nada. Volvé a correr con --aplicar cuando la lista esté revisada.");
    return;
  }

  // Solo se sueltan las dos columnas de rótulo. Ni el monto, ni installments_paid,
  // ni la caja: nada de eso mueve el saldo de nadie.
  const res = await prisma.paymentReceipt.updateMany({
    where: { id: { in: aCorregir.map((c) => c.id) } },
    data: { nominal_installment_number: null, nominal_installment_range: null },
  });
  console.log(`\nComprobantes corregidos: ${res.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
