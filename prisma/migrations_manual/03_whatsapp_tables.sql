-- =====================================================================
-- MANUAL MIGRATION: 03_whatsapp_tables.sql
-- =====================================================================
-- Modulo de WhatsApp del portal: plantillas editables y bitacora de envios
-- hacia Evolution API.
--
-- Migracion puramente aditiva: crea dos tablas nuevas y siembra las cuatro
-- plantillas por defecto. No toca ninguna tabla existente ni los triggers de
-- proteccion financiera.
--
-- Categorias (calzan con el estado que ya calcula getFullPostventaData):
--   MORA         → status LATE       (la cuota ya genera multa diaria)
--   GRACIA       → status GRACE      (vencio, aun dentro de los dias de gracia)
--   PROXIMO      → status UPCOMING   (vence dentro de los proximos 5 dias)
--   VENCIMIENTO  → la cuota vence hoy (fecha de Santiago)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Plantillas
-- ---------------------------------------------------------------------
-- La restriccion de categoria va en linea y no en un bloque DO: asi el archivo
-- se puede pegar entero en cualquier consola SQL, incluidas las que cortan el
-- script por punto y coma y se atragantan con $$.
CREATE TABLE IF NOT EXISTS pagos.whatsapp_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category   VARCHAR(20) NOT NULL UNIQUE
             CONSTRAINT whatsapp_templates_category_valid
             CHECK (category IN ('MORA', 'GRACIA', 'PROXIMO', 'VENCIMIENTO')),
  name       VARCHAR(100) NOT NULL,
  body       TEXT NOT NULL,
  active     BOOLEAN DEFAULT TRUE,
  updated_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 2. Bitacora de mensajes enviados
-- ---------------------------------------------------------------------
-- reservation_id va con ON DELETE SET NULL a proposito: si se borra la
-- reserva, el historial de lo enviado sobrevive porque el nombre y el
-- telefono quedan copiados en la propia fila.
CREATE TABLE IF NOT EXISTS pagos.whatsapp_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID REFERENCES pagos.reservations(id) ON DELETE SET NULL,
  project_slug   VARCHAR(100) NOT NULL,
  instance       VARCHAR(50) NOT NULL,
  category       VARCHAR(20) NOT NULL,
  client_name    VARCHAR(255) NOT NULL,
  phone          VARCHAR(30) NOT NULL,
  message        TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'SENT',
  error          TEXT,
  evolution_id   VARCHAR(160),
  sent_by        VARCHAR(255),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created     ON pagos.whatsapp_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_category    ON pagos.whatsapp_messages (category);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_project     ON pagos.whatsapp_messages (project_slug);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_reservation ON pagos.whatsapp_messages (reservation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_instance    ON pagos.whatsapp_messages (instance);

-- ---------------------------------------------------------------------
-- 3. Plantillas por defecto
-- ---------------------------------------------------------------------
-- ON CONFLICT DO NOTHING para que correr la migracion dos veces no pise los
-- textos que postventa haya editado desde el portal.
INSERT INTO pagos.whatsapp_templates (category, name, body) VALUES
(
  'MORA',
  'Cuota en mora',
  E'Hola {nombre}, le escribimos de {proyecto}.\n\nSu cuota {cuota} ({mes_cuota}) del lote {lote} venció el {fecha_vencimiento} y registra {dias_mora} días de atraso.\n\nMonto de la cuota: {monto}\nMulta acumulada: {multa}\nTotal a pagar: {total}\n\nPuede revisar su estado de cuenta y subir su comprobante en el portal: {portal}\n\nSi ya realizó el pago, por favor ignore este mensaje o envíenos el comprobante. Quedamos atentos.'
),
(
  'GRACIA',
  'Dentro del período de gracia',
  E'Hola {nombre}, le escribimos de {proyecto}.\n\nSu cuota {cuota} ({mes_cuota}) del lote {lote} venció el {fecha_vencimiento}, pero aún está dentro del período de gracia de {dias_gracia} días, así que todavía no genera multa.\n\nMonto a pagar: {monto}\n\nSi paga dentro del plazo evita el recargo por atraso. Puede subir su comprobante en el portal: {portal}\n\nQuedamos atentos.'
),
(
  'PROXIMO',
  'Próximo a vencer',
  E'Hola {nombre}, le saludamos de {proyecto}.\n\nLe recordamos que su cuota {cuota} ({mes_cuota}) del lote {lote} vence el {fecha_vencimiento}.\n\nMonto a pagar: {monto}\n\nPuede realizar el pago y subir su comprobante en el portal: {portal}\n\n¡Gracias por su puntualidad!'
),
(
  'VENCIMIENTO',
  'Vence hoy',
  E'Hola {nombre}, le saludamos de {proyecto}.\n\nHoy {fecha_vencimiento} vence su cuota {cuota} ({mes_cuota}) del lote {lote}.\n\nMonto a pagar: {monto}\n\nSi paga hoy no se genera ningún recargo. Puede subir su comprobante en el portal: {portal}\n\nQuedamos atentos.'
)
ON CONFLICT (category) DO NOTHING;
