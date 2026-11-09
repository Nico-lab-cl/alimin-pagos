# Bitácora completa de trabajo — Portal de Pagos Alimin

**Proyecto:** `pagos-alimin` (portal de postventa y pagos — `pagos.aliminspa.cl`)
**Periodo cubierto:** 12 de abril de 2026 → 9 de octubre de 2026 (≈ 6 meses)
**Ramas:** `v2` (rama de trabajo y despliegue) · `main` (172 commits detrás de `v2`)
**Autor de los commits:** Nico-lab-cl (con asistencia de Claude desde fines de junio)
**Fuente:** historial git completo del repositorio, mensajes de commit, bitácoras semanales previas en `docs/bitacoras/` y documentación en `docs/`.
**Generada:** 11 de octubre de 2026

> Esta es la bitácora de *desarrollo* (qué se construyó, qué se arregló, por qué y a quién afectó). No hay que confundirla con la "Bitácora" del cliente dentro de la app, que es el registro de notas de cada ficha.

---

## Índice

1. [Cifras generales](#1-cifras-generales)
2. [Qué es el sistema](#2-qué-es-el-sistema)
3. [Línea de tiempo por fases](#3-línea-de-tiempo-por-fases)
   - [Fase 1 — Fundación (12–30 abr)](#fase-1--fundación-del-portal-12-al-30-de-abril)
   - [Fase 2 — Recibos, analítica e inventario (mayo)](#fase-2--recibos-analítica-e-inventario-mayo)
   - [Fase 3 — Legal, auditoría de historial y rediseño (junio)](#fase-3--legal-auditoría-de-historial-y-rediseño-junio)
   - [Fase 4 — Mora correcta, manual y llegada de Lomas del Mar (julio)](#fase-4--mora-correcta-manual-y-llegada-de-lomas-del-mar-julio)
   - [Fase 5 — Marca, Android y comunicación con clientes (agosto)](#fase-5--marca-android-y-comunicación-con-clientes-agosto)
   - [Fase 6 — Comprobantes, documentos y cuadre de caja (septiembre)](#fase-6--comprobantes-documentos-y-cuadre-de-caja-septiembre)
   - [Fase 7 — Automatización y acuerdos de mora (octubre)](#fase-7--automatización-y-acuerdos-de-mora-octubre)
4. [Catálogo de módulos construidos](#4-catálogo-de-módulos-construidos)
5. [Bugs importantes corregidos y clientes afectados](#5-bugs-importantes-corregidos-y-clientes-afectados)
6. [Migraciones manuales de base de datos](#6-migraciones-manuales-de-base-de-datos)
7. [Correcciones de datos puntuales](#7-correcciones-de-datos-puntuales)
8. [Reglas de negocio acordadas](#8-reglas-de-negocio-acordadas)
9. [Infraestructura, despliegue e integraciones](#9-infraestructura-despliegue-e-integraciones)
10. [Pendientes y riesgos conocidos](#10-pendientes-y-riesgos-conocidos)
11. [Anexo — Listado completo de commits](#11-anexo--listado-completo-de-commits)

---

## 1. Cifras generales

| Indicador | Valor |
|---|---|
| Commits del portal (`v2`) | **374** |
| Días con commits | 84 |
| Primer commit | 12-04-2026 02:16 — *Initial commit from Create Next App* |
| Último commit | 09-10-2026 15:31 — *modo "Monto Pactado" para acuerdos de intereses* |
| Archivos en `src/` | 110 |
| Líneas de código TypeScript/TSX en `src/` | ≈ 42.300 |
| Migraciones SQL manuales | 11 |
| Proyectos inmobiliarios atendidos | 3 — Arena y Sol, Libertad y Alegría, Lomas del Mar |

**Commits por mes**

| Mes | Commits | Lo principal |
|---|---:|---|
| Abril 2026 | 142 | Construcción del portal admin + cliente, motor de mora, app Android, ledger |
| Mayo 2026 | 40 | Recibos PDF automáticos, analítica de ingresos, inventario, desglose de mora |
| Junio 2026 | 53 | Rol Legal, rediseño completo, portal de pago tipo carrusel, triggers de protección |
| Julio 2026 | 47 | Bugs de mora, manual de postventa, pantalla de Auditoría, paridad con Lomas, puente Lomas→Portal |
| Agosto 2026 | 26 | Rediseño verde de marca, descargas en Android, WhatsApp, correo masivo, NPS |
| Septiembre 2026 | 58 | Fichas duplicadas, fecha real de pago, recibo único, Mis Documentos, Revisión de Comprobantes, Cuadre de Caja |
| Octubre 2026 (al 9) | 8 | Elegir cuotas al aprobar, resumen semanal automático, modo PACTADO |

> **Contexto:** el remoto `lomas_repo` (sitio `aliminlomasdelmar.com`, en marcha desde el 31-01-2026) es **otro repositorio** con 941 commits propios. Aparece en este git solo como referencia. Esta bitácora cubre el portal de pagos; Lomas se menciona cuando el portal tuvo que integrarse con él.

---

## 2. Qué es el sistema

Es un portal web (con app Android) para la **postventa** de terrenos vendidos en cuotas:

- **Portal del cliente (`/user`)**: el comprador ve su lote, sus cuotas, la mora, sube el comprobante de su transferencia, descarga recibos oficiales y documentos (contrato, certificados) y deja sugerencias o responde la encuesta NPS.
- **Panel de postventa (`/admin`)**: directorio de clientes con ficha completa, bandeja de comprobantes por aprobar, registro de pagos manuales, alertas de mora, inventario de lotes, informes, auditoría, WhatsApp, correo masivo, revisión de comprobantes y cuadre de caja.
- **Consola Legal (`/legal`)**: vista de solo lectura de morosos para cobranza judicial, con exportación a Excel y acceso a documentos.

**Stack:** Next.js 16 (App Router, Server Actions), Prisma sobre PostgreSQL (esquema `pagos`, compartiendo la base con el esquema `public` de Lomas), Tailwind, Capacitor (Android), `@react-pdf/renderer` para recibos, n8n para correos, Evolution API para WhatsApp, despliegue en EasyPanel.

---

## 3. Línea de tiempo por fases

### Fase 1 — Fundación del portal (12 al 30 de abril)

**142 commits en 19 días.** Se construye el sistema desde cero y se cargan los datos reales.

**12 abr — Arranque y marca.** Proyecto creado con Create Next App. Esa misma tarde entra la interfaz oscura premium para admin y cliente, el login, la paleta esmeralda y dorado y el logo de la hoja Alimin como favicon. Se agregan logs de autenticación para diagnosticar el despliegue en EasyPanel.

**13 abr — Datos y ficha financiera.** Se adapta el esquema (etapa de lote como texto, multas diarias por usuario) y se crea el **script de importación** de la planilla, que se ajusta para el archivo de Libertad y Alegría. En el directorio de clientes entran paginación, filtro por etapa, modal de detalle, modo edición de perfil con avisos de campos faltantes y **modo de edición financiera**. Se agrega día de vencimiento y días de gracia por cliente, con cálculo automático de mora, y un selector de calendario para la próxima fecha de pago. Unos diez commits de ajuste resuelven errores de build y de guardado.

**14 abr — Estados y segundo proyecto.** Selector de estado financiero de tres opciones (**Activo / Congelado / Al Día**). Se **migra el proyecto Arena y Sol**. Se manejan los clientes **Al Contado** (pagados completos) y se archivan las fichas de relleno. El inventario cruza lotes con clientes y se detectan dueños de varios lotes.

**15 abr — Documentos y motor de pago.** Sistema de **gestión documental** para admin y cliente. El portal de pago pasa a **seleccionar cuotas en orden cronológico con su multa incluida**, muestra días de atraso e interés de cada cuota y un botón para copiar todos los datos bancarios. Entra la tasa de interés diaria y el **modo de multa FIXED/AUTO**, que arrastra el faltante al aprobar. Multi-lote: solo cuenta reservas activas con correo real.

**16–18 abr — Herramientas de postventa.** Marcado manual de multi-lote, exclusión de contactos archivados, componente **DatePicker** propio (con arreglo de desfase de un día por zona horaria), vista **"Ver como cliente" (Client POV)** para que postventa vea exactamente el portal del cliente, cálculo dinámico de la próxima fecha desde las cuotas pagadas, monto del pie visible y previsualización de documentos.

**20 abr — Zona horaria y caja.** Las fechas pasan a presentarse en **America/Santiago**. Interruptor manual "Al Contado". Se implementa el **libro de caja (FinancialLedger)** y las métricas mensuales del dashboard.

**23 abr — App Android.** Primera versión de la **app Android con Capacitor**: notificaciones push y visor de documentos. Detección de formato por *magic numbers* para que las descargas tengan extensión correcta, **búsqueda global** sincronizada en el admin, límite de 10 MB por archivo, multas sumadas para pagos de varias cuotas y todas las cuotas disponibles en vez de solo 12.

**24 abr — Recuperación de clave y notificaciones.** Flujo de recuperación de contraseña, tabla del ledger, subida de comprobantes desde el POV, previsualización PDF en línea con *lightbox* y **notificaciones persistentes** de pagos aprobados y rechazados.

**26–27 abr — Activación de clientes.** Campo de observación de postventa, **precios de cuotas anteriores** (tramos de precio históricos), **activación de cliente con contraseña temporal** enviada por webhook de **n8n** con plantilla HTML, pestaña PRUEBAS, pantalla de cambio de clave rediseñada, **fecha de término de deuda** (`debt_end_date`) para topar el interés, fechas manuales de mora, historial de transacciones con eliminación y el **modo de multa MIXED** (fijo + automático). Las cuotas vencidas pasan a ser **obligatorias** al pagar y el interés se calcula agregado y repartido por cuota.

**29–30 abr — Historial y fórmulas.** Desacople de usuarios que compartían correo, primer **dashboard de Email Marketing**, historial de comprobantes y reconstrucción del historial financiero desde los datos migrados. Se fijan las fórmulas de **Total Invertido** y **Saldo Remanente** (cuotas + pie completo). Se quita "Abono al Pie" del portal porque todos los pies estaban pagados. Columna de contraseña temporal para que postventa envíe credenciales a mano.

### Fase 2 — Recibos, analítica e inventario (mayo)

**40 commits.**

- **4 may — Recibo PDF automático.** Al aprobar un pago se genera un **comprobante digital en PDF** (luego rediseñado con estética formal), con titular de la cuenta y número de cuenta corregidos, copia al portapapeles con respaldo para contextos sin HTTPS y sección **Documentos** en el portal del cliente.
- **6–7 may — Ingresos e inventario.** Monto extra pagado editable, **dashboard de ingresos** con gráficos mensuales y libro detallado, filtros de fecha dinámicos al estilo HubSpot, agrupación diaria, PIE excluido de la analítica. **Asignación de lote y dueño desde el inventario.**
- **14–15 may — Mora detallada.** Submenú Reservas (vacío a la espera del CRM). Arreglo: en modo FIXED ahora **se acumula la mora automática** de las cuotas atrasadas. Atraso Contable muestra **cuotas individuales en mora**, mora histórica fija visible y modal de desglose en Alertas. **Rediseño del modal de cliente con pestañas**, optimizado para móvil.
- **18 may — Pago manual.** Formulario de **pago manual con comprobante obligatorio** en Finanzas y Saldos. Barra lateral que se expande al pasar el mouse. Interés atrasado **dinámico según calendario**. Clientes al contado ven sus documentos.
- **26 may.** Comprobantes autogenerados también en pagos manuales y visibles en el historial de la bandeja.

### Fase 3 — Legal, auditoría de historial y rediseño (junio)

**53 commits.**

- **1–2 jun — Fechas y reseteo de mora.** Corrección del día de pago, mora continua al limpiar la fecha de fin, **reseteo completo de mora al aprobar** comprobante o pago manual. Correos en minúscula y contraseñas temporales con `crypto`.
- **5 jun — Rol Legal.** Nuevo rol **abogado** con **dashboard unificado de morosos** de solo lectura, tarjetas clickeables y **exportación a Excel**.
- **8 jun — Trazabilidad.** Editar el monto de un registro del historial financiero **con registro de auditoría**, **log de accesos al portal** (activaciones, cambios de clave, logins), regeneración automática del PDF al editar un monto y edición de la cantidad de cuotas en pagos manuales.
- **15–16 jun — Zona horaria.** Corrección del desfase en el cálculo de días de mora y de la doble conversión en `getChileToday`.
- **17 jun.** Se agrega `DESIGN.md` con la guía de estilo y UX.
- **22 jun — Rediseño completo del portal** (25 archivos, +6.600 líneas): nuevos componentes, arreglo de descarga de documentos, reservas optimizadas, selección por checkbox en el CRM, rango de fechas propio, consola Legal en tema claro, menú de informes según maqueta, buscador con autocompletado por nombre, RUT o correo, selector de proyecto en informes y gráfico mensual desde la base. Arreglo: las actualizaciones parciales ya no borran las finanzas del cliente.
- **24–26 jun — Portal de pago premium.** Mes de la cuota en la bandeja, comprobantes aprobados en la lista de documentos, **desglose detallado de mora con texto legal**, distintivo de cuenta congelada, notas automáticas en la Bitácora al congelar o ajustar, barra lateral colapsable con memoria, **carrusel interactivo de cuotas**, fecha de vencimiento de mora = día de pago + días de gracia, arreglo del **doble conteo de la mora histórica** y selector de cuotas obligatorias/opcionales.
- **30 jun — Triggers de protección financiera.** La base pasa a tener *triggers* que bloquean cambios en los campos financieros protegidos. Todas las server actions de postventa que los tocan pasan a declarar `SET LOCAL app.postventa_authorized = 'true'` dentro de su transacción (antes fallaban con "Error al aprobar").

### Fase 4 — Mora correcta, manual y llegada de Lomas del Mar (julio)

**47 commits.** Desde aquí los commits traen explicaciones largas, verificación contra datos reales y el impacto en clientes.

**1–10 jul — Corrección y documentación**
- Doble conteo de mora histórica en el total a pagar (Francisco Ramírez: $224.000 en vez de $212.000; Yanis López: $557.000 en vez de $378.500).
- Regenerar contraseña **siempre** envía WhatsApp y correo con un hash nuevo (caso Luis Bernal, "credenciales no válidas").
- **`docs/ARQUITECTURA.md`**: mapa completo del sistema (modelo de datos, motor de mora, ciclo de pagos, autenticación, integraciones, catálogo de acciones, riesgos).
- `toggleAlContado` y `toggleMultiLot` quedan en AuditLog. **Manual de postventa en PDF** (7 páginas, luego 9), con roadmap de futuras implementaciones y hallazgos de auditoría.
- La mora histórica ya no cuenta como cuota al pagar. **Aprobación atómica**: el recibo se marca APROBADO dentro de la misma transacción que suma la cuota.
- Se puede eliminar cualquier documento del cliente, con reversión financiera si era un comprobante aprobado, y queda en la Bitácora.
- Ya no se obligan cuotas en gracia (casos Solange L36, Sergio L49, Carolina L11B).
- Legal puede ver y descargar los documentos del cliente.
- Nueva nota **"Observación"** que avisa al cliente por portal y por correo "ALIMIN | IMPORTANTE".
- **Pantalla de Auditoría** (`/admin/audit`): origen Postventa/Desarrollador, detalle, filtros y nombre real del cliente.
- Directorio ordenable por **número de lote** (orden natural) y por **monto de mora**. La pestaña En Mora ordena sola y muestra "Mora Acumulada".

**17 jul — Mora real y abono de intereses**
- **Bug de producción:** al aprobar, el faltante se comparaba solo contra la mora fija e ignoraba la automática, así que la mora se **borraba sin aviso** (caso Jorge Urra: $35.000). Se crea `calculateCurrentMoraOwed()`.
- **Abono de Intereses** en la bandeja y en el pago manual.
- Editar y eliminar registros del Historial de Pagos con motivo obligatorio y reversión exacta.
- Nota automática con el desglose de cuota y días al fijar mora.
- **La multa fija/mixta crece día a día** mientras no se pague (`calculateGrowingFixedPenalty`). Se activó a mano para Magdalena Cofre y Omar Ruiz.

**20–24 jul — Lomas del Mar entra al portal**
- **Modo mantenimiento** con redirección en el middleware.
- Proyectos dinámicos (`getAdminProjects`) en vez de fijos. Se restan los abonos `scope=MORA`.
- 87 comprobantes migrados de Lomas sin archivo (`LEGACY_SYNC`, `CONDONACION_ADMIN`) muestran "Sin comprobante digital".
- **Paridad exacta con aliminlomasdelmar.com**: Total Pagado, Saldo y mora con la fórmula de Lomas (`calculateLomasInterest`), verificado **66/66 clientes al peso**. Solo para `lomas-del-mar`.
- **Recuperación de contraseña funcional** vía n8n y pantallas con la paleta del login, accesibles sin sesión.
- **Puente Lomas → Portal (Fase 0)**: `/api/cron/sync-lomas`, que **solo inserta** clientes nuevos de Lomas, protegido por `CRON_SECRET`.
- **Recibo oficial** emitido por Alimin, generado al vuelo y con la identidad legal de cada proyecto.
- Arreglos: el apellido viejo quedaba pegado al guardar el nombre; los pagos manuales usaban "hoy" y no la fecha real del pago; el pago de una cuota mezclaba la mora de otras cuotas y creaba multas fantasma.
- La ficha muestra cuota base + interés + total por cuota vencida.

**30–31 jul**
- La Auditoría resuelve el cliente en las eliminaciones (15/15 registros).
- **Asesor del cliente** visible y reasignable desde la ficha, con una acción aislada que no toca la cuenta ni las finanzas.
- Correo de contacto en los datos de transferencia.

### Fase 5 — Marca, Android y comunicación con clientes (agosto)

**26 commits, muchos grandes.**

- **1 ago.** Cada corrida del puente Lomas queda en Auditoría (OK, 401 sin secreto o caída).
- **3 ago — Rediseño claro con el verde de marca** (24 archivos): paleta `brand-50..900` sacada de aliminspa.cl, pantallas que seguían oscuras migradas y **contraste WCAG AA** revisado (el semáforo "Al Día" pasó de 2.26:1 a 4.90:1).
- **3 ago — Descargas en la app Android** (`deliverFile()`): en el WebView el `<a download>` no hacía nada; ahora se usa la hoja de compartir del sistema. Se corta el tráfico HTTP sin cifrar e íconos y splash se regeneran.
- **3 ago — `deploymentId`**: tras un despliegue, el botón "subir comprobante" quedaba muerto ("Failed to find Server Action"). Tres clientes reclamaron. Ahora Next recarga la página.
- **4 ago.** Lote visible en la bandeja de pagos, con formato según proyecto.
- **10 ago.** Comprobantes y selector nombran la cuota con mes y año ("Cuota 3 - Agosto 2026"). **Buzón de sugerencias y encuesta NPS** en el portal, con `/admin/feedback`.
- **11 ago.** Un abono de mora viejo seguía borrando la multa de cada cuota nueva (Franco Baeza, Lomas 39). Regla única `crearAplicadorDeAbonosMora`. Medido: solo cambia Franco (+$10.000) de 175 clientes.
- **17 ago — Módulo de WhatsApp** (Evolution API): panel, envío de cobranza por categoría (MORA, GRACIA, PRÓXIMO, VENCIMIENTO), plantillas editables, tramos con pausa, topes por hora, anti-repetición de 24 h, relectura antes de cada envío y una instancia por ejecutiva (Denisse para Libertad y Alegría; Cindy para Arena y Sol y Lomas).
- **21 ago.** Correo secundario del cliente (solo contacto, no da acceso). Menú Email. CSV con más datos financieros y etiqueta AL CONTADO.
- **23 ago — Aviso automático por WhatsApp al aprobar un pago**, con cola en base, llave única por pago y sin mencionar saldos ni mora.
- **24 ago — Correo masivo vía n8n**: redactar, plantillas, historial y panel. Solo dos cuentas pueden enviar tandas, con el control en el servidor. Variables `{nombre}`, `{lote}`, etc., prueba con datos reales y **vista previa en vivo**. Arreglo de un export inválido en `"use server"` que dejaba el contenedor reiniciándose.
- **24 ago.** En Lomas, la mora se reseteaba a 1 día tras un pago o abono manual (Eugenia Rojas, L37: la cuota de junio mostraba $10.000 en vez de $610.000).
- **25 ago.** Los avisos de WhatsApp quedan solo para aprobaciones de bandeja, no para pagos manuales.
- **27 ago.** Pagos de **Reserva** y **Gastos Operacionales** con recibo propio. El respaldo bancario pasa a ser interno. Dos comprobantes subidos juntos ya no quedan con la misma cuota.
- **30–31 ago.** Diagnóstico de comprobantes: dice si el archivo existe y marca duplicados. Entra al menú bajo Bandeja de Pagos, con paginación.

### Fase 6 — Comprobantes, documentos y cuadre de caja (septiembre)

**58 commits, el mes con más trabajo sobre datos.**

**1–3 sep**
- **Deuda fantasma**: al aprobar, la mora se medía al día de la aprobación y no al del pago (Vanessa Ponce L52, Alan Contreras L07). El historial repetía el total del comprobante en cada cuota (Verónica Farías L12, Carolina Fernández L11B).
- El historial separa **Vencimiento** de **Fecha de Pago**.
- Se puede **eliminar un comprobante aceptado por error**, con reversión completa en una sola transacción (el borrado anterior deshacía a medias).

**6–8 sep**
- **Difusión masiva por WhatsApp con adjuntos** (imagen, video, documento) y metacampos de correo con ayuda.
- **Fichas duplicadas del puente Lomas** (Joselin Castillo L-18, Rodrigo Márquez L-42): el cliente veía mora falsa. Se corrige la llave del puente (por lote, no por RUT), el portal toma la ficha más avanzada, y las copias quedan fuera de stats, cobranza, Legal, dashboard y KPIs, con botón Archivar.
- Comprobantes que no son PDF (HEIC de iPhone, AVIF, GIF) se detectan por sus primeros bytes (caso José Torres, Lomas L-13).

**11–17 sep**
- Adjuntar comprobante a una cuota que ya figura pagada, sin sumar cuotas ni caja (caso Romina, Lomas L-29).
- **Fecha y monto reales de la transferencia al aprobar** (`paid_at`, migración 08). Caso Romina Durán: transfirió $550.000 en gracia y el portal le estampó $560.000.
- **Un solo recibo oficial**, con logo y fecha del pago (antes salía con la fecha de cada descarga). Mis Documentos en secciones y luego en **tabla** con pestañas Cuotas y Documentos, y un componente compartido entre portal y admin.
- **Imagotipo Alimin** con la palabra recoloreada a verde de marca.
- Un abono de intereses salía rotulado como cuota y desaparecía del listado (Marcelo Marambio, Arena y Sol L-58).
- **Ocultar un recibo mal emitido** sin tocar el pago (Luis Donoso, L-20; migración 09).
- **Revisión de Comprobantes** con cobertura, traslape, plata, caja y desfase, exportable a Excel. Se fue afinando para no acusar a fichas sanas: historial migrado en ámbar, caja corta en ámbar porque no mueve el saldo, desfase solo hacia adelante.
- Documentos en pestaña propia de la ficha. Subir los comprobantes que faltan desde la misma auditoría.
- Cuotas con comprobante pero sin contar ahora se ven en postventa (Caroline, Lomas 37-2).
- Correcciones de datos: comprobante de Caroline (cuota 8 → 5) y 22 comprobantes migrados con el número de cuota en la columna equivocada.

**20–22 sep**
- El abono de intereses suelta la cuota rotulada (María José Vergara).
- **Revisión de Comprobantes contesta una sola pregunta**: "¿a quién le faltan comprobantes?". Se sacan los chequeos de descuadre y los montos, a pedido de postventa.
- Scripts de corrección de datos versionados (`cuotas_pagadas_de_mas`, `abonos_intereses_mal_rotulados`, `rotulos_de_cuota_corridos`).
- **Corregir desde el panel a qué cuota apunta un comprobante** (Erika Valenzuela L19 "Cuotas 47-56"; Verónica Farías L12).
- Los rechazados salen de la lista. Adjuntar un comprobante que pagó **varias cuotas**. **Quitar el archivo** de un comprobante sin revertir el pago, y rehacer el recibo.
- Rellenar pagos migrados sin archivo en vez de bloquearlos (Marcelo Márquez, Alan, Eduardo Arroyo).
- WhatsApp masivo incluye a los clientes al contado. Límite de cuerpo subido a 30 MB en Server Actions y en el middleware (los adjuntos se cortaban a 10 MB).

**27–29 sep — Cuadre de Caja**
- **`/admin/cuadre-caja`**: verifica por lote que **pie (con la reserva adentro) + cuotas = valor total**, al peso. Semáforo, sugerencia del campo con error, edición con vista previa de saldos y Auditoría.
- Cálculo del pie que cerraría el plan, lista de pies para revisar y **corrección masiva de pies anotados sin la reserva**, con tres condiciones verificadas en el servidor.
- **El panel de Lomas deja de sumar la reserva aparte del pie**, que la contaba dos veces.
- Ventana "Editar valores" (pie, reserva, cuotas por tramo).
- La bandeja ordena por último movimiento y marca en ámbar las fechas futuras.

### Fase 7 — Automatización y acuerdos de mora (octubre)

**8 commits.**

- **1 oct.** Al aprobar, postventa **elige cuántas cuotas cubre** el comprobante (clientes que pagaban dos y marcaban una).
- **5 oct — Resumen semanal por WhatsApp** a los grupos de postventa: pagos del portal aprobados, pagos manuales, monto en cuotas y % al día / en mora. El cálculo de cartera se movió a `src/lib/postventaData.ts`. El servidor lo manda solo **los lunes a las 11:00** (`instrumentation.ts` + `programadorResumen.ts`) y se apaga con `RESUMEN_SEMANAL_AUTO=false`.
- **6 oct.** El portal rechaza comprobantes de 0 bytes, que eran PDFs en iCloud sin descargar (Bernardita Herrera, L-39).
- **9 oct — Modo de mora "Monto Pactado" (PACTADO)**: cobra exactamente el monto acordado, cubre el interés de las cuotas vencidas antes del acuerdo, y las cuotas posteriores generan interés normal. El botón "Monto Fijo" pasa a mostrarse como Mixto porque eso era lo que calculaba (caso Juliette: $1.100.000 → $180.000 pactados).

---

## 4. Catálogo de módulos construidos

| Módulo | Ruta | Desde | Qué hace |
|---|---|---|---|
| Login y cuentas | `/login`, `/forgot-password`, `/reset-password` | abr / jul | Acceso por correo, clave temporal, cambio obligatorio, recuperación por n8n |
| Dashboard admin | `/admin` | abr | KPIs de cartera, saldo pendiente, morosos, CSV |
| Directorio de clientes | `/admin/clients` | abr | Pestañas por estado, orden por lote o mora, ficha completa |
| Ficha del cliente | (modal/vista) | abr→sep | Datos, finanzas, mora, bitácora, documentos, asesor, POV |
| Bandeja de pagos | `/admin/receipts` | abr | Aprobar, rechazar, abono de intereses, eliminar, fecha y monto reales, cuántas cuotas |
| Revisión de comprobantes | `/admin/diagnostico-comprobantes` | ago→sep | Qué cuotas pagadas no tienen comprobante, adjuntar y corregir rótulos |
| Cuadre de caja | `/admin/cuadre-caja` | sep | Plan de pago vs. valor total por lote, corrección de pies |
| Diagnóstico de mora | `/admin/diagnostico-mora` | — | Vista de solo lectura del cálculo de mora |
| Alertas | `/admin/alerts` | may | Cuotas en mora con desglose |
| Inventario de lotes | `/admin/lots` | abr / may | Lotes, asignación de dueño, creación |
| Ingresos | `/admin/income` | may | Analítica de recaudación con filtros de fecha |
| Informes | `/admin/email-marketing` | abr / jun | Reportes por proyecto (el nombre de la carpeta es histórico) |
| Auditoría | `/admin/audit` | jul | Bitácora del sistema con filtros y cliente |
| WhatsApp | `/admin/whatsapp` | ago→sep | Cobranza, avisos de pago, difusión con adjuntos, resumen semanal |
| Correo masivo | `/admin/email` | ago | Redactar, plantillas, historial, panel vía n8n |
| Sugerencias y NPS | `/admin/feedback` | ago | Resultados de la encuesta y del buzón |
| Consola Legal | `/legal` | jun | Morosos de solo lectura, Excel, documentos |
| Portal del cliente | `/user`, `/user/pay`, `/user/documents` | abr→sep | Estado, pago con carrusel, Mis Documentos, NPS |
| Mantenimiento | `/mantenimiento` | jul | Saca el sitio de circulación para no-admins |
| Puente Lomas | `/api/cron/sync-lomas` | jul | Copia clientes nuevos de Lomas (solo inserción) |
| App Android | Capacitor | abr / ago | Push, visor y descargas nativas |

**Motor financiero (`src/lib/financials.ts` y otros):** modos de multa **AUTO, FIXED, MIXED y PACTADO**, días de gracia, `debt_start_date`/`debt_end_date`, tramos de precio históricos, fórmula específica de Lomas, aplicador único de abonos de mora y multa fija que crece día a día.

---

## 5. Bugs importantes corregidos y clientes afectados

| Fecha | Bug | Clientes | Commit |
|---|---|---|---|
| 30-06 | Triggers bloqueaban aprobaciones y pagos manuales | Todos | `6b9f233` |
| 01-07 | Mora histórica sumada dos veces en el total a pagar | Francisco Ramírez (+$12.000), Yanis López (+$178.500) | `2d07125` |
| 01-07 | Clave regenerada no coincidía con la guardada | Luis Bernal | `cf82f62` |
| 06-07 | Recibo aprobado sin sumar la cuota si fallaba la transacción | Potencialmente todos | `41e5284` |
| 07-07 | Se obligaba a pagar cuotas en gracia | Solange L36, Sergio L49, Carolina L11B | `b05f1ea` |
| 17-07 | Mora automática borrada sin aviso al pagar solo la cuota | Jorge Urra ($35.000) y clientes MIXED | `b74de5e` |
| 24-07 | Pago manual medía la mora a "hoy" y no a la fecha del pago | Los tres proyectos | `010ac1b` |
| 24-07 | Pago de una cuota arrastraba la mora de otras y creaba multas fantasma | Los tres proyectos | `1ced943` |
| 03-08 | Botón de subir comprobante muerto tras un despliegue | 3 clientes reclamaron | `8ce12ea` |
| 11-08 | Abono de mora viejo perdonaba cuotas nuevas | Franco Baeza (Lomas 39) | `436e622` |
| 24-08 | Mora de Lomas reseteada a 1 día tras pago o abono | Eugenia Rojas L37 y FIXED/MIXED de Lomas | `d1fc063` |
| 27-08 | Dos comprobantes juntos quedaban como la misma cuota | — | `52a8ae0` |
| 01-09 | Mora medida a la fecha de aprobación → deuda fantasma | Vanessa Ponce L52, Alan Contreras L07 | `64b08a2` |
| 01-09 | Total del comprobante repetido en cada cuota | Verónica Farías L12, Carolina Fernández L11B | `64b08a2` |
| 03-09 | Eliminar comprobante deshacía a medias | — | `c95d3f1` |
| 07-09 | Puente Lomas duplicaba fichas sin RUT → mora falsa | Joselin Castillo L-18, Rodrigo Márquez L-42 | `11d2d0d`, `9af82f0`, `bf3c3c2` |
| 07-09 | Comprobante HEIC se veía roto o como "PDF dañado" | José Torres (Lomas L-13) | `34ff436` |
| 11-09 | Monto estampado distinto del transferido | Romina Durán (Lomas L-29) | `10df818` |
| 13-09 | Recibo con fecha distinta en cada descarga y sin logo | Todos | `74e86a8` |
| 15-09 | Abono de intereses rotulado como cuota o invisible | Marcelo Marambio (L-58) | `0686611` |
| 20-09 | Abono conservaba la cuota y generaba traslape | María José Vergara | `ba491c2` |
| 21-09 | "Ya tiene comprobante" en pagos migrados sin archivo | Marcelo Márquez, Alan, Eduardo Arroyo | `c170a74`, `3325795` |
| 22-09 | Adjuntos de difusión cortados a 10 MB | — | `96ba073`, `e011480` |
| 27-09 | Lomas contaba la reserva dos veces | Fichas de Lomas con pie bruto | `c827301` |
| 06-10 | Comprobantes de 0 bytes aceptados | Bernardita Herrera L-39 | `135d3f8` |
| 09-10 | "Monto Fijo" calculaba como Mixto | Juliette | `d62c005` |

---

## 6. Migraciones manuales de base de datos

Las migraciones viven en `prisma/migrations_manual/` y **se aplican antes del Redeploy**. Si el código sube primero, Prisma pide columnas que no existen y fallan las consultas.

| # | Archivo | Qué hace |
|---|---|---|
| 01 | `financial_protection_triggers.sql` | Triggers que exigen `app.postventa_authorized` para tocar campos financieros |
| 02 | `feedback_table.sql` | Tabla `pagos.feedback` (sugerencias y NPS) |
| 03 | `whatsapp_tables.sql` | Mensajes y plantillas de WhatsApp |
| 04 | `secondary_email.sql` | `reservations.secondary_email` |
| 05 | `whatsapp_payment_notices.sql` | Avisos de pago: columnas, categorías y plantillas iniciales |
| 06 | `email_marketing.sql` | `email_templates`, `email_messages` |
| 07 | `whatsapp_bulk_media.sql` | Difusión con adjuntos |
| 08 | `receipt_paid_at.sql` | `payment_receipts.paid_at` (fecha real de la transferencia) |
| 09 | `receipt_oculto.sql` | `oculto_at` / `oculto_motivo` para ocultar recibos |
| 10 | `caroline_comprobante_cuota8_es_cuota5.sql` | Corrección de datos puntual |
| 11 | `migracion_cuota_en_columna_equivocada.sql` | 22 comprobantes de 8 clientes reconectados con su cuota |

---

## 7. Correcciones de datos puntuales

- **17-07** — Se activó el crecimiento de la multa fija (`debt_start_date` = hoy) para **Magdalena Cofre** y **Omar Ruiz** (2 reservas) con `safe_financial_update.ts`, respaldo y AuditLog. Otros 5 casos se dejaron sin tocar a pedido del usuario.
- **17-09** — Comprobante de **Caroline** (Lomas 37-2) rotulado cuota 8 → cuota 5, confirmado por postventa mirando el documento.
- **17-09** — **22 comprobantes de 8 clientes** de la carga inicial del 12-03-2026 tenían el número de cuota en `installments_count`. Caso que lo destapó: Guillermo Silva. Guarda del cambio: monto = valor de una cuota.
- **21-09** — Scripts de corrección versionados en `scratch/` (sin credenciales; no escriben nada sin `--aplicar`).
- Ninguna de estas correcciones movió `installments_paid`, montos, caja ni mora: solo a qué cuota apunta cada papel.

---

## 8. Reglas de negocio acordadas

1. **La reserva es parte del pie**, en todos los proyectos: pie bruto + cuotas pactadas = valor total, al peso.
2. **El saldo del cliente sale de `installments_paid`** contra el valor pactado de cada cuota. El FinancialLedger alimenta el reporte de recaudación, no el saldo.
3. **La mora se mide a la fecha real del pago** (fecha de la transferencia, luego de subida, y por último de aprobación), nunca a "hoy".
4. **Un abono de mora solo cubre interés que existía el día en que se pagó**, y cada peso se consume una sola vez.
5. **El interés empieza el día siguiente al fin del periodo de gracia.**
6. **Modos de multa:** AUTO (calculada), FIXED/MIXED (monto guardado que crece a diario + automática), PACTADO (monto acordado fijo + interés normal de cuotas posteriores).
7. **Lomas del Mar** usa su propia fórmula de mora y su propio criterio de "Al Día" (cuenta los congelados), aislados por `projectSlug`.
8. **Un lote tiene un solo dueño** para el puente; la ficha duplicada se detecta por lote **y** persona.
9. **Ocultar un recibo ≠ deshacer un pago.** Quitar un archivo ≠ eliminar un comprobante.
10. **Cada ejecutiva tiene su canal:** Denisse para Libertad y Alegría, Cindy para Arena y Sol y Lomas del Mar (WhatsApp y correo).
11. **Nada retroactivo** en avisos: solo cuentan las aprobaciones posteriores al despliegue.

---

## 9. Infraestructura, despliegue e integraciones

- **EasyPanel:** el `git push` **no despliega**. Hay que apretar *Redeploy* en el panel.
- **Base de datos:** PostgreSQL remoto, esquema `pagos` (portal) junto a `public` (Lomas). No responde desde el equipo local, así que las migraciones se aplican desde el servidor.
- **Variables de entorno relevantes:** `CRON_SECRET`, `NEXT_DEPLOYMENT_ID`, `EVOLUTION_*`, `N8N_EMAIL_WEBHOOK_URL/AUTH_*`, `RESUMEN_SEMANAL_AUTO`.
- **n8n:** activación de cuentas, recuperación de clave, observaciones "ALIMIN | IMPORTANTE" y correo masivo (reparte a Gmail por buzón).
- **Evolution API (WhatsApp):** cobranza, avisos de pago, difusión con adjuntos y resumen semanal. Documentado en `docs/whatsapp-evolution.md`.
- **Capacitor / Android:** push, visor, descargas nativas y sin tráfico HTTP sin cifrar.
- **Documentación del repo:** `docs/ARQUITECTURA.md`, `docs/Manual_Postventa_Alimin.pdf`, `DESIGN.md` y las bitácoras semanales de `docs/bitacoras/` (20-07 al 23-08).

---

## 10. Pendientes y riesgos conocidos

Estos puntos se registraron en los mensajes de commit o en notas del proyecto. Antes de actuar sobre ellos conviene revisar si siguen vigentes.

- **Fichas duplicadas del puente Lomas** (Joselin L-18, Rodrigo L-42): quedaron neutralizadas y con botón Archivar, pero hay que archivarlas.
- **56 comprobantes sin cuota con `installments_count = 1`** en 41 clientes: no se pudieron corregir en bloque porque se mezclan con abonos de intereses legítimos.
- **Reservas con `manual_penalty` cristalizado antes del arreglo del 01-09**: hay que pasarlas a Modo Multa → Automático desde la ficha.
- **Comprobantes aprobados antes del 27-08 o del 20-09** con el número de cuota viejo o rotulados como cuota: no se corrigen solos.
- **Evolution API con la apikey de ejemplo de la documentación**: antes de rotarla hay que revisar si n8n la usa.
- **Imagotipo en PNG de 256 px**: queda justo en pantallas de alta densidad; conviene reemplazarlo por el SVG cuando exista.
- **Funciones marcadas "en desarrollo" en el manual** (al 08-07): Exportar ficha, Repactar y PDF Estado de Cuenta.
- **Rama `main` 172 commits detrás de `v2`.**
- **Salida de Alimin (desde el 14-08-2026):** el ecosistema pasa a usarse como material de venta para captar inmobiliarias nuevas.

---

## 11. Anexo — Listado completo de commits

Los 374 commits en orden cronológico (hash corto · fecha y hora · mensaje).


### Abril 2026

| Hash | Fecha | Mensaje |
|---|---|---|
| `b9928ad` | 2026-04-12 02:16 | Initial commit from Create Next App |
| `3f1ad4c` | 2026-04-12 14:24 | feat: complete premium dark-theme UI overhaul for admin and user portals |
| `e92bb70` | 2026-04-12 14:41 | debug: add verbose logging to auth flow for Easypanel diagnostics |
| `2d98bbe` | 2026-04-12 14:56 | design: ultra-premium Emerald & Gold overhaul for login and layouts |
| `004af2f` | 2026-04-12 14:59 | fix: resolve syntax error (extra div) in admin dashboard |
| `baaae0f` | 2026-04-12 15:07 | branding: apply Alimin leaf logo as favicon and logo across app |
| `ad97442` | 2026-04-13 15:02 | feat(db): update schema to support varchar lot stage and user daily penalties, add import script |
| `70a7a1f` | 2026-04-13 15:57 | fix(script): ensure stage uniqueness and map alegria file |
| `2d5e699` | 2026-04-13 16:06 | feat(admin): add pagination and stage filters to clients page |
| `e60713a` | 2026-04-13 16:13 | feat(admin): add client details modal to clients directory |
| `9942b4a` | 2026-04-13 16:27 | feat(admin): add client profile edit mode and missing field alerts |
| `3dd2bf1` | 2026-04-13 16:31 | fix(admin): export updateClientProfile action from postventa.ts |
| `a10461f` | 2026-04-13 16:50 | feat(admin): implement financial edit mode and system-wide pagination |
| `cc47204` | 2026-04-13 16:53 | fix(admin): remove extra div in receipts page causing build error |
| `3662dbd` | 2026-04-13 16:54 | fix(admin): add missing import for getProjectConfig in postventa actions |
| `3120a54` | 2026-04-13 16:56 | fix(admin): resolve lotId type mismatch and property name in client financials update |
| `9741bf2` | 2026-04-13 17:08 | fix(admin): resolve missing financial data fields in client modal and improve mapping |
| `d295aad` | 2026-04-13 17:40 | fix(admin): improve financial field fallbacks and force cache refresh for accurate data display |
| `4169e1c` | 2026-04-13 17:44 | fix(admin): resolve build error and ensure cache invalidating on update |
| `de99377` | 2026-04-13 17:57 | fix(admin): resolve financial data mapping bugs and correct imported installments paid |
| `ef6e411` | 2026-04-13 18:18 | feat(admin): implement per-client due date and grace period settings with automated mora calculation |
| `6c17d4f` | 2026-04-13 18:31 | feat(admin): replace numeric due day with calendar picker for next payment date |
| `b7992fe` | 2026-04-13 18:46 | fix(admin): address server error when saving financial config with empty dates |
| `948b13e` | 2026-04-13 19:02 | fix(admin): resolve persistence issues and server errors in financial updates |
| `5d7f30f` | 2026-04-14 15:37 | fix: resolve mora inconsistencies and grace days server error |
| `9812838` | 2026-04-14 15:44 | fix: type error in postventa stats (isMoraFrozen vs mora_frozen) |
| `7ee9624` | 2026-04-14 15:49 | fix: handle optional installments_paid in nextDate calculation |
| `f603365` | 2026-04-14 17:08 | feat: implement 3-way financial status dropdown (Activo, Congelado, Al Día) |
| `e775577` | 2026-04-14 17:24 | fix: resolve escaped characters in user.ts that broke build |
| `72f79ef` | 2026-04-14 17:33 | fix: restore missing isLate property in postventa data |
| `323d6a3` | 2026-04-14 17:38 | fix: add mora_status to finForm state to resolve build error |
| `40915d1` | 2026-04-14 17:40 | fix: restore mora_frozen in setFinForm object to satisfy TS |
| `f406307` | 2026-04-14 17:46 | fix: ensure UI refreshes after saving financial status and harden persistence logic |
| `2cd3ab2` | 2026-04-14 19:10 | feat: migrate Arena y Sol project and finalize financial status UI fixes |
| `ac7e9c6` | 2026-04-14 19:36 | feat: handle 'Al Contado' (fully paid) clients and archive placeholders |
| `073e9e2` | 2026-04-14 19:38 | fix: change pendingBalance to let to allow reassignment in postventa status calculation |
| `6b09af7` | 2026-04-14 19:47 | feat: cross-reference clients in inventory and handle multi-lot owners in client list |
| `9f59b88` | 2026-04-15 00:24 | feat: implement document management system for admin and user portal |
| `2695cba` | 2026-04-15 00:47 | fix: resolve build errors with next.js route handlers and prisma schemas |
| `197f487` | 2026-04-15 13:13 | feat: implement chronological installment selection with embedded penalties |
| `96b20ea` | 2026-04-15 13:29 | chore: add test client seeding script |
| `b2e8f61` | 2026-04-15 14:02 | feat: show mora details (days, interest) on installments + copy all bank data button |
| `20bfe00` | 2026-04-15 14:10 | feat: add daily interest rate, mora breakdown in summary, fix typos, all bank fields copyable |
| `a049bea` | 2026-04-15 19:17 | feat: add manual penalty mode (FIXED/AUTO) with shortfall carry-forward on approval |
| `a8224c4` | 2026-04-15 19:26 | fix: multi-lote detection only counts active reservations, ignores placeholder emails |
| `c2d963a` | 2026-04-15 19:34 | fix: multi-lote only matches real emails (must contain @), excludes placeholders like 'solicitado' |
| `2f49199` | 2026-04-16 20:35 | feat: implement manual multi-lot marking and filtering |
| `e77b3cb` | 2026-04-16 20:42 | style: rename multi-lot toggle button label |
| `21a9de6` | 2026-04-16 20:50 | fix: exclude placeholder contacts from client list |
| `6d3fd77` | 2026-04-16 21:02 | fix: exclude all archived contacts from client list |
| `1320c91` | 2026-04-16 21:11 | debug: change label to H-VERIFY for build verification |
| `6bdcb0b` | 2026-04-16 21:41 | feat: implement premium DatePicker component for client management |
| `ec31984` | 2026-04-16 22:02 | fix: resolve off-by-one day timezone issue in DatePicker |
| `aa60eda` | 2026-04-16 22:26 | fix: rename installment start date label and trigger redeploy |
| `1d72321` | 2026-04-16 22:49 | style: rename financial labels for better clarity as requested |
| `153163c` | 2026-04-17 12:49 | Fix: handled infinite loading and errors in document upload |
| `6d0ac0c` | 2026-04-17 13:30 | Feat: add Client POV view in admin panel to preview client portal |
| `c19fece` | 2026-04-17 13:49 | Fix: rename 'Vence' to 'Próximo Pago' and show interest details in badges |
| `14cfc43` | 2026-04-17 13:59 | Fix: calculate nextDueDate dynamically from installments_paid instead of stale stored value |
| `22a22f2` | 2026-04-17 14:41 | Fix: derive payment day from installment_start_date, not stale due_day field |
| `d8cb5b9` | 2026-04-17 14:58 | UI: update next_payment_date label to clarify it is optional and auto-calculated |
| `cf2344c` | 2026-04-17 15:14 | UI/Backend: correctly display Pie amount and detail next installment number and month |
| `3a7d106` | 2026-04-17 15:28 | Docs: fix server action 404 error and unify document management between admin and client portals |
| `ab65fee` | 2026-04-17 15:41 | Docs: fix metadata display after upload and add preview (eye) button |
| `96d1c9c` | 2026-04-18 00:20 | Fix: Corrected financial date calculation logic and updated UI labels for clarity |
| `745f24f` | 2026-04-18 00:38 | Fix: Unified date handling and removed redundant override fields |
| `03e370e` | 2026-04-18 01:03 | Update schema after manual recalibration and db pull |
| `2095c90` | 2026-04-20 13:31 | feat: show specific day for installments in client portal |
| `84d476a` | 2026-04-20 13:52 | fix: also add exact day format to admin POV in postventa |
| `00cd9f5` | 2026-04-20 14:07 | fix: resolve off-by-one timezone day shifts in core due dates calculation by using UTC getters |
| `058e736` | 2026-04-20 14:45 | feat: use America/Santiago explicitly instead of UTC for date presentation |
| `d678935` | 2026-04-20 15:20 | feat: add 'al contado' manual toggle switch to admin client interface |
| `dadbaa0` | 2026-04-20 15:58 | fix(ui): prevent date feedback loop by initializing form with nextDueDate instead of raw db anchor |
| `bb3d2da` | 2026-04-20 16:07 | feat(ui): hide debt_start_date when penalty mode is FIXED |
| `3550a81` | 2026-04-20 20:50 | feat: implement financial ledger and monthly dashboard metrics |
| `cb0d81d` | 2026-04-23 21:00 | feat: Android app with push notifications and document previewer |
| `78e089f` | 2026-04-23 21:06 | fix: remove deprecated bundledWebRuntime from capacitor config |
| `6fc10f4` | 2026-04-23 21:10 | fix: add missing preview state hooks to admin clients page |
| `c968a0b` | 2026-04-23 21:14 | fix: append file extension to document downloads |
| `298522a` | 2026-04-23 21:19 | fix: robust file preview and download extensions using magic numbers |
| `88c68bb` | 2026-04-23 21:24 | fix: syntax error in PreviewModal |
| `89dc277` | 2026-04-23 21:27 | fix: restore missing preview state in Admin Clients |
| `a2de13e` | 2026-04-23 21:29 | fix: type error in User Documents preview state |
| `36a924c` | 2026-04-23 21:36 | fix: expanded magic number detection for Office docs |
| `a906e88` | 2026-04-23 21:38 | fix: explicit handling for non-previewable files and loading timeout |
| `c617d67` | 2026-04-23 21:40 | fix: import FileText in PreviewModal |
| `8cf8698` | 2026-04-23 21:50 | feat: global synchronized search across admin dashboard |
| `2497ae3` | 2026-04-23 21:54 | fix: adoption of milestone-based acquisition progress to match installment count |
| `6b376c2` | 2026-04-23 22:01 | fix: enable 'Ejecutar Pago' button in Client POV simulation |
| `8fb69e3` | 2026-04-23 22:12 | fix: enforce 10MB upload limit and enable interactive simulation for receipts |
| `12e946c` | 2026-04-23 22:14 | fix: aggregate penalties and improve summary for multi-installment payments |
| `a3488d0` | 2026-04-23 22:18 | fix: resolve build error by adding missing selectedCuotas state and totalAmount |
| `4f283b2` | 2026-04-23 23:22 | fix: enable toggle behavior for installment selection (click to deselect last) |
| `36260b3` | 2026-04-23 23:36 | feat: show all available installments for clients instead of limiting to 12 |
| `b86f071` | 2026-04-24 14:35 | feat: implement password recovery flow and financial ledger table |
| `eb588b4` | 2026-04-24 14:46 | fix: remove deprecated bundledWebRuntime from capacitor config |
| `f13792b` | 2026-04-24 15:43 | feat: functionalize client POV payment upload and allow admin override |
| `6b724e3` | 2026-04-24 15:47 | feat: add inline PDF preview for payment receipts |
| `8dd6d41` | 2026-04-24 15:55 | fix: use Blob URLs for full screen receipt preview to bypass browser limits |
| `6e7a9c8` | 2026-04-24 16:14 | feat: implement inline lightbox for payment receipts preview |
| `7ee1ee9` | 2026-04-24 16:22 | feat: implement persistent notification system for payment rejections and approvals |
| `70ff544` | 2026-04-25 18:48 | chore: update gitignore and formatting |
| `720fe3f` | 2026-04-26 01:46 | feat: add post-venta observation field to client admin |
| `281d1ba` | 2026-04-26 02:08 | feat: add manual financial adjustment field to clients admin |
| `f60b7d4` | 2026-04-26 02:21 | feat: implement installment price ranges for historical financial accuracy |
| `4f7b909` | 2026-04-26 02:25 | style: add observation badge to client list for quick post-venta reference |
| `4273fd7` | 2026-04-26 02:27 | fix: explicit type for installment_ranges to resolve build error |
| `8f86c6a` | 2026-04-26 02:33 | ux: simplify financial admin by removing manual adjustment and renaming ranges to Precios de Cuotas Anteriores |
| `abdfe59` | 2026-04-26 02:46 | fix: ensures observations are saved, refreshed and always visible in read-only mode |
| `ef8b4d6` | 2026-04-27 02:50 | feat: Add client activation and temporary password generation |
| `df5a895` | 2026-04-27 03:16 | style: Optimize client portal layouts for mobile devices |
| `bc4180a` | 2026-04-27 03:27 | feat: integrate N8N webhook URLs for client activation |
| `2a0f28e` | 2026-04-27 03:45 | feat: Add PRUEBAS tab for testing Nicolas Cabrera emails |
| `7b0ea09` | 2026-04-27 04:08 | fix: Ensure client tabs render even when a project has no stages |
| `120a2f2` | 2026-04-27 04:17 | chore: change webhook URL to test endpoint for n8n debugging |
| `82f7561` | 2026-04-27 04:22 | feat: use production webhook URLs for n8n workflows |
| `1256387` | 2026-04-27 04:38 | feat: Add HTML template and subject to activation email payload |
| `df0e7e3` | 2026-04-27 05:09 | design: Optimize Change Password screen with premium dark theme and glassmorphism |
| `3c6483a` | 2026-04-27 05:15 | feat: Add success state and 3-second delay before redirecting to login after password change |
| `13af71d` | 2026-04-27 10:19 | feat: add debt_end_date support to cap interest calculation |
| `ae652fa` | 2026-04-27 17:52 | feat: manual mora dates, receipt management and transaction history with deletion |
| `aa8192a` | 2026-04-27 21:48 | feat: implement MIXED penalty mode for fixed + auto combined calculations |
| `b0bb1d2` | 2026-04-27 21:57 | fix: save manual_penalty when penalty_mode is MIXED |
| `45899d7` | 2026-04-27 22:11 | feat(payments): enforce mandatory overdue installments and apply mixed penalty mode to simulator |
| `f637d98` | 2026-04-27 23:44 | feat(payments): aggregated interest calculation for all overdue installments |
| `1b34f16` | 2026-04-27 23:59 | fix(financials): correct day counting logic and distribute interest per installment box |
| `45bbeb4` | 2026-04-28 00:05 | fix(ui): separate historical penalty into its own box and hide days for manual amounts |
| `899cb6b` | 2026-04-28 18:17 | fix: force selection of overdue installments even if interest is disabled |
| `4a7161e` | 2026-04-29 12:20 | fix: decoupling shared users on email update and UI improvements for contact editing |
| `cff9b43` | 2026-04-29 12:57 | feat: add Email Marketing dashboard with project-based bulk messaging |
| `92958d3` | 2026-04-30 04:19 | feat: add receipt history and detailed financial history for clients |
| `9c58d95` | 2026-04-30 04:35 | fix: reconstruct client financial history from migrated data and installment ranges |
| `9d7986d` | 2026-04-30 10:35 | Fix financial calculations for Total Invertido and Saldo Remanente |
| `a4e8817` | 2026-04-30 10:45 | Corrected range properties and adjusted balance sign to negative for debt |
| `b6bfdc8` | 2026-04-30 10:51 | Finalized financial formulas: Positive balance and strict Cuotas+Pie logic |
| `4a9bef9` | 2026-04-30 10:56 | FIX: Always include full Pie amount in Total Invertido calculation |
| `f9451e4` | 2026-04-30 11:13 | Removed Abono al Pie option from client portal as all pies are paid |
| `97a6252` | 2026-04-30 11:33 | Added temporary password column and storage for admins to manually send credentials |
| `89b6f04` | 2026-04-30 11:45 | Added year-to-year navigation to DatePicker for faster scheduling |
| `82e048c` | 2026-04-30 11:53 | Auto-generate temporary password on lock click and fix state updates |
| `c5bd770` | 2026-04-30 11:55 | Fixed TypeScript build error (implicit any) |
| `8999597` | 2026-04-30 11:57 | Fixed second TypeScript build error (implicit any for map item) |

### Mayo 2026

| Hash | Fecha | Mensaje |
|---|---|---|
| `41dc114` | 2026-05-04 10:54 | fix(payment): add bank holder and fix missing account number in copy-all logic |
| `e7af66b` | 2026-05-04 11:10 | fix(payment): implement fallback clipboard copy for non-https contexts |
| `f8c163c` | 2026-05-04 11:18 | fix(admin): sync client pov preview with real payment portal copy logic |
| `66a43db` | 2026-05-04 11:30 | feat(payment): auto-generate digital pdf receipts upon approval |
| `53bc0e4` | 2026-05-04 12:51 | fix(payment): resolve TS error missing rut property on user type |
| `ba7a44a` | 2026-05-04 12:56 | chore(db): update Alimin bank account number and schema defaults |
| `eeb688f` | 2026-05-04 13:02 | fix(payment): resolve TS error lot_number property on lot type |
| `8ea580f` | 2026-05-04 13:13 | fix(payment): resolve lot_number type error in postventa actions |
| `297e91f` | 2026-05-04 13:22 | feat(user-portal): added documents section and finalized automated receipt generation |
| `f232cfd` | 2026-05-04 14:48 | fix(user-actions): remove duplicate documents variable declaration |
| `e5278ae` | 2026-05-04 14:56 | fix(user-actions): add explicit any types to resolve typescript build errors |
| `29ec899` | 2026-05-04 15:11 | fix(user-actions): restore missing currentDate variable |
| `536c49b` | 2026-05-04 15:18 | fix(build): remove temporary file causing typescript errors |
| `1a20c61` | 2026-05-04 15:39 | style(receipt): redesigned PDF to match formal example aesthetic |
| `72b2744` | 2026-05-04 16:39 | fix(pdf): remove unsupported characterSpacing property |
| `bba26fe` | 2026-05-06 10:29 | feat: permitir editar monto extra pagado y incluirlo en totalPaid |
| `646cb83` | 2026-05-06 19:38 | fix: PreviewModal timeout race condition - clear timeout on iframe onLoad success |
| `96d5335` | 2026-05-06 22:44 | feat: add income analytics dashboard with monthly charts and detailed payment ledger |
| `76a236e` | 2026-05-07 18:20 | feat: implement lot and owner assignment from inventory admin panel |
| `1db3e3b` | 2026-05-07 18:34 | fix: resolve typescript type error in assignLotOwner |
| `9bde688` | 2026-05-07 19:02 | feat: remove PIE from income analytics as it is considered fully paid |
| `7a800cc` | 2026-05-07 20:22 | feat: add hubspot style dynamic date filters to income analytics |
| `80d1eb9` | 2026-05-07 20:43 | style: replace native date inputs with custom DatePicker in income analytics |
| `613d793` | 2026-05-07 20:55 | feat: make income chart group by day for date filters |
| `3c47761` | 2026-05-14 19:55 | feat: add Reservas submenu under Comprobantes section |
| `e63c127` | 2026-05-14 20:09 | chore: temporarily empty Reservas section until CRM integration is ready |
| `a38c039` | 2026-05-14 23:50 | fix: FIXED penalty mode now accumulates auto mora on late installments |
| `856f0df` | 2026-05-15 00:37 | feat: mostrar cuotas individuales en mora en vez de suma total de dias en Atraso Contable |
| `1e3ed0b` | 2026-05-15 00:45 | feat: mostrar mora historica fija en seccion Cuotas en Mora del admin |
| `386b0b5` | 2026-05-15 00:57 | feat: desglose cuotas individuales en mora en pagina de alertas |
| `c425fba` | 2026-05-15 01:10 | feat: modal de desglose de mora en pagina de alertas |
| `7be241f` | 2026-05-15 17:44 | feat(admin): redesign client details modal with tabbed layout and new profile fields |
| `06b8d2d` | 2026-05-15 18:36 | Optimize ClientDetailModal for mobile and desktop screens |
| `f4f63e2` | 2026-05-18 10:29 | feat(admin): add manual payment form with mandatory receipt validation in Finanzas y Saldos |
| `545f7a0` | 2026-05-18 16:08 | feat: optimize admin sidebar layout to collapse and expand on hover on desktop |
| `8850c93` | 2026-05-18 16:16 | style: remove redundant top header search bar and align header items to the right |
| `260e31c` | 2026-05-18 16:29 | feat: make late interest calculations fully dynamic and calendar-based |
| `91a3d08` | 2026-05-18 16:36 | fix: reflect dynamic late interests in client portal simulation view |
| `49a2158` | 2026-05-18 17:04 | fix: allow completed (al contado) reservations to see their lots/documents and clear cache on document upload/delete |
| `93f1dd2` | 2026-05-26 02:20 | feat: autogenerar comprobantes en pagos manuales y mostrarlos en historial de bandeja de pagos |

### Junio 2026

| Hash | Fecha | Mensaje |
|---|---|---|
| `3700344` | 2026-06-01 16:03 | feat: correccion de dia de pago, visualizacion en dashboard e implementacion de mora continua al limpiar fecha fin |
| `e70c528` | 2026-06-01 16:27 | fix: correct next_payment_date shift calculation based on database anchor date when modifying installments_paid count |
| `17bf5a8` | 2026-06-01 16:40 | feat: add next payment date input and automatic date shift in frontend, restore backend anchor logic with timezone safety |
| `ab7da86` | 2026-06-01 17:35 | feat: reset completo de mora al aprobar comprobante o pago manual - Agrega debt_end_date null en approveReceipt y registerManualPayment - Agrega debt_start_date null en fallback de approveReceipt |
| `b301106` | 2026-06-02 13:40 | fix(postventa): lowercase emails for users and use crypto-based random bytes for temporary passwords |
| `0415288` | 2026-06-05 17:17 | feat: add legal lawyer role, unified read-only morosos dashboard, and account seeding |
| `aefbc8b` | 2026-06-05 17:43 | legal: fix page syntax, clean 'null' last names and filter test clients |
| `e33753d` | 2026-06-05 17:52 | legal: rename 'Centro de Alertas Legales' to 'Centro de alertas' |
| `1c149a1` | 2026-06-05 17:57 | style: restructure card layouts to place overdue breakdown under lote row and avoid overlap |
| `7b2c654` | 2026-06-05 18:11 | legal: hardcode 'Alimin legal' in header to bypass cached session values |
| `f9a5150` | 2026-06-05 18:27 | feat: make legal cards clickable, add dashboard and modal Excel export features |
| `dfa9738` | 2026-06-08 11:47 | feat: permitir editar monto de historial financiero con registro de auditoria |
| `0efda31` | 2026-06-08 11:55 | feat: add portal access log tracking for activations, password changes, and logins |
| `28f2d5a` | 2026-06-08 12:01 | feat: regenerar comprobantes PDF automaticamente al editar monto en historial |
| `53a5cd7` | 2026-06-08 12:15 | fix(postventa): compare created_at instead of paid_at for linking ledger and receipt updates |
| `83f0fc2` | 2026-06-08 12:38 | feat(postventa): add ability to edit installments count in manual payments and sync updates |
| `4bd9686` | 2026-06-15 22:55 | fix: corregir desfase de zona horaria en el calculo de dias de mora |
| `f6b6ead` | 2026-06-16 02:04 | fix: corregir doble conversion de zona horaria en getChileToday |
| `fc1ce5a` | 2026-06-16 17:55 | fix: permitir guardar fecha de proximo vencimiento con dia diferente a due_day |
| `03f0545` | 2026-06-17 19:17 | Agregar DESIGN.md con guia de estilo y UX |
| `9fce9c4` | 2026-06-22 05:39 | feat: rediseño completo del portal - UI/UX mejorado, fix descarga documentos, nuevos componentes y utilidades |
| `564a4bb` | 2026-06-22 11:33 | style: optimize reservations page layout, client detail responsiveness, and add mora settings actions |
| `a5600fa` | 2026-06-22 12:13 | feat: crm checkbox selections, custom date range filtering, clickable dashboard rows, and UI improvements |
| `38b994b` | 2026-06-22 12:21 | design: redesign Alimin Legal console to light-theme premium layout with selective client table |
| `b1bec8a` | 2026-06-22 12:28 | feat: customize dashboard metrics cards and remove multi-lote filter option |
| `fb273d2` | 2026-06-22 12:30 | design: replace client detail modal with custom light-theme mora breakdown modal in legal console |
| `f2f3cfd` | 2026-06-22 12:41 | feat: restrict period collections to category CUOTA (installments only, no PIE) |
| `01b8c7c` | 2026-06-22 12:44 | design: redesign document preview modal to light-theme corporate palette |
| `b94190a` | 2026-06-22 12:47 | design: redesign CreateLotModal to light-theme corporate palette |
| `df7a5b9` | 2026-06-22 13:00 | feat: design and style reports menu item and layout to match the provided mockup |
| `4389614` | 2026-06-22 13:08 | feat: simplify search bar placeholder to Buscar clientes, show autocomplete dropdown matching name/RUT/email, and route/select client on click |
| `4abadfc` | 2026-06-22 13:18 | feat: add project selector to reports page, enable dynamic date queries and database-driven monthly chart |
| `6abc220` | 2026-06-22 16:47 | fix: prevent client financials from being cleared during partial updates |
| `03bdff9` | 2026-06-24 17:43 | feat: show installment month in receipts tray and detail modal |
| `6c82590` | 2026-06-25 00:37 | feat: mostrar comprobantes de pago aprobados en listado de documentos de cliente y admin |
| `f469590` | 2026-06-25 00:58 | feat: desglose detallado de mora y modal legal en vista de pagos de cliente |
| `4ee6724` | 2026-06-25 01:05 | feat: sync and display system and client-uploaded receipts in portal |
| `d069370` | 2026-06-25 01:34 | fix: clarify select dropdown labels and summary box descriptions for historical debt |
| `3162888` | 2026-06-25 01:37 | fix: simplify dropdown option labels and fix summary box double counting |
| `36a7524` | 2026-06-25 01:53 | feat: show detailed mora table and legal text inline on payments tab |
| `189f687` | 2026-06-25 02:05 | feat: show frozen account badge on tabs and log detailed system notes in Bitacora on freeze/unfreeze or adjustments |
| `69e0f58` | 2026-06-25 02:10 | feat: show interest start date as vencimiento in Detalle de Mora table |
| `98a7574` | 2026-06-25 02:18 | fix: use pre-calculated totalPaid from backend in ClientDetailView to respect installment ranges |
| `74ea0d6` | 2026-06-25 02:41 | feat: implement collapsible admin sidebar with localStorage persistence |
| `fa5e2c4` | 2026-06-25 03:09 | feat: rediseño premium portal de pagos - carrusel interactivo, desglose de mora y aspectos legales |
| `d36cc3f` | 2026-06-25 03:17 | feat: sidebar auto-expand on hover, auto-collapse on mouse leave |
| `fdc8e7a` | 2026-06-25 03:29 | fix: fecha vencimiento mora usa dia de pago + dias de gracia (interestStartDate) |
| `eb972d9` | 2026-06-26 03:14 | fix: corrige doble conteo de mora historica en total a pagar |
| `773ff41` | 2026-06-26 03:34 | fix: corrige doble conteo mora historica en ClientPOVModal (vista previa admin) |
| `ddfe357` | 2026-06-26 11:27 | fix: mostrar cuotas y mora historica cuando penaltyAmount en proximas cuotas es cero |
| `6df9359` | 2026-06-26 11:36 | feat: selector +/- cuotas en portal de pago con logica de obligatorias y adicionales opcionales |
| `ed958aa` | 2026-06-26 11:46 | fix: reemplazar botones +/- por selector dropdown intuitivo de cuotas con paginacion en carrusel |
| `6b9f233` | 2026-06-30 14:21 | fix: autorizar server actions de postventa ante triggers de proteccion financiera |

### Julio 2026

| Hash | Fecha | Mensaje |
|---|---|---|
| `2d07125` | 2026-07-01 13:42 | fix: corrige doble conteo de mora historica en total a pagar del portal |
| `cf82f62` | 2026-07-01 17:26 | fix: regenerar contraseña siempre envia WhatsApp y usa hash fresco |
| `8a88dae` | 2026-07-02 13:43 | docs: agrega mapa de arquitectura completo del sistema |
| `09d2c9b` | 2026-07-02 18:38 | feat: registrar toggleAlContado y toggleMultiLot en la bitacora de auditoria |
| `42b0a80` | 2026-07-03 21:12 | docs: agrega seccion de futuras implementaciones al manual de postventa |
| `fd11aae` | 2026-07-03 21:21 | fix: aplana canal alpha del logo en el PDF para evitar imagen rota |
| `77d94fc` | 2026-07-06 11:29 | fix: la mora histórica ya no se cuenta como cuota al pagar |
| `41e5284` | 2026-07-06 16:45 | fix: aprobar recibo de forma atomica con el incremento de cuotas |
| `ff82084` | 2026-07-06 17:35 | feat: permitir eliminar cualquier documento del cliente y registrarlo en la bitacora |
| `b05f1ea` | 2026-07-07 17:26 | fix: no forzar cuotas en gracia ni contar doble la mora historica al pagar |
| `7b72b5d` | 2026-07-07 19:42 | feat: legal puede ver, previsualizar y descargar los documentos del cliente |
| `6a4e74f` | 2026-07-07 21:18 | docs: agrega ronda 2 de propuestas al manual (login, comprobantes, bandeja) |
| `20ca6fc` | 2026-07-08 11:25 | docs: agrega hallazgos de auditoria de cobertura al manual de postventa |
| `a583da3` | 2026-07-08 11:44 | feat: agrega tipo de nota "Observacion" que avisa al cliente (portal + correo) |
| `0ebb807` | 2026-07-09 15:39 | feat: pantalla de Auditoria - origen manual/automatico, detalle y filtro de fecha |
| `09f4c3d` | 2026-07-09 16:15 | feat: auditoria en español - origen Postventa/Desarrollador y nombre de cliente |
| `47a77f2` | 2026-07-10 10:29 | feat: ordenar directorio de clientes por numero de lote (menor/mayor) |
| `7e9a6f4` | 2026-07-10 11:35 | feat: ordenar directorio de clientes por monto de mora (mayor/menor) |
| `e225adb` | 2026-07-10 13:34 | fix: pestaña En Mora ordena automatico por mora y muestra el monto |
| `508b207` | 2026-07-10 13:40 | fix: columna Saldo Pendiente muestra Mora Acumulada solo en pestaña En Mora |
| `b74de5e` | 2026-07-17 18:51 | fix+feat: preservar mora real al pagar cuota + nuevo Abono de Intereses |
| `bd9c09e` | 2026-07-17 22:29 | feat: permitir editar y eliminar registros del Historial de Pagos |
| `e60777f` | 2026-07-17 23:01 | feat: registrar en bitacora el desglose de cuota/dias al fijar mora |
| `342d584` | 2026-07-17 23:29 | feat: la multa fija/mixta crece dia a dia mientras no se pague |
| `0d6e3a6` | 2026-07-20 21:31 | feat: add maintenance mode page and middleware redirect |
| `cb9310f` | 2026-07-20 21:39 | fix: mark maintenance page as client component for prerendering |
| `e37db94` | 2026-07-22 03:00 | feat: soportar cualquier proyecto activo (no solo Arena y Sol/Libertad) + restar abonos de mora |
| `88280fb` | 2026-07-22 03:48 | fix: reemplazar tarjeta "Total Adeudado Vencido" por abono visible en la cuota |
| `d4545c1` | 2026-07-22 04:29 | fix: incluir nominal_installment_number en el select de comprobantes de getFullPostventaData |
| `dee8c0b` | 2026-07-22 04:38 | fix: aplicar abonos de mora tambien en getUserLots (portal real del cliente) |
| `c2769f1` | 2026-07-22 11:10 | fix: reemplazar tarjeta de error confuso por mensaje claro en comprobantes sin archivo digital |
| `dbe7984` | 2026-07-22 11:17 | fix: ocultar botones de ver/descargar en comprobantes sin archivo digital (historial migrado) |
| `e17f1f2` | 2026-07-22 11:59 | fix: contar mora congelada dentro de "Al Dia" solo para Lomas del Mar |
| `84e28af` | 2026-07-22 12:39 | fix: alinear Total Pagado/Saldo Pendiente de Lomas del Mar con aliminlomasdelmar.com |
| `b586173` | 2026-07-22 13:02 | fix: mora de Lomas del Mar identica a aliminlomasdelmar.com (formula exacta) |
| `9a41e00` | 2026-07-23 02:29 | feat: recuperacion de contrasena funcional + pantallas con la paleta del login |
| `809b8ef` | 2026-07-23 02:32 | fix: permitir /forgot-password y /reset-password sin sesion (y en mantenimiento) |
| `4fd371d` | 2026-07-23 03:01 | feat: puente Lomas->Portal (Fase 0) - endpoint /api/cron/sync-lomas solo-insercion |
| `1962cec` | 2026-07-23 14:55 | fix: mostrar fecha de inicio de interes correcta en ficha de cliente (admin) |
| `274c7a8` | 2026-07-23 20:10 | feat: recibo oficial de pago (emitido por Alimin) junto al comprobante del cliente |
| `23eee58` | 2026-07-23 20:10 | fix: guardar el nombre del cliente no borraba el apellido viejo (quedaba pegado) |
| `010ac1b` | 2026-07-24 14:23 | fix: usar la fecha real del pago (no "hoy") al calcular mora en pagos manuales |
| `1ced943` | 2026-07-24 14:38 | fix: registrar pago de cuota no debe mezclar la mora de OTRAS cuotas pendientes |
| `d0ff169` | 2026-07-24 15:04 | feat: mostrar cuota base + interes + total en el desglose de cuotas vencidas |
| `7615a8c` | 2026-07-30 09:33 | fix: auditoria no mostraba el cliente en eliminaciones de comprobantes y documentos |
| `03d6f6c` | 2026-07-30 10:05 | feat: asesor del cliente visible y reasignable desde la ficha |
| `16b21b5` | 2026-07-31 15:03 | feat: mostrar el correo de contacto en los datos de transferencia |

### Agosto 2026

| Hash | Fecha | Mensaje |
|---|---|---|
| `3733bad` | 2026-08-01 15:09 | feat: registrar en auditoria cada corrida del puente Lomas |
| `d83246f` | 2026-08-03 09:59 | feat: rediseno claro con verde de marca (navy+dorado -> fondo claro) |
| `3840a8c` | 2026-08-03 10:02 | feat: descarga de archivos funcional dentro de la app Android |
| `8ce12ea` | 2026-08-03 19:11 | fix: que un deploy no deje al cliente con el boton de subir muerto |
| `0d68699` | 2026-08-04 10:21 | feat: mostrar el lote en la bandeja de pagos |
| `72dffaa` | 2026-08-10 04:06 | feat: los comprobantes y el selector nombran la cuota con su mes y ano |
| `4bbc2a3` | 2026-08-10 04:13 | feat: buzon de sugerencias y encuesta NPS en el portal del cliente |
| `436e622` | 2026-08-11 15:37 | fix: un abono de mora viejo seguia borrando la multa de las cuotas nuevas |
| `52ee06a` | 2026-08-17 00:55 | feat: modulo de whatsapp para enviar cobranza a los clientes |
| `5d3c959` | 2026-08-21 05:01 | feat: correo secundario del cliente en la ficha de postventa |
| `e968498` | 2026-08-21 05:11 | feat: menu de Email en el admin con pantalla de proximamente |
| `f8193d0` | 2026-08-21 23:29 | feat: mas datos financieros en los exportables csv de clientes y dashboard |
| `eba640d` | 2026-08-23 23:33 | feat: aviso automatico por whatsapp cuando se aprueba o registra un pago |
| `b9b2ecb` | 2026-08-24 02:27 | feat: modulo de correo masivo del portal via webhook de n8n |
| `29d2289` | 2026-08-24 02:35 | fix: correo caia en bucle por un export invalido en el use server |
| `d726e80` | 2026-08-24 03:05 | fix: correo con logo real, cabecera verde y sin pie legal |
| `37b1a08` | 2026-08-24 11:03 | fix: prueba de correo usaba datos de otro cliente, no del marcado |
| `b20808e` | 2026-08-24 12:03 | feat: vista previa en vivo del correo antes de enviar |
| `d1fc063` | 2026-08-24 14:40 | fix: mora reseteada a 1 dia en Lomas del Mar tras pago o abono manual |
| `45226c2` | 2026-08-25 15:30 | fix(whatsapp): desactivar avisos automáticos en registros de pagos manuales y mantener solo en aprobaciones de bandeja |
| `b962405` | 2026-08-27 15:48 | feat: pagos de reserva y gastos operacionales con su comprobante, y respaldos bancarios internos |
| `52a8ae0` | 2026-08-27 17:13 | fix: dos comprobantes subidos juntos quedaban ambos como la misma cuota |
| `c483ec0` | 2026-08-30 23:47 | feat: el diagnostico de comprobantes ahora dice si el archivo del cliente existe, y marca duplicados |
| `88f20eb` | 2026-08-30 23:51 | fix: el diagnostico no puede depender de un parametro array que no se puede probar |
| `69f92d7` | 2026-08-31 09:57 | feat: la revision de comprobantes entra al menu, bajo Bandeja de Pagos |
| `4800377` | 2026-08-31 10:01 | feat: paginacion en la revision de comprobantes |

### Septiembre 2026

| Hash | Fecha | Mensaje |
|---|---|---|
| `64b08a2` | 2026-09-01 13:35 | fix: deuda fantasma y monto repetido en clientes que pagaron atrasado |
| `e989ccd` | 2026-09-01 13:48 | feat: el historial separa el vencimiento de la cuota de la fecha de pago |
| `c95d3f1` | 2026-09-03 14:09 | feat: se puede eliminar un comprobante aceptado por error |
| `4463b95` | 2026-09-06 22:48 | feat: modulo de difusion masiva por WhatsApp con soporte de adjuntos (imagenes, videos y documentos) |
| `5989d95` | 2026-09-06 23:00 | fix: compatibilidad de payload mediaType y mediatype en Evolution API sendMedia |
| `dfbed6e` | 2026-09-06 23:10 | fix: estructura de reintentos para sendMedia en Evolution API con formato estandar mediatype |
| `2a5b1a5` | 2026-09-06 23:26 | feat(email): agregar metacampos completos categorizados con boton de ayuda interactivo |
| `11d2d0d` | 2026-09-07 12:18 | fix: el cliente entra a su ficha correcta cuando el puente Lomas duplico el lote |
| `34ff436` | 2026-09-07 17:29 | fix: el comprobante se abre aunque no sea PDF (caso Jose Torres, Lomas L-13) |
| `9af82f0` | 2026-09-08 14:20 | fix: la ficha duplicada del puente Lomas ya no genera mora ni cobranza |
| `bf3c3c2` | 2026-09-08 14:26 | fix: la ficha duplicada tampoco cuenta en dashboard, cobranza legal ni KPIs |
| `cc55166` | 2026-09-11 13:26 | feat: adjuntar el comprobante a una cuota que ya figura pagada |
| `10df818` | 2026-09-11 14:23 | feat: al aprobar un pago se declara la fecha y el monto reales de la transferencia |
| `74e86a8` | 2026-09-13 17:19 | feat: un solo recibo oficial, con logo, y los documentos del cliente ordenados |
| `10a11c1` | 2026-09-13 22:31 | feat: los documentos del cliente pasan a ser una tabla con cuatro pestanas |
| `1f2c045` | 2026-09-13 22:40 | feat: la palabra Alimin deja de escribirse como texto y pasa a ser el imagotipo |
| `26d203e` | 2026-09-13 22:47 | fix: el respaldo del logo no entraba y quedaba el icono de imagen rota |
| `62f0d31` | 2026-09-14 11:22 | feat: el imagotipo de Alimin, con la palabra recoloreada para fondo blanco |
| `2c87d4d` | 2026-09-15 00:16 | feat: Mis Documentos queda en dos pestanas, Cuotas y Documentos |
| `0686611` | 2026-09-15 03:03 | fix: un abono de intereses se rotulaba como cuota y en el listado nuevo desaparecia |
| `14e57e8` | 2026-09-15 10:21 | feat: ocultar un recibo oficial mal emitido, sin tocar el pago |
| `20b1286` | 2026-09-16 16:27 | feat: la Revision de Comprobantes ahora cruza cuotas, comprobantes y caja |
| `ca2e257` | 2026-09-16 17:09 | fix: separar lo respaldado por comprobantes de lo realmente ingresado en caja |
| `b404ef5` | 2026-09-16 17:56 | feat: comparar hasta que cuota dice la ficha contra hasta cual llega el ultimo comprobante |
| `ddfb65c` | 2026-09-16 18:02 | feat: chequeos para los comprobantes que pagan varias cuotas de una vez |
| `937a1f3` | 2026-09-16 18:13 | fix: el chequeo de caja comparaba peras con manzanas |
| `4c2c7d3` | 2026-09-16 18:55 | feat: los documentos del cliente pasan a su propia pestana en la ficha |
| `83b2858` | 2026-09-16 19:07 | feat: subir los comprobantes que faltan desde la misma auditoria |
| `ddf33e8` | 2026-09-17 03:33 | fix: el desfase solo se marca cuando el comprobante va MAS ADELANTE que la ficha |
| `47302fb` | 2026-09-17 03:49 | fix: las cuotas con comprobante pero sin contar ya no son invisibles |
| `745ce33` | 2026-09-17 04:00 | fix(datos): el comprobante de Caroline rotulado cuota 8 es de la cuota 5 |
| `8af9534` | 2026-09-17 04:06 | fix: los contadores de la auditoria dejan de acusar al historial migrado |
| `555a7df` | 2026-09-17 04:19 | fix: el chequeo de Caja afirmaba algo falso sobre el saldo del cliente |
| `5a3abbe` | 2026-09-17 04:38 | fix(datos): la importacion guardo el numero de cuota en installments_count |
| `ba491c2` | 2026-09-20 21:57 | fix: el abono de intereses se quedaba con la cuota rotulada |
| `f1e905e` | 2026-09-20 21:57 | fix: la auditoria acusaba de descuadre a quien pagaba la cuota con la mora |
| `33504f5` | 2026-09-20 21:57 | feat: Revision de Comprobantes paginada |
| `b959cd9` | 2026-09-20 22:16 | fix: el traslape mandaba a buscar un pago duplicado que no existe |
| `3f3cd08` | 2026-09-21 00:05 | feat: Revision de Comprobantes contesta una sola pregunta |
| `3ea2cb2` | 2026-09-21 01:24 | feat: Revision de Comprobantes deja de mostrar plata |
| `f940565` | 2026-09-21 01:35 | chore: dejar pasar los tres scripts de correccion de datos |
| `aab5e81` | 2026-09-21 01:56 | feat: corregir desde el panel a que cuota apunta un comprobante |
| `83fd32c` | 2026-09-21 03:07 | fix: los comprobantes rechazados ensuciaban la lista |
| `cf8ddd1` | 2026-09-21 13:31 | feat: adjuntar un comprobante que pago varias cuotas de una vez |
| `d6e9bfb` | 2026-09-21 13:42 | feat: postventa puede quitar el archivo de un comprobante y rehacer el recibo |
| `c170a74` | 2026-09-21 14:08 | fix: "la cuota ya tiene un comprobante adjunto" cuando no habia ninguno |
| `3325795` | 2026-09-22 03:28 | fix: "ese tramo tiene N pagos distintos sin archivo" bloqueaba el caso normal |
| `1c6cd31` | 2026-09-22 18:12 | feat: incluir clientes al contado en la difusion masiva de WhatsApp |
| `96ba073` | 2026-09-22 18:19 | fix: subir el limite de Server Actions para que los adjuntos de difusion masiva no revienten |
| `e011480` | 2026-09-22 18:55 | fix: subir tambien el limite del proxy/middleware, causa real del corte a 10MB |
| `707efdf` | 2026-09-27 22:53 | feat: Cuadre de Caja, si el plan de pago de cada lote cierra con su valor total |
| `2bf0503` | 2026-09-27 23:16 | fix: el cuadre ya no da a entender que la reserva se suma aparte del pie |
| `30ae85e` | 2026-09-27 23:31 | feat: el cuadre calcula el pie que cerraria el plan y lista los pies para revisar |
| `fe9ee43` | 2026-09-27 23:41 | feat: corregir de una vez los pies anotados sin la reserva |
| `c827301` | 2026-09-27 22:55 | fix: el panel de Lomas deja de sumar la reserva aparte del pie |
| `534ddb7` | 2026-09-28 00:14 | feat: el cuadre muestra una sola cuenta y edita los valores en una ventana |
| `c38b28b` | 2026-09-28 00:22 | feat: la ventana de edicion queda en pie, reserva y cuotas |
| `ad15915` | 2026-09-29 13:22 | fix: la bandeja muestra primero lo ultimo aprobado, no la fecha de pago mas lejana |

### Octubre 2026

| Hash | Fecha | Mensaje |
|---|---|---|
| `bb73c46` | 2026-10-01 11:58 | feat: al aprobar un comprobante se elige cuantas cuotas cubre |
| `9f20fc0` | 2026-10-05 01:09 | feat: resumen semanal de pagos por WhatsApp a los grupos de postventa |
| `89edb58` | 2026-10-05 01:20 | feat: el resumen semanal muestra los comprobantes por aprobar y se puede ver como texto |
| `ae66777` | 2026-10-05 01:29 | feat: el resumen semanal se puede probar de a un proyecto |
| `93593a5` | 2026-10-05 01:39 | fix: el resumen semanal ya no muestra los comprobantes por aprobar |
| `5f99e5e` | 2026-10-05 02:10 | feat: el portal manda solo el resumen semanal los lunes a las 11:00 |
| `135d3f8` | 2026-10-06 16:20 | fix: el portal ya no acepta comprobantes de 0 bytes |
| `d62c005` | 2026-10-09 15:31 | feat(mora): modo "Monto Pactado" para acuerdos de intereses con el cliente |

