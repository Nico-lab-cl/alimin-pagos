/**
 * Cuadre de Caja: ¿cierra el plan de pago de cada lote con su valor total?
 *
 * La regla la dio postventa (27-09-2026) y vale para TODOS los proyectos:
 *
 *     pie (con la reserva adentro) + cuotas pactadas (la última puede ser
 *     distinta) = valor total del lote, EXACTO al peso.
 *
 * La reserva no es un pago aparte: es parte de pago del pie. Si el pie es
 * $1.500.000 y la reserva $200.000, el cliente pagó $1.300.000 como pie.
 *
 * El problema es que las fichas no lo tienen detallado igual. Algunas guardan el
 * pie BRUTO ($1.500.000, reserva incluida) y otras NETO ($1.300.000, la reserva
 * por fuera). Por eso no se asume un formato: se prueban las dos lecturas y se
 * dice cuál calza.
 *
 * Los intereses quedan fuera a propósito. No son parte del valor del lote.
 *
 * Todo es de SOLO LECTURA y se calcula sobre datos ya cargados: acá no se
 * consulta ni se escribe nada. Las mismas funciones sirven para la tabla y para
 * la vista previa de una corrección, así que las dos dicen siempre lo mismo.
 */

export const LOMAS_SLUG = "lomas-del-mar";

/** Los datos de una ficha que entran al cuadre. */
export type FichaPlan = {
  projectSlug: string;
  status: string | null;
  /** lot.price_total_clp */
  valorTotal: number;
  /** lot.cuotas */
  cuotas: number;
  /** lot.valor_cuota */
  valorCuota: number;
  /** reservation.installment_ranges, tal cual viene de la base. */
  tramos: unknown;
  /** reservation.last_installment_value */
  ultimaCuotaFicha: number | null;
  /** lot.last_installment_amount */
  ultimaCuotaLote: number | null;
  /** reservation.pie */
  pieFicha: number | null;
  /** lot.pie */
  pieLote: number | null;
  pieStatus: string | null;
  /** reservation.reservation_price */
  reservaFicha: number | null;
  /** lot.reservation_amount_clp */
  reservaLote: number | null;
  installmentsPaid: number;
  extraPagado: number;
  pendingAmount: number;
  /** Comprobantes APROBADOS, con el scope real. */
  comprobantes: { scope: string; amount_clp: number }[];
};

export type Tramo = { desde: number; hasta: number; monto: number };

