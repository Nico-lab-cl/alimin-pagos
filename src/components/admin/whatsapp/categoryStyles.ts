import type { PaymentCategory, WhatsappCategory } from "@/lib/whatsappTemplates";

export type CategoryStyle = {
  bg: string;
  border: string;
  text: string;
  dot: string;
  solid: string;
  bar: string;
};

/**
 * Colores de las cuatro categorias, siguiendo el semaforo de DESIGN.md: el color
 * de identidad se queda en el borde y el punto, y el texto va un escalon mas
 * oscuro (-700) para cumplir AA.
 *
 * Tres calzan uno a uno con un estado del semaforo (Mora Critica, Periodo de
 * Gracia, Aviso Proximo). "Vence hoy" no es un estado de cobranza, asi que usa
 * `sky`, que no esta tomado por ningun estado y por lo tanto no le atribuye al
 * cliente una condicion que no tiene. sky-700 sobre sky-100 da 6.3:1.
 */
export const CATEGORY_STYLES: Record<
  WhatsappCategory,
  { bg: string; border: string; text: string; dot: string; solid: string; bar: string }
> = {
  MORA: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    dot: "bg-red-500",
    solid: "bg-red-600 hover:bg-red-700",
    bar: "bg-red-500",
  },
  GRACIA: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-500",
    solid: "bg-amber-600 hover:bg-amber-700",
    bar: "bg-amber-500",
  },
  PROXIMO: {
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
    solid: "bg-indigo-600 hover:bg-indigo-700",
    bar: "bg-indigo-500",
  },
  VENCIMIENTO: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-700",
    dot: "bg-sky-500",
    solid: "bg-sky-600 hover:bg-sky-700",
    bar: "bg-sky-500",
  },
};

/**
 * Colores de los avisos automaticos de pago.
 *
 * Ninguno usa el rojo ni el ambar del semaforo de cobranza a proposito: estos
 * mensajes confirman plata que YA entro, no una deuda, y pintarlos con el color
 * de la mora haria leer una fila buena como si fuera un problema. Los tres se
 * quedan en la familia verde/violeta, que no esta tomada por ningun estado.
 */
export const PAYMENT_CATEGORY_STYLES: Record<PaymentCategory, CategoryStyle> = {
  PAGO_CUOTA: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    solid: "bg-emerald-600 hover:bg-emerald-700",
    bar: "bg-emerald-500",
  },
  PAGO_PIE: {
    bg: "bg-teal-50",
    border: "border-teal-200",
    text: "text-teal-700",
    dot: "bg-teal-500",
    solid: "bg-teal-600 hover:bg-teal-700",
    bar: "bg-teal-500",
  },
  PAGO_INTERES: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-700",
    dot: "bg-violet-500",
    solid: "bg-violet-600 hover:bg-violet-700",
    bar: "bg-violet-500",
  },
};

/** Estilo de cualquiera de las siete categorias, sin tener que saber cual es. */
export const ALL_CATEGORY_STYLES: Record<string, CategoryStyle> = {
  ...CATEGORY_STYLES,
  ...PAYMENT_CATEGORY_STYLES,
};
