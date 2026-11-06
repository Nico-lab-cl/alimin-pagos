-- =====================================================================
-- MANUAL MIGRATION: 14_mi_proyecto_app.sql
-- =====================================================================
-- "Mi proyecto" en Alimin app: novedades y fotos de cada proyecto que
-- postventa publica desde /admin/proyecto-app y que ven los clientes de ese
-- proyecto en la app movil.
--
-- Las fotos se guardan como base64, igual que reservation_documents y los
-- comprobantes: el contenedor de EasyPanel no tiene disco persistente. El
-- admin las achica en el navegador antes de subirlas (lado mayor 1600 px).
--
-- Migracion puramente aditiva: crea dos tablas nuevas y no toca ninguna fila
-- existente ni los triggers de proteccion financiera. El codigo tolera que
-- las tablas todavia no existan (el admin avisa que falta esta migracion y la
-- app muestra el proyecto sin novedades), asi que el orden con el Redeploy no
-- rompe nada.
-- =====================================================================

CREATE TABLE IF NOT EXISTS pagos.project_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES pagos.projects(id) ON DELETE CASCADE,
  title         VARCHAR(160) NOT NULL,
  body          TEXT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  published_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES pagos.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_project_posts_status CHECK (status IN ('DRAFT', 'PUBLISHED'))
);

CREATE INDEX IF NOT EXISTS idx_project_posts_project ON pagos.project_posts (project_id, status, published_at DESC);

CREATE TABLE IF NOT EXISTS pagos.project_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES pagos.projects(id) ON DELETE CASCADE,
  -- NULL = foto de la galeria del proyecto; con valor = foto de esa novedad.
  post_id         UUID REFERENCES pagos.project_posts(id) ON DELETE CASCADE,
  caption         VARCHAR(160),
  mime_type       VARCHAR(50) NOT NULL,
  base64_content  TEXT NOT NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  is_cover        BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID REFERENCES pagos.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_photos_project ON pagos.project_photos (project_id, post_id, sort_order);

COMMENT ON TABLE pagos.project_posts IS
  'Novedades de un proyecto que ven sus clientes en Alimin app (Mi proyecto). Las publica postventa.';
COMMENT ON TABLE pagos.project_photos IS
  'Fotos de un proyecto para Alimin app: galeria (post_id NULL) o fotos de una novedad.';
