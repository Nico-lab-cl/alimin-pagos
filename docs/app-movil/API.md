# API de Alimin app (clientes)

Endpoints que usa la app móvil de clientes. Viven en el mismo portal
(`pagos.aliminspa.cl`) y calculan todo con el mismo código que `/user`, así que
la app muestra exactamente lo mismo que el portal web.

La app de postventa (Capacitor, `android/`) no usa nada de esto.

## Sesión

- `POST /api/mobile/auth/login` con `{ "email", "password" }` devuelve
  `{ token, expiresAt, user }`. El token dura 30 días.
- Cada petición siguiente manda `Authorization: Bearer <token>`.
- Solo entran usuarios con rol `USER` (clientes y co-titulares). Un admin recibe
  `403 no_es_cliente`.
- Si `user.mustChangePassword` es `true`, la app tiene que pedir una contraseña
  nueva antes de seguir.
- Cambiar la contraseña invalida todos los tokens anteriores.

Firma: `MOBILE_JWT_SECRET` si está definida en EasyPanel; si no, `AUTH_SECRET`.
Conviene definir `MOBILE_JWT_SECRET` propia: así se pueden cerrar todas las
sesiones de la app cambiándola, sin tocar las del portal.

## Errores

Siempre `{ "error": { "codigo", "mensaje" } }`. `mensaje` se le puede mostrar al
cliente tal cual; `codigo` es para que la app decida qué hacer.

| Código | HTTP | Qué hacer en la app |
|---|---|---|
| `sesion_invalida` | 401 | Volver a la pantalla de ingreso |
| `credenciales` | 401 | Mostrar el mensaje en el formulario |
| `no_es_cliente` | 403 | Mostrar el mensaje |
| `demasiados_intentos` | 429 | Mostrar el mensaje y esperar |
| `mantenimiento` | 503 | Pantalla de mantenimiento |
| `datos_invalidos` | 400 | Revisar el formulario |

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/mobile/auth/login` | Ingreso con correo y contraseña |
| POST | `/api/mobile/auth/forgot` | `{ email }`. Manda el correo de recuperación (el mismo del portal, vía n8n) |
| POST | `/api/mobile/auth/change-password` | `{ currentPassword, newPassword }` (mínimo 8). Devuelve un token nuevo |
| GET | `/api/mobile/me` | `{ user, lots }`: terrenos, saldo, cuotas, mora, recibos y documentos |
| GET | `/api/mobile/notifications` | `{ notifications, unread }`, los 50 avisos más recientes |
| POST | `/api/mobile/notifications/:id/read` | Marca un aviso como leído |
| POST | `/api/mobile/push-token` | `{ token, platform: "android" \| "ios" }`. Guarda el token de Firebase |
| POST | `/api/mobile/receipts` | `multipart/form-data`: `reservationId`, `amount`, `scope` (`INSTALLMENT` o `PIE`), `installmentsCount`, `file` (JPG, PNG, HEIC o PDF, hasta 10 MB). Queda PENDING para postventa |
| GET | `/api/documents/:id` | La misma ruta del portal. Con el token Bearer sirve los recibos, comprobantes y documentos del cliente |

### `lots` en `/api/mobile/me`

Es lo que devuelve `cargarTerrenosDelUsuario` (`src/lib/terrenosCliente.ts`), con
una diferencia: cada recibo trae `hasFile` en vez de `receipt_url`, porque el
archivo viene como data-URL de varios MB. La app lo baja aparte con la `url` de
`documentos` cuando el cliente lo abre.

Campos que más usa la app: `projectName`, `projectSlug`, `lotNumber`,
`pendingBalance`, `totalPaid`, `paidCuotas`, `totalCuotas`,
`acquisitionProgress`, `isUpToDate`, `penaltyAmount`, `lateDays`,
`upcomingInstallments` (con la mora de cada cuota), `bank` y `documentos`.

Pendiente de decidir en la app: no mostrar la mora congelada ni los acuerdos de
pago (`isMoraFrozen`, y la fila `isHistorical` de `upcomingInstallments`).

## Pendiente

- Fotos y novedades de "Mi proyecto": tablas nuevas, sección en el admin y su
  endpoint.
- Notificaciones push que dispara el portal.
