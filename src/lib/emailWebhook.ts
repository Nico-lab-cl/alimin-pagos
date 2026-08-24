/**
 * Cliente del webhook de correo (n8n).
 *
 * El portal NO manda correos: llama a un webhook de n8n que tiene, por dentro,
 * un Switch que reparte por "buzon" (cindy | denisse) hacia el nodo Gmail de
 * la cuenta que corresponde, y esas si mandan el correo real desde
 * postventa@lomasdelmar.cl o postventa@libertadyalegria.cl. El portal nunca
 * ve ni guarda ninguna credencial de Google.
 *
 * Que proyecto sale por que buzon es una regla de negocio (Arena y Sol sale
 * por la cuenta de Lomas del Mar), no un dato de conexion, asi que vive acá
 * igual que PROJECT_INSTANCE en evolution.ts.
 */

export type Buzon = "cindy" | "denisse";

const BUZON_BY_PROJECT: Record<string, Buzon> = {
  "libertad-y-alegria": "denisse",
  "arena-y-sol": "cindy",
  "lomas-del-mar": "cindy",
};

const DEFAULT_TIMEOUT_MS = 20_000;

export function knownEmailProjectSlugs(): string[] {
  return Object.keys(BUZON_BY_PROJECT);
}

export function buzonForProject(projectSlug: string): Buzon | null {
  return BUZON_BY_PROJECT[projectSlug] ?? null;
}

function webhookUrl(): string {
  return process.env.N8N_EMAIL_WEBHOOK_URL || "";
}

/**
 * true cuando estan las tres variables que hacen falta para poder llamar al
 * webhook. Se separa de sendEmail para que la pantalla pueda avisar "falta
 * configurar" en vez de que cada envio reviente con un error críptico.
 */
export function emailWebhookConfigured(): boolean {
  return Boolean(
    process.env.N8N_EMAIL_WEBHOOK_URL &&
      process.env.N8N_EMAIL_WEBHOOK_AUTH_HEADER &&
      process.env.N8N_EMAIL_WEBHOOK_AUTH_VALUE
  );
}

export type EmailPayload = {
  buzon: Buzon;
  modo: "REAL" | "PRUEBA";
  to: string;
  subject: string;
  html: string;
  texto: string;
  proyectoSlug: string;
  proyectoNombre: string;
  clienteNombre: string;
  clienteRut: string;
  clienteLote: string;
  clienteEtapa: string;
  reservaId: string | null;
  mensajeId: string;
  tandaId: string;
  indice: number;
  total: number;
  enviadoPor: string;
};

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Llama al webhook de n8n para un solo correo. El nodo Webhook de n8n esta
 * configurado en "When Last Node Finishes", asi que la respuesta HTTP refleja
 * si Gmail realmente acepto el envio, no solo si n8n recibio la llamada.
 */
export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  const url = webhookUrl();
  const authHeader = process.env.N8N_EMAIL_WEBHOOK_AUTH_HEADER;
  const authValue = process.env.N8N_EMAIL_WEBHOOK_AUTH_VALUE;

  if (!url || !authHeader || !authValue) {
    return { ok: false, error: "Falta configurar el webhook de correo (N8N_EMAIL_WEBHOOK_*)" };
  }

  const body = {
    buzon: payload.buzon,
    modo: payload.modo,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    texto: payload.texto,
    proyecto_slug: payload.proyectoSlug,
    proyecto_nombre: payload.proyectoNombre,
    cliente_nombre: payload.clienteNombre,
    cliente_rut: payload.clienteRut,
    cliente_lote: payload.clienteLote,
    cliente_etapa: payload.clienteEtapa,
    reserva_id: payload.reservaId,
    mensaje_id: payload.mensajeId,
    tanda_id: payload.tandaId,
    indice: payload.indice,
    total: payload.total,
    enviado_por: payload.enviadoPor,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [authHeader]: authValue,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "El webhook rechazó la autorización (revisa el secreto)" };
      }
      return {
        ok: false,
        error: text ? `n8n respondió ${res.status}: ${text.slice(0, 300)}` : `n8n respondió ${res.status}`,
      };
    }

    return { ok: true };
  } catch (error: any) {
    const reason =
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? `El webhook no respondió en ${DEFAULT_TIMEOUT_MS / 1000}s`
        : error?.message || "No se pudo contactar el webhook de correo";
    return { ok: false, error: reason };
  }
}
