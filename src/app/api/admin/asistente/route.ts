import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { auth } from "@/auth";
import { conversar } from "@/lib/asistente/conversar";

// Una consulta hace varias llamadas al modelo y a la base.
export const maxDuration = 60;

const cuerpo = z.object({
  mensajes: z
    .array(z.object({ rol: z.enum(["usuario", "asistente"]), texto: z.string().min(1).max(4000) }))
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1].rol === "usuario", "El último mensaje tiene que ser del usuario."),
});

const error = (status: number, mensaje: string) => Response.json({ error: mensaje }, { status });

/**
 * Asistente de postventa (solo lectura). Lo usa el panel /admin; responde con
 * los datos que la cuenta que pregunta puede ver segun allowed_projects.
 */
export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; role?: string; allowedProjects?: string[] | null } | undefined;
  if (!user?.id || user.role !== "ADMIN") return error(401, "No autorizado");

  if (!process.env.ANTHROPIC_API_KEY) {
    return error(503, "Falta configurar ANTHROPIC_API_KEY en el servidor.");
  }

  let datos: z.infer<typeof cuerpo>;
  try {
    datos = cuerpo.parse(await request.json());
  } catch {
    return error(400, "Mensaje inválido.");
  }

  const inicio = Date.now();
  try {
    const r = await conversar(datos.mensajes.slice(-20), {
      id: user.id,
      email: user.email,
      allowedProjects: Array.isArray(user.allowedProjects) ? user.allowedProjects : null,
    });
    console.log(
      `[Asistente] ${user.email} · ${Date.now() - inicio}ms · vueltas=${r.uso.vueltas} · ` +
        `tokens entrada=${r.uso.entrada} cache=${r.uso.cache_leida} salida=${r.uso.salida} · ` +
        `herramientas=${r.herramientas.join(",") || "-"}`
    );
    return Response.json({ texto: r.texto, herramientas: r.herramientas });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      console.error("[Asistente] ANTHROPIC_API_KEY rechazada");
      return error(503, "La llave de Anthropic no es válida.");
    }
    if (e instanceof Anthropic.RateLimitError) return error(429, "Demasiadas consultas seguidas; espera unos segundos.");
    if (e instanceof Anthropic.APIError) {
      console.error(`[Asistente] Error de la API ${e.status}:`, e.message);
      return error(502, "El asistente no está disponible en este momento.");
    }
    console.error("[Asistente] Error:", e);
    return error(500, "Error al procesar la consulta.");
  }
}
