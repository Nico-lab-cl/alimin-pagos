/**
 * Rótulos de cuota corridos: el traslape que no es un pago duplicado.
 *
 * Síntoma en Revisión de Comprobantes: la misma ficha muestra un TRASLAPE
 * ("cuota 3: nº 3 y nº 3") y un HUECO ("cuota 2 sin comprobante"), y la plata
 * cuadra al peso contra el contador de cuotas. No se cobró dos veces: dos
 * comprobantes quedaron marcados con el mismo número y la cuota de al lado se
 * quedó sin marcar. Caso testigo: Cesar Retamal, Lomas, lote 37-3 — cuatro
 * comprobantes por $2.200.000 rotulados {1,3,3,4} contra 4 cuotas contadas
 * que valen $2.200.000.
 *
 * El portal no los produce: `approveReceipt` re-estampa el número con el
 * contador vivo al aprobar, y al adjuntar a mano postventa elige la cuota.
 * Venían del puente de Lomas, que copiaba `nominal_installment_number` tal
 * cual. Por eso esto es una limpieza de una vez y no un parche permanente.
 *
 * La decisión vive en `proponerCorreccion`, que es pura: no consulta ni
 * escribe nada. Así se puede probar contra fichas de mentira antes de
 * soltarla sobre la cartera.
 *
 * Solo escribe `nominal_installment_number`. No toca montos, ni
 * installments_paid, ni la caja: ningún saldo se mueve.
 *
 * NO ESCRIBE NADA salvo --aplicar.
 *
 *   npx tsx scratch/rotulos_de_cuota_corridos.ts
 *   npx tsx scratch/rotulos_de_cuota_corridos.ts --aplicar
 */
import { PrismaClient } from "@prisma/client";
import { getNominalInstallmentAmount } from "../src/lib/financials";

export type ReciboRotulo = {
  id: string;
  amount_clp: number;
  installments_count?: number | null;
  nominal_installment_number?: number | null;
  nominal_installment_range?: string | null;
  paid_at?: Date | string | null;
  processed_at?: Date | string | null;
  created_at?: Date | string | null;
};

export type Correccion = { id: string; de: number; a: number };

/**
 * ¿Esta ficha tiene un rótulo corrido, y cómo se endereza?
 *
 * Devuelve `null` cuando no hay nada que hacer, `{ saltada }` cuando hay un
 * traslape pero NO es un rótulo corrido —y entonces hay que mirarlo a mano—, o
 * la lista de cambios cuando se cumplen las cinco reglas:
 *
 *   1. hay al menos un traslape y al menos un hueco;
 *   2. tantos comprobantes sobrantes como huecos;
 *   3. ningún comprobante usa RANGO ni cubre varias cuotas (un rango mal
 *      escrito es otro problema y se arregla distinto);
 *   4. la plata no sobra: si lo que suman los comprobantes supera lo que valen
 *      las cuotas contadas, puede haber un pago duplicado de verdad;
 *   5. después de reasignar, las cuotas cubiertas quedan EXACTAS 1..contadas.
 *      Si no, se descarta la ficha entera.
 *
 * Reparto: por cada cuota pisada se conserva el comprobante MÁS NUEVO con su
 * número y se liberan los anteriores; los liberados se emparejan por fecha con
 * los huecos ordenados, porque un pago más viejo corresponde a una cuota más
 * temprana.
 */
