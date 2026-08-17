/**
 * Cliente de Evolution API (WhatsApp).
 *
 * El servidor corre en Easypanel junto al resto de los proyectos y expone dos
 * instancias, una por equipo de postventa. Cada proyecto sale por el numero de
 * la persona que lo atiende, para que el cliente reciba el mensaje desde el
 * contacto con el que ya viene hablando.
 *
 * Nada de esto esta hardcodeado con credenciales: la URL y las apikeys viven en
 * variables de entorno (ver .env.example). Lo unico que vive en el codigo es a
 * que instancia le toca cada proyecto, porque eso es una regla del negocio y no
 * un secreto.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

/** Que instancia atiende cada proyecto. */
const PROJECT_INSTANCE: Record<string, InstanceKey> = {
  "libertad-y-alegria": "DENISSE",
  "arena-y-sol": "CINDY",
  "lomas-del-mar": "CINDY",
};

export type InstanceKey = "DENISSE" | "CINDY";

export type ResolvedInstance = {
  key: InstanceKey;
  /** Nombre de la instancia en Evolution; es lo que va en la URL del endpoint. */
  name: string;
  apikey: string;
};

export function getBaseUrl(): string {
  return (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
}

/**
 * Resuelve la instancia de un proyecto. Devuelve null (en vez de lanzar) cuando
 * falta configuracion, para que la pantalla pueda mostrar "falta configurar" en
 * lugar de reventar.
 */
export function resolveInstance(projectSlug: string): ResolvedInstance | null {
  const key = PROJECT_INSTANCE[projectSlug];
  if (!key) return null;

  const name = process.env[`EVOLUTION_INSTANCE_${key}`];
  const apikey = process.env[`EVOLUTION_APIKEY_${key}`] || process.env.EVOLUTION_API_KEY;

  if (!name || !apikey || !getBaseUrl()) return null;

  return { key, name, apikey };
}

/** Los proyectos que este modulo sabe atender, con o sin configuracion cargada. */
export function knownProjectSlugs(): string[] {
  return Object.keys(PROJECT_INSTANCE);
}

export function instanceKeyForProject(projectSlug: string): InstanceKey | null {
  return PROJECT_INSTANCE[projectSlug] ?? null;
}

async function evolutionFetch(
  path: string,
  apikey: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${getBaseUrl()}${path}`;

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey,
        ...(init?.headers || {}),
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });

    let data: any = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    return { ok: res.ok, status: res.status, data };
  } catch (error: any) {
    const reason =
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? `El servidor de WhatsApp no respondio en ${DEFAULT_TIMEOUT_MS / 1000}s`
        : error?.message || "No se pudo contactar el servidor de WhatsApp";
    return { ok: false, status: 0, data: { error: reason } };
  }
}

/** Mensaje de error legible a partir de lo que devuelve Evolution. */
function readError(status: number, data: any): string {
  const raw =
    data?.response?.message ??
    data?.message ??
    data?.error ??
    data?.raw ??
    null;

  const text = Array.isArray(raw) ? raw.join(" | ") : typeof raw === "string" ? raw : null;

  if (status === 401 || status === 403) return "Apikey rechazada por Evolution API";
  if (status === 404) return "La instancia no existe en Evolution API (revisa el nombre)";
  if (status === 0) return text || "No se pudo contactar el servidor de WhatsApp";

  return text ? `${status}: ${text}` : `Evolution respondio ${status}`;
}

export type SendResult =
  | { ok: true; evolutionId: string | null }
  | { ok: false; error: string };

/**
 * Envia un mensaje de texto.
 *
 * `number` va en digitos con codigo de pais y sin "+", que es lo que espera la
 * API. El cuerpo se manda en el formato de Evolution v2; si el servidor resulta
 * ser v1 responde 400 y se reintenta una sola vez con el formato viejo, para no
 * depender de que version quedo instalada en Easypanel.
 */
export async function sendText(
  instance: ResolvedInstance,
  number: string,
  text: string
): Promise<SendResult> {
  const path = `/message/sendText/${encodeURIComponent(instance.name)}`;

  let res = await evolutionFetch(path, instance.apikey, {
    method: "POST",
    body: JSON.stringify({ number, text }),
  });

  // Formato v1: el texto va anidado en textMessage.
  if (!res.ok && res.status === 400) {
    res = await evolutionFetch(path, instance.apikey, {
      method: "POST",
      body: JSON.stringify({ number, textMessage: { text } }),
    });
  }

  if (!res.ok) {
    return { ok: false, error: readError(res.status, res.data) };
  }

  return { ok: true, evolutionId: res.data?.key?.id ?? null };
}

export type ConnectionState = {
  configured: boolean;
  connected: boolean;
  state: string;
  instanceName: string | null;
  error?: string;
};

/** Estado de la sesion de WhatsApp; alimenta el boton "Probar conexion". */
export async function getConnectionState(projectSlug: string): Promise<ConnectionState> {
  const instance = resolveInstance(projectSlug);

  if (!instance) {
    return {
      configured: false,
      connected: false,
      state: "SIN CONFIGURAR",
      instanceName: null,
      error:
        "Faltan variables de entorno (EVOLUTION_API_URL / EVOLUTION_INSTANCE_* / EVOLUTION_APIKEY_*)",
    };
  }

  const res = await evolutionFetch(
    `/instance/connectionState/${encodeURIComponent(instance.name)}`,
    instance.apikey
  );

  if (!res.ok) {
    return {
      configured: true,
      connected: false,
      state: "ERROR",
      instanceName: instance.name,
      error: readError(res.status, res.data),
    };
  }

  const state = res.data?.instance?.state ?? res.data?.state ?? "desconocido";

  return {
    configured: true,
    connected: state === "open",
    state,
    instanceName: instance.name,
  };
}

/**
 * Lista las instancias del servidor. Sirve para descubrir el nombre exacto
 * cuando el que quedo en la variable de entorno no coincide con el real.
 */
export async function fetchInstances(): Promise<
  { ok: true; instances: { name: string; id: string; state: string }[] } | { ok: false; error: string }
> {
  const apikey =
    process.env.EVOLUTION_API_KEY ||
    process.env.EVOLUTION_APIKEY_DENISSE ||
    process.env.EVOLUTION_APIKEY_CINDY;

  if (!apikey || !getBaseUrl()) {
    return { ok: false, error: "Falta EVOLUTION_API_URL o la apikey del servidor" };
  }

  const res = await evolutionFetch("/instance/fetchInstances", apikey);

  if (!res.ok) return { ok: false, error: readError(res.status, res.data) };

  const list = Array.isArray(res.data) ? res.data : res.data?.instances ?? [];

  return {
    ok: true,
    instances: list.map((raw: any) => {
      const i = raw?.instance ?? raw;
      return {
        name: i?.name ?? i?.instanceName ?? "?",
        id: i?.id ?? i?.instanceId ?? "?",
        state: i?.connectionStatus ?? i?.state ?? i?.status ?? "?",
      };
    }),
  };
}