export function leerTramos(tramos: unknown): Tramo[] {
  let lista: unknown = tramos;
  if (typeof lista === "string") {
    try {
      lista = JSON.parse(lista);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return lista
    .map((r: Record<string, unknown>) => ({
      desde: Number(r?.from ?? r?.start ?? 0),
      hasta: Number(r?.to ?? r?.end ?? 0),
      monto: Number(r?.amount ?? r?.value ?? 0),
    }))
    .filter((t) => t.desde > 0 && t.hasta >= t.desde);
}

/**
 * Monto con que el SALDO cuenta la cuota n: su tramo, o si no el valor cuota del
 * lote. Es exactamente lo que suman `getFullPostventaData` y `actions/user.ts`,
 * que nunca miran la última cuota: por eso se separa del monto pactado.
 */
function montoQueCuentaElSaldo(tramos: Tramo[], n: number, valorCuota: number): number {
  const t = tramos.find((r) => n >= r.desde && n <= r.hasta);
  return t ? t.monto : valorCuota;
}

/** La última cuota que dice la ficha. 0 = no tiene una distinta. */
export function ultimaCuotaDeclarada(f: FichaPlan): number {
  return f.ultimaCuotaFicha || f.ultimaCuotaLote || 0;
}

/**
 * Monto PACTADO de la cuota n. Igual que el del saldo, salvo la última: si la
 * ficha declara una última cuota y ningún tramo la cubre, manda esa.
 */
export function montoPactado(f: FichaPlan, n: number): number {
  const tramos = leerTramos(f.tramos);
  const t = tramos.find((r) => n >= r.desde && n <= r.hasta);
  if (t) return t.monto;
  const ultima = ultimaCuotaDeclarada(f);
  if (n === f.cuotas && ultima > 0) return ultima;
  return f.valorCuota;
}

export function sumaCuotasPactadas(f: FichaPlan, desde = 1, hasta = f.cuotas): number {
  let s = 0;
  for (let n = desde; n <= hasta; n++) s += montoPactado(f, n);
  return s;
}

/** El pie que usa el saldo: el de la ficha, o si no el del lote. */
export function pieGuardado(f: FichaPlan): number {
  return f.pieFicha || f.pieLote || 0;
}

export type FuentesReserva = {
  ficha: number;
  lote: number;
  /** Suma de los comprobantes de reserva aprobados. null = no hay ninguno. */
  comprobante: number | null;
  /** La que se usa para cuadrar: comprobante, si no ficha, si no lote. */
  usada: number;
  usadaDe: "comprobante" | "ficha" | "lote" | "ninguna";
  /** Las fuentes que tienen dato no dicen lo mismo. */
  noCoinciden: boolean;
};

export function fuentesReserva(f: FichaPlan): FuentesReserva {
  const ficha = f.reservaFicha || 0;
  const lote = f.reservaLote || 0;
  const deReserva = f.comprobantes.filter((c) => c.scope === "RESERVA");
  const comprobante = deReserva.length > 0 ? deReserva.reduce((s, c) => s + (c.amount_clp || 0), 0) : null;

  let usada = 0;
  let usadaDe: FuentesReserva["usadaDe"] = "ninguna";
  if (comprobante !== null && comprobante > 0) {
    usada = comprobante;
    usadaDe = "comprobante";
  } else if (ficha > 0) {
    usada = ficha;
    usadaDe = "ficha";
  } else if (lote > 0) {
    usada = lote;
    usadaDe = "lote";
  }

  // Un 0 en la ficha es el valor por defecto, no un dato: no se compara.
  const conDato = [ficha, lote, comprobante ?? 0].filter((v) => v > 0);
  const noCoinciden = new Set(conDato).size > 1;

  return { ficha, lote, comprobante, usada, usadaDe, noCoinciden };
}

/**
 * Cómo está guardado el pie, según cuál de las dos lecturas cierra con el total.
 *   BRUTO       pie + cuotas = total: la reserva ya está adentro del pie. Es la regla.
 *   NETO        reserva + pie + cuotas = total: el pie está guardado sin la reserva.
 *   SIN_RESERVA no hay reserva, las dos lecturas son la misma y cierra.
 *   NO_CIERRA   ninguna de las dos da el total.
 */
export type LecturaPie = "BRUTO" | "NETO" | "SIN_RESERVA" | "NO_CIERRA";

export type Sugerencia = {
  campo: CampoCorregible;
  valor: number;
  motivo: string;
  /** La primera que calza con un patrón conocido. */
  probable: boolean;
};

export type EstadoCuadre = "DESCUADRA" | "REVISAR" | "CUADRA";

export type Hallazgo = { tipo: EstadoCuadre; titulo: string; detalle: string };

export type ResultadoCuadre = {
  estado: EstadoCuadre;
  lectura: LecturaPie;
  hallazgos: Hallazgo[];
  sugerencias: Sugerencia[];

  valorTotal: number;
  pie: number;
  /** El pie con la reserva adentro, según la lectura. */
  pieBruto: number;
  /** Lo que el cliente pagó como pie, descontada la reserva. */
  pieNeto: number;
  reserva: FuentesReserva;
  cuotas: number;
  cuotasPagadas: number;
  valorCuota: number;
  ultimaCuota: number;
  tieneTramos: boolean;
  sumaCuotas: number;
  /** pieBruto + sumaCuotas. */
  sumaPlan: number;
  /** valorTotal - (pie + cuotas), con el pie tal cual está guardado. + falta, - sobra. */
  diferencia: number;

  /** Comprobantes de pie aprobados. null = ninguno. */
  pieConComprobantes: number | null;

  /** Lo pagado según la regla: pie bruto + cuotas pagadas + extra. */
  pagadoSegunRegla: number;
  /** Lo que le falta según la regla. */
  saldoSegunRegla: number;
  /** Lo que suman las cuotas que le quedan, con la última pactada. */
  cuotasPendientesSuman: number;
  /** Con cuánto tendría que cerrar la última cuota para que el saldo dé exacto. */
  ultimaCuotaQueCierra: number | null;

  /**
   * Corrección de pie candidata para el arreglo en lote, suponiendo que las
   * cuotas (tramos, valor cuota, última) están bien cargadas:
   *   RESERVA_AFUERA      el pie está guardado sin la reserva: pie + reserva.
   *   TOTAL_MENOS_CUOTAS  el pie es lo que falta para el valor total.
   * null = no hay una corrección de pie que tenga sentido.
   */
  /**
   * La cuenta en cuatro partes, como la lee postventa:
   * pie + cuotas pagadas + cuotas restantes + última cuota = valor total.
   * La última va aparte aunque esté pagada.
   */
  desglose: {
    pie: number;
    pagadas: { cantidad: number; monto: number };
    restantes: { cantidad: number; monto: number };
    ultima: { numero: number; monto: number; pagada: boolean };
    suma: number;
  };

  correccionPie: { tipo: "RESERVA_AFUERA" | "TOTAL_MENOS_CUOTAS"; pieNuevo: number; pieNetoNuevo: number } | null;

  /** El saldo que ve el cliente en su portal hoy (actions/user.ts). */
  saldoPortal: number;
  /** El saldo que muestra el panel de postventa hoy (getFullPostventaData). */
  saldoPanel: number;
};

/** Campos que se pueden corregir desde el Cuadre de Caja. */
export type CampoCorregible =
  | "pie"
  | "reserva_ficha"
  | "reserva_lote"
  | "ultima_cuota"
  | "valor_total"
  | "valor_cuota";

export const ETIQUETA_CAMPO: Record<CampoCorregible, string> = {
  pie: "Pie",
  reserva_ficha: "Reserva (ficha)",
  reserva_lote: "Reserva (lote)",
  ultima_cuota: "Última cuota",
  valor_total: "Valor total",
  valor_cuota: "Valor cuota",
};

/**
 * Lo que se puede corregir. `tramos` son los montos nuevos de cada tramo, en el
 * mismo orden que devuelve leerTramos: se cambia el monto, nunca desde/hasta,
 * porque los límites mueven qué cuota vence cuándo.
 */
export type CambiosPlan = Partial<Record<CampoCorregible, number>> & { tramos?: number[] };

/**
 * Los tramos crudos de la base con los montos reemplazados, conservando el
 * nombre de campo con que vinieron (amount o value). null si no calzan.
 */
export function reemplazarMontosTramos(tramosCrudos: unknown, montos: number[]): unknown[] | null {
  let lista: unknown = tramosCrudos;
  if (typeof lista === "string") {
    try {
      lista = JSON.parse(lista);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(lista)) return null;
  let i = 0;
  const out = lista.map((t: Record<string, unknown>) => {
    const desde = Number(t?.from ?? t?.start ?? 0);
    const hasta = Number(t?.to ?? t?.end ?? 0);
    if (!(desde > 0 && hasta >= desde)) return t;
    const monto = montos[i++];
    if ("value" in (t || {}) && !("amount" in (t || {}))) return { ...t, value: monto };
    return { ...t, amount: monto };
  });
  return i === montos.length ? out : null;
}

/** Aplica una corrección sobre una copia de la ficha, para simularla. */
export function aplicarCambios(f: FichaPlan, cambios: CambiosPlan): FichaPlan {
  const g: FichaPlan = { ...f };
  if (cambios.tramos) {
    const nuevos = reemplazarMontosTramos(f.tramos, cambios.tramos);
    if (nuevos) g.tramos = nuevos;
  }
  if (cambios.pie !== undefined) {
    // updateClientFinancials escribe el pie en la ficha y en el lote.
    g.pieFicha = cambios.pie;
    g.pieLote = cambios.pie;
  }
  if (cambios.reserva_ficha !== undefined) g.reservaFicha = cambios.reserva_ficha;
  if (cambios.reserva_lote !== undefined) g.reservaLote = cambios.reserva_lote;
  if (cambios.ultima_cuota !== undefined) g.ultimaCuotaFicha = cambios.ultima_cuota;
  if (cambios.valor_total !== undefined) g.valorTotal = cambios.valor_total;
  if (cambios.valor_cuota !== undefined) g.valorCuota = cambios.valor_cuota;
  return g;
}

/**
 * Suma de lo pagado en cuotas tal como lo cuenta el saldo hoy: cuotas contadas
 * por su tramo o valor cuota, sin mirar la última.
 */
function cuotasPagadasSegunSaldo(f: FichaPlan): number {
  const tramos = leerTramos(f.tramos);
  let s = 0;
  for (let n = 1; n <= f.installmentsPaid; n++) s += montoQueCuentaElSaldo(tramos, n, f.valorCuota);
  return s;
}

/** Réplica del saldo del portal del cliente (actions/user.ts, getClientPOV). */
export function saldoPortalCliente(f: FichaPlan): number {
  const pagado = cuotasPagadasSegunSaldo(f) + pieGuardado(f) + (f.extraPagado || 0);
  return f.valorTotal - pagado;
}

/**
 * Réplica del saldo del panel de postventa (getFullPostventaData). En Lomas del
 * Mar ya no suma la reserva aparte del pie; sí cuenta el pie solo si está pagado.
 */
export function saldoPanelPostventa(f: FichaPlan): number {
  return saldoPanel(f, false);
}

/**
 * El saldo del panel de Lomas sin la reserva aparte. Desde que el panel dejó de
 * sumarla es igual a saldoPanelPostventa; se conserva para el bloque de impacto,
 * que así queda vacío en vez de romperse.
 */
export function saldoPanelLomasSinReservaAparte(f: FichaPlan): number {
  return saldoPanel(f, false);
}

function saldoPanel(f: FichaPlan, lomasSumaReservaAparte: boolean): number {
  // El panel da por pagada entera a la ficha terminada, haga la cuenta lo que haga.
  if (f.status === "COMPLETED") return 0;
  const cuotas = cuotasPagadasSegunSaldo(f);
  const extra = f.extraPagado || 0;
  if (f.projectSlug !== LOMAS_SLUG) {
    return f.valorTotal - (cuotas + pieGuardado(f) + extra);
  }
  const pieManual = f.pieFicha || 0;
  const piePorComprobantes = f.comprobantes
    .filter((c) => c.scope === "PIE")
    .reduce((s, c) => s + (c.amount_clp || 0), 0);
  let pie = 0;
  if (pieManual > 0) pie = pieManual;
  else if (piePorComprobantes > 0) pie = piePorComprobantes;
  else if ((f.pieStatus || "").toUpperCase() === "PAID") pie = pieManual || f.pieLote || 0;

  const reservaPorComprobantes = f.comprobantes
    .filter((c) => c.scope === "RESERVA")
    .reduce((s, c) => s + (c.amount_clp || 0), 0);
  const reserva = lomasSumaReservaAparte ? reservaPorComprobantes || (f.reservaLote ?? 500000) : 0;

  const pagado = f.cuotas === 0 ? f.valorTotal + extra : reserva + pie + cuotas + extra;
  return Math.max(0, f.valorTotal - pagado + (f.pendingAmount || 0));
}

function clp(n: number): string {
  const signo = n < 0 ? "-" : "";
  return `${signo}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
}

export function cuadrarPlan(f: FichaPlan): ResultadoCuadre {
  const hallazgos: Hallazgo[] = [];
  const sugerencias: Sugerencia[] = [];

  const reserva = fuentesReserva(f);
  const pie = pieGuardado(f);
  const tramos = leerTramos(f.tramos);
  const sumaCuotas = sumaCuotasPactadas(f);
  const ultima = f.cuotas > 0 ? montoPactado(f, f.cuotas) : 0;
  const diferencia = f.valorTotal - (pie + sumaCuotas);

  let lectura: LecturaPie;
  if (diferencia === 0) lectura = reserva.usada > 0 ? "BRUTO" : "SIN_RESERVA";
  else if (reserva.usada > 0 && diferencia === reserva.usada) lectura = "NETO";
  else lectura = "NO_CIERRA";

  // Con la lectura NETO el pie real es pie + reserva. En cualquier otro caso se
  // toma la regla: el pie guardado ya trae la reserva adentro.
  const pieBruto = lectura === "NETO" ? pie + reserva.usada : pie;
  const pieNeto = pieBruto - reserva.usada;
  const sumaPlan = pieBruto + sumaCuotas;

  // ---------------------------------------------------------- EL PLAN
  if (f.valorTotal <= 0) {
    hallazgos.push({
      tipo: "DESCUADRA",
      titulo: "El lote no tiene valor total",
      detalle: "Sin valor total no hay contra qué cuadrar. Hay que cargarlo en la ficha.",
    });
  } else if (lectura === "NO_CIERRA") {
    hallazgos.push({
      tipo: "DESCUADRA",
      titulo: diferencia > 0 ? `Faltan ${clp(diferencia)} para el valor total` : `Sobran ${clp(-diferencia)} sobre el valor total`,
      detalle: `Pie ${clp(pie)} + ${f.cuotas} cuotas por ${clp(sumaCuotas)} = ${clp(pie + sumaCuotas)}, y el lote vale ${clp(
        f.valorTotal
      )}.${reserva.usada > 0 ? ` La diferencia no es la reserva (${clp(reserva.usada)}): no es un pie mal anotado.` : ""}${
        f.valorCuota > 0 && Math.abs(diferencia) === f.valorCuota
          ? ` La diferencia es exactamente una cuota: revisa si el plan es de ${
              diferencia > 0 ? f.cuotas + 1 : f.cuotas - 1
            } cuotas. La cantidad de cuotas se cambia desde la ficha del cliente, porque mueve la mora.`
          : ""
      }`,
    });
    sugerencias.push(...sugerir(f, { diferencia, pie, reserva: reserva.usada, ultima, tieneTramos: tramos.length > 0 }));
  } else if (lectura === "NETO") {
    hallazgos.push({
      tipo: "REVISAR",
      titulo: "El pie está guardado sin la reserva",
      detalle: `Cierra solo si la reserva (${clp(reserva.usada)}) se suma aparte: ${clp(reserva.usada)} + pie ${clp(pie)} + cuotas ${clp(
        sumaCuotas
      )} = ${clp(f.valorTotal)}. Según la regla el pie debería decir ${clp(pie + reserva.usada)}.`,
    });
    sugerencias.push({
      campo: "pie",
      valor: pie + reserva.usada,
      motivo: `Dejar el pie con la reserva adentro: ${clp(pie)} + ${clp(reserva.usada)}.`,
      probable: true,
    });
  }

  // ------------------------------------------------------- LA RESERVA
  if (reserva.noCoinciden) {
    const partes = [
      reserva.ficha > 0 ? `ficha ${clp(reserva.ficha)}` : null,
      reserva.lote > 0 ? `lote ${clp(reserva.lote)}` : null,
      reserva.comprobante ? `comprobante ${clp(reserva.comprobante)}` : null,
    ].filter(Boolean);
    hallazgos.push({
      tipo: "REVISAR",
      titulo: "La reserva no dice lo mismo en todos lados",
      detalle: `${partes.join(", ")}. Se cuadra con ${reserva.usadaDe === "ficha" ? "la de la ficha" : `la del ${reserva.usadaDe}`}.${
        f.projectSlug === LOMAS_SLUG && reserva.comprobante === null && reserva.lote !== reserva.ficha
          ? " En Lomas el saldo usa la del lote."
          : ""
      }`,
    });
  }
  if (reserva.usada > pieBruto && pieBruto > 0) {
    hallazgos.push({
      tipo: "REVISAR",
      titulo: "La reserva es mayor que el pie",
      detalle: `Reserva ${clp(reserva.usada)} y pie ${clp(pieBruto)}. Si la reserva es parte del pie, no puede ser más grande.`,
    });
  }

  // ------------------------------------------- COMPROBANTES DE PIE
  const deciPie = f.comprobantes.filter((c) => c.scope === "PIE");
  const pieConComprobantes = deciPie.length > 0 ? deciPie.reduce((s, c) => s + (c.amount_clp || 0), 0) : null;
  if (pieConComprobantes !== null && lectura !== "NO_CIERRA" && pieConComprobantes !== pieNeto) {
    const pagoPieCompletoAparte = reserva.usada > 0 && pieConComprobantes === pieBruto;
    hallazgos.push({
      tipo: "REVISAR",
      titulo: pagoPieCompletoAparte
        ? "El comprobante de pie trae el pie completo, reserva incluida"
        : `Los comprobantes de pie suman ${clp(pieConComprobantes)} y el pie neto es ${clp(pieNeto)}`,
      detalle: pagoPieCompletoAparte
        ? `El pie neto es ${clp(pieNeto)} (pie ${clp(pieBruto)} menos reserva ${clp(
            reserva.usada
          )}). O el comprobante se registró por el pie bruto, o el cliente pagó la reserva dos veces.`
        : `Pie ${clp(pieBruto)} menos reserva ${clp(reserva.usada)} = ${clp(pieNeto)} a pagar como pie.`,
    });
  }

  // ------------------------------------------------ LA ÚLTIMA CUOTA
  const ultimaDeclarada = ultimaCuotaDeclarada(f);
  const tramoDeLaUltima = tramos.find((t) => f.cuotas >= t.desde && f.cuotas <= t.hasta);
  if (tramoDeLaUltima && ultimaDeclarada > 0 && ultimaDeclarada !== tramoDeLaUltima.monto && ultimaDeclarada !== f.valorCuota) {
    hallazgos.push({
      tipo: "REVISAR",
      titulo: "La última cuota dice una cosa y su tramo otra",
      detalle: `La ficha declara una última cuota de ${clp(ultimaDeclarada)}, pero el tramo ${tramoDeLaUltima.desde}-${
        tramoDeLaUltima.hasta
      } la cobra a ${clp(tramoDeLaUltima.monto)}. Se usó la del tramo.`,
    });
  }

  // ---------------------------------------------- LO PAGADO Y LO QUE FALTA
  const pagados = Math.min(f.installmentsPaid, f.cuotas);
  const pagadoSegunRegla = pieBruto + sumaCuotasPactadas(f, 1, pagados) + (f.extraPagado || 0);
  const saldoSegunRegla = f.valorTotal - pagadoSegunRegla;
  const cuotasPendientesSuman = sumaCuotasPactadas(f, pagados + 1, f.cuotas);
  const pendientesSinUltima = pagados < f.cuotas ? sumaCuotasPactadas(f, pagados + 1, f.cuotas - 1) : 0;
  const ultimaCuotaQueCierra = pagados < f.cuotas ? saldoSegunRegla - pendientesSinUltima : null;

  if (f.installmentsPaid > f.cuotas) {
    hallazgos.push({
      tipo: "DESCUADRA",
      titulo: `Tiene ${f.installmentsPaid} cuotas pagadas de ${f.cuotas}`,
      detalle: "La ficha cuenta más cuotas pagadas que las que tiene el plan.",
    });
  }

  const saldoPortal = saldoPortalCliente(f);
  const saldoPanel = saldoPanelPostventa(f);
  const terminada = f.status === "COMPLETED";

  if (terminada && lectura !== "NO_CIERRA" && saldoSegunRegla !== 0) {
    hallazgos.push({
      tipo: "REVISAR",
      titulo:
        saldoSegunRegla > 0
          ? `Figura terminado y le faltan ${clp(saldoSegunRegla)}`
          : `Figura terminado y pagó ${clp(-saldoSegunRegla)} de más`,
      detalle: `Con ${f.installmentsPaid} de ${f.cuotas} cuotas contadas, lo pagado según la regla es ${clp(
        pagadoSegunRegla
      )} y el lote vale ${clp(f.valorTotal)}. Un cliente terminado tendría que cerrar en cero.`,
    });
  }

  if (!terminada && lectura !== "NO_CIERRA" && f.valorTotal > 0) {
    if (saldoPortal !== saldoSegunRegla) {
      hallazgos.push({
        tipo: "REVISAR",
        titulo: `El cliente ve un saldo de ${clp(saldoPortal)} y debería ver ${clp(saldoSegunRegla)}`,
        detalle:
          lectura === "NETO"
            ? `Su portal cuenta el pie sin la reserva, así que le cobra ${clp(saldoPortal - saldoSegunRegla)} de más. Se arregla dejando el pie con la reserva adentro.`
            : `Diferencia de ${clp(saldoPortal - saldoSegunRegla)}.`,
      });
    }
    if (f.projectSlug === LOMAS_SLUG && saldoPanel !== Math.max(0, saldoSegunRegla + (f.pendingAmount || 0))) {
      hallazgos.push({
        tipo: "REVISAR",
        titulo: `El panel de postventa muestra un saldo de ${clp(saldoPanel)}`,
        detalle: `Según la regla son ${clp(saldoSegunRegla)}. El panel de Lomas cuenta el pie solo si figura pagado, y suma el monto pendiente de la ficha.`,
      });
    }
  }

  // Qué pie cerraría el plan si las cuotas están bien. No se corrige solo:
  // alimenta la lista del arreglo en lote, donde postventa marca cuáles sí.
  let correccionPie: ResultadoCuadre["correccionPie"] = null;
  const pieQueCierra = f.valorTotal - sumaCuotas;
  if (f.valorTotal > 0 && f.cuotas > 0 && f.installmentsPaid <= f.cuotas) {
    if (lectura === "NETO") {
      correccionPie = { tipo: "RESERVA_AFUERA", pieNuevo: pie + reserva.usada, pieNetoNuevo: pie };
    } else if (lectura === "NO_CIERRA" && pieQueCierra > 0 && pieQueCierra >= reserva.usada) {
      correccionPie = { tipo: "TOTAL_MENOS_CUOTAS", pieNuevo: pieQueCierra, pieNetoNuevo: pieQueCierra - reserva.usada };
    }
  }

  const nPagadas = Math.min(f.installmentsPaid, Math.max(0, f.cuotas - 1));
  const desglose: ResultadoCuadre["desglose"] = {
    pie,
    pagadas: { cantidad: nPagadas, monto: sumaCuotasPactadas(f, 1, nPagadas) },
    restantes: {
      cantidad: Math.max(0, f.cuotas - 1 - nPagadas),
      monto: sumaCuotasPactadas(f, nPagadas + 1, f.cuotas - 1),
    },
    ultima: { numero: f.cuotas, monto: ultima, pagada: f.installmentsPaid >= f.cuotas },
    suma: 0,
  };
  desglose.suma = desglose.pie + desglose.pagadas.monto + desglose.restantes.monto + desglose.ultima.monto;

  const estado: EstadoCuadre = hallazgos.some((h) => h.tipo === "DESCUADRA")
    ? "DESCUADRA"
    : hallazgos.length > 0
      ? "REVISAR"
      : "CUADRA";

  return {
    estado,
    lectura,
    hallazgos,
    sugerencias,
    valorTotal: f.valorTotal,
    pie,
    pieBruto,
    pieNeto,
    reserva,
    cuotas: f.cuotas,
    cuotasPagadas: f.installmentsPaid,
    valorCuota: f.valorCuota,
    ultimaCuota: ultima,
    tieneTramos: tramos.length > 0,
    sumaCuotas,
    sumaPlan,
    diferencia,
    pieConComprobantes,
    pagadoSegunRegla,
    saldoSegunRegla,
    cuotasPendientesSuman,
    ultimaCuotaQueCierra,
    correccionPie,
    desglose,
    saldoPortal,
    saldoPanel,
  };
}

/**
 * En qué campo parece estar el error, del patrón más reconocible al más
 * genérico. No se elige por postventa: se ofrece, y postventa decide.
 */
function sugerir(
  f: FichaPlan,
  c: { diferencia: number; pie: number; reserva: number; ultima: number; tieneTramos: boolean }
): Sugerencia[] {
  const out: Omit<Sugerencia, "probable">[] = [];
  const d = c.diferencia;

  // El pie trae la reserva sumada dos veces.
  if (c.reserva > 0 && d === -c.reserva) {
    out.push({
      campo: "pie",
      valor: c.pie - c.reserva,
      motivo: `Sobra justo la reserva (${clp(c.reserva)}): el pie parece tenerla sumada dos veces.`,
    });
  }
  // Si los tramos de cuotas están bien, el pie es lo que falta para el total.
  if (c.pie + d > 0 && c.pie + d >= c.reserva) {
    out.push({
      campo: "pie",
      valor: c.pie + d,
      motivo: `Si las cuotas están bien, el pie es el valor total menos las cuotas: ${clp(f.valorTotal)} - ${clp(
        f.valorTotal - (c.pie + d)
      )}${c.reserva > 0 ? `. Con la reserva adentro, el cliente paga ${clp(c.pie + d - c.reserva)} de pie aparte` : ""}. Ojo: subir el pie es dar esa plata por recibida.`,
    });
  }
  // Una última cuota que cierre el total.
  if (f.cuotas > 0 && c.ultima + d > 0) {
    out.push({
      campo: "ultima_cuota",
      valor: c.ultima + d,
      motivo: `Que la última cuota cierre el valor total: ${clp(c.ultima)} ${d > 0 ? "+" : "-"} ${clp(Math.abs(d))}.`,
    });
  }
  // Valor cuota, solo si no hay tramos y la diferencia se reparte exacta.
  if (!c.tieneTramos && f.cuotas > 0 && d % f.cuotas === 0 && f.valorCuota + d / f.cuotas > 0) {
    out.push({
      campo: "valor_cuota",
      valor: f.valorCuota + d / f.cuotas,
      motivo: `Repartida en las ${f.cuotas} cuotas, la diferencia es ${clp(d / f.cuotas)} por cuota.`,
    });
  }
  out.push({
    campo: "valor_total",
    valor: f.valorTotal - d,
    motivo: "Que el valor total sea lo que suma el plan. Solo si el precio del lote está mal cargado.",
  });

  // Sin repetidos (mismo campo y valor), y la primera es la más probable
  // solo si calzó con un patrón (reserva doble o una cuota exacta).
  const vistos = new Set<string>();
  const unicas = out.filter((s) => {
    const k = `${s.campo}:${s.valor}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  const hayPatron = c.reserva > 0 && d === -c.reserva;
  return unicas.map((s, i) => ({ ...s, probable: hayPatron && i === 0 }));
}

/**
 * Arma la FichaPlan desde una reserva de Prisma con su lote y sus comprobantes
 * APROBADOS. La usan la pantalla y las acciones, para que lean lo mismo.
 */
export function fichaPlanDesdeReserva(
  res: {
    status: string | null;
    installment_ranges: unknown;
    last_installment_value: number | null;
    pie: number | null;
    pie_status: string | null;
    reservation_price: number | null;
    installments_paid: number | null;
    extra_paid_amount: number | null;
    pending_amount: number | null;
    lot: {
      price_total_clp: number | null;
      cuotas: number | null;
      valor_cuota: number | null;
      last_installment_amount: number | null;
      pie: number | null;
      reservation_amount_clp: number | null;
    };
    receipts: { scope: string; amount_clp: number; status?: string | null }[];
  },
  projectSlug: string
): FichaPlan {
  return {
    projectSlug,
    status: res.status,
    valorTotal: res.lot.price_total_clp || 0,
    cuotas: res.lot.cuotas || 0,
    valorCuota: res.lot.valor_cuota || 0,
    tramos: res.installment_ranges,
    ultimaCuotaFicha: res.last_installment_value,
    ultimaCuotaLote: res.lot.last_installment_amount,
    pieFicha: res.pie,
    pieLote: res.lot.pie,
    pieStatus: res.pie_status,
    reservaFicha: res.reservation_price,
    // null y 0 no son lo mismo acá: Lomas cae a $500.000 solo con null.
    reservaLote: res.lot.reservation_amount_clp,
    installmentsPaid: res.installments_paid || 0,
    extraPagado: res.extra_paid_amount || 0,
    pendingAmount: res.pending_amount || 0,
    comprobantes: res.receipts
      .filter((r) => !r.status || r.status === "APPROVED")
      .map((r) => ({ scope: r.scope, amount_clp: r.amount_clp })),
  };
}
