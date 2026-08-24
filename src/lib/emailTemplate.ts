/**
 * Marco fijo del correo masivo y utilidades de composicion.
 *
 * Postventa escribe SOLO el asunto y el cuerpo, en texto plano con saltos de
 * linea (como un WhatsApp largo). Esta funcion es la unica que sabe convertir
 * eso en el HTML de marca que le llega al cliente: logo/nombre, colores del
 * proyecto y un pie legal. Nadie fuera de este archivo arma HTML de correo, asi
 * que solo hay un lugar donde el diseño se puede desalinear entre proyectos.
 */

import { getReceiptLegalInfo } from "@/lib/receiptLegalInfo";

export const EMAIL_SUBJECT_MAX = 120;
export const EMAIL_BODY_MAX = 4000;

export const EMAIL_TEMPLATE_VARIABLES: { key: string; description: string }[] = [
  { key: "{nombre}", description: "Nombre completo del cliente" },
  { key: "{proyecto}", description: "Nombre del proyecto" },
  { key: "{lote}", description: "Número de lote" },
  { key: "{etapa}", description: "Etapa del lote" },
  { key: "{rut}", description: "RUT del cliente" },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Texto plano con saltos de línea -> párrafos HTML. Nada de HTML libre. */
function bodyToHtmlParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => escapeHtml(block.trim()).replace(/\n/g, "<br/>"))
    .filter((block) => block.length > 0)
    .map((block) => `<p style="margin:0 0 16px 0;">${block}</p>`)
    .join("\n");
}

/** Reemplaza las variables del asunto/cuerpo con los datos reales del cliente. */
export function renderEmailVariables(
  text: string,
  values: { nombre: string; proyecto: string; lote: string; etapa: string; rut: string }
): string {
  return text
    .split("{nombre}").join(values.nombre)
    .split("{proyecto}").join(values.proyecto)
    .split("{lote}").join(values.lote)
    .split("{etapa}").join(values.etapa)
    .split("{rut}").join(values.rut);
}

/**
 * Arma el HTML completo que se manda a n8n: marco de marca + el cuerpo que
 * escribió postventa (ya con las variables reemplazadas). `projectSlug` decide
 * el nombre legal y el correo de contacto del pie, igual que en el comprobante
 * de pago oficial.
 */
export function buildEmailHtml(opts: {
  projectSlug: string;
  projectName: string;
  bodyText: string;
}): string {
  const legal = getReceiptLegalInfo(opts.projectSlug);
  const paragraphs = bodyToHtmlParagraphs(opts.bodyText);

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:#0f172a;padding:24px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.02em;">Alimin</span>
                <span style="color:#94a3b8;font-size:12px;display:block;margin-top:2px;">${escapeHtml(opts.projectName)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1e293b;font-size:14px;line-height:1.6;">
                ${paragraphs}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.6;">
                <p style="margin:0 0 4px 0;font-weight:bold;color:#334155;">${escapeHtml(legal.legalName)}</p>
                <p style="margin:0 0 4px 0;">${escapeHtml(legal.address)}</p>
                <p style="margin:0;">Contacto: <a href="mailto:${legal.contactEmail}" style="color:#2563eb;">${legal.contactEmail}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
