-- =====================================================================
-- MANUAL MIGRATION: 05_whatsapp_payment_notices.sql
-- =====================================================================
-- Aviso automatico por WhatsApp cuando postventa aprueba o registra un pago.
--
-- Migracion puramente aditiva: agrega columnas nuevas a whatsapp_messages,
-- amplia la lista de categorias validas de whatsapp_templates y siembra las
-- tres plantillas nuevas. NO toca ninguna tabla financiera (reservations,
-- financial_ledger, payment_receipts) ni los triggers de proteccion.
--
-- Categorias nuevas, una por objetivo del pago:
--   PAGO_PIE      -> pago de pie
--   PAGO_CUOTA    -> cuota(s) base
--   PAGO_INTERES  -> abono a intereses / mora
--
-- Ojo: esto NO envia nada hacia atras. El aviso solo existe en el instante en
-- que alguien aprueba o registra un pago, asi que todo lo aprobado antes de
-- aplicar esta migracion queda como esta y no genera ningun mensaje.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Categorias nuevas en las plantillas
-- ---------------------------------------------------------------------
ALTER TABLE pagos.whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_category_valid;

ALTER TABLE pagos.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_category_valid
  CHECK (category IN (
    'MORA', 'GRACIA', 'PROXIMO', 'VENCIMIENTO',
    'PAGO_PIE', 'PAGO_CUOTA', 'PAGO_INTERES'
  ));

-- ---------------------------------------------------------------------
-- 2. Columnas nuevas en la bitacora
-- ---------------------------------------------------------------------
-- event_key      -> llave del pago que origino el aviso ("receipt:<uuid>").
--                   Es UNIQUE: si alguien aprieta dos veces "Aprobar", el
--                   segundo insert choca y el cliente recibe UN solo mensaje.
--                   No es una ventana de tiempo: un cliente en mora que paga
--                   la cuota y ademas abona interes el mismo dia recibe los
--                   dos avisos, porque son dos pagos distintos.
-- attempts /
-- next_attempt_at-> reintentos de la cola cuando Evolution no responde.
-- notice_concept -> "Cuota 3 - Agosto 2026", "Pago de Pie", "Abono a intereses".
-- notice_amount  -> monto informado en el mensaje (copia, igual que el nombre
--                   y el telefono, para que el historial sobreviva a la reserva).
-- lot_label      -> numero de lote tal como salio impreso en el mensaje.
ALTER TABLE pagos.whatsapp_messages
  ADD COLUMN IF NOT EXISTS event_key       VARCHAR(80),
  ADD COLUMN IF NOT EXISTS attempts        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notice_concept  VARCHAR(120),
  ADD COLUMN IF NOT EXISTS notice_amount   INTEGER,
  ADD COLUMN IF NOT EXISTS lot_label       VARCHAR(40);

-- En Postgres un indice UNIQUE admite varios NULL, asi que las filas viejas de
-- cobranza (sin event_key) conviven sin problema con esta restriccion.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_event_key
  ON pagos.whatsapp_messages (event_key);

-- La cola se consulta por estado + turno; el indice parcial la mantiene barata
-- aunque la bitacora crezca.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_queue
  ON pagos.whatsapp_messages (next_attempt_at, created_at)
  WHERE status = 'QUEUED';

-- ---------------------------------------------------------------------
-- 3. Plantillas por defecto de los avisos de pago
-- ---------------------------------------------------------------------
-- {confirmacion} se rellena solo segun de donde vino el pago:
--   comprobante subido por el cliente -> "su pago fue aprobado..."
--   registro manual de postventa      -> "registramos su pago..."
-- ON CONFLICT DO NOTHING para que correr la migracion dos veces no pise los
-- textos que postventa haya editado desde el portal.
INSERT INTO pagos.whatsapp_templates (category, name, body) VALUES
(
  'PAGO_CUOTA',
  'Pago de cuota confirmado',
  E'Hola {nombre}, le saludamos de {proyecto}.\n\n{confirmacion}\n\nDetalle del pago\nLote {lote}\n{concepto}\nMonto: {monto}\nFecha: {fecha}\n\nPuede revisar su estado de cuenta y descargar su comprobante en el portal: {portal}\n\n¡Gracias por su pago!'
),
(
  'PAGO_PIE',
  'Pago de pie confirmado',
  E'Hola {nombre}, le saludamos de {proyecto}.\n\n{confirmacion}\n\nDetalle del pago\nLote {lote}\n{concepto}\nMonto: {monto}\nFecha: {fecha}\n\nPuede revisar su estado de cuenta y descargar su comprobante en el portal: {portal}\n\n¡Gracias por su pago!'
),
(
  'PAGO_INTERES',
  'Abono a intereses confirmado',
  E'Hola {nombre}, le saludamos de {proyecto}.\n\n{confirmacion}\n\nDetalle del abono\nLote {lote}\n{concepto}\nMonto: {monto}\nFecha: {fecha}\n\nPuede revisar su estado de cuenta y descargar su comprobante en el portal: {portal}\n\nQuedamos atentos.'
)
ON CONFLICT (category) DO NOTHING;
