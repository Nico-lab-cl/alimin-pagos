-- =====================================================================
-- MANUAL MIGRATION: 08_receipt_paid_at.sql
-- =====================================================================
-- Fecha REAL en que el cliente pago, separada de la fecha en que postventa
-- aprobo el comprobante.
--
-- Hasta ahora las dos eran la misma columna (`processed_at`, que se estampa al
-- aprobar), y eso le mentia al cliente en tres lugares: la columna "Fecha de
-- Pago" de su historial, la fecha impresa en su recibo oficial y el aviso de
-- WhatsApp. Un cliente que transfiere el ultimo dia de plazo y sube el
-- comprobante al dia siguiente aparecia pagando tarde, y el portal le sumaba un
-- dia de interes que no le correspondia.
--
-- `paid_at` la declara postventa al aprobar, leyendola de la transferencia.
-- Es NULL en todo lo ya aprobado: esos registros siguen mostrando
-- `processed_at` exactamente como hasta hoy (paid_at -> processed_at ->
-- created_at), asi que la migracion no cambia ningun dato existente.
--
-- ORDEN OBLIGATORIO: esta migracion va ANTES del deploy del codigo que la usa.
-- Si el codigo sube primero, Prisma pide una columna que no existe y toda
-- consulta sobre payment_receipts falla (portal del cliente incluido). Al reves
-- no pasa nada: la columna queda creada y sin usar hasta que llegue el deploy.
-- =====================================================================

ALTER TABLE pagos.payment_receipts
  ADD COLUMN IF NOT EXISTS paid_at timestamptz NULL;

COMMENT ON COLUMN pagos.payment_receipts.paid_at IS
  'Fecha real de la transferencia, declarada por postventa al aprobar. NULL en los comprobantes anteriores a esta columna: esos caen a processed_at.';

-- Verificacion:
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'pagos'
--    AND table_name   = 'payment_receipts'
--    AND column_name  = 'paid_at';
