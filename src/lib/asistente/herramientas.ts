import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computePostventaData } from "@/lib/postventaData";
import { memoryCache } from "@/lib/cache";
import { getInstallmentDueDate, getNominalInstallmentAmount } from "@/lib/financials";
import { SCOPE_LABELS } from "@/lib/receiptDocs";

/**
 * Herramientas del asistente de postventa. SOLO LECTURA: ninguna escribe en la
 * base. Los saldos, la mora y el estado de cada ficha salen de
 * computePostventaData, el mismo calculo del panel de Clientes, para que el
 * asistente nunca diga una cifra distinta a la que ve postventa en pantalla.
 *
 * El alcance por proyecto (allowed_projects) se revisa aca, en codigo, y no en
 * el prompt: el modelo no puede pedir datos de un proyecto que la cuenta no ve.
 */

export type UsuarioAsistente = {
  id: string;
  email?: string | null;
  allowedProjects: string[] | null;
};

type Proyecto = { id: string; slug: string; name: string };
type Cartera = Exclude<Awaited<ReturnType<typeof computePostventaData>>, { error: string }>;
/** Una fila de la cartera, tal como la arma computePostventaData. */
type Ficha = Cartera["data"][number] & { isGhostDuplicate?: boolean };

const TTL_CARTERA = 120; // segundos
// Empieza con "postventa_" a proposito: invalidatePostventaCache() (que corre al
// aprobar pagos y editar fichas) la borra junto con el resto.
const claveCartera = (slug: string) => `postventa_asistente_${slug}`;

async function cartera(slug: string): Promise<Ficha[]> {
  const enCache = memoryCache.get(claveCartera(slug));
  if (enCache) return enCache;
  const r = await computePostventaData(slug);
  if ("error" in r) throw new Error(r.error);
  memoryCache.set(claveCartera(slug), r.data, TTL_CARTERA);
  return r.data;
}

