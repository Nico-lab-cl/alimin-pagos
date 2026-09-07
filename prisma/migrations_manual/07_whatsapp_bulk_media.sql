-- =====================================================================
-- MANUAL MIGRATION: 07_whatsapp_bulk_media.sql
-- =====================================================================
-- Módulo de WhatsApp: Soporte para Difusión / Masivo y Envío de Archivos Adjuntos
-- (Imágenes, Videos, Documentos PDF, etc.)
-- =====================================================================

-- 1. Ampliar categorías válidas en plantillas de WhatsApp para incluir 'DIFUSION' y 'MASIVO'
ALTER TABLE pagos.whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_category_valid;

ALTER TABLE pagos.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_category_valid
  CHECK (category IN (
    'MORA', 'GRACIA', 'PROXIMO', 'VENCIMIENTO',
    'PAGO_PIE', 'PAGO_CUOTA', 'PAGO_INTERES',
    'DIFUSION', 'MASIVO'
  ));

-- 2. Agregar columnas de adjuntos (media) a la bitácora de mensajes de WhatsApp
ALTER TABLE pagos.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_type VARCHAR(20),  -- 'image' | 'video' | 'document' | null
  ADD COLUMN IF NOT EXISTS media_name VARCHAR(255), -- 'comunicado.pdf', 'flyer.png', 'video.mp4'
  ADD COLUMN IF NOT EXISTS media_url  TEXT;         -- URL o referencia del archivo si aplica

-- 3. Crear índice para optimizar consultas de mensajes con archivos adjuntos
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_media_type
  ON pagos.whatsapp_messages (media_type);

-- 4. Sembrar plantilla por defecto para Difusión Masiva
INSERT INTO pagos.whatsapp_templates (category, name, body) VALUES
(
  'DIFUSION',
  'Comunicado o Difusión General',
  E'Estimado/a {nombre},\n\nLe escribimos de {proyecto} para compartirle una información importante respecto a su lote {lote}.\n\nAdjuntamos el documento con el detalle.\n\nQuedamos atentos a cualquier consulta.\nSaludos cordiales.'
)
ON CONFLICT (category) DO NOTHING;
