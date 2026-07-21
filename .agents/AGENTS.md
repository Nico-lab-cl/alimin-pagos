# Reglas de Codificación del Workspace - pagos-alimin

Este archivo define reglas estrictas de seguridad y desarrollo para todos los agentes de IA (incluyendo Gemini) y desarrolladores que trabajen en este repositorio.

---

## 🚫 Regla de Seguridad Financiera (Bloqueo de Escritura)

**Queda estrictamente prohibido que cualquier script de automatización o código de servidor Next.js modifique de forma directa campos financieros de clientes sin la autorización del bypass de la base de datos.**

### 1. Campos Financieros Protegidos por Triggers de PostgreSQL:
*   **Proyectos (`pagos.projects`)**: `grace_period_days`, `daily_penalty_amount`, `due_day_of_month`.
*   **Lotes (`pagos.lots`)**: `price_total_clp`, `reservation_amount_clp`, `cuotas`, `valor_cuota`, `last_installment_amount`.
*   **Reservas (`pagos.reservations`)**: `pie`, `installments_paid`, `extra_paid_amount`, `pending_amount`, `daily_penalty`, `reservation_price`, `last_installment_value`, `due_day`, `grace_days`.

Cualquier intento de actualización directa (e.g. `prisma.reservation.update` simple) sobre estas columnas arrojará un error de base de datos (`ERROR DE SEGURIDAD (Postgres)`).

### 2. Cómo realizar cambios desde el Portal Web (Admin/Postventa)
Si estás agregando o modificando una acción legítima del servidor (Server Action o API) en Next.js que deba alterar estos valores, debes envolver obligatoriamente la llamada en una transacción interactiva de Prisma y ejecutar primero el comando de bypass de sesión:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SET LOCAL app.postventa_authorized = 'true'`);
  await tx.reservation.update({
    where: { id: reservationId },
    data: { installments_paid: nuevoValor }
  });
});
```

### 3. Cómo realizar cambios manuales desde la Consola (CLI / Script de Soporte)
Si necesitas corregir registros o realizar modificaciones manuales directas ("si o si"), **nunca crees un script personalizado temporal**. En su lugar, debes ejecutar el script oficial de soporte seguro:

```bash
npx ts-node src/scripts/safe_financial_update.ts <entidad> <id> '<json_datos>'
```

Este script se encarga de:
1. Crear un respaldo en formato JSON bajo la carpeta `backups/` antes de aplicar el cambio.
2. Iniciar una transacción de base de datos autorizada.
3. Mostrar un diff comparativo detallado de los cambios aplicados en pantalla.
4. Generar un registro de auditoría (`AuditLog`) en la base de datos.
