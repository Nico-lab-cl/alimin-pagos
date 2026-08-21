-- =====================================================================
-- MANUAL MIGRATION: 04_secondary_email.sql
-- =====================================================================
-- Correo secundario del cliente en la ficha de postventa.
--
-- El correo principal (reservations.email) es el mismo con el que el cliente
-- entra al portal y esta espejado en pagos.users.email, que es UNIQUE. Por eso
-- el correo alternativo NO puede vivir ahi: se guarda solo en la reserva, como
-- dato de contacto. No crea cuenta, no permite iniciar sesion y no se valida
-- contra los correos de otros clientes (dos personas pueden compartir el correo
-- de un familiar o de la empresa).
--
-- Migracion puramente aditiva: agrega una columna nullable. No toca los
-- triggers de proteccion financiera ni ninguna fila existente.
--
-- OJO CON EL ORDEN: esto hay que correrlo ANTES de desplegar el codigo. A
-- diferencia de las migraciones anteriores (que solo creaban tablas nuevas),
-- aca se agrega una columna a una tabla que ya se usa: Prisma nombra todas las
-- columnas del modelo en cada SELECT, asi que si el codigo sube primero, TODA
-- lectura de reservations falla hasta que se aplique este archivo.
-- =====================================================================

ALTER TABLE pagos.reservations
  ADD COLUMN IF NOT EXISTS secondary_email VARCHAR(255);

COMMENT ON COLUMN pagos.reservations.secondary_email IS
  'Correo alternativo de contacto que registra postventa. Solo informativo: no da acceso al portal.';
