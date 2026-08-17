import type { WhatsappCategory } from "@/lib/whatsappTemplates";

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
