# Rediseño Cobranzas Alimin - Guía de Estilo y UX

Esta guía define el sistema de diseño para la nueva interfaz clara (Light Mode) de Alimin Cobranzas, pensada para los dueños, el equipo de postventa y el abogado.

## Brand & Style
El estilo visual debe ser **Corporativo / Bancario Moderno** y **Limpio**. La interfaz debe transmitir máxima confianza, seguridad y transparencia, asimilándose a un software financiero tradicional (como Stripe o una banca digital de alta gama) pero con toques contemporáneos. 

Como el equipo de postventa está acostumbrado a trabajar en **Excel**, el diseño de las tablas y listas debe priorizar la densidad de información, el orden por filas y columnas claras, la facilidad de lectura y celdas bien estructuradas sin adornos innecesarios.

## Paleta de Colores
Buscamos un diseño de fondo claro y alto contraste:
* **Fondo Principal (Background):** Gris seda ultra-claro (`#F8FAFC`).
* **Superficies de Tarjetas y Modales (Surface):** Blanco Puro (`#FFFFFF`).
* **Texto Principal:** Carbono / Gris Oscuro (`#1E293B`).
* **Color Secundario (Gris Pizarra):** Slate Gray (`#64748B`) para etiquetas secundarias y bordes finos.

### Verde de marca (escala `brand`)
Identidad Alimin, extraída del design system de `aliminspa.cl`. Definida en `src/app/globals.css` bajo `@theme`; se usa vía las clases `bg-brand-*`, `text-brand-*`, `border-brand-*`.

| Token | Hex | Uso |
|---|---|---|
| `brand-50` | `#eef9ea` | Tinte de fondo |
| `brand-100` | `#dcf3d4` | Bordes suaves |
| `brand-200` | `#cdeac2` | Bordes definidos, marcos de tarjeta |
| `brand-400` | `#76d845` | Lima. Decorativo y acentos sobre fondo oscuro |
| `brand-500` | `#4ba646` | Bordes, iconos, superficies no textuales |
| `brand-600` | `#2f7a2b` | **Texto y botones con texto pequeño** |
| `brand-700` | `#245f21` | Hover / estado activo |

**Contraste (WCAG AA, sobre blanco).** Es la regla que decide qué verde usar:
* `brand-600` `#2f7a2b` → **5.32:1**, cumple AA para texto normal. Es el verde de todo texto y de todo relleno con texto pequeño.
* `brand-500` `#4ba646` → **3.07:1**, NO cumple AA para texto. Solo bordes, iconos y superficies sin texto encima.
* `brand-400` `#76d845` → ~1.9:1. Nunca como texto sobre claro; sirve como acento sobre superficie oscura.

### Separación entre marca y semáforo
Regla crítica del producto: **el verde de marca nunca debe confundirse con el estado "Al día".** El semáforo de cobranza conserva su escala propia e independiente.

* **Verde de marca (`brand-*`)** → lo accionable: botones, enlaces, pestaña activa, navegación activa, foco.
* **Semáforo** → lo informativo, nunca en `brand-*`.

**El texto del semáforo va un escalón más oscuro que el borde.** El estado de mora es el dato más crítico de la pantalla, así que se le exige el mismo AA que a la marca. El color "identidad" del estado (`#EF4444`, `#F59E0B`, `#10B981`…) se queda en el borde y el punto indicador, donde no necesita contraste de texto; el texto usa el tono `-700`.

| Estado | Fondo | Borde / punto | Texto | Contraste |
|---|---|---|---|---|
| Mora Crítica | `#FEE2E2` `red-100` | `#EF4444` `red-500` | `red-700` `#b91c1c` | 5.36:1 |
| Período de Gracia | `#FEF3C7` `amber-100` | `#F59E0B` `amber-500` | `amber-700` `#b45309` | 4.54:1 |
| Al Día / Pagado | `#D1FAE5` `emerald-100` | `#10B981` `emerald-500` | `emerald-700` `#047857` | 4.90:1 |
| Aviso Próximo | `#E0E7FF` `indigo-100` | `#6366F1` `indigo-500` | `indigo-700` `#4338ca` | 6.40:1 |
| Congelado / Pausado | `#F1F5F9` `slate-100` | `#CBD5E1` `slate-300` | `slate-600` `#475569` | 7.5:1 |

Usar el color de identidad como texto (p. ej. `#10B981` sobre `#D1FAE5`) da 2.26:1 y queda ilegible en pantallas con reflejo — que es exactamente donde postventa revisa la cartera.

Al elegir un color, la pregunta es: ¿esto *hace* algo (marca) o *informa* de un estado (semáforo)? Un botón "Descargar comprobante" es marca aunque el comprobante esté pagado.

### Superficies oscuras
`/mantenimiento` y `/change-password` son oscuras a propósito. El design system define un "mundo oscuro" (navy + lima), así que usan `accent` = `#76d845` sobre fondo oscuro. No llevan azul ni dorado.

## Tipografía
* **Títulos y Encabezados (Display & Headline):** `Outfit` o `Inter` en negrita, dando un aspecto corporativo y sólido.
* **Datos, Tablas y Formularios (Body & Labels):** `Inter` o `Roboto` en pesos Regular e Medium para máxima legibilidad de números y RUTs en grids densos.

## Bordes y Espaciado
* **Redondez (Roundness):** `ROUND_EIGHT` (8px) para botones y entradas, y `ROUND_TWELVE` (12px) para contenedores grandes y tarjetas. Evitar formas completamente redondas (píldoras) para mantener la seriedad corporativa.
* **Bordes:** Líneas finas de 1px en `#E2E8F0` para separar las filas de la tabla de deudores, imitando sutilmente las cuadrículas de Excel para que el personal de postventa se sienta familiarizado de inmediato.

## Componentes UI Clave
1. **Grilla de Clientes (Tabla):** Filas compactas con alineación perfecta. Los montos de dinero deben estar alineados a la derecha con formato `$XX.XXX.XXX` claro.
2. **Modal de Ficha Técnica:** Pestañas superiores claras en lugar de iconos. En la sección "Finanzas y Mora", los campos numéricos de Excel (monto total, cuotas, pie) deben ir a la izquierda y las acciones (registro de pago manual, congelar mora) en una columna de acción rápida a la derecha.
3. **Portal del Cliente (Móvil):** Una tarjeta de Lote limpia que represente el "activo", enmarcada con `border-brand-200`, y una barra de progreso de pago con degradado `brand-500 → brand-400`.
