import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCLP } from "@/lib/utils";
import { getNominalInstallmentAmount } from "@/lib/financials";
import { SCOPE_LABELS } from "@/lib/receiptDocs";

// Diagnostico de SOLO LECTURA. No escribe nada: reproduce exactamente el mismo
// cruce con el que el portal del cliente decide si una cuota pagada muestra el
// boton de descarga o el texto "No disponible" (src/app/user/page.tsx), y pone
// al lado los comprobantes que SI existen en la base, con su estado y su numero
// nominal, para poder ver por que no se estan cruzando.
//
// Ademas de las cuotas huecas, marca tres cosas que descuadran en silencio:
// comprobantes duplicados apuntando a la misma cuota, pagos por debajo de la
// cuota pactada, y reservas que se cuentan en el saldo sin comprobante detras.
//
// Se acota solo a los proyectos de la cuenta que entra (allowedProjects): cada
// equipo de postventa ve su propia cartera y nunca la de otro proyecto.
//
// Ruta: /admin/diagnostico-comprobantes  (requiere sesion ADMIN)

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

/** Dia calendario del comprobante, para detectar dos pagos identicos el mismo dia. */
function diaDe(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Cruce EXACTO que hace el portal del cliente: nominal_installment_number igual,
 * o el rango partido por "-" cuyos EXTREMOS incluyan la cuota. Ojo: se replica
 * con su limitacion incluida (un rango "4-6" no matchea la cuota 5, porque
 * split solo deja los extremos), para que el diagnostico refleje lo que el
 * cliente realmente ve y no lo que deberia ver.
 */
function matcheaComoElPortal(r: any, cuota: number): boolean {
  if (r.nominal_installment_number === cuota) return true;
  if (r.nominal_installment_range) {
    return r.nominal_installment_range.split("-").map(Number).includes(cuota);
  }
  return false;
}

/** Cruce correcto: un rango "4-6" cubre 4, 5 y 6. */
function matcheaPorRangoReal(r: any, cuota: number): boolean {
  if (r.nominal_installment_number === cuota) return true;
  if (r.nominal_installment_range) {
    const [desde, hasta] = r.nominal_installment_range.split("-").map(Number);
    if (Number.isFinite(desde) && Number.isFinite(hasta)) {
      return cuota >= desde && cuota <= hasta;
    }
  }
  return false;
}

type CuotaHueca = {
  numero: number;
  causa: string;
  detalle: string;
};

type Anomalia = {
  tipo: "Duplicado" | "Monto bajo" | "Reserva sin respaldo";
  detalle: string;
};

/**
 * Navegacion entre paginas. Va por URL (?page=N) y no por estado de cliente para
 * que la pagina siga siendo un Server Component: asi cada pagina dibuja solo sus
 * 15 clientes en vez de mandar los 94 al navegador.
 */
function Paginacion({
  paginaActual,
  totalPaginas,
}: {
  paginaActual: number;
  totalPaginas: number;
}) {
  if (totalPaginas <= 1) return null;
  const base = "/admin/diagnostico-comprobantes";
  const btn =
    "px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-colors bg-white border-slate-200 text-slate-600 hover:bg-slate-50";
  const btnOff =
    "px-3 py-1.5 rounded-lg border text-[11px] font-bold bg-slate-50 border-slate-200 text-slate-300 cursor-default";

  return (
    <div className="flex items-center gap-2 ml-auto">
      {paginaActual > 1 ? (
        <a href={`${base}?page=${paginaActual - 1}`} className={btn}>
          Anterior
        </a>
      ) : (
        <span className={btnOff}>Anterior</span>
      )}
      <span className="text-[11px] font-bold text-slate-500">
        {paginaActual} / {totalPaginas}
      </span>
      {paginaActual < totalPaginas ? (
        <a href={`${base}?page=${paginaActual + 1}`} className={btn}>
          Siguiente
        </a>
      ) : (
        <span className={btnOff}>Siguiente</span>
      )}
    </div>
  );
}

/** Clientes por pagina. Cada bloque trae la tabla completa de comprobantes del
 *  cliente, asi que mas de esto vuelve la pagina pesada de leer y de cargar. */
const POR_PAGINA = 15;

export default async function DiagnosticoComprobantesPage(
  props: PageProps<"/admin/diagnostico-comprobantes">
) {
  // En esta version de Next, searchParams es un Promise y hay que esperarlo.
  const { page } = await props.searchParams;
  const paginaPedida = Number(Array.isArray(page) ? page[0] : page) || 1;

  const session = await auth();
  const user = session?.user as any;
  if (!session?.user || user?.role !== "ADMIN") {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <p className="text-sm font-bold text-red-600">No autorizado</p>
      </div>
    );
  }

  const whereProyecto: any = { status: "ACTIVE" };
  if (user.allowedProjects && Array.isArray(user.allowedProjects)) {
    whereProyecto.slug = { in: user.allowedProjects };
  }
  const proyectos = await prisma.project.findMany({
    where: whereProyecto,
    select: { id: true, name: true, slug: true },
  });

  const reservas = await prisma.reservation.findMany({
    where: {
      project_id: { in: proyectos.map((p) => p.id) },
      status: { in: ["active", "COMPLETED"] },
    },
    select: {
      id: true,
      name: true,
      last_name: true,
      installments_paid: true,
      project_id: true,
      installment_ranges: true,
      reservation_price: true,
      lot: {
        select: {
          number: true,
          stage: true,
          cuotas: true,
          valor_cuota: true,
          reservation_amount_clp: true,
        },
      },
      receipts: {
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          amount_clp: true,
          status: true,
          scope: true,
          installments_count: true,
          nominal_installment_number: true,
          nominal_installment_range: true,
          created_at: true,
        },
      },
      documents: { select: { name: true } },
    },
  });

  // Si el comprobante tiene un archivo real detras. Se resuelve con una consulta
  // aparte y NO trayendo receipt_url en el select de arriba a proposito: esa
  // columna guarda la imagen entera en base64 y traerla para cada comprobante de
  // la cartera reventaria la memoria y el tiempo de la pagina. Aca solo viaja el
  // booleano, calculado en el motor.
  //
  // Va sin WHERE a proposito: pasar la lista de reservas como parametro obliga a
  // un array de uuid, y esta pagina no se puede probar contra la base antes de
  // desplegar. Traer id + booleano de toda la tabla es barato y no depende de
  // como se serialice el parametro. Los comprobantes de otros proyectos entran
  // al mapa pero nunca se consultan: las filas se arman solo con las reservas
  // que la cuenta tiene permitidas.
  const archivoPorComprobante = new Map<string, boolean>();
  const filasArchivo = await prisma.$queryRaw<{ id: string; tiene_archivo: boolean }[]>`
    SELECT pr.id::text AS id,
           (pr.receipt_url IS NOT NULL
            AND length(pr.receipt_url) > 0
            AND pr.receipt_url NOT IN ('LEGACY_SYNC', 'CONDONACION_ADMIN', 'SIN_RESPALDO')) AS tiene_archivo
    FROM pagos.payment_receipts pr
  `;
  for (const f of filasArchivo) archivoPorComprobante.set(f.id, f.tiene_archivo);

  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.name]));
  const slugProyecto = new Map(proyectos.map((p) => [p.id, p.slug]));

  const filas = reservas.map((res) => {
    const pagadas = res.installments_paid || 0;
    const aprobados = res.receipts.filter((r) => r.status === "APPROVED");
    const nombresDocs = res.documents.map((d) => (d.name || "").toLowerCase());

    const huecas: CuotaHueca[] = [];
    for (let i = 1; i <= pagadas; i++) {
      if (aprobados.some((r) => matcheaComoElPortal(r, i))) continue;

      // La cuota no muestra comprobante. Ahora se busca POR QUE.
      const porRangoReal = aprobados.find((r) => matcheaPorRangoReal(r, i));
      if (porRangoReal) {
        huecas.push({
          numero: i,
          causa: "Rango intermedio",
          detalle: `El comprobante ${porRangoReal.id.slice(0, 8)} cubre el rango ${porRangoReal.nominal_installment_range}, pero el portal solo cruza los extremos del rango.`,
        });
        continue;
      }

      const pendiente = res.receipts.find(
        (r) => r.status !== "APPROVED" && matcheaPorRangoReal(r, i)
      );
      if (pendiente) {
        huecas.push({
          numero: i,
          causa: `Comprobante en estado ${pendiente.status}`,
          detalle: `Existe el comprobante ${pendiente.id.slice(0, 8)} de ${formatCLP(pendiente.amount_clp)} del ${fmt(pendiente.created_at)}, pero el portal solo muestra los APPROVED.`,
        });
        continue;
      }

      const sinNumero = res.receipts.filter(
        (r) =>
          r.scope !== "PIE" &&
          r.nominal_installment_number == null &&
          !r.nominal_installment_range
      );
      if (sinNumero.length > 0) {
        huecas.push({
          numero: i,
          causa: "Comprobante sin numero de cuota",
          detalle: `Hay ${sinNumero.length} comprobante(s) de cuota sin nominal_installment_number, asi que no se pueden asignar a ninguna fila del historial.`,
        });
        continue;
      }

      const huerfanos = aprobados.filter(
        (r) => r.scope !== "PIE" && (r.nominal_installment_number || 0) > pagadas
      );
      if (huerfanos.length > 0) {
        huecas.push({
          numero: i,
          causa: "Numeracion corrida",
          detalle: `Hay comprobante(s) aprobados apuntando a la cuota ${huerfanos
            .map((r) => r.nominal_installment_number)
            .join(", ")}, mayor que las ${pagadas} cuotas contadas como pagadas.`,
        });
        continue;
      }

      huecas.push({
        numero: i,
        causa: "Sin comprobante",
        detalle:
          "No existe ningun PaymentReceipt para esta cuota: la cuota se sumo sin adjuntar archivo (pago manual sin comprobante, o edicion directa de Cuotas Pagadas).",
      });
    }

    // El PDF oficial que emite el sistema se guarda como Comprobante_Pago_<6 hex>.pdf
    const aprobadosSinPdf = aprobados.filter(
      (r) =>
        r.scope !== "PIE" &&
        !nombresDocs.some((n) =>
          n.includes(`comprobante_pago_${r.id.slice(0, 6).toLowerCase()}`)
        )
    );

    // ---- Anomalias que no dejan hueco pero descuadran igual ----
    const anomalias: Anomalia[] = [];

    // 1) Dos comprobantes aprobados apuntando a la MISMA cuota. Es lo que paso
    //    cuando un cliente sube dos comprobantes antes de que le aprueben el
    //    primero: los dos nacen marcados con la misma cuota.
    const porCuota = new Map<number, typeof aprobados>();
    for (const r of aprobados) {
      if (r.scope !== "INSTALLMENT" || r.nominal_installment_number == null) continue;
      const arr = porCuota.get(r.nominal_installment_number) || [];
      arr.push(r);
      porCuota.set(r.nominal_installment_number, arr);
    }
    for (const [cuota, lista] of porCuota) {
      if (lista.length > 1) {
        anomalias.push({
          tipo: "Duplicado",
          detalle: `${lista.length} comprobantes aprobados apuntan a la cuota ${cuota} (${lista
            .map((r) => `${r.id.slice(0, 8)} ${formatCLP(r.amount_clp)}`)
            .join(", ")}). Uno de ellos deberia ser otra cuota.`,
        });
      }
    }

    // 2) Dos pagos identicos (mismo tipo, mismo monto, mismo dia). Puede ser real
    //    —alguien que paga en dos transferencias— o un duplicado que le sumo
    //    plata de mas al cliente. Hay que mirarlo, no se puede decidir solo.
    const porHuella = new Map<string, typeof aprobados>();
    for (const r of aprobados) {
      const huella = `${r.scope}|${r.amount_clp}|${diaDe(r.created_at)}`;
      const arr = porHuella.get(huella) || [];
      arr.push(r);
      porHuella.set(huella, arr);
    }
    for (const [huella, lista] of porHuella) {
      if (lista.length > 1) {
        const [scope, monto] = huella.split("|");
        anomalias.push({
          tipo: "Duplicado",
          detalle: `${lista.length} pagos de ${SCOPE_LABELS[scope] || scope} por ${formatCLP(
            Number(monto)
          )} el mismo dia (${fmt(lista[0].created_at)}). Puede ser real o estar contado dos veces.`,
        });
      }
    }

    // 3) Pagos de cuota por DEBAJO de lo pactado. Un pago mayor no se marca:
    //    lo normal es que el excedente sea mora.
    for (const r of aprobados) {
      if (r.scope !== "INSTALLMENT") continue;
      const primera = r.nominal_installment_number;
      if (!primera) continue;
      const cantidad = r.installments_count || 1;
      let esperado = 0;
      for (let k = 0; k < cantidad; k++) {
        esperado += getNominalInstallmentAmount(
          res.installment_ranges,
          primera + k,
          res.lot?.valor_cuota || 0
        );
      }
      if (esperado > 0 && r.amount_clp < esperado) {
        anomalias.push({
          tipo: "Monto bajo",
          detalle: `El comprobante ${r.id.slice(0, 8)} paga ${formatCLP(
            r.amount_clp
          )} por la cuota ${primera}${cantidad > 1 ? ` (x${cantidad})` : ""}, pero lo pactado son ${formatCLP(
            esperado
          )}. Faltan ${formatCLP(esperado - r.amount_clp)}.`,
        });
      }
    }

    // 4) Reserva contada en el saldo pero sin comprobante detras. Es el caso con
    //    el que partio todo: la plata se suma al Total Invertido y el cliente no
    //    tiene ningun documento que la respalde.
    const montoReserva = res.reservation_price || res.lot?.reservation_amount_clp || 0;
    const tieneReserva = aprobados.some((r) => r.scope === "RESERVA");
    if (montoReserva > 0 && !tieneReserva) {
      anomalias.push({
        tipo: "Reserva sin respaldo",
        detalle: `La ficha declara una reserva de ${formatCLP(
          montoReserva
        )} y no existe ningun comprobante de reserva. El cliente no tiene como respaldarla.`,
      });
    }

    return {
      id: res.id,
      proyecto: nombreProyecto.get(res.project_id) || "—",
      slug: slugProyecto.get(res.project_id) || "",
      cliente: `${res.name || ""} ${res.last_name || ""}`.trim() || "Sin nombre",
      lote: `${res.lot?.number ?? "—"}${res.lot?.stage ? ` · Etapa ${res.lot.stage}` : ""}`,
      pagadas,
      totalCuotas: res.lot?.cuotas || 0,
      receipts: res.receipts,
      huecas,
      aprobadosSinPdf,
      anomalias,
    };
  });

  const conProblemas = filas
    .filter((f) => f.huecas.length > 0 || f.anomalias.length > 0)
    .sort((a, b) => b.huecas.length + b.anomalias.length - (a.huecas.length + a.anomalias.length));

  // Los totales de arriba se siguen calculando sobre la cartera COMPLETA: la
  // paginacion parte lo que se dibuja, no lo que se cuenta. Si no, cada pagina
  // mostraria un resumen distinto y no habria forma de saber cuanto falta.
  const totalPaginas = Math.max(1, Math.ceil(conProblemas.length / POR_PAGINA));
  const paginaActual = Math.min(Math.max(1, paginaPedida), totalPaginas);
  const desde = (paginaActual - 1) * POR_PAGINA;
  const visibles = conProblemas.slice(desde, desde + POR_PAGINA);

  const porCausa = new Map<string, number>();
  for (const f of filas) {
    for (const h of f.huecas) porCausa.set(h.causa, (porCausa.get(h.causa) || 0) + 1);
  }
  const porAnomalia = new Map<string, number>();
  for (const f of filas) {
    for (const a of f.anomalias) porAnomalia.set(a.tipo, (porAnomalia.get(a.tipo) || 0) + 1);
  }

  const totalHuecas = filas.reduce((acc, f) => acc + f.huecas.length, 0);
  const conHuecos = filas.filter((f) => f.huecas.length > 0);
  const sinPdfOficial = filas.filter((f) => f.aprobadosSinPdf.length > 0);
  const totalSinPdf = sinPdfOficial.reduce((a, f) => a + f.aprobadosSinPdf.length, 0);

  // Cuantos de los comprobantes sin PDF oficial tienen ademas el archivo del
  // cliente. Es la pregunta que no se podia responder antes: separa "solo falta
  // el recibo de Alimin" de "no hay nada de nada".
  let sinPdfConArchivo = 0;
  let sinPdfSinArchivo = 0;
  for (const f of sinPdfOficial) {
    for (const r of f.aprobadosSinPdf) {
      if (archivoPorComprobante.get(r.id)) sinPdfConArchivo++;
      else sinPdfSinArchivo++;
    }
  }

  // Totales por proyecto, para que cada cartera se lea por separado.
  const porProyecto = new Map<
    string,
    { nombre: string; reservas: number; huecas: number; anomalias: number; sinPdf: number }
  >();
  for (const f of filas) {
    const acc = porProyecto.get(f.slug) || {
      nombre: f.proyecto,
      reservas: 0,
      huecas: 0,
      anomalias: 0,
      sinPdf: 0,
    };
    acc.reservas += 1;
    acc.huecas += f.huecas.length;
    acc.anomalias += f.anomalias.length;
    acc.sinPdf += f.aprobadosSinPdf.length;
    porProyecto.set(f.slug, acc);
  }

  // Se cuentan SOLO los comprobantes de las reservas que esta cuenta ve, no el
  // mapa completo: ese trae la tabla entera, incluidos proyectos ajenos.
  const comprobantesDeLaCartera = filas.flatMap((f) => f.receipts);
  const totalComprobantes = comprobantesDeLaCartera.length;
  const comprobantesConArchivo = comprobantesDeLaCartera.filter((r) =>
    archivoPorComprobante.get(r.id)
  ).length;

  return (
    <div className="space-y-8 pb-16">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-800 tracking-tight">
          Diagnóstico de comprobantes
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Solo lectura · no modifica ningún dato · {filas.length} reservas revisadas ·{" "}
          {proyectos.map((p) => p.name).join(" + ")}
        </p>
        <p className="text-xs text-slate-400 mt-2 max-w-3xl leading-relaxed">
          Lista las cuotas que el cliente ve como <b>&quot;Pagado&quot;</b> pero sin botón de
          descarga, y además marca los comprobantes duplicados, los pagos por debajo de la cuota
          pactada y las reservas que se cuentan en el saldo sin respaldo.
        </p>
      </div>

      {/* Totales por proyecto */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
          Por proyecto
        </p>
        <table className="w-full text-left text-[11px]">
          <thead className="text-slate-400 font-bold uppercase tracking-wider">
            <tr>
              <th className="pr-4 py-1">Proyecto</th>
              <th className="pr-4 py-1">Reservas</th>
              <th className="pr-4 py-1">Cuotas sin comprobante</th>
              <th className="pr-4 py-1">Anomalías</th>
              <th className="pr-4 py-1">Sin PDF oficial</th>
            </tr>
          </thead>
          <tbody className="text-slate-700 font-semibold">
            {[...porProyecto.values()].map((p) => (
              <tr key={p.nombre} className="border-t border-slate-100">
                <td className="pr-4 py-1 font-extrabold text-slate-800">{p.nombre}</td>
                <td className="pr-4 py-1">{p.reservas}</td>
                <td className="pr-4 py-1 text-red-700 font-extrabold">{p.huecas}</td>
                <td className="pr-4 py-1 text-orange-700 font-extrabold">{p.anomalias}</td>
                <td className="pr-4 py-1 text-amber-700 font-extrabold">{p.sinPdf}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Cuotas sin comprobante
          </p>
          <p className="text-3xl font-extrabold text-red-600 mt-1">{totalHuecas}</p>
          <p className="text-[11px] text-slate-500 mt-1">en {conHuecos.length} cliente(s)</p>
          <div className="mt-2 space-y-0.5">
            {[...porCausa.entries()].map(([causa, n]) => (
              <p key={causa} className="text-[10px] font-semibold text-slate-500">
                {causa}: <span className="font-extrabold text-slate-800">{n}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Anomalías
          </p>
          <p className="text-3xl font-extrabold text-orange-600 mt-1">
            {[...porAnomalia.values()].reduce((a, b) => a + b, 0)}
          </p>
          <div className="mt-2 space-y-0.5">
            {porAnomalia.size === 0 && <p className="text-[10px] text-slate-400">Ninguna.</p>}
            {[...porAnomalia.entries()].map(([tipo, n]) => (
              <p key={tipo} className="text-[10px] font-semibold text-slate-500">
                {tipo}: <span className="font-extrabold text-slate-800">{n}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Aprobados sin PDF oficial
          </p>
          <p className="text-3xl font-extrabold text-amber-600 mt-1">{totalSinPdf}</p>
          <p className="text-[11px] text-slate-500 mt-1">en {sinPdfOficial.length} cliente(s)</p>
          <div className="mt-2 space-y-0.5">
            <p className="text-[10px] font-semibold text-slate-500">
              Con archivo del cliente:{" "}
              <span className="font-extrabold text-emerald-700">{sinPdfConArchivo}</span>
            </p>
            <p className="text-[10px] font-semibold text-slate-500">
              Sin ningún archivo:{" "}
              <span className="font-extrabold text-red-700">{sinPdfSinArchivo}</span>
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Archivos en la base
          </p>
          <p className="text-3xl font-extrabold text-slate-800 mt-1">{totalComprobantes}</p>
          <p className="text-[11px] text-slate-500 mt-1">comprobantes totales</p>
          <div className="mt-2 space-y-0.5">
            <p className="text-[10px] font-semibold text-slate-500">
              Con archivo real:{" "}
              <span className="font-extrabold text-emerald-700">{comprobantesConArchivo}</span>
            </p>
            <p className="text-[10px] font-semibold text-slate-500">
              Importados sin archivo:{" "}
              <span className="font-extrabold text-red-700">
                {totalComprobantes - comprobantesConArchivo}
              </span>
            </p>
          </div>
        </div>
      </div>

      {conProblemas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Mostrando {desde + 1} a {Math.min(desde + POR_PAGINA, conProblemas.length)} de{" "}
            {conProblemas.length} cliente(s) con hallazgos
          </p>
          <Paginacion paginaActual={paginaActual} totalPaginas={totalPaginas} />
        </div>
      )}

      <div className="space-y-5">
        {conProblemas.length === 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-sm font-bold text-emerald-800">
            Ninguna cuota pagada quedó sin comprobante y no hay anomalías.
          </div>
        )}

        {visibles.map((f) => (
          <div key={f.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-extrabold text-slate-800">{f.cliente}</span>
              <span className="text-xs font-bold text-slate-500">Lote {f.lote}</span>
              <span className="text-[11px] font-semibold text-slate-400">{f.proyecto}</span>
              <span className="text-[11px] font-semibold text-slate-400 ml-auto">
                {f.pagadas} de {f.totalCuotas} cuotas pagadas · {f.receipts.length} comprobante(s)
                en base
              </span>
            </div>

            {f.anomalias.length > 0 && (
              <div className="px-5 py-4 space-y-2 bg-orange-50/40 border-b border-orange-100">
                {f.anomalias.map((a, idx) => (
                  <div key={idx} className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs font-extrabold text-orange-800 bg-orange-100 border border-orange-200 rounded-lg px-2 py-0.5">
                      {a.tipo}
                    </span>
                    <span className="text-[11px] text-slate-600 basis-full">{a.detalle}</span>
                  </div>
                ))}
              </div>
            )}

            {f.huecas.length > 0 && (
              <div className="px-5 py-4 space-y-2">
                {f.huecas.map((h) => (
                  <div key={h.numero} className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs font-extrabold text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-0.5">
                      Cuota #{String(h.numero).padStart(2, "0")}
                    </span>
                    <span className="text-xs font-bold text-slate-700">{h.causa}</span>
                    <span className="text-[11px] text-slate-500 basis-full">{h.detalle}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 overflow-x-auto">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Comprobantes en la base
              </p>
              {f.receipts.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Ninguno.</p>
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead className="text-slate-400 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="pr-4 py-1">ID</th>
                      <th className="pr-4 py-1">Estado</th>
                      <th className="pr-4 py-1">Tipo</th>
                      <th className="pr-4 py-1">Cuota nominal</th>
                      <th className="pr-4 py-1">Rango</th>
                      <th className="pr-4 py-1">Cant.</th>
                      <th className="pr-4 py-1">Monto</th>
                      <th className="pr-4 py-1">Subido</th>
                      <th className="pr-4 py-1">Archivo cliente</th>
                      <th className="pr-4 py-1">PDF oficial</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700 font-semibold">
                    {f.receipts.map((r) => {
                      const tieneArchivo = archivoPorComprobante.get(r.id);
                      return (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="pr-4 py-1 font-mono">{r.id.slice(0, 8)}</td>
                          <td
                            className={`pr-4 py-1 font-extrabold ${
                              r.status === "APPROVED" ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {r.status}
                          </td>
                          <td className="pr-4 py-1">{SCOPE_LABELS[r.scope] || r.scope}</td>
                          <td className="pr-4 py-1">{r.nominal_installment_number ?? "—"}</td>
                          <td className="pr-4 py-1">{r.nominal_installment_range ?? "—"}</td>
                          <td className="pr-4 py-1">{r.installments_count ?? 1}</td>
                          <td className="pr-4 py-1">{formatCLP(r.amount_clp)}</td>
                          <td className="pr-4 py-1">{fmt(r.created_at)}</td>
                          <td
                            className={`pr-4 py-1 font-extrabold ${
                              tieneArchivo ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {tieneArchivo ? "sí" : "no"}
                          </td>
                          <td
                            className={`pr-4 py-1 font-extrabold ${
                              f.aprobadosSinPdf.some((x) => x.id === r.id)
                                ? "text-amber-700"
                                : "text-slate-400"
                            }`}
                          >
                            {f.aprobadosSinPdf.some((x) => x.id === r.id) ? "falta" : "ok"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ))}
      </div>

      {conProblemas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Página {paginaActual} de {totalPaginas}
          </p>
          <Paginacion paginaActual={paginaActual} totalPaginas={totalPaginas} />
        </div>
      )}
    </div>
  );
}
