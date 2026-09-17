-- La importacion del 12-03-2026 guardo el NUMERO DE CUOTA en installments_count
--
-- payment_receipts tiene dos columnas distintas:
--   nominal_installment_number  a que cuota corresponde el pago
--   installments_count          cuantas cuotas cubre ese pago (casi siempre 1)
--
-- La carga inicial escribio el numero de cuota en la segunda. Quedaron
-- comprobantes de UNA cuota diciendo "cubre 6 cuotas", con
-- nominal_installment_number en NULL.
--
-- Dos efectos, los dos visibles:
--   1. La Revision de Comprobantes daba esas cuotas por "sin respaldo": el papel
--      existe pero no esta conectado a ninguna cuota.
--   2. Al CLIENTE le aparecian como "Abono de intereses". Un comprobante
--      INSTALLMENT sin numero ni rango es exactamente lo que
--      `esAbonoDeIntereses` (src/lib/receiptDocs.ts) da por abono de mora.
--
-- Se detecto mirando a Guillermo Segundo Silva: 7 comprobantes creados en el
-- mismo milisegundo con installments_count 1..7 y $500.000 cada uno. Un pago de
-- $500.000 no puede cubrir 6 cuotas de $500.000.
--
-- QUE NO CAMBIA: installments_paid, montos, financial_ledger, saldo, mora, caja.
-- Solo se conecta cada papel con su cuota.
--
-- LA GUARDA: `pr.amount_clp = l.valor_cuota`. Si el monto alcanza para UNA sola
-- cuota, entonces installments_count no era un conteo. Un comprobante que si
-- pago varias cuotas trae el monto de varias y este UPDATE no lo puede tocar:
-- ese caso se arregla distinto, poniendole un rango ("7-9"), no un numero.
--
-- Verificado antes de aplicar: las 22 filas candidatas daban todas
-- amount_clp / valor_cuota = 1.00, sin una sola excepcion.


-- ---------------------------------------------------------------- MIRAR
SELECT r.name, r.last_name, l.valor_cuota,
       pr.installments_count AS declara, pr.amount_clp,
       round(pr.amount_clp::numeric / NULLIF(l.valor_cuota, 0), 2) AS alcanza_para,
       pr.created_at::date AS dia, pr.id
FROM pagos.payment_receipts pr
JOIN pagos.reservations r ON r.id = pr.reservation_id
JOIN pagos.lots l         ON l.id = pr.lot_id
WHERE pr.nominal_installment_number IS NULL
  AND pr.nominal_installment_range IS NULL
  AND pr.status = 'APPROVED'
  AND pr.scope = 'INSTALLMENT'
  AND pr.installments_count >= 2
ORDER BY r.name, pr.installments_count;
-- Toda fila con alcanza_para distinto de 1.00 hay que sacarla a mano y mirarla
-- aparte ANTES de seguir: es un pago real de varias cuotas.


-- --------------------------------------------------------------- ARREGLAR
BEGIN;

UPDATE pagos.payment_receipts pr
SET nominal_installment_number = pr.installments_count,
    installments_count = 1
FROM pagos.lots l
WHERE l.id = pr.lot_id
  AND pr.nominal_installment_number IS NULL
  AND pr.nominal_installment_range IS NULL
  AND pr.status = 'APPROVED'
  AND pr.scope = 'INSTALLMENT'
  AND pr.installments_count >= 2
  AND pr.amount_clp = l.valor_cuota
RETURNING pr.id, pr.nominal_installment_number AS cuota, pr.installments_count;

-- 22 filas al 17-09-2026. Si el RETURNING da otra cosa: ROLLBACK.
COMMIT;


-- -------------------------------------------------------------- VERIFICAR
-- No debe quedar ningun comprobante de cuota con installments_count > 1 y sin
-- cuota asignada.
SELECT count(*) AS quedan
FROM pagos.payment_receipts pr
JOIN pagos.lots l ON l.id = pr.lot_id
WHERE pr.nominal_installment_number IS NULL
  AND pr.nominal_installment_range IS NULL
  AND pr.status = 'APPROVED'
  AND pr.scope = 'INSTALLMENT'
  AND pr.installments_count >= 2
  AND pr.amount_clp = l.valor_cuota;


-- ------------------------------------------------------------- PENDIENTE
-- Quedan 56 comprobantes INSTALLMENT aprobados sin cuota y con
-- installments_count = 1, en 41 clientes, entre 05-03-2026 y 16-09-2026.
--
-- ESOS NO SE PUEDEN ARREGLAR CON ESTA REGLA. Ahi estan mezclados:
--   - las cuotas 1 de la misma importacion (installments_count = 1 es a la vez
--     el numero de cuota correcto y el conteo correcto, no se distinguen), y
--   - los ABONOS DE INTERESES de verdad, que se guardan asi a proposito: son
--     INSTALLMENT sin numero ni rango.
--
-- Renumerarlos a ciegas convertiria abonos de mora en pagos de cuota y le
-- sumaria cuotas a gente que no las pago. Eso si mueve plata.
--
-- Criterio propuesto para separarlos, sin aplicar todavia: tomar solo los de las
-- reservas que ademas tienen filas de esta misma importacion (las del bloque de
-- arriba) y con la misma fecha de creacion. Un abono de intereses real no viene
-- en un lote creado en el mismo milisegundo.
