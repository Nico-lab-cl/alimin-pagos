/**
 * Normalizacion de telefonos chilenos para WhatsApp.
 *
 * En el CRM los numeros vienen escritos de todas las formas posibles: "569...",
 * "+569...", "9 1234 5678", "9-1234-5678", con puntos, con parentesis, y a veces
 * con dos numeros en el mismo campo separados por "/" o ",".
 *
 * El criterio es ser estricto a proposito. Estos mensajes dicen cuanto debe el
 * cliente y por cuantos dias, asi que mandarselo a un numero mal adivinado es
 * filtrarle la deuda a un tercero. Cuando el numero no resuelve de forma
 * inequivoca a un movil chileno, se rechaza y la pantalla lo muestra en la lista
 * de "telefonos con problema" para que postventa lo corrija en la ficha. Es
 * preferible dejar a alguien fuera de la tanda que escribirle al equivocado.
 */

export type PhoneCheck =
  | {
      ok: true;
      /** Solo digitos, con codigo de pais. Es lo que espera Evolution API. */
      e164: string;
      /** Formato legible para la tabla: +56 9 1234 5678 */
      display: string;
      kind: "CL_MOBILE" | "INTERNATIONAL";
      raw: string;
    }
  | { ok: false; reason: string; raw: string };

/**
 * Cuando el campo trae dos numeros ("912345678 / 987654321") se usa el primero.
 * Solo se corta en separadores que no aparecen dentro de un numero: el guion
 * queda fuera porque es separador de formato ("9 1234-5678").
 */
function firstCandidate(raw: string): string {
  const parts = raw.split(/[/,;]| o | y /i);
  for (const part of parts) {
    if (/\d/.test(part)) return part;
  }
  return raw;
}

function formatCl(e164: string): string {
  // 56 9 1234 5678
  const n = e164.slice(3);
  return `+56 9 ${n.slice(0, 4)} ${n.slice(4)}`;
}

export function normalizePhone(input: string | null | undefined): PhoneCheck {
  const raw = (input ?? "").toString().trim();

  if (!raw) return { ok: false, reason: "Sin telefono registrado", raw };

  const candidate = firstCandidate(raw);
  const hadPlus = candidate.trimStart().startsWith("+");

  let digits = candidate.replace(/\D/g, "");

  if (!digits) return { ok: false, reason: "No contiene digitos", raw };

  // Prefijo de salida internacional y ceros iniciales de discado nacional.
  if (digits.startsWith("00")) digits = digits.slice(2);
  while (digits.startsWith("0")) digits = digits.slice(1);

  if (!digits) return { ok: false, reason: "Solo ceros", raw };

  // 9 digitos partiendo en 9 → movil sin codigo de pais.
  if (digits.length === 9 && digits.startsWith("9")) {
    const e164 = `56${digits}`;
    return { ok: true, e164, display: formatCl(e164), kind: "CL_MOBILE", raw };
  }

  if (digits.startsWith("56")) {
    const national = digits.slice(2);

    if (national.length === 9 && national.startsWith("9")) {
      return { ok: true, e164: digits, display: formatCl(digits), kind: "CL_MOBILE", raw };
    }

    // 56 + 8 digitos partiendo en 9: movil al que le falta un digito. Antes de
    // 2012 los moviles chilenos tenian 8 digitos; estos son registros viejos que
    // nunca se migraron. No se completa por nuestra cuenta.
    if (national.length === 8 && national.startsWith("9")) {
      return { ok: false, reason: "Movil incompleto (formato antiguo de 8 digitos)", raw };
    }

    if (national.length >= 8 && national.length <= 9) {
      return { ok: false, reason: "Es un fijo, no un movil", raw };
    }

    return { ok: false, reason: `Largo invalido (${digits.length} digitos)`, raw };
  }

  // 8 digitos sueltos: puede ser un movil viejo o un fijo sin codigo de area.
  // No hay forma de saberlo, asi que no se adivina.
  if (digits.length === 8) {
    return { ok: false, reason: "Faltan digitos (numero de 8 cifras sin prefijo)", raw };
  }

  // Numero extranjero: solo se acepta si venia escrito con "+", es decir, si
  // alguien lo tecleo como internacional a proposito. Sin el "+" no se puede
  // distinguir de un numero chileno mal escrito.
  if (hadPlus && digits.length >= 10 && digits.length <= 15) {
    return { ok: true, e164: digits, display: `+${digits}`, kind: "INTERNATIONAL", raw };
  }

  return { ok: false, reason: `Formato no reconocido (${digits.length} digitos)`, raw };
}

/** Atajo para los sitios donde solo interesa saber si se le puede escribir. */
export function isSendablePhone(input: string | null | undefined): boolean {
  return normalizePhone(input).ok;
}
