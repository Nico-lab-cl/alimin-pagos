import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import crypto from "crypto";

// Puente Lomas (schema public) -> Portal (schema pagos). SOLO-INSERCION:
// trae al portal los clientes de Lomas que ya reservaron+pagaron y que AUN NO
// existen en el portal. NUNCA actualiza los existentes. Se dispara por cron
// (EasyPanel) llamando este endpoint con el header Authorization: Bearer CRON_SECRET.
// Ambas apps comparten la misma BD, por eso se puede leer public."..." por SQL.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROJECT_SLUG = "lomas-del-mar";
const TEST_EMAIL = "nicolas.cab.v@gmail.com";
const TEST_RUT = "191766024"; // 19.176.602-4 (cuenta de prueba)
const RECEIPT_CATEGORIES = ["PIE", "CUOTAS", "INSTALLMENT", "MORA"];
const STAGE_RANK: Record<string, number> = { RESERVA_POR_FIRMAR: 0, RESERVA_PAGADA: 1, PIE_POR_PAGAR: 2, PIE_PAGADO: 3, PAGO_CUOTAS: 4, VENTA_CERRADA: 5 };

function normRut(r: string | null) { return (r || "").trim().toUpperCase().replace(/\./g, "").replace(/-/g, ""); }
function fileTypeFromDataUri(uri: string) { const m = (uri || "").match(/^data:([^;]+);/); return m ? m[1] : "application/pdf"; }
function parseJson(v: any): any[] { if (!v) return []; try { const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; } }

