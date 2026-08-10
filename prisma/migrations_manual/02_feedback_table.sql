-- =====================================================================
-- MANUAL MIGRATION: 02_feedback_table.sql
-- =====================================================================
-- Retroalimentación del portal del cliente: sugerencias libres y encuesta NPS.
-- Migración puramente aditiva: crea una tabla nueva, no toca ninguna existente
-- ni los triggers de protección financiera.
--
--   type = 'COMMENT'   → sugerencia / problema / felicitación (category + message)
--   type = 'NPS'       → respuesta de la encuesta (score 0-10 + message opcional)
--   type = 'NPS_SKIP'  → el cliente pospuso la encuesta (se re-pregunta a los 90 días)
-- =====================================================================

CREATE TABLE IF NOT EXISTS pagos.feedback (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES pagos.users(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES pagos.reservations(id) ON DELETE SET NULL,
  type           VARCHAR(20) NOT NULL,
  category       VARCHAR(30),
  score          INTEGER,
  message        TEXT,
  status         VARCHAR(20) DEFAULT 'NEW',
  page_context   VARCHAR(160),
  admin_note     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- El puntaje NPS solo admite la escala 0-10 (o nada, para comentarios libres).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_score_range'
  ) THEN
    ALTER TABLE pagos.feedback
      ADD CONSTRAINT feedback_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 10));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_feedback_created ON pagos.feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status  ON pagos.feedback (status);
CREATE INDEX IF NOT EXISTS idx_feedback_type    ON pagos.feedback (type);
CREATE INDEX IF NOT EXISTS idx_feedback_user    ON pagos.feedback (user_id);