export function proponerCorreccion(ficha: {
  contadas: number;
  recibos: ReciboRotulo[];
  valorDeCuota: (n: number) => number;
}): { cambios: Correccion[]; recibido: number; pactado: number } | { saltada: string } | null {
  const { contadas, recibos, valorDeCuota } = ficha;
  if (contadas <= 0) return null;

  // Los que nombran una cuota. Un abono de intereses no tiene número ni rango,
  // así que queda afuera solo.
  const deCuota = recibos.filter(
    (r) => r.nominal_installment_number != null || r.nominal_installment_range
  );
  if (deCuota.length === 0) return null;

  const porCuota = new Map<number, ReciboRotulo[]>();
  for (const r of deCuota) {
    if (r.nominal_installment_range) continue; // se valida en la regla 3
    const n = r.nominal_installment_number as number;
    porCuota.set(n, [...(porCuota.get(n) || []), r]);
  }

  const pisadas = [...porCuota.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([n]) => n)
    .sort((a, b) => a - b);
  if (pisadas.length === 0) return null;

  // Regla 3.
  if (deCuota.some((r) => r.nominal_installment_range || (r.installments_count || 1) > 1)) {
    return { saltada: "hay rangos o comprobantes de varias cuotas; se arregla distinto" };
  }

  const huecos: number[] = [];
  for (let n = 1; n <= contadas; n++) if (!porCuota.has(n)) huecos.push(n);

  // Regla 2.
  const sobrantes = pisadas.reduce((a, n) => a + (porCuota.get(n) as ReciboRotulo[]).length - 1, 0);
  if (huecos.length === 0 || sobrantes !== huecos.length) {
    return {
      saltada: `${sobrantes} comprobante(s) de sobra contra ${huecos.length} hueco(s); no es un rótulo corrido`,
    };
  }

  // Regla 4.
  let pactado = 0;
  for (let n = 1; n <= contadas; n++) pactado += valorDeCuota(n);
  const recibido = deCuota.reduce((a, r) => a + (r.amount_clp || 0), 0);
  const umbral = valorDeCuota(1) || 1;
  if (recibido - pactado >= umbral) {
    return {
      saltada: `los comprobantes suman más que las cuotas contadas; puede haber un pago duplicado de verdad`,
    };
  }

  // Reparto.
  const cuando = (r: ReciboRotulo) =>
    new Date(r.paid_at || r.processed_at || r.created_at || 0).getTime();
  const liberados: ReciboRotulo[] = [];
  for (const n of pisadas) {
    const orden = [...(porCuota.get(n) as ReciboRotulo[])].sort((a, b) => cuando(a) - cuando(b));
    liberados.push(...orden.slice(0, -1)); // todos menos el más nuevo
  }
  liberados.sort((a, b) => cuando(a) - cuando(b));
  const destinos = [...huecos].sort((a, b) => a - b);
  const propuesta = liberados.map((r, i) => ({ r, destino: destinos[i] }));

  // Regla 5: simular el resultado y exigir la serie exacta 1..contadas.
  const quedan = new Map<number, number>();
  for (const [n, l] of porCuota) quedan.set(n, l.length);
  for (const { r, destino } of propuesta) {
    const n = r.nominal_installment_number as number;
    quedan.set(n, (quedan.get(n) || 0) - 1);
    quedan.set(destino, (quedan.get(destino) || 0) + 1);
  }
  const cubiertas = [...quedan.entries()].filter(([, c]) => c > 0).map(([n]) => n);
  const serieOk =
    cubiertas.length === contadas &&
    cubiertas.every((n) => n >= 1 && n <= contadas) &&
    [...quedan.values()].every((c) => c <= 1);
  if (!serieOk) {
    return { saltada: `reasignar no deja la serie 1..${contadas} limpia` };
  }

  return {
    cambios: propuesta.map(({ r, destino }) => ({
      id: r.id,
      de: r.nominal_installment_number as number,
      a: destino,
    })),
    recibido,
    pactado,
  };
}

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
const dia = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : "—";

async function main() {
  const prisma = new PrismaClient();
  const APLICAR = process.argv.includes("--aplicar");

  try {
    const reservas = await prisma.reservation.findMany({
      where: { status: { in: ["active", "COMPLETED"] } },
      select: {
        id: true,
        name: true,
        last_name: true,
        installments_paid: true,
        installment_ranges: true,
        project: { select: { name: true } },
        lot: { select: { number: true, stage: true, valor_cuota: true } },
        receipts: {
          where: { status: "APPROVED", scope: "INSTALLMENT" },
          select: {
            id: true,
            amount_clp: true,
            installments_count: true,
            nominal_installment_number: true,
            nominal_installment_range: true,
            paid_at: true,
            processed_at: true,
            created_at: true,
          },
        },
      },
    });

    const cambios: Correccion[] = [];
    const saltadas: string[] = [];
    let fichasOk = 0;

    for (const res of reservas) {
      const nombre = `${res.name || ""} ${res.last_name || ""}`.trim();
      const lote = `${res.lot?.number ?? "—"}${res.lot?.stage ? "-" + res.lot.stage : ""}`;
      const quien = `${nombre} (${res.project?.name}, lote ${lote})`;

      const r = proponerCorreccion({
        contadas: res.installments_paid || 0,
        recibos: res.receipts,
        valorDeCuota: (n) =>
          getNominalInstallmentAmount(res.installment_ranges, n, res.lot?.valor_cuota || 0),
      });
      if (r === null) continue;
      if ("saltada" in r) {
        saltadas.push(`SALTADA  ${quien} · ${r.saltada}`);
        continue;
      }

      fichasOk++;
      const porId = new Map(res.receipts.map((x) => [x.id, x]));
      console.log(`\n${quien}`);
      console.log(
        `   ${res.receipts.length} comprobantes por ${clp(r.recibido)} · ${res.installments_paid} cuotas contadas valen ${clp(r.pactado)}`
      );
      for (const c of r.cambios) {
        const rec = porId.get(c.id);
        console.log(
          `   ${c.id.slice(0, 8)} · pagado ${dia(rec?.paid_at || rec?.processed_at)} · ${clp(rec?.amount_clp || 0)} · cuota ${c.de} -> cuota ${c.a}`
        );
      }
      cambios.push(...r.cambios);
    }

    console.log(
      `\n\nFichas a corregir: ${fichasOk}   ·   Comprobantes: ${cambios.length}   ·   Saltadas: ${saltadas.length}\n`
    );
    for (const s of saltadas) console.log("  " + s);

    if (!APLICAR) {
      console.log(
        "\nSimulación. No se escribió nada. Volvé a correr con --aplicar cuando la lista esté revisada."
      );
      return;
    }

    let hechos = 0;
    for (const c of cambios) {
      await prisma.paymentReceipt.update({
        where: { id: c.id },
        data: { nominal_installment_number: c.a },
      });
      hechos++;
    }
    console.log(`\nComprobantes re-rotulados: ${hechos}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Solo corre cuando se lo invoca directo; importarlo para probar no dispara nada.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
