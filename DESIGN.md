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
* **Color Primario (Cobalto Financiero):** Azul Cobalto (`#1E3A8A`) para headers, botones principales y acciones clave.
* **Color Secundario (Gris Pizarra):** Slate Gray (`#64748B`) para etiquetas secundarias y bordes finos.
* **Estados Semafóricos (Mora y Alertas):**
  * **Mora Crítica:** Fondo Coral Claro (`#FEE2E2`) con texto y bordes Rojo Coral (`#EF4444`).
  * **Período de Gracia:** Fondo Ámbar Claro (`#FEF3C7`) con texto y bordes Naranja Ámbar (`#F59E0B`).
  * **Al Día / Pagado:** Fondo Verde Menta Claro (`#D1FAE5`) con texto y bordes Verde Esmeralda (`#10B981`).
  * **Aviso Próximo:** Fondo Indigo Claro (`#E0E7FF`) con texto y bordes Indigo (`#6366F1`).
  * **Congelado / Pausado:** Fondo Gris Claro (`#F1F5F9`) con texto y bordes Gris Pizarra (`#64748B`).

## Tipografía
* **Títulos y Encabezados (Display & Headline):** `Outfit` o `Inter` en negrita, dando un aspecto corporativo y sólido.
* **Datos, Tablas y Formularios (Body & Labels):** `Inter` o `Roboto` en pesos Regular e Medium para máxima legibilidad de números y RUTs en grids densos.

## Bordes y Espaciado
* **Redondez (Roundness):** `ROUND_EIGHT` (8px) para botones y entradas, y `ROUND_TWELVE` (12px) para contenedores grandes y tarjetas. Evitar formas completamente redondas (píldoras) para mantener la seriedad corporativa.
* **Bordes:** Líneas finas de 1px en `#E2E8F0` para separar las filas de la tabla de deudores, imitando sutilmente las cuadrículas de Excel para que el personal de postventa se sienta familiarizado de inmediato.

## Componentes UI Clave
1. **Grilla de Clientes (Tabla):** Filas compactas con alineación perfecta. Los montos de dinero deben estar alineados a la derecha con formato `$XX.XXX.XXX` claro.
2. **Modal de Ficha Técnica:** Pestañas superiores claras en lugar de iconos. En la sección "Finanzas y Mora", los campos numéricos de Excel (monto total, cuotas, pie) deben ir a la izquierda y las acciones (registro de pago manual, congelar mora) en una columna de acción rápida a la derecha.
3. **Portal del Cliente (Móvil):** Una tarjeta de Lote limpia que represente el "activo", con una barra de progreso de pago en tonos azul cobalto y dorado.
