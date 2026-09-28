"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { memoryCache } from "@/lib/cache";
import { revalidatePath } from "next/cache";
import { detectarFichasFantasma } from "@/lib/fichasDuplicadas";
import {
  aplicarCambios,
  cuadrarPlan,
  fichaPlanDesdeReserva,
  ETIQUETA_CAMPO,
  LOMAS_SLUG,
  type CampoCorregible,
  type FichaPlan,
} from "@/lib/cuadrePlan";

/**
 * Correcciones desde el Cuadre de Caja.
 *
 * Solo se tocan los montos del plan: pie, reserva (ficha o lote), última cuota,
 * valor total y valor cuota. Ninguno entra al cálculo de la mora, que se cuenta
 * por días de atraso y cuotas pendientes, así que la mora no se mueve. Lo que SÍ
 * se mueve es el saldo, y por eso todo pasa primero por la vista previa.
 *
 * La cantidad de cuotas, las cuotas pagadas y los tramos quedan fuera a
 * propósito: esos sí mueven la mora y se siguen editando desde la ficha.
 */

type Cambios = Partial<Record<CampoCorregible, number>>;

const CAMPOS: CampoCorregible[] = ["pie", "reserva_ficha", "reserva_lote", "ultima_cuota", "valor_total", "valor_cuota"];

/** Los campos que viven en el lote y no en la ficha: los comparte quien tenga el mismo lote. */
const DEL_LOTE: CampoCorregible[] = ["reserva_lote", "valor_total", "valor_cuota"];

