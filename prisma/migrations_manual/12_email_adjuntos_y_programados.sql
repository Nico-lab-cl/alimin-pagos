-- =====================================================================
-- MANUAL MIGRATION: 12_email_adjuntos_y_programados.sql
-- =====================================================================
-- Correo masivo: varios archivos adjuntos por correo y envio programado
-- (fecha y hora de Chile).
--
-- Migracion puramente aditiva: crea dos tablas nuevas y no toca
-- email_messages ni ninguna tabla financiera. Mientras no se aplique, el
-- envio de siempre (sin adjuntos, "Enviar ahora") sigue funcionando igual;
-- solo los adjuntos y la programacion avisan que falta esta migracion.
-- Idempotente: se puede correr dos veces sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Archivos adjuntos
-- ---------------------------------------------------------------------
-- El archivo se sube UNA vez al prepararlo en la pantalla y despues cada
-- tramo de la tanda (o el programador) lo lee de aca por id, en vez de
-- viajar entero desde el navegador en cada tramo de 5 correos.
-- Los que no quedan amarrados a una tanda programada pendiente se borran
-- solos a los 7 dias (ver lib/programadorCorreos.ts).
CREATE TABLE IF NOT EXISTS pagos.email_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name   VARCHAR(255) NOT NULL,
  mimetype    VARCHAR(150) NOT NULL,
  size_bytes  INTEGER NOT NULL,
  data        BYTEA NOT NULL,
  uploaded_by VARCHAR(255),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_created ON pagos.email_attachments (created_at);

-- ---------------------------------------------------------------------
-- 2. Tandas programadas
-- ---------------------------------------------------------------------
-- Guarda el borrador TAL CUAL lo escribio postventa (con las {variables} sin
-- reemplazar): los montos, dias de mora, etc. se calculan al momento de
-- enviar, no al programar. Y al enviar se vuelve a revisar que cada cliente
-- siga en el segmento elegido: si pago entre medio, no le llega el aviso.
--
-- status: PENDING -> SENDING -> SENT | PARTIAL | FAILED
--         PENDING -> CANCELLED (postventa lo cancelo)
--         PENDING -> EXPIRED   (el servidor estuvo caido y ya era tarde)
CREATE TABLE IF NOT EXISTS pagos.email_scheduled_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_slug    VARCHAR(100) NOT NULL,
  audience        VARCHAR(30) NOT NULL,
  subject         VARCHAR(200) NOT NULL,
  body            TEXT NOT NULL,
  reservation_ids UUID[] NOT NULL,
  attachment_ids  UUID[] NOT NULL DEFAULT '{}',
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  sent_count      INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  skipped_count   INTEGER NOT NULL DEFAULT 0,
  -- Detalle de fallidos y omitidos: [{ "clientName": "...", "error": "..." }]
  detail          JSONB,
  error           TEXT,
  created_by      VARCHAR(255) NOT NULL,
  cancelled_by    VARCHAR(255),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  -- Lo actualiza el programador mientras envia; si deja de moverse (el
  -- servidor se reinicio a mitad de tanda) otra vuelta retoma desde donde
  -- quedo, sin repetir a quienes ya les salio el correo.
  heartbeat_at    TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_scheduled_status_at
  ON pagos.email_scheduled_batches (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_scheduled_created
  ON pagos.email_scheduled_batches (created_at DESC);
