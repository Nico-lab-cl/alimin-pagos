# Módulo de WhatsApp (Evolution API)

Envío manual de mensajes de cobranza a los clientes desde `/admin/whatsapp`.

## Variables de entorno

Van en Easypanel, en el servicio del portal. Sin ellas el módulo carga igual, pero
muestra "falta configurar" y no deja enviar nada.

```
EVOLUTION_API_URL=https://n8n-evolution-api.wbk5qi.easypanel.host
EVOLUTION_INSTANCE_DENISSE=Denisse
EVOLUTION_APIKEY_DENISSE=<token de la instancia de Denisse>
EVOLUTION_INSTANCE_CINDY=Cindy
EVOLUTION_APIKEY_CINDY=<token de la instancia de Cindy>

# Opcional. Techo de seguridad por instancia y por hora (default: 120).
WHATSAPP_HOURLY_LIMIT=120
```

`EVOLUTION_INSTANCE_*` es el **nombre** de la instancia, que es lo que va en la URL
del endpoint (`/message/sendText/{nombre}`). No es el UUID que aparece en la URL del
manager: ese es el `id` interno y la API de envío no lo usa.

Si el nombre no coincide, Evolution responde 404 y la pantalla lo muestra tal cual
("La instancia no existe en Evolution API"). Para ver los nombres reales que tiene
el servidor está la acción `getEvolutionDiagnostics()`, que lista lo que devuelve
`/instance/fetchInstances`.

Como alternativa, `EVOLUTION_API_KEY` sirve de apikey global si ambas instancias
comparten la misma llave.

## Reparto de instancias

Vive en `src/lib/evolution.ts`, en la constante `PROJECT_INSTANCE`:

| Instancia | Proyectos |
|---|---|
| Denisse | `libertad-y-alegria` |
| Cindy | `arena-y-sol`, `lomas-del-mar` |

## Migración

Antes del primer uso hay que aplicar `prisma/migrations_manual/03_whatsapp_tables.sql`
contra la base de producción. Crea `pagos.whatsapp_templates` y
`pagos.whatsapp_messages` y siembra las cuatro plantillas por defecto. Es puramente
aditiva: no toca ninguna tabla existente ni los triggers de protección financiera.

Sin la migración el módulo no se cae, pero cualquier consulta a esas tablas falla y
el panel muestra el error.

## Categorías

Tres salen del `status` que ya calcula `getFullPostventaData`, que es la única fuente
de verdad de la mora. La cuarta es el único filtro propio del módulo.

| Categoría | Criterio |
|---|---|
| `MORA` | `status === "LATE"` — venció y ya acumula multa |
| `GRACIA` | `status === "GRACE"` — venció, todavía dentro de los días de gracia |
| `PROXIMO` | `status === "UPCOMING"` — vence dentro de 5 días |
| `VENCIMIENTO` | la cuota vence hoy (fecha de Santiago) y aún no tiene multa |

`VENCIMIENTO` se superpone con `GRACIA`: el mismo día del vencimiento el cliente ya
entró en gracia. Son dos formas de mirar al mismo grupo; el bloqueo antirrepetición
de 24 horas evita que le llegue el mensaje dos veces si se usan ambas.

Los clientes con `status` `COMPLETED` o `FROZEN` quedan fuera de todas las categorías.

## Resguardos

- **Confirmación obligatoria** con el conteo exacto antes de enviar.
- **Envío por tramos** de 5 mensajes, con pausa de 3 a 8 segundos entre cada uno.
  Va por tramos porque 100 mensajes con esas pausas son más de 13 minutos y ninguna
  petición HTTP debería quedar colgada tanto rato; además así hay progreso real y
  botón de detener.
- **Tope de 100 por tanda** en la pantalla y **techo de 120 por hora por instancia**
  en el servidor.
- **Antirrepetición de 24 horas** por cliente y categoría. Se puede forzar con un
  checkbox, pero viene desactivado.
- **Reverificación al momento de enviar**: se releen los datos de cobranza justo
  antes de cada mensaje. Si el cliente pagó mientras se revisaba la lista, se omite.
- **Teléfonos ambiguos se rechazan** en vez de adivinarse (ver `src/lib/phone.ts`).
  Aparecen en una tabla aparte con el motivo, para corregirlos en la ficha.
- **Mensaje de prueba** a un número propio antes de soltar la tanda.

## Qué no hace todavía

- No envía solo: todo arranca con un clic de una persona.
- No manda adjuntos, solo texto.
- No sabe si el mensaje se entregó o se leyó. Registra si Evolution lo aceptó. Para
  el estado real de entrega haría falta configurar un webhook de Evolution al portal.
