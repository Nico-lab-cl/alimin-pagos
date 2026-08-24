/**
 * Constantes del modulo de WhatsApp.
 *
 * Viven fuera de src/actions/whatsapp.ts porque un archivo "use server" solo
 * puede exportar funciones asincronas. Aca no hay nada de servidor, asi que la
 * pantalla tambien puede importarlo.
 */

export const WHATSAPP_CATEGORIES = ["MORA", "GRACIA", "PROXIMO", "VENCIMIENTO"] as const;
export type WhatsappCategory = (typeof WHATSAPP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<WhatsappCategory, string> = {
  MORA: "Mora",
  GRACIA: "Días de gracia",
  PROXIMO: "Próximo a pagar",
  VENCIMIENTO: "Vence hoy",
};

/** Como se define cada categoria, para explicarlo en la pantalla. */
export const CATEGORY_DESCRIPTIONS: Record<WhatsappCategory, string> = {
  MORA: "La cuota venció y ya pasó el período de gracia: acumula multa diaria.",
  GRACIA: "La cuota venció pero sigue dentro del período de gracia, todavía sin multa.",
  PROXIMO: "La cuota vence dentro de los próximos 5 días.",
  VENCIMIENTO: "La cuota vence hoy. Se superpone con «Días de gracia», porque el mismo día del vencimiento el cliente ya entró en gracia.",
};

/**
 * Textos de respaldo. La fuente real son las plantillas guardadas en la base y
 * editables desde /admin/whatsapp; esto solo cubre el caso de que la migración
 * 03_whatsapp_tables.sql aún no se haya aplicado.
 */
export const DEFAULT_TEMPLATES: Record<WhatsappCategory, { name: string; body: string }> = {
  MORA: {
    name: "Cuota en mora",
    body:
      "Hola {nombre}, le escribimos de {proyecto}.\n\n" +
      "Su cuota {cuota} ({mes_cuota}) del lote {lote} venció el {fecha_vencimiento} y registra {dias_mora} días de atraso.\n\n" +
      "Monto de la cuota: {monto}\nMulta acumulada: {multa}\nTotal a pagar: {total}\n\n" +
      "Puede revisar su estado de cuenta y subir su comprobante en el portal: {portal}\n\n" +
      "Si ya realizó el pago, por favor ignore este mensaje o envíenos el comprobante. Quedamos atentos.",
  },
  GRACIA: {
    name: "Dentro del período de gracia",
    body:
      "Hola {nombre}, le escribimos de {proyecto}.\n\n" +
      "Su cuota {cuota} ({mes_cuota}) del lote {lote} venció el {fecha_vencimiento}, pero aún está dentro del período de gracia de {dias_gracia} días, así que todavía no genera multa.\n\n" +
      "Monto a pagar: {monto}\n\n" +
      "Si paga dentro del plazo evita el recargo por atraso. Puede subir su comprobante en el portal: {portal}\n\nQuedamos atentos.",
  },
  PROXIMO: {
    name: "Próximo a vencer",
    body:
      "Hola {nombre}, le saludamos de {proyecto}.\n\n" +
      "Le recordamos que su cuota {cuota} ({mes_cuota}) del lote {lote} vence el {fecha_vencimiento}.\n\n" +
      "Monto a pagar: {monto}\n\n" +
      "Puede realizar el pago y subir su comprobante en el portal: {portal}\n\n¡Gracias por su puntualidad!",
  },
  VENCIMIENTO: {
    name: "Vence hoy",
    body:
      "Hola {nombre}, le saludamos de {proyecto}.\n\n" +
      "Hoy {fecha_vencimiento} vence su cuota {cuota} ({mes_cuota}) del lote {lote}.\n\n" +
      "Monto a pagar: {monto}\n\n" +
      "Si paga hoy no se genera ningún recargo. Puede subir su comprobante en el portal: {portal}\n\nQuedamos atentos.",
  },
};

export const TEMPLATE_VARIABLES: { key: string; description: string }[] = [
  { key: "{nombre}", description: "Nombre completo del cliente" },
  { key: "{proyecto}", description: "Nombre del proyecto" },
  { key: "{lote}", description: "Número de lote" },
  { key: "{etapa}", description: "Etapa del lote" },
  { key: "{rut}", description: "RUT del cliente" },
  { key: "{cuota}", description: "Número de la próxima cuota" },
  { key: "{mes_cuota}", description: "Mes y año de esa cuota" },
  { key: "{monto}", description: "Valor de la cuota" },
  { key: "{multa}", description: "Multa acumulada" },
  { key: "{total}", description: "Cuota + multa" },
  { key: "{saldo}", description: "Saldo pendiente total" },
  { key: "{dias_mora}", description: "Días de atraso" },
  { key: "{dias_gracia}", description: "Días de gracia del cliente" },
  { key: "{fecha_vencimiento}", description: "Fecha de vencimiento de la cuota" },
  { key: "{portal}", description: "Link al portal del cliente" },
];

// ---------------------------------------------------------------------------
// Avisos automaticos de pago
// ---------------------------------------------------------------------------
// Estas categorias NO son de cobranza y por eso viven aparte de
// WHATSAPP_CATEGORIES: no tienen audiencia que segmentar ni pantalla de envio.
// Salen solas cuando postventa aprueba un comprobante o registra un pago, una
// por objetivo del pago.

export const PAYMENT_CATEGORIES = ["PAGO_PIE", "PAGO_CUOTA", "PAGO_INTERES"] as const;
export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number];