function clp(n: number): string {
  const signo = n < 0 ? "-" : "";
  return `${signo}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
}

function limpiar(cambios: Cambios): Cambios | string {
  const out: Cambios = {};
  for (const [k, v] of Object.entries(cambios || {})) {
    if (!CAMPOS.includes(k as CampoCorregible)) return `Campo no permitido: ${k}`;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) return `${ETIQUETA_CAMPO[k as CampoCorregible]}: el monto tiene que ser un entero en pesos, sin decimales.`;
    if (k === "valor_total" && n === 0) return "El valor total no puede quedar en $0.";
    out[k as CampoCorregible] = n;
  }
  if (Object.keys(out).length === 0) return "No hay nada que cambiar.";
  return out;
}

async function cargar(reservationId: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") return { error: "No autorizado" as const };

  const res = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      lot: true,
      project: { select: { slug: true } },
      receipts: { where: { status: "APPROVED" }, select: { scope: true, amount_clp: true, status: true } },
    },
  });
  if (!res) return { error: "Ficha no encontrada" as const };

  // Cada cuenta de postventa corrige solo su proyecto.
  if (Array.isArray(user.allowedProjects) && !user.allowedProjects.includes(res.project.slug)) {
    return { error: "Esta ficha es de un proyecto que tu cuenta no administra" as const };
  }

  const otrasDelLote = await prisma.reservation.count({
    where: { lot_id: res.lot_id, id: { not: res.id }, status: { in: ["active", "COMPLETED"] } },
  });

  return { user, res, ficha: fichaPlanDesdeReserva(res as any, res.project.slug), otrasDelLote };
}

function valorActual(f: FichaPlan, campo: CampoCorregible): number {
  switch (campo) {
    case "pie":
      return f.pieFicha || f.pieLote || 0;
    case "reserva_ficha":
      return f.reservaFicha || 0;
    case "reserva_lote":
      return f.reservaLote || 0;
    case "ultima_cuota":
      return f.ultimaCuotaFicha || f.ultimaCuotaLote || 0;
    case "valor_total":
      return f.valorTotal;
    case "valor_cuota":
      return f.valorCuota;
  }
}

function comparar(ficha: FichaPlan, cambios: Cambios, otrasDelLote: number) {
  const antes = cuadrarPlan(ficha);
  const despues = cuadrarPlan(aplicarCambios(ficha, cambios));

  const lineas = (Object.keys(cambios) as CampoCorregible[]).map((campo) => ({
    campo,
    etiqueta: ETIQUETA_CAMPO[campo],
    antes: valorActual(ficha, campo),
    despues: cambios[campo]!,
  }));

  const avisos: string[] = [];
  const tocaLote = lineas.some((l) => DEL_LOTE.includes(l.campo));
  if (tocaLote && otrasDelLote > 0) {
    avisos.push(
      `El lote tiene ${otrasDelLote} ficha(s) más. Valor total, valor cuota y reserva del lote son del lote: el cambio les llega a todas.`
    );
  }
  if (ficha.projectSlug === LOMAS_SLUG && antes.saldoPanel !== despues.saldoPanel && despues.saldoPanel !== despues.saldoPortal) {
    avisos.push(
      `En Lomas el panel suma la reserva aparte del pie, así que el saldo del panel (y el {saldo} de WhatsApp y correo) queda en ${clp(
        despues.saldoPanel
      )} mientras no se corrija esa fórmula. El cliente en su portal ve ${clp(despues.saldoPortal)}.`
    );
  }
  avisos.push("La mora no cambia: se calcula por días de atraso, no por estos montos.");

  const resumen = (r: typeof antes) => ({
    estado: r.estado,
    diferencia: r.diferencia,
    lectura: r.lectura,
    saldoPortal: r.saldoPortal,
    saldoPanel: r.saldoPanel,
    saldoSegunRegla: r.saldoSegunRegla,
    hallazgos: r.hallazgos.map((h) => h.titulo),
  });

  return { lineas, antes: resumen(antes), despues: resumen(despues), avisos };
}

export async function previsualizarCorreccionCuadre(reservationId: string, cambios: Cambios) {
  try {
    const limpios = limpiar(cambios);
    if (typeof limpios === "string") return { error: limpios };
    const c = await cargar(reservationId);
    if ("error" in c) return { error: c.error };
    return { ok: true as const, ...comparar(c.ficha, limpios, c.otrasDelLote) };
  } catch (e) {
    console.error("previsualizarCorreccionCuadre:", e);
    return { error: "No se pudo calcular la vista previa" };
  }
}

export async function aplicarCorreccionCuadre(reservationId: string, cambios: Cambios) {
  try {
    const limpios = limpiar(cambios);
    if (typeof limpios === "string") return { error: limpios };
    const c = await cargar(reservationId);
    if ("error" in c) return { error: c.error };
    const { user, res, ficha, otrasDelLote } = c;

    // Se recalcula acá y no se confía en la vista previa del navegador: si otro
    // cambió la ficha entremedio, el registro dice lo que de verdad pasó.
    const comp = comparar(ficha, limpios, otrasDelLote);
    const lineas = comp.lineas.filter((l) => l.antes !== l.despues);
    if (lineas.length === 0) return { error: "Los montos ya tienen esos valores." };

    const lotData: Record<string, number> = {};
    const resData: Record<string, unknown> = {};
    for (const l of lineas) {
      switch (l.campo) {
        case "pie":
          // Igual que updateClientFinancials: el pie va en la ficha y en el lote.
          resData.pie = l.despues;
          lotData.pie = l.despues;
          break;
        case "reserva_ficha":
          resData.reservation_price = l.despues;
          break;
        case "reserva_lote":
          lotData.reservation_amount_clp = l.despues;
          break;
        case "ultima_cuota":
          resData.last_installment_value = l.despues;
          break;
        case "valor_total":
          lotData.price_total_clp = l.despues;
          break;
        case "valor_cuota":
          lotData.valor_cuota = l.despues;
          break;
      }
    }

    const texto = [
      "Corrección desde Cuadre de Caja:",
      ...lineas.map((l) => `- ${l.etiqueta}: ${clp(l.antes)} -> ${clp(l.despues)}`),
      `- Cuadre: ${comp.antes.estado} -> ${comp.despues.estado} (diferencia ${clp(comp.antes.diferencia)} -> ${clp(
        comp.despues.diferencia
      )})`,
      `- Saldo en el portal del cliente: ${clp(comp.antes.saldoPortal)} -> ${clp(comp.despues.saldoPortal)}`,
      `- Saldo en el panel: ${clp(comp.antes.saldoPanel)} -> ${clp(comp.despues.saldoPanel)}`,
    ].join("\n");

    let notas: any[] = [];
    try {
      notas = JSON.parse(res.notes || "[]");
      if (!Array.isArray(notas)) notas = [];
    } catch {
      notas = [];
    }
    notas.unshift({
      id: Math.random().toString(36).substring(7),
      text: texto,
      type: "Registro",
      date: new Date().toISOString(),
      author: user.name || user.email || "Administrador",
    });
    resData.notes = JSON.stringify(notas);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
      if (Object.keys(lotData).length > 0) {
        await tx.lot.update({ where: { id: res.lot_id }, data: lotData });
      }
      await tx.reservation.update({ where: { id: res.id }, data: resData });
      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entity: "Reservation",
          entity_id: res.id,
          details: `${texto}\nCliente: ${res.name} ${res.last_name || ""} - Lote #${res.lot.number}${
            res.lot.stage ? ` (e${res.lot.stage})` : ""
          }`,
          user_id: user.id,
          user_email: user.email,
        },
      });
    });

    memoryCache.deleteByPrefix("postventa_");
    memoryCache.deleteByPrefix("user_data_");
    revalidatePath("/admin/cuadre-caja");
    revalidatePath("/admin/clients");

    return { ok: true as const, antes: comp.antes, despues: comp.despues };
  } catch (e) {
    console.error("aplicarCorreccionCuadre:", e);
    return { error: "No se pudo guardar la corrección" };
  }
}

/**
 * Pie anotado sin la reserva, corregido de una vez (pedido de postventa,
 * 27-09-2026). Solo entra la ficha que cumple las TRES condiciones, revisadas
 * en el servidor al momento de guardar y no en el navegador:
 *
 *   1. Al pie le falta exactamente la reserva: reserva + pie + cuotas = total.
 *   2. Con pie + reserva el plan cierra exacto con el valor total.
 *   3. Lo que le queda por pagar al cliente coincide al peso con la suma de sus
 *      cuotas pendientes (para un terminado, que quede en cero).
 *
 * La que no cumple queda fuera y se revisa a mano. Cada ficha se guarda por el
 * mismo camino que la corrección individual: nota en la ficha y Auditoría.
 */
function correccionSinReservaSegura(ficha: FichaPlan) {
  const antes = cuadrarPlan(ficha);
  const c = antes.correccionPie;
  if (!c || c.tipo !== "RESERVA_AFUERA") return null;
  if (c.pieNuevo !== antes.pie + antes.reserva.usada) return null;

  const despues = cuadrarPlan(aplicarCambios(ficha, { pie: c.pieNuevo }));
  if (despues.diferencia !== 0 || despues.lectura === "NO_CIERRA") return null;
  const terminada = ficha.status === "COMPLETED";
  const calza = terminada
    ? despues.saldoSegunRegla === 0
    : despues.saldoSegunRegla === despues.cuotasPendientesSuman && despues.saldoPortal === despues.saldoSegunRegla;
  if (!calza) return null;

  return { pieNuevo: c.pieNuevo, antes, despues };
}

async function fichasDeLaCuenta(user: any, soloIds?: string[]) {
  const whereProyecto: any = { status: "ACTIVE" };
  if (Array.isArray(user.allowedProjects)) whereProyecto.slug = { in: user.allowedProjects };
  const proyectos = await prisma.project.findMany({ where: whereProyecto, select: { id: true, slug: true } });
  const slug = new Map(proyectos.map((p) => [p.id, p.slug]));

  const reservas = await prisma.reservation.findMany({
    where: {
      project_id: { in: proyectos.map((p) => p.id) },
      status: { in: ["active", "COMPLETED"] },
      ...(soloIds ? { id: { in: soloIds } } : {}),
    },
    include: {
      lot: true,
      receipts: { where: { status: "APPROVED" }, select: { scope: true, amount_clp: true, status: true } },
    },
  });
  // Fuera las fichas fantasma del puente Lomas y los lotes con más de una
  // ficha: el pie también se escribe en el lote, y ahí le llegaría a la otra.
  // Esos se corrigen a mano, de a uno.
  const porLote = await prisma.reservation.groupBy({
    by: ["lot_id"],
    where: { lot_id: { in: reservas.map((r) => r.lot_id) }, status: { in: ["active", "COMPLETED"] } },
    _count: { _all: true },
  });
  const compartido = new Set(porLote.filter((g) => g._count._all > 1).map((g) => g.lot_id));
  const fantasmas = detectarFichasFantasma(
    reservas.map((r) => ({
      id: r.id,
      lotId: r.lot_id,
      rut: r.rut,
      clientEmail: r.email,
      buyer: { id: r.user_id },
      paidCuotas: r.installments_paid,
      internalStatus: r.status,
    }))
  );

  return reservas
    .filter((r) => (r.lot?.cuotas || 0) > 0 && !compartido.has(r.lot_id) && !fantasmas.has(r.id))
    .map((r) => ({ res: r, ficha: fichaPlanDesdeReserva(r as any, slug.get(r.project_id) || "") }));
}

export async function previsualizarPiesSinReserva() {
  try {
    const session = await auth();
    const user = session?.user as any;
    if (!session?.user || user?.role !== "ADMIN") return { ok: false as const, error: "No autorizado" };

    const filas = [];
    for (const { res, ficha } of await fichasDeLaCuenta(user)) {
      const ok = correccionSinReservaSegura(ficha);
      if (!ok) continue;
      filas.push({
        id: res.id,
        cliente: `${res.name || ""} ${res.last_name || ""}`.trim(),
        lote: `${res.lot.number}${res.lot.stage ? ` · ${res.lot.stage}` : ""}`,
        proyecto: ficha.projectSlug,
        pieAntes: ok.antes.pie,
        pieDespues: ok.pieNuevo,
        reserva: ok.antes.reserva.usada,
        portalAntes: ok.antes.saldoPortal,
        portalDespues: ok.despues.saldoPortal,
        panelAntes: ok.antes.saldoPanel,
        panelDespues: ok.despues.saldoPanel,
      });
    }
    filas.sort((a, b) => a.proyecto.localeCompare(b.proyecto) || a.cliente.localeCompare(b.cliente, "es"));
    return { ok: true as const, filas };
  } catch (e) {
    console.error("previsualizarPiesSinReserva:", e);
    return { ok: false as const, error: "No se pudo armar la lista" };
  }
}

/** Corrige las fichas de la lista que postventa vio, re-verificando cada una. */
export async function corregirPiesSinReserva(ids: string[]) {
  try {
    const session = await auth();
    const user = session?.user as any;
    if (!session?.user || user?.role !== "ADMIN") return { ok: false as const, error: "No autorizado" };
    if (!Array.isArray(ids) || ids.length === 0) return { ok: false as const, error: "No hay fichas para corregir." };

    let corregidas = 0;
    const saltadas: string[] = [];
    for (const { res, ficha } of await fichasDeLaCuenta(user, ids)) {
      // Se vuelve a verificar: si la ficha cambió desde la vista previa y ya no
      // cumple las tres condiciones, no se toca.
      const ok = correccionSinReservaSegura(ficha);
      if (!ok) {
        saltadas.push(`${res.name} ${res.last_name || ""}`.trim());
        continue;
      }
      const r = await aplicarCorreccionCuadre(res.id, { pie: ok.pieNuevo });
      if ("ok" in r) corregidas++;
      else saltadas.push(`${res.name} ${res.last_name || ""}`.trim());
    }
    return { ok: true as const, corregidas, saltadas };
  } catch (e) {
    console.error("corregirPiesSinReserva:", e);
    return { ok: false as const, error: "No se pudo completar la corrección" };
  }
}
