/**
 * Fichas con MÁS cuotas pagadas de las que tiene el lote.
 *
 * Disparado por Erika Valenzuela Mena: lote de 51 cuotas, el contador dice 57,
 * y hay un comprobante rotulado "hasta la 57".
 *
 * ── Cómo pasa ────────────────────────────────────────────────────────────
 *
 * `payment_receipts` tiene dos columnas que se parecen: a qué cuota
 * corresponde el pago (`nominal_installment_number`) y cuántas cuotas cubre
 * (`installments_count`). La carga inicial del 12-03-2026 escribió el NÚMERO
 * DE CUOTA en la segunda (ver la migración 11). Un pago de la cuota 6 quedó
 * diciendo que cubre 6 cuotas.
 *
 * Esa migración arregló el rótulo, pero a propósito no tocó `installments_paid`
 * ("no mueve plata"). El problema es lo que pasa si uno de esos comprobantes
 * se aprueba DESPUÉS por la bandeja: `approveReceipt` hace
 *
 *     installments_paid: { increment: receipt.installments_count || 1 }
 *
 * sin ningún tope contra `lot.cuotas`. Con el contador en 51 y un comprobante
 * que dice cubrir 6, el contador salta a 57 y el rango se estampa "52-57"
 * (`approvedInstRange`), aunque las cuotas 52 a 57 no existan.
 *
 * ── Por qué importa ──────────────────────────────────────────────────────
 *
 * Esto NO es cosmético. El "Total Pagado" del cliente se calcula recorriendo
 * `for (let i = 1; i <= paidCuotas; i++)` en actions/user.ts, sin tope, así
 * que suma cuotas que no existen: al cliente le aparece MÁS plata invertida y
 * MENOS saldo del que de verdad debe. Y como la mora se calcula sobre
 * `totalCuotas - paidCuotas`, que queda negativo, el cliente no figura con
 * mora y su "próxima cuota" sale en blanco: parece que terminó de pagar.
 *
 * SOLO LECTURA. No escribe nada, no tiene modo --aplicar: primero hay que
 * decidir qué hacer con cada caso.
 *
 *   npx tsx scratch/cuotas_pagadas_de_mas.ts
 *   npx tsx scratch/cuotas_pagadas_de_mas.ts "erika"
 */
import { PrismaClient } from "@prisma/client";
import { getNominalInstallmentAmount } from "../src/lib/financials";

const prisma = new PrismaClient();
const BUSCADO = process.argv[2]?.toLowerCase();

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

