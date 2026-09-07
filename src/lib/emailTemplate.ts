/**
 * Marco fijo del correo masivo y utilidades de composicion.
 *
 * Postventa escribe SOLO el asunto y el cuerpo, en texto plano con saltos de
 * linea (como un WhatsApp largo). Esta funcion es la unica que sabe convertir
 * eso en el HTML de marca que le llega al cliente: logo, cabecera verde y el
 * cuerpo. Nadie fuera de este archivo arma HTML de correo, asi que solo hay
 * un lugar donde el diseño se puede desalinear entre proyectos.
 *
 * Sin "use server": es una libreria comun, no acciones de servidor. Por eso
 * la puede importar directo un componente de cliente (EmailComposer) para
 * armar la vista previa en el navegador sin ir al servidor por cada tecla.
 */

export const EMAIL_SUBJECT_MAX = 120;
export const EMAIL_BODY_MAX = 4000;

export type EmailVariableCategory = "CLIENTE" | "TERRENO" | "FINANCIERO";

export type EmailTemplateVariable = {
  key: string;
  label: string;
  description: string;
  example: string;
  category: EmailVariableCategory;
};

export const EMAIL_VARIABLE_CATEGORIES: { id: EmailVariableCategory; label: string; icon: string }[] = [
  { id: "CLIENTE", label: "Cliente", icon: "👤" },
  { id: "TERRENO", label: "Proyecto y Lote", icon: "🏡" },
  { id: "FINANCIERO", label: "Cobranza y Cuota", icon: "💳" },
];

export const EMAIL_TEMPLATE_VARIABLES: EmailTemplateVariable[] = [
  // 👤 Datos del Cliente
  {
    key: "{nombre}",
    label: "Nombre",
    description: "Nombre completo del cliente registrado en la reserva",
    example: "Juan Carlos Pérez González",
    category: "CLIENTE",
  },
  {
    key: "{rut}",
    label: "RUT",
    description: "RUT o identificación del cliente",
    example: "12.345.678-9",
    category: "CLIENTE",
  },
  {
    key: "{email}",
    label: "Email",
    description: "Correo electrónico del cliente",
    example: "cliente@gmail.com",
    category: "CLIENTE",
  },
  {
    key: "{telefono}",
    label: "Teléfono",
    description: "Teléfono de contacto del cliente",
    example: "+56 9 1234 5678",
    category: "CLIENTE",
  },

  // 🏡 Datos del Terreno / Proyecto
  {
    key: "{proyecto}",
    label: "Proyecto",
    description: "Nombre oficial del proyecto inmobiliario",
    example: "Arena y Sol",
    category: "TERRENO",
  },
  {
    key: "{lote}",
    label: "N° Lote",
    description: "Número de lote asignado al cliente",
    example: "14",
    category: "TERRENO",
  },
  {
    key: "{etapa}",
    label: "Etapa",
    description: "Etapa del lote (si está definida)",
    example: "1",
    category: "TERRENO",
  },
  {
    key: "{portal}",
    label: "Link Portal",
    description: "Enlace directo al portal del cliente para pagos y consultas",
    example: "https://pagos.alimin.cl/user",
    category: "TERRENO",
  },

  // 💳 Datos Financieros / Cobranza
  {
    key: "{monto}",
    label: "Valor Cuota",
    description: "Monto de la próxima cuota a pagar en pesos chilenos",
    example: "$120.000",
    category: "FINANCIERO",
  },
  {
    key: "{cuota}",
    label: "N° Cuota",
    description: "Número correlativo de la próxima cuota",
    example: "5",
    category: "FINANCIERO",
  },
  {
    key: "{mes_cuota}",
    label: "Mes Cuota",
    description: "Mes y año correspondiente a la cuota",
    example: "Septiembre 2026",
    category: "FINANCIERO",
  },
  {
    key: "{fecha_vencimiento}",
    label: "Vencimiento",
    description: "Fecha límite de pago de la cuota",
    example: "15/09/2026",
    category: "FINANCIERO",
  },
  {
    key: "{saldo}",
    label: "Saldo Pendiente",
    description: "Saldo total pendiente por pagar del terreno",
    example: "$3.500.000",
    category: "FINANCIERO",
  },
  {
    key: "{multa}",
    label: "Multa Acumulada",
    description: "Multa total acumulada por días de atraso ($0 si está al día)",
    example: "$15.000",
    category: "FINANCIERO",
  },
  {
    key: "{total}",
    label: "Total a Pagar",
    description: "Suma del valor de la cuota más la multa acumulada",
    example: "$135.000",
    category: "FINANCIERO",
  },
  {
    key: "{dias_mora}",
    label: "Días Mora",
    description: "Cantidad de días de atraso transcurridos tras vencer",
    example: "8",
    category: "FINANCIERO",
  },
  {
    key: "{dias_gracia}",
    label: "Días Gracia",
    description: "Días de gracia otorgados antes de aplicar multa diaria",
    example: "5",
    category: "FINANCIERO",
  },
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
  values: Record<string, string | number | null | undefined>
): string {
  let result = text;
  for (const [key, val] of Object.entries(values)) {
    const formattedKey = key.startsWith("{") && key.endsWith("}") ? key : `{${key}}`;
    const stringVal = val !== null && val !== undefined ? String(val) : "";
    result = result.split(formattedKey).join(stringVal);
  }
  return result;
}

