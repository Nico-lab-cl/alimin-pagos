-- =====================================================================
-- MANUAL MIGRATION: 09_receipt_oculto.sql
-- =====================================================================
-- Permite sacar de la vista el recibo oficial de un pago SIN tocar el pago.
--
-- El recibo oficial ("Recibo_Oficial_Cuotas_21-22.pdf") no es un archivo
-- guardado: se genera al vuelo desde el comprobante, cada vez que alguien lo
-- abre. Por eso hasta ahora no habia forma de sacarlo del listado. El boton de
-- borrar que aparece al lado tampoco servia: busca un documento con id
-- "official-<id del pago>", no lo encuentra, y termina en "Documento no
-- encontrado". La unica eliminacion que existia era borrar el PAGO, que
-- revierte cuotas y saca plata de caja.
--
-- Postventa necesitaba lo otro: que un recibo deje de verse porque quedo mal
-- emitido (por ejemplo, con rangos de cuota pisados), sin mover un peso.
--
-- `oculto_at` es esa marca. El pago sigue intacto: su monto, sus cuotas y su
-- fila de caja no se tocan. Solo deja de listarse el recibo. Es reversible:
-- basta con volver la columna a NULL.
--
-- Es NULL en todo lo existente, asi que esta migracion no cambia ni un dato ni
-- esconde nada de lo que hoy se ve.
--
-- ORDEN OBLIGATORIO: esta migracion va ANTES del deploy del codigo que la usa.
-- Si el codigo sube primero, Prisma pide una columna que no existe y toda
-- consulta sobre payment_receipts falla (portal del cliente incluido). Al reves
-- no pasa nada: la columna queda creada y sin usar hasta que llegue el deploy.
-- =====================================================================

ALTER TABLE pagos.payment_receipts
  ADD COLUMN IF NOT EXISTS oculto_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS oculto_motivo text      NULL;

COMMENT ON COLUMN pagos.payment_receipts.oculto_at IS
  'Cuando se oculto el recibo oficial de este pago. NULL = visible. Ocultar NO toca el pago: ni monto, ni cuotas, ni caja.';

COMMENT ON COLUMN pagos.payment_receipts.oculto_motivo IS
  'Por que se oculto, escrito por postventa. Queda ademas en la bitacora del cliente.';

-- Verificacion:
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'pagos'
--    AND table_name   = 'payment_receipts'
--    AND column_name IN ('oculto_at', 'oculto_motivo');
