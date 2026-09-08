/**
 * Fichas fantasma: la copia que el puente Lomas->Portal dejo de un cliente que
 * ya estaba en el portal.
 *
 * El puente (app/api/cron/sync-lomas/route.ts) deduplicaba con la llave
 * rut+lote+etapa. Cuando la ficha de Lomas venia SIN rut y la del portal si lo
 * tenia (o al reves), la llave no calzaba y se insertaba una SEGUNDA reserva
 * del mismo cliente para el mismo lote, congelada en el avance de cuotas de
 * Lomas -- que va atrasado justamente porque los pagos se aprueban en el
 * portal, no en Lomas. Resultado: el cliente aparece "en mora" por una cuota
 * que postventa ya le cobro. Paso el 04-09-2026 con Joselin Castillo (L-18 e1)
 * y Rodrigo Marquez (L-42 e3).
 *
 * La llave del puente ya se corrigio, pero las copias que alcanzo a crear
 * siguen en la base. Este modulo las detecta en memoria para que no cuenten
 * como mora ni entren a las audiencias de cobranza, sin tocar ningun dato.
 *
 * IMPORTANTE: la deteccion es por lote Y persona, nunca por lote a secas. En
 * Arena y Sol el lote 24 tiene dos fichas de personas DISTINTAS, que es
 * legitimo y no se debe colapsar.
 */

export type FichaComparable = {
  id: string;
  lotId?: number | null;
  rut?: string | null;
  clientEmail?: string | null;
  buyer?: { id?: string | null } | null;
  paidCuotas?: number | null;
  internalStatus?: string | null;
};

export function normalizarRut(rut: string | null | undefined): string {
  return (rut || "").trim().toUpperCase().replace(/[.\-\s]/g, "");
}

function normalizarEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

/**
 * Dos fichas del mismo lote son de la misma persona si coinciden en rut, en
 * email o en la cuenta del portal. Basta UNA coincidencia: el caso que genero
 * el problema es justamente el de una ficha sin rut, donde la unica senal en
 * comun es el email.
 */
export function esLaMismaPersona(a: FichaComparable, b: FichaComparable): boolean {
  const rutA = normalizarRut(a.rut);
  if (rutA && rutA === normalizarRut(b.rut)) return true;

  const emailA = normalizarEmail(a.clientEmail);
  if (emailA && emailA === normalizarEmail(b.clientEmail)) return true;

  const userA = a.buyer?.id;
  return !!userA && userA === b.buyer?.id;
}

/**
 * De dos fichas de la misma persona en el mismo lote, manda la mas avanzada en
 * cuotas: es la que mantiene postventa, y la copia del puente siempre viene
 * igual o mas atrasada. Mismo criterio que esFichaVigente en actions/user.ts,
 * para que el cliente y postventa vean la misma ficha como la buena.
 */
function esMasVigente(candidata: FichaComparable, actual: FichaComparable): boolean {
  const completaCandidata = candidata.internalStatus === "COMPLETED" ? 1 : 0;
  const completaActual = actual.internalStatus === "COMPLETED" ? 1 : 0;
  if (completaCandidata !== completaActual) return completaCandidata > completaActual;

  const cuotasCandidata = candidata.paidCuotas || 0;
  const cuotasActual = actual.paidCuotas || 0;
  if (cuotasCandidata !== cuotasActual) return cuotasCandidata > cuotasActual;

  return (normalizarRut(candidata.rut) ? 1 : 0) > (normalizarRut(actual.rut) ? 1 : 0);
}

/**
 * Devuelve los ids de las fichas fantasma: las copias mas atrasadas de una
 * persona que aparece mas de una vez en el mismo lote. La ficha vigente NUNCA
 * queda marcada, y un lote con una sola ficha jamas entra al calculo.
 */
export function detectarFichasFantasma(fichas: FichaComparable[]): Set<string> {
  const fantasmas = new Set<string>();

  const porLote = new Map<number, FichaComparable[]>();
  for (const ficha of fichas) {
    if (ficha.lotId == null) continue;
    const enElLote = porLote.get(ficha.lotId);
    if (enElLote) enElLote.push(ficha);
    else porLote.set(ficha.lotId, [ficha]);
  }

  for (const enElLote of porLote.values()) {
    if (enElLote.length < 2) continue;

    // Dentro del lote se agrupa por persona comparando contra cada grupo ya
    // formado, no contra una llave: una ficha sin rut solo se reconoce por el
    // email, y una llave fija volveria a dejarlas separadas como al principio.
    const grupos: FichaComparable[][] = [];
    for (const ficha of enElLote) {
      const grupo = grupos.find((g) => g.some((otra) => esLaMismaPersona(ficha, otra)));
      if (grupo) grupo.push(ficha);
      else grupos.push([ficha]);
    }

    for (const grupo of grupos) {
      if (grupo.length < 2) continue;
      let vigente = grupo[0];
      for (const ficha of grupo.slice(1)) if (esMasVigente(ficha, vigente)) vigente = ficha;
      for (const ficha of grupo) if (ficha.id !== vigente.id) fantasmas.add(ficha.id);
    }
  }

  return fantasmas;
}
