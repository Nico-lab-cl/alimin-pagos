-- =====================================================================
-- MANUAL MIGRATION: 06_email_marketing.sql
-- =====================================================================
-- Modulo de correo masivo del portal: postventa escribe asunto + cuerpo,
-- elige a quien, y el envio real lo hace n8n (nodo Gmail con las cuentas
-- de Cindy y Denisse), que este modulo llama por webhook.
--
-- Migracion puramente aditiva: crea dos tablas nuevas. No toca ninguna
-- tabla financiera ni los triggers de proteccion.
--
-- El portal NO guarda contraseñas de Gmail ni credenciales de Google: solo
-- guarda con QUE cuenta ("buzon": cindy | denisse) se mando cada correo,
-- que es un dato de negocio, no un secreto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Plantillas guardadas (borradores reutilizables)
-- ---------------------------------------------------------------------
-- A diferencia de las plantillas de WhatsApp, aca NO hay una categoria fija
-- por fila: son borradores con nombre libre que postventa crea, reutiliza y
-- edita ("Aviso corte de agua", "Recordatorio junta de vecinos"...). El marco
-- visual (logo, colores, pie legal) no vive en la base: lo aplica el codigo
-- del portal al momento de enviar, siempre igual para todos los proyectos.
CREATE TABLE IF NOT EXISTS pagos.email_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(150) NOT NULL,
  subject    VARCHAR(200) NOT NULL,
  body       TEXT NOT NULL,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_created ON pagos.email_templates (created_at DESC);

-- ---------------------------------------------------------------------
-- 2. Bitacora de correos enviados
-- ---------------------------------------------------------------------
-- reservation_id va con ON DELETE SET NULL, mismo criterio que
-- whatsapp_messages: si se borra la reserva, el historial de lo enviado
-- sobrevive porque el nombre y el correo quedan copiados en la propia fila.
--
-- batch_id agrupa los correos de una misma tanda (un "Enviar" en la pantalla),
-- para poder mostrar "esta tanda: 40 enviados, 2 fallidos" sin tener que
-- adivinarlo por fecha.
CREATE TABLE IF NOT EXISTS pagos.email_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID REFERENCES pagos.reservations(id) ON DELETE SET NULL,
  project_slug   VARCHAR(100) NOT NULL,
  buzon          VARCHAR(20) NOT NULL
                 CONSTRAINT email_messages_buzon_valid CHECK (buzon IN ('cindy', 'denisse')),
  batch_id       UUID NOT NULL,
  client_name    VARCHAR(255) NOT NULL,
  to_email       VARCHAR(500) NOT NULL,
  subject        VARCHAR(300) NOT NULL,
  -- Cuerpo COMPLETO tal como se mando (marco + texto de postventa, ya con las
  -- variables reemplazadas), para que el historial pueda mostrar exactamente
  -- lo que el cliente recibio.
  body_html      TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  error          TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  sent_by        VARCHAR(255),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_created     ON pagos.email_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_project     ON pagos.email_messages (project_slug);
CREATE INDEX IF NOT EXISTS idx_email_messages_status      ON pagos.email_messages (status);
CREATE INDEX IF NOT EXISTS idx_email_messages_batch       ON pagos.email_messages (batch_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_reservation ON pagos.email_messages (reservation_id);