export function getEmailVariableSampleValues(previewSource?: any): Record<string, string> {
  const formatCLP = (amount: number | null | undefined) =>
    `$${Math.round(Number(amount) || 0).toLocaleString("es-CL")}`;

  const formatDateCL = (date: Date | string | null | undefined) => {
    if (!date) return "";
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  };

  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.AUTH_URL ||
    "https://pagos.aliminspa.cl"
  ).replace(/\/+$/, "");

  if (!previewSource) {
    return {
      nombre: "Juan Carlos Pérez González",
      rut: "12.345.678-9",
      email: "cliente@gmail.com",
      telefono: "+56 9 1234 5678",
      proyecto: "Arena y Sol",
      lote: "14",
      etapa: "1",
      portal: `${baseUrl}/user`,
      monto: "$120.000",
      cuota: "5",
      mes_cuota: "Septiembre 2026",
      fecha_vencimiento: "15/09/2026",
      saldo: "$3.500.000",
      multa: "$15.000",
      total: "$135.000",
      dias_mora: "8",
      dias_gracia: "5",
    };
  }

  const monto = Number(previewSource.monto ?? previewSource.valor_cuota ?? 120000);
  const multa = Number(previewSource.penaltyAmount ?? previewSource.multa ?? 0);
  const saldo = Number(previewSource.pendingBalance ?? previewSource.saldo ?? 0);

  return {
    nombre: previewSource.clientName || previewSource.nombre || "Nombre del cliente",
    rut: previewSource.rut || "",
    email: previewSource.to || previewSource.email || previewSource.clientEmail || "",
    telefono: previewSource.clientPhone || previewSource.telefono || "",
    proyecto: previewSource.projectName || previewSource.proyecto || "Proyecto",
    lote: previewSource.lotNumber !== undefined && previewSource.lotNumber !== null ? String(previewSource.lotNumber) : (previewSource.lote || ""),
    etapa: previewSource.lotStage !== undefined && previewSource.lotStage !== null ? String(previewSource.lotStage) : (previewSource.etapa || ""),
    portal: `${baseUrl}/user`,
    monto: previewSource.montoFormatted || formatCLP(monto),
    cuota: previewSource.nextInstallmentNumber ? String(previewSource.nextInstallmentNumber) : (previewSource.cuota || ""),
    mes_cuota: previewSource.nextInstallmentMonth || previewSource.mes_cuota || "",
    fecha_vencimiento: previewSource.nextDueDate ? formatDateCL(previewSource.nextDueDate) : (previewSource.fecha_vencimiento || ""),
    saldo: previewSource.saldoFormatted || formatCLP(saldo),
    multa: previewSource.multaFormatted || formatCLP(multa),
    total: formatCLP(monto + multa),
    dias_mora: previewSource.lateDays !== undefined && previewSource.lateDays !== null ? String(previewSource.lateDays) : (previewSource.dias_mora || "0"),
    dias_gracia: previewSource.grace_days !== undefined && previewSource.grace_days !== null ? String(previewSource.grace_days) : (previewSource.dias_gracia || "0"),
  };
}

/**
 * URL absoluta del logo. Va absoluta a propósito: este HTML lo abre Gmail en
 * la bandeja del cliente, no el navegador del portal, así que una ruta
 * relativa ("/logo.png") no resolvería a ningún lado. Mismo criterio de
 * fallback que ya usa el link de recuperación de clave.
 */
function logoUrl(): string {
  const base = (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.AUTH_URL ||
    "https://pagos.aliminspa.cl"
  ).replace(/\/+$/, "");
  return `${base}/logo.png`;
}

/**
 * Arma el HTML completo que se manda a n8n: marco de marca + el cuerpo que
 * escribió postventa (ya con las variables reemplazadas).
 *
 * Sin pie legal: postventa pidió sacarlo (el nombre/RUT/dirección por razón
 * social que sí lleva el comprobante de pago oficial, aquí no se necesita).
 */
export function buildEmailHtml(opts: {
  projectSlug: string;
  projectName: string;
  bodyText: string;
}): string {
  const paragraphs = bodyToHtmlParagraphs(opts.bodyText);

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:#1b4818;padding:24px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <img src="${logoUrl()}" width="36" height="36" alt="Alimin" style="display:block;border:0;" />
                    </td>
                    <td>
                      <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.02em;">Alimin</span>
                      <span style="color:#cdeac2;font-size:12px;display:block;margin-top:2px;">${escapeHtml(opts.projectName)}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1e293b;font-size:14px;line-height:1.6;">
                ${paragraphs}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
