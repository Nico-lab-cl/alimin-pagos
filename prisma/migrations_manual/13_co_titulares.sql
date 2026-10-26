-- =====================================================================
-- MANUAL MIGRATION: 13_co_titulares.sql
-- =====================================================================
-- Co-titulares de un lote: cuando la promesa la firman dos personas (caso
-- L61 Arena y Sol, Alejandro Menares y Dominique Ramirez), las dos tienen que
-- poder entrar al portal con su propio correo y recibir los mismos avisos.
--
-- La reserva sigue teniendo UN titular (reservations.user_id), que es el que
-- figura en recibos y saldos. Cada co-titular es una fila aca, con su propio
-- usuario en pagos.users para iniciar sesion. Los pagos, cuotas y mora siguen
-- viviendo solo en la reserva: el co-titular ve exactamente lo mismo.
--
-- Migracion puramente aditiva: crea una tabla nueva y no toca ninguna fila
-- existente ni los triggers de proteccion financiera. El codigo tolera que la
-- tabla todavia no exista (simplemente no hay co-titulares), asi que el orden
-- con el Redeploy no rompe nada; igual conviene correrla antes.
-- =====================================================================

CREATE TABLE IF NOT EXISTS pagos.reservation_co_owners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID NOT NULL REFERENCES pagos.reservations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES pagos.users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  rut             VARCHAR(20),
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(50),
  address         VARCHAR(255),
  marital_status  VARCHAR(50),
  profession      VARCHAR(100),
  nationality     VARCHAR(100) DEFAULT 'Chilena',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_co_owner_reservation_user UNIQUE (reservation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_co_owners_user ON pagos.reservation_co_owners (user_id);
CREATE INDEX IF NOT EXISTS idx_co_owners_reservation ON pagos.reservation_co_owners (reservation_id);

COMMENT ON TABLE pagos.reservation_co_owners IS
  'Segundo (o tercer) comprador de un lote. Entra al portal con su propio usuario y recibe los mismos correos y WhatsApp que el titular.';
