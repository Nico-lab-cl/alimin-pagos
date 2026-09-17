-- Caroline Macarena Vera Maulen (RUT 19405459-9) - Lomas del Mar, lote 37-2
--
-- El comprobante que quedo estampado como CUOTA 8 corresponde en realidad a la
-- CUOTA 5. Lo confirmo postventa mirando el documento.
--
-- Sintoma: la Revision de Comprobantes la marcaba en rojo por desfase -"ultimo
-- comprobante: cuota 8" contra una ficha que cuenta 7 cuotas pagadas- y la
-- cuota 5 aparecia sin respaldo. Las dos cosas son el mismo comprobante mal
-- rotulado.
--
-- QUE NO CAMBIA ESTO:
--   installments_paid           sigue en 7
--   amount_clp del comprobante  no se toca
--   financial_ledger            no se toca (ninguna fila referencia este campo)
--   mora / abonos               no se tocan: crearAplicadorDeAbonosMora solo
--                               mira recibos con scope='MORA' y este es
--                               'INSTALLMENT'
--   saldo, caja, fechas         no se tocan
-- Lo unico que cambia es a que cuota apunta el papel.
--
-- Los triggers de 01_financial_protection_triggers.sql protegen projects, lots
-- y reservations. payment_receipts NO esta protegido, asi que este UPDATE no
-- necesita app.postventa_authorized.


-- ===========================================================================
-- PASO 1 - MIRAR. Correr solo esto primero y leer el resultado.
-- ===========================================================================
SELECT
  pr.id,
  pr.scope,
  pr.status,
  pr.amount_clp,
  pr.nominal_installment_number AS cuota,
  pr.nominal_installment_range  AS rango,
  pr.paid_at,
  pr.created_at,
  pr.oculto_at,
  (pr.receipt_url IS NOT NULL AND pr.receipt_url <> '') AS tiene_archivo
FROM pagos.payment_receipts pr
JOIN pagos.reservations r ON r.id = pr.reservation_id
WHERE replace(replace(coalesce(r.rut, ''), '.', ''), ' ', '') = '19405459-9'
ORDER BY pr.nominal_installment_number NULLS LAST, pr.created_at;

-- Antes de seguir, comprobar en ese listado:
--   a) hay EXACTAMENTE UNA fila con cuota = 8, scope = 'INSTALLMENT' y rango NULL;
--   b) NO hay ya otra fila aprobada con cuota = 5 (si la hay, PARAR: entonces
--      son dos comprobantes distintos y hay que mirarlos uno por uno antes de
--      renumerar nada).


-- ===========================================================================
-- PASO 2 - ARREGLAR. Solo si el paso 1 dio lo esperado.
-- ===========================================================================
-- El UPDATE va dentro de una transaccion y devuelve lo que toco. Si RETURNING
-- muestra mas de una fila, o muestra algo que no reconoces, hacer ROLLBACK.
BEGIN;

UPDATE pagos.payment_receipts pr
SET nominal_installment_number = 5
FROM pagos.reservations r
WHERE r.id = pr.reservation_id
  AND replace(replace(coalesce(r.rut, ''), '.', ''), ' ', '') = '19405459-9'
  AND pr.scope = 'INSTALLMENT'
  AND pr.nominal_installment_number = 8
  -- Nunca tocar un comprobante que cubre un rango de cuotas: ese se renumera
  -- distinto y no es el caso.
  AND pr.nominal_installment_range IS NULL
RETURNING pr.id, pr.amount_clp, pr.nominal_installment_number AS cuota_nueva, pr.paid_at;

-- Revisar el RETURNING: debe ser UNA sola fila, con cuota_nueva = 5 y el monto
-- que esperabas. Si esta bien:
COMMIT;
-- Si no:
-- ROLLBACK;


-- ===========================================================================
-- PASO 3 - VERIFICAR. Correr despues del COMMIT.
-- ===========================================================================
-- Deberia quedar sin ninguna cuota por encima de 7, que es lo que cuenta su
-- ficha, y con la cuota 5 respaldada.
SELECT
  pr.nominal_installment_number AS cuota,
  pr.nominal_installment_range  AS rango,
  pr.status,
  pr.amount_clp
FROM pagos.payment_receipts pr
JOIN pagos.reservations r ON r.id = pr.reservation_id
WHERE replace(replace(coalesce(r.rut, ''), '.', ''), ' ', '') = '19405459-9'
  AND pr.scope = 'INSTALLMENT'
ORDER BY pr.nominal_installment_number NULLS LAST;