export const PAYMENT_CATEGORY_LABELS: Record<PaymentCategory, string> = {
  PAGO_PIE: "Pago de pie",
  PAGO_CUOTA: "Pago de cuota",
  PAGO_INTERES: "Abono a intereses",
};

export const PAYMENT_CATEGORY_DESCRIPTIONS: Record<PaymentCategory, string> = {
  PAGO_PIE: "Sale cuando se aprueba o se registra un pago de pie.",
  PAGO_CUOTA:
    "Sale cuando se aprueba o se registra el pago de una o varias cuotas. El concepto indica qué cuota y de qué mes.",
  PAGO_INTERES: "Sale cuando se aprueba o se registra un abono a intereses.",
};

/**
 * De donde vino el pago. Es la unica diferencia de redaccion entre un aviso y
 * otro, y por eso va como variable en vez de duplicar las tres plantillas:
 * el cliente que subio su comprobante espera un "aprobado", y el que pago por
 * transferencia sin subir nada espera un "lo registramos".
 */
export type PaymentNoticeSource = "RECEIPT" | "MANUAL";

export const CONFIRMATION_PHRASES: Record<PaymentNoticeSource, string> = {
  RECEIPT: "Confirmamos que su pago fue aprobado y ya quedó registrado en su portal.",
  MANUAL: "Registramos su pago y ya quedó publicado en su portal.",
};

export const DEFAULT_PAYMENT_TEMPLATES: Record<PaymentCategory, { name: string; body: string }> = {
  PAGO_CUOTA: {
    name: "Pago de cuota confirmado",
    body:
      "Hola {nombre}, le saludamos de {proyecto}.\n\n" +
      "{confirmacion}\n\n" +
      "Detalle del pago\nLote {lote}\n{concepto}\nMonto: {monto}\nFecha: {fecha}\n\n" +
      "Puede revisar su estado de cuenta y descargar su comprobante en el portal: {portal}\n\n" +
      "¡Gracias por su pago!",
  },
  PAGO_PIE: {
    name: "Pago de pie confirmado",
    body:
      "Hola {nombre}, le saludamos de {proyecto}.\n\n" +
      "{confirmacion}\n\n" +
      "Detalle del pago\nLote {lote}\n{concepto}\nMonto: {monto}\nFecha: {fecha}\n\n" +
      "Puede revisar su estado de cuenta y descargar su comprobante en el portal: {portal}\n\n" +
      "¡Gracias por su pago!",
  },
  PAGO_INTERES: {
    name: "Abono a intereses confirmado",
    body:
      "Hola {nombre}, le saludamos de {proyecto}.\n\n" +
      "{confirmacion}\n\n" +
      "Detalle del abono\nLote {lote}\n{concepto}\nMonto: {monto}\nFecha: {fecha}\n\n" +
      "Puede revisar su estado de cuenta y descargar su comprobante en el portal: {portal}\n\n" +
      "Quedamos atentos.",
  },
};

/**
 * Variables de los avisos de pago. Son distintas a las de cobranza a proposito:
 * un aviso de pago confirma lo que se pago y nada mas. No expone saldo, mora ni
 * dias de atraso, porque eso lo ve el cliente en su portal y lo conversa con
 * postventa, no se le anuncia junto con la confirmacion de su pago.
 */
export const PAYMENT_TEMPLATE_VARIABLES: { key: string; description: string }[] = [
  { key: "{nombre}", description: "Nombre completo del cliente" },
  { key: "{proyecto}", description: "Nombre del proyecto" },
  { key: "{lote}", description: "Número de lote" },
  { key: "{etapa}", description: "Etapa del lote" },
  { key: "{rut}", description: "RUT del cliente" },
  {
    key: "{concepto}",
    description: 'Qué se pagó: "Cuota 3 - Agosto 2026", "Pago de Pie", "Abono a intereses"',
  },
  { key: "{monto}", description: "Monto del pago confirmado" },
  { key: "{fecha}", description: "Fecha del pago" },
  {
    key: "{confirmacion}",
    description: 'Se rellena solo: "fue aprobado" si el cliente subió el comprobante, "lo registramos" si lo cargó postventa',
  },
  { key: "{portal}", description: "Link al portal del cliente" },
];

/** Categoria de plantilla que le toca a cada objetivo de pago. */
export const PAYMENT_CATEGORY_BY_KIND: Record<"PIE" | "CUOTA" | "INTERES", PaymentCategory> = {
  PIE: "PAGO_PIE",
  CUOTA: "PAGO_CUOTA",
  INTERES: "PAGO_INTERES",
};