async function main() {
  const reservas = await prisma.reservation.findMany({
    where: { status: { in: ["active", "COMPLETED"] } },
    select: {
      id: true,
      name: true,
      last_name: true,
      rut: true,
      installments_paid: true,
      installment_ranges: true,
      pie: true,
      extra_paid_amount: true,
      project: { select: { name: true } },
      lot: {
        select: { number: true, stage: true, cuotas: true, valor_cuota: true, price_total_clp: true },
      },
      receipts: {
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          amount_clp: true,
          status: true,
          scope: true,
          installments_count: true,
          nominal_installment_number: true,
          nominal_installment_range: true,
          created_at: true,
          paid_at: true,
          processed_at: true,
        },
      },
    },
  });

  // ── Si se pidió un cliente puntual, se vuelca entero ──────────────────
  if (BUSCADO) {
    const hit = reservas.filter((r) =>
      `${r.name || ""} ${r.last_name || ""}`.toLowerCase().includes(BUSCADO)
    );
    if (hit.length === 0) {
      console.log(`Ningún cliente coincide con "${BUSCADO}".`);
      return;
    }
    for (const r of hit) {
      const total = r.lot?.cuotas || 0;
      const pagadas = r.installments_paid || 0;
      console.log(`\n${"=".repeat(72)}`);
      console.log(`${`${r.name || ""} ${r.last_name || ""}`.trim()}  ·  ${r.rut || "sin RUT"}`);
      console.log(`${r.project?.name} · lote ${r.lot?.number}${r.lot?.stage ? "-" + r.lot.stage : ""}`);
      console.log(`${"=".repeat(72)}`);
      console.log(`  cuotas del lote      : ${total}`);
      console.log(`  installments_paid    : ${pagadas}${pagadas > total ? `   <-- ${pagadas - total} DE MÁS` : ""}`);
      console.log(`  valor_cuota          : ${clp(r.lot?.valor_cuota || 0)}`);
      console.log(`  precio total         : ${clp(r.lot?.price_total_clp || 0)}`);
      console.log(`  pie / extra          : ${clp(r.pie || 0)} / ${clp(r.extra_paid_amount || 0)}`);
      console.log(`\n  Comprobantes (${r.receipts.length}):`);
      console.log(
        `  ${"estado".padEnd(9)} ${"scope".padEnd(11)} ${"monto".padEnd(12)} ${"cuenta".padEnd(7)} ${"nº".padEnd(5)} ${"rango".padEnd(8)} fecha`
      );
      for (const c of r.receipts) {
        console.log(
          `  ${String(c.status).padEnd(9)} ${String(c.scope).padEnd(11)} ${clp(c.amount_clp).padEnd(12)} ` +
            `${String(c.installments_count ?? "—").padEnd(7)} ${String(c.nominal_installment_number ?? "—").padEnd(5)} ` +
            `${String(c.nominal_installment_range ?? "—").padEnd(8)} ${dia(c.paid_at || c.processed_at || c.created_at)}`
        );
      }
      // Los sospechosos: cuenta > 1 con monto de UNA sola cuota.
      const vc = r.lot?.valor_cuota || 0;
      const sospechosos = r.receipts.filter(
        (c) => (c.installments_count || 1) > 1 && vc > 0 && c.amount_clp < vc * 1.5
      );
      if (sospechosos.length) {
        console.log(`\n  SOSPECHOSOS (dicen cubrir varias cuotas con plata de una):`);
        for (const c of sospechosos) {
          console.log(
            `    ${c.id.slice(0, 8)} · dice cubrir ${c.installments_count} · trae ${clp(c.amount_clp)} · alcanza para ${(c.amount_clp / vc).toFixed(2)} cuota(s)`
          );
        }
      }
    }
    return;
  }

  // ── Barrido: todas las fichas con el contador pasado de largo ─────────
  const pasadas = reservas
    .map((r) => {
      const total = r.lot?.cuotas || 0;
      const pagadas = r.installments_paid || 0;
      if (total <= 0 || pagadas <= total) return null;
      // Lo que el "Total Pagado" del cliente está inflado: las cuotas que el
      // contador suma y el lote no tiene.
      let inflado = 0;
      for (let n = total + 1; n <= pagadas; n++) {
        inflado += getNominalInstallmentAmount(r.installment_ranges, n, r.lot?.valor_cuota || 0);
      }
      return { r, total, pagadas, inflado };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.inflado - a.inflado);

  console.log(`\nFichas con más cuotas pagadas que cuotas del lote: ${pasadas.length}\n`);
  let totalInflado = 0;
  for (const p of pasadas) {
    totalInflado += p.inflado;
    const quien = `${`${p.r.name || ""} ${p.r.last_name || ""}`.trim()}`;
    console.log(
      `  ${quien.padEnd(32)} ${String(p.r.project?.name || "").padEnd(16)} lote ${String(p.r.lot?.number).padEnd(6)} ` +
        `${p.pagadas}/${p.total} (+${p.pagadas - p.total})  saldo subestimado en ${clp(p.inflado)}`
    );
  }
  console.log(`\n  TOTAL que el portal le está perdonando a estos clientes: ${clp(totalInflado)}`);
  console.log(`\nPara ver una ficha completa:  npx tsx scratch/cuotas_pagadas_de_mas.ts "apellido"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