async function handle(req: NextRequest) {
  // --- Auth por CRON_SECRET ---
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization") || req.nextUrl.searchParams.get("secret") || "";
  if (!secret || (provided !== `Bearer ${secret}` && provided !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";

  const project = await prisma.project.findUnique({ where: { slug: PROJECT_SLUG } });
  if (!project) return NextResponse.json({ error: "Proyecto lomas-del-mar no existe" }, { status: 404 });

  // --- 1. Candidatas de Lomas (public schema) ---
  const candidatas: any[] = await prisma.$queryRawUnsafe(`
    SELECT r.id, r.lot_id, r.name, r.last_name, r.email, r.phone, r.rut, r.created_at,
           r.marital_status, r.profession, r.nationality, r.pipeline_stage, r.advisor, r.observation,
           r.pie, r.extra_paid_amount, r.pending_amount, r.uploaded_contract_url,
           r.address_street, r.address_number, r.address_commune, r.address_region,
           r.legacy_uploaded_contracts, r.mora_frozen, r.manual_documents, r.pie_status,
           r.installments_paid, r.legacy_debt_start_date, r.legacy_debt_end_date,
           r.legacy_installment_start_date, r.legacy_installment_ranges, r.is_legacy, r.next_payment_date,
           l.number AS lot_number, l.stage AS lot_stage, l.status AS lot_status,
           l.price_total_clp, l.reservation_amount_clp, l.pie AS lot_pie, l.cuotas, l.valor_cuota,
           l.last_installment_amount, l.area_m2
    FROM public."Reservation" r
    JOIN public."Lot" l ON r.lot_id = l.id
    WHERE r.status = 'paid' AND r.buyer_id IS NOT NULL
      AND l.status IN ('sold','reserved') AND l.stage <> 4
  `);

  // Excluir cuenta de prueba
  const validas = candidatas.filter((r) => r.email?.toLowerCase() !== TEST_EMAIL && normRut(r.rut) !== TEST_RUT);

  // Dedup por lote: mismo rut = misma persona (la mas avanzada); distinto rut = conflicto (omitir)
  const byLot = new Map<number, any[]>();
  for (const r of validas) { const k = Number(r.lot_id); if (!byLot.has(k)) byLot.set(k, []); byLot.get(k)!.push(r); }
  const finalistas: any[] = [];
  const conflictos: any[] = [];
  for (const arr of byLot.values()) {
    if (new Set(arr.map((r) => normRut(r.rut))).size > 1) { conflictos.push(arr.map((r) => `${r.name} (${r.rut}) L${r.lot_number}`)); continue; }
    finalistas.push(arr.length === 1 ? arr[0] : [...arr].sort((a, b) =>
      (Number(b.installments_paid) || 0) - (Number(a.installments_paid) || 0) ||
      (STAGE_RANK[b.pipeline_stage] ?? 0) - (STAGE_RANK[a.pipeline_stage] ?? 0) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]);
  }

  // --- 2. Lo que ya existe en el portal (no se toca) ---
  const existentesRows = await prisma.reservation.findMany({ where: { project_id: project.id }, select: { rut: true, lot: { select: { number: true, stage: true } } } });
  const existentes = new Set(existentesRows.map((r) => `${normRut(r.rut)}_${r.lot.number}_${r.lot.stage}`));

  let nuevos = 0, omitidos = 0, receiptsCreados = 0, docsCreados = 0;
  const detalle: string[] = [];

  for (const r of finalistas) {
    const key = `${normRut(r.rut)}_${r.lot_number}_${r.lot_stage}`;
    if (existentes.has(key)) { omitidos++; continue; }
    nuevos++;
    detalle.push(`${r.name} ${r.last_name || ""} - Lote #${r.lot_number}(e${r.lot_stage})`.trim());
    if (dryRun) continue;

    const email = (r.email || "").toLowerCase();

    // Usuario: crear con password de Lomas (para que entre con su misma clave); si ya existe, no tocar password
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const lomasUserRows: any[] = await prisma.$queryRawUnsafe(`SELECT password, "mustChangePassword" AS must FROM public."User" WHERE lower(email) = $1 LIMIT 1`, email);
      const lu = lomasUserRows[0];
      const hasRealPw = lu && typeof lu.password === "string" && lu.password.startsWith("$2");
      user = await prisma.user.create({ data: {
        email,
        name: `${r.name || ""} ${r.last_name || ""}`.trim() || "Sin Nombre",
        password: hasRealPw ? lu.password : await hash(crypto.randomBytes(32).toString("hex"), 10),
        role: "USER",
        portal_active: !!hasRealPw,
        must_change_password: hasRealPw ? !!lu.must : true,
        activated_at: hasRealPw ? new Date() : null,
        allowed_projects: [PROJECT_SLUG],
      } });
    } else {
      const allowed = Array.isArray(user.allowed_projects) ? (user.allowed_projects as string[]) : [];
      if (!allowed.includes(PROJECT_SLUG)) await prisma.user.update({ where: { id: user.id }, data: { allowed_projects: [...allowed, PROJECT_SLUG] } });
    }

    // Lote
    const stageStr = String(r.lot_stage ?? "");
    let lot = await prisma.lot.findUnique({ where: { project_id_number_stage: { project_id: project.id, number: r.lot_number, stage: stageStr } } });
    if (!lot) lot = await prisma.lot.create({ data: {
      project_id: project.id, number: r.lot_number, stage: stageStr,
      price_total_clp: r.price_total_clp, reservation_amount_clp: r.reservation_amount_clp,
      pie: r.lot_pie, cuotas: r.cuotas, valor_cuota: r.valor_cuota,
      last_installment_amount: r.last_installment_amount, status: r.lot_status, area_m2: r.area_m2,
    } });

    // Reserva
    const installmentStartDate = (r.is_legacy && r.legacy_installment_start_date) ? r.legacy_installment_start_date : r.created_at;
    const reservation = await prisma.reservation.create({ data: {
      project_id: project.id, lot_id: lot.id, user_id: user.id, created_at: r.created_at,
      name: (r.name || "").split(" ")[0] || r.name, last_name: r.last_name || (r.name || "").split(" ").slice(1).join(" ") || null,
      email, phone: r.phone, rut: normRut(r.rut) ? (r.rut || "").trim().toUpperCase().replace(/\./g, "") : null,
      status: "active", pie_status: r.pie_status || "PENDING", installments_paid: Number(r.installments_paid) || 0,
      pie: Number(r.pie) || 0, extra_paid_amount: Number(r.extra_paid_amount) || 0, pending_amount: Number(r.pending_amount) || 0,
      installment_start_date: installmentStartDate, installment_ranges: r.legacy_installment_ranges || undefined,
      debt_start_date: r.legacy_debt_start_date || null, debt_end_date: r.legacy_debt_end_date || null,
      next_payment_date: r.next_payment_date || null, mora_frozen: !!r.mora_frozen,
      advisor: r.advisor || null, observation: r.observation || null,
      address_street: r.address_street || null, address_number: r.address_number || null,
      address_commune: r.address_commune || null, address_region: r.address_region || null,
      marital_status: r.marital_status || null, profession: r.profession || null, nationality: r.nationality || "Chilena",
      due_day: 5, grace_days: 5, is_multilote: false,
    } });

    // Comprobantes
    const recs: any[] = await prisma.$queryRawUnsafe(`
      SELECT amount_clp, status, receipt_url, scope, installments_count, nominal_installment_number,
             nominal_installment_range, rejection_reason, created_at, processed_at
      FROM public."PaymentReceipt" WHERE reservation_id = $1`, r.id);
    for (const rec of recs) {
      await prisma.paymentReceipt.create({ data: {
        reservation_id: reservation.id, lot_id: lot.id, amount_clp: Number(rec.amount_clp),
        status: rec.status, receipt_url: rec.receipt_url, scope: rec.scope,
        installments_count: rec.installments_count == null ? 1 : Number(rec.installments_count),
        nominal_installment_number: rec.nominal_installment_number == null ? null : Number(rec.nominal_installment_number),
        nominal_installment_range: rec.nominal_installment_range, rejection_reason: rec.rejection_reason,
        created_at: rec.created_at, processed_at: rec.processed_at,
      } });
      receiptsCreados++;
    }

    // Documentos firmados (contrato reserva, promesa, otros no-comprobante)
    const docs: { name: string; url: string }[] = [];
    if (r.uploaded_contract_url?.startsWith("data:")) docs.push({ name: `Contrato de Reserva - Lote ${r.lot_number}.pdf`, url: r.uploaded_contract_url });
    for (const d of parseJson(r.legacy_uploaded_contracts)) if (d.url?.startsWith("data:")) docs.push({ name: d.name || `Promesa - Lote ${r.lot_number}.pdf`, url: d.url });
    for (const d of parseJson(r.manual_documents)) { if (RECEIPT_CATEGORIES.includes((d.category || "").toUpperCase())) continue; if (d.url?.startsWith("data:")) docs.push({ name: d.name || `Documento - Lote ${r.lot_number}.pdf`, url: d.url }); }
    for (const d of docs) {
      await prisma.reservationDocument.create({ data: { reservation_id: reservation.id, name: d.name, file_type: fileTypeFromDataUri(d.url), base64_content: d.url } });
      docsCreados++;
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    candidatas: finalistas.length,
    nuevos,
    omitidos_ya_existen: omitidos,
    conflictos: conflictos.length,
    receiptsCreados,
    docsCreados,
    detalle_nuevos: detalle,
    conflictos_detalle: conflictos,
  });
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req); }