async function proyectosPermitidos(u: UsuarioAsistente): Promise<Proyecto[]> {
  return prisma.project.findMany({
    where: {
      status: "ACTIVE",
      ...(Array.isArray(u.allowedProjects) ? { slug: { in: u.allowedProjects } } : {}),
    },
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

const normalizar = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Acepta slug o nombre ("arena y sol", "Lomas"). Sin proyecto = todos los permitidos. */
async function resolverProyectos(u: UsuarioAsistente, proyecto?: string | null): Promise<Proyecto[]> {
  const todos = await proyectosPermitidos(u);
  if (!proyecto) return todos;
  const q = normalizar(proyecto);
  const hallados = todos.filter(
    (p) => normalizar(p.slug) === q || normalizar(p.name).includes(q) || normalizar(p.slug).includes(q.replace(/\s+/g, "-"))
  );
  if (hallados.length === 0) {
    throw new Error(
      `No encontré el proyecto "${proyecto}" entre los que puede ver esta cuenta: ${todos.map((p) => p.name).join(", ") || "ninguno"}.`
    );
  }
  return hallados;
}

const fmtFecha = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Santiago",
});
const fecha = (d: Date | string | null | undefined) => (d ? fmtFecha.format(new Date(d)).replace(/\//g, "-") : null);

const ESTADOS: Record<string, string> = {
  OK: "al día",
  UPCOMING: "cuota vence en los próximos 5 días",
  GRACE: "en período de gracia",
  LATE: "en mora",
  FROZEN: "mora congelada",
  COMPLETED: "pagado completo",
};

function filaCorta(c: Ficha, p: Proyecto) {
  return {
    reserva_id: c.id,
    cliente: c.clientName,
    rut: c.rut || null,
    proyecto: p.name,
    lote: c.lotNumber,
    etapa: c.lotStage ?? null,
    estado: ESTADOS[c.status] || c.status,
    saldo_pendiente: c.pendingBalance,
    cuotas_pagadas: `${c.paidCuotas} de ${c.totalCuotas}`,
    proxima_cuota: c.nextInstallmentNumber
      ? { numero: c.nextInstallmentNumber, vence: fecha(c.nextDueDate), monto: c.currentInstallmentAmount }
      : null,
    mora_actual: c.penaltyAmount,
    dias_atraso: c.lateDays,
    ...(c.isGhostDuplicate ? { aviso: "ficha duplicada del puente Lomas; no es la vigente" } : {}),
  };
}

/** Busca dentro de las carteras ya filtradas por proyecto permitido. */
async function fichaPorId(u: UsuarioAsistente, reservaId: string): Promise<{ c: Ficha; p: Proyecto }> {
  const res = await prisma.reservation.findUnique({
    where: { id: reservaId },
    select: { project: { select: { id: true, slug: true, name: true } } },
  });
  const permitidos = await proyectosPermitidos(u);
  const p = res && permitidos.find((x) => x.slug === res.project.slug);
  if (!p) throw new Error("No encontré esa ficha entre los proyectos que puede ver esta cuenta.");
  const c = (await cartera(p.slug)).find((f) => f.id === reservaId);
  if (!c) throw new Error("La ficha existe pero no está activa (ni vigente ni pagada completa).");
  return { c, p };
}

// ---------------------------------------------------------------------------
// Herramientas
// ---------------------------------------------------------------------------

const sinEntrada = z.object({}).strict();

const entradaBuscar = z.object({
  texto: z.string().min(1).max(120),
  proyecto: z.string().max(80).optional(),
});

const entradaVerCliente = z.object({ reserva_id: z.string().uuid() });

const ESTADO_FILTRO = ["en_mora", "en_gracia", "vence_pronto", "al_dia", "congelado", "pagado"] as const;
const FILTRO_A_STATUS: Record<(typeof ESTADO_FILTRO)[number], string> = {
  en_mora: "LATE",
  en_gracia: "GRACE",
  vence_pronto: "UPCOMING",
  al_dia: "OK",
  congelado: "FROZEN",
  pagado: "COMPLETED",
};

const entradaPorEstado = z.object({
  estado: z.enum(ESTADO_FILTRO),
  proyecto: z.string().max(80).optional(),
  limite: z.number().int().min(1).max(60).optional(),
});

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "usa el formato AAAA-MM-DD");
const entradaVencen = z.object({
  desde: fechaISO,
  hasta: fechaISO,
  proyecto: z.string().max(80).optional(),
});

const entradaProyectoOpcional = z.object({ proyecto: z.string().max(80).optional() });

async function listarProyectos(u: UsuarioAsistente) {
  const ps = await proyectosPermitidos(u);
  return { proyectos: ps.map((p) => ({ nombre: p.name, slug: p.slug })) };
}

async function buscarClientes(u: UsuarioAsistente, entrada: z.infer<typeof entradaBuscar>) {
  const ps = await resolverProyectos(u, entrada.proyecto);
  const q = normalizar(entrada.texto);
  // "lote 37", "lote n° 37", "lt37" o solo "37". El numero tiene que traer un
  // digito: si no, "luis" o "lorena" se leerian como lote.
  const loteBuscado = q.match(/^(?:lote|lt)\D*(\S*\d\S*)$/)?.[1] ?? (/^\d{1,4}[a-z]?$/.test(q) ? q : null);
  const rutBuscado = q.replace(/[^0-9k]/g, "");
  const pareceRut = rutBuscado.length >= 6 && /^[\d.\-\sk]+$/.test(q);
  const palabras = q.split(/\s+/).filter(Boolean);

  const hallados: ReturnType<typeof filaCorta>[] = [];
  for (const p of ps) {
    for (const c of await cartera(p.slug)) {
      const rut = normalizar(c.rut).replace(/[^0-9k]/g, "");
      const pajar = normalizar(
        [c.clientName, c.clientEmail, c.secondaryEmail, c.clientPhone, ...c.coOwners.map((o) => o.name)].join(" ")
      );
      const coincide =
        (loteBuscado && normalizar(c.lotNumber) === loteBuscado) ||
        (pareceRut && rut.includes(rutBuscado)) ||
        (!pareceRut && !loteBuscado && palabras.every((w) => pajar.includes(w)));
      if (coincide) hallados.push(filaCorta(c, p));
    }
  }
  return {
    total_encontrados: hallados.length,
    clientes: hallados.slice(0, 15),
    ...(hallados.length > 15 ? { nota: "Hay más resultados; pide un dato más preciso (RUT, lote o proyecto)." } : {}),
  };
}

async function verCliente(u: UsuarioAsistente, entrada: z.infer<typeof entradaVerCliente>) {
  const { c, p } = await fichaPorId(u, entrada.reserva_id);

  // Proximas cuotas: misma regla que el panel (next_payment_date solo mueve la vigente).
  const proximas: { numero: number; vence: string | null; monto: number }[] = [];
  if (c.installment_start_date) {
    for (let n = c.paidCuotas + 1; n <= c.totalCuotas && proximas.length < 6; n++) {
      const vence =
        n === c.paidCuotas + 1 && c.next_payment_date
          ? new Date(c.next_payment_date)
          : getInstallmentDueDate(c.installment_start_date, n, c.due_day);
      proximas.push({ numero: n, vence: fecha(vence), monto: getNominalInstallmentAmount(c.installment_ranges, n, c.valor_cuota) });
    }
  }

  const [pagos, enRevision] = await Promise.all([
    prisma.paymentReceipt.findMany({
      where: { reservation_id: c.id, status: "APPROVED" },
      orderBy: { created_at: "desc" },
      take: 10,
      select: {
        amount_clp: true, scope: true, paid_at: true, processed_at: true,
        nominal_installment_number: true, nominal_installment_range: true,
      },
    }),
    prisma.paymentReceipt.findMany({
      where: { reservation_id: c.id, status: "PENDING" },
      orderBy: { created_at: "desc" },
      select: { amount_clp: true, scope: true, created_at: true },
    }),
  ]);

  return {
    ...filaCorta(c, p),
    contacto: {
      correo: c.clientEmail || null,
      telefono: c.clientPhone || null,
      co_titulares: c.coOwners.map((o) => ({ nombre: o.name, rut: o.rut, correo: o.email, telefono: o.phone })),
    },
    asesor: c.advisor || null,
    plan: {
      precio_total: c.totalToPay,
      pie: c.pieAmount,
      estado_pie: c.pieStatus,
      valor_cuota: c.valor_cuota,
      total_pagado: c.totalPaid,
      saldo_pendiente: c.pendingBalance,
      dia_de_vencimiento: c.due_day,
      dias_de_gracia: c.grace_days,
      multa_diaria: c.daily_penalty,
      modo_de_mora: c.penalty_mode,
      inicio_cuotas: fecha(c.installment_start_date),
    },
    mora: {
      total: c.penaltyAmount,
      dias_atraso: c.lateDays,
      cuotas_vencidas: c.overdueInstallments.map((o) => ({
        numero: o.number,
        mes: o.monthName,
        vencio: fecha(o.dueDate),
        monto_cuota: o.baseAmount,
        interes: o.penaltyAmount,
      })),
    },
    proximas_cuotas: proximas,
    ultimos_pagos_aprobados: pagos.map((r) => ({
      monto: r.amount_clp,
      tipo: SCOPE_LABELS[r.scope] || r.scope,
      cuota: r.nominal_installment_range || r.nominal_installment_number || null,
      fecha_pago: fecha(r.paid_at || r.processed_at),
    })),
    comprobantes_en_revision: enRevision.map((r) => ({
      monto: r.amount_clp,
      tipo: SCOPE_LABELS[r.scope] || r.scope,
      enviado: fecha(r.created_at),
    })),
    portal: { activo: !!c.portal_active, ultimo_ingreso: fecha(c.last_login_at) },
    observacion: c.observation ? String(c.observation).slice(0, 400) : null,
  };
}

async function clientesPorEstado(u: UsuarioAsistente, entrada: z.infer<typeof entradaPorEstado>) {
  const ps = await resolverProyectos(u, entrada.proyecto);
  const status = FILTRO_A_STATUS[entrada.estado];
  const filas: (ReturnType<typeof filaCorta> & { _orden: number })[] = [];
  for (const p of ps) {
    for (const c of await cartera(p.slug)) {
      if (c.isGhostDuplicate || c.status !== status) continue;
      const orden =
        status === "LATE" ? -c.penaltyAmount : c.nextDueDate ? new Date(c.nextDueDate).getTime() : Number.MAX_SAFE_INTEGER;
      filas.push({ ...filaCorta(c, p), _orden: orden });
    }
  }
  filas.sort((a, b) => a._orden - b._orden);
  const limite = entrada.limite ?? 30;
  return {
    estado: ESTADOS[status],
    total: filas.length,
    suma_saldo_pendiente: filas.reduce((s, f) => s + (f.saldo_pendiente || 0), 0),
    suma_mora: filas.reduce((s, f) => s + (f.mora_actual || 0), 0),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    clientes: filas.slice(0, limite).map(({ _orden, ...f }) => f),
    ...(filas.length > limite ? { nota: `Se muestran ${limite} de ${filas.length}.` } : {}),
  };
}

async function cuotasQueVencen(u: UsuarioAsistente, entrada: z.infer<typeof entradaVencen>) {
  const ps = await resolverProyectos(u, entrada.proyecto);
  // Fechas de vencimiento quedan a las 12:00 UTC; el rango se toma por dia completo.
  const desde = new Date(`${entrada.desde}T00:00:00Z`).getTime();
  const hasta = new Date(`${entrada.hasta}T23:59:59Z`).getTime();
  if (hasta < desde) throw new Error("'hasta' es anterior a 'desde'.");
  const filas: (ReturnType<typeof filaCorta> & { _t: number })[] = [];
  for (const p of ps) {
    for (const c of await cartera(p.slug)) {
      if (c.isGhostDuplicate || c.status === "COMPLETED" || !c.nextDueDate) continue;
      const t = new Date(c.nextDueDate).getTime();
      if (t >= desde && t <= hasta) filas.push({ ...filaCorta(c, p), _t: t });
    }
  }
  filas.sort((a, b) => a._t - b._t);
  return {
    total: filas.length,
    suma_cuotas: filas.reduce((s, f) => s + (f.proxima_cuota?.monto || 0), 0),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    clientes: filas.slice(0, 60).map(({ _t, ...f }) => f),
    nota: "Solo cuenta la próxima cuota impaga de cada cliente.",
  };
}

async function resumenCartera(u: UsuarioAsistente, entrada: z.infer<typeof entradaProyectoOpcional>) {
  const ps = await resolverProyectos(u, entrada.proyecto);
  const proyectos = [];
  for (const p of ps) {
    const reales = (await cartera(p.slug)).filter((c) => !c.isGhostDuplicate);
    const cuenta = (s: string) => reales.filter((c) => c.status === s).length;
    proyectos.push({
      proyecto: p.name,
      fichas: reales.length,
      al_dia: cuenta("OK"),
      vence_pronto: cuenta("UPCOMING"),
      en_gracia: cuenta("GRACE"),
      en_mora: cuenta("LATE"),
      congelados: cuenta("FROZEN"),
      pagados_completos: cuenta("COMPLETED"),
      mora_total: reales.reduce((s, c) => s + (c.penaltyAmount || 0), 0),
      saldo_por_cobrar: reales.reduce((s, c) => s + Math.max(0, c.pendingBalance || 0), 0),
    });
  }
  return { proyectos };
}

async function comprobantesPorRevisar(u: UsuarioAsistente, entrada: z.infer<typeof entradaProyectoOpcional>) {
  const ps = await resolverProyectos(u, entrada.proyecto);
  const where = { status: "PENDING", reservation: { project_id: { in: ps.map((p) => p.id) } } };
  const [total, filas] = await Promise.all([
    prisma.paymentReceipt.count({ where }),
    prisma.paymentReceipt.findMany({
      where,
      orderBy: { created_at: "asc" },
      take: 30,
      select: {
        amount_clp: true, scope: true, created_at: true, installments_count: true,
        reservation: { select: { id: true, name: true, last_name: true, project: { select: { name: true } } } },
        lot: { select: { number: true } },
      },
    }),
  ]);
  return {
    total_en_bandeja: total,
    comprobantes: filas.map((r) => ({
      reserva_id: r.reservation.id,
      cliente: [r.reservation.name, r.reservation.last_name && r.reservation.last_name !== "null" ? r.reservation.last_name : ""]
        .join(" ")
        .trim(),
      proyecto: r.reservation.project.name,
      lote: r.lot.number,
      monto: r.amount_clp,
      tipo: SCOPE_LABELS[r.scope] || r.scope,
      cuotas_que_dice_pagar: r.installments_count,
      enviado: fecha(r.created_at),
    })),
    nota: "Ordenados del más antiguo al más nuevo. Se aprueban o rechazan en Bandeja de Pagos.",
  };
}

// ---------------------------------------------------------------------------
// Definiciones para la API y despacho
// ---------------------------------------------------------------------------

const propProyecto = {
  type: "string",
  description: "Nombre o slug del proyecto. Omitir para buscar en todos los que ve la cuenta.",
} as const;

export const DEFINICIONES: Anthropic.Tool[] = [
  {
    name: "listar_proyectos",
    description: "Lista los proyectos que puede ver la cuenta de postventa que está usando el asistente.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "buscar_clientes",
    description:
      "Busca fichas de clientes por nombre, apellido, RUT, número de lote ('lote 37' o '37'), correo o teléfono. " +
      "Devuelve un resumen por ficha con su reserva_id. Úsala antes de ver_cliente cuando no tengas el reserva_id.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Lo que se busca, tal como lo escribió el usuario." },
        proyecto: propProyecto,
      },
      required: ["texto"],
      additionalProperties: false,
    },
  },
  {
    name: "ver_cliente",
    description:
      "Detalle completo de una ficha: contacto, plan de pago, saldo, mora con sus cuotas vencidas, próximas 6 cuotas con fecha y monto, " +
      "últimos 10 pagos aprobados, comprobantes en revisión y acceso al portal.",
    input_schema: {
      type: "object",
      properties: { reserva_id: { type: "string", description: "reserva_id que devolvió otra herramienta." } },
      required: ["reserva_id"],
      additionalProperties: false,
    },
  },
  {
    name: "clientes_por_estado",
    description:
      "Lista los clientes en un estado de cobranza. en_mora sale ordenado por mayor mora; el resto por fecha de la próxima cuota. " +
      "Incluye el total de clientes y las sumas de saldo y mora.",
    input_schema: {
      type: "object",
      properties: {
        estado: { type: "string", enum: [...ESTADO_FILTRO] },
        proyecto: propProyecto,
        limite: { type: "integer", minimum: 1, maximum: 60, description: "Cuántos listar (por defecto 30)." },
      },
      required: ["estado"],
      additionalProperties: false,
    },
  },
  {
    name: "cuotas_que_vencen",
    description: "Clientes cuya próxima cuota impaga vence entre dos fechas (incluidas). Útil para 'quién paga esta semana'.",
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "AAAA-MM-DD" },
        hasta: { type: "string", description: "AAAA-MM-DD" },
        proyecto: propProyecto,
      },
      required: ["desde", "hasta"],
      additionalProperties: false,
    },
  },
  {
    name: "resumen_cartera",
    description: "Contadores por proyecto: fichas al día, en gracia, en mora, congeladas y pagadas, más mora total y saldo por cobrar.",
    input_schema: { type: "object", properties: { proyecto: propProyecto }, additionalProperties: false },
  },
  {
    name: "comprobantes_por_revisar",
    description: "Comprobantes que esperan aprobación en la Bandeja de Pagos (los 30 más antiguos y el total).",
    input_schema: { type: "object", properties: { proyecto: propProyecto }, additionalProperties: false },
  },
];

export async function ejecutarHerramienta(
  nombre: string,
  entradaCruda: unknown,
  usuario: UsuarioAsistente
): Promise<unknown> {
  switch (nombre) {
    case "listar_proyectos":
      sinEntrada.parse(entradaCruda ?? {});
      return listarProyectos(usuario);
    case "buscar_clientes":
      return buscarClientes(usuario, entradaBuscar.parse(entradaCruda));
    case "ver_cliente":
      return verCliente(usuario, entradaVerCliente.parse(entradaCruda));
    case "clientes_por_estado":
      return clientesPorEstado(usuario, entradaPorEstado.parse(entradaCruda));
    case "cuotas_que_vencen":
      return cuotasQueVencen(usuario, entradaVencen.parse(entradaCruda));
    case "resumen_cartera":
      return resumenCartera(usuario, entradaProyectoOpcional.parse(entradaCruda ?? {}));
    case "comprobantes_por_revisar":
      return comprobantesPorRevisar(usuario, entradaProyectoOpcional.parse(entradaCruda ?? {}));
    default:
      throw new Error(`Herramienta desconocida: ${nombre}`);
  }
}
