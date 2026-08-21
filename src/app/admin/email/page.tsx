import { Mail, Send, Users, FileText, History, Hammer } from "lucide-react";

/**
 * Modulo de Email — marcador de posicion.
 *
 * La ruta ya existe y cuelga del menu para que postventa sepa que el canal
 * viene en camino, pero todavia no envia nada. Cuando se implemente, esta
 * pagina se reemplaza por el modulo real (mismo patron que /admin/whatsapp:
 * pestanas Panel / Enviar / Plantillas).
 *
 * Es un Server Component a proposito: no tiene interaccion ni consulta la base,
 * asi que carga siempre, incluso si el resto del portal esta con problemas.
 *
 * OJO: no confundir con /admin/email-marketing, que pese al nombre es la
 * pagina de "Informes" (ingresos y mora). El canal de correo es ESTA.
 */

const PLANIFICADO = [
  {
    icon: Users,
    titulo: "Envío masivo",
    detalle:
      "Escribir una vez y mandarlo a todos los clientes de un proyecto, o solo a los que estén en mora, en gracia o al día.",
  },
  {
    icon: Send,
    titulo: "Envío individual",
    detalle:
      "Escribirle a un cliente puntual desde su ficha, sin salir del portal ni abrir el correo aparte.",
  },
  {
    icon: FileText,
    titulo: "Plantillas editables",
    detalle:
      "Textos guardados y reutilizables con los datos del cliente ya rellenados, igual que en WhatsApp.",
  },
  {
    icon: History,
    titulo: "Historial de envíos",
    detalle:
      "Quién recibió qué correo y cuándo, para que quede registro de lo que se le comunicó a cada cliente.",
  },
];

export default function EmailPage() {
  return (
    <div className="space-y-8 animate-fade-in text-slate-800 font-sans">
      {/* Encabezado */}
      <div className="pb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email</h1>
          <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded shadow-xs uppercase tracking-wider">
            Próximamente
          </span>
        </div>
        <p className="text-xs font-medium text-slate-500 mt-1.5">
          Correos a los clientes desde el portal: masivos o uno a uno.
        </p>
      </div>

      {/* Aviso principal */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 sm:p-10">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0">
            <Mail className="w-6 h-6 text-brand-600" />
          </div>
          <div className="max-w-2xl">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Este módulo todavía no está disponible
            </h2>
            <p className="text-sm font-medium text-slate-600 mt-2 leading-relaxed">
              Estamos construyendo el canal de correo del portal. Por ahora esta
              pantalla no envía nada: está aquí para que sepas que viene y qué va
              a poder hacer.
            </p>
            <p className="text-xs font-medium text-slate-500 mt-3 leading-relaxed">
              Mientras tanto, los correos automáticos de cobranza siguen saliendo
              como siempre — esto no cambia nada de lo que ya está funcionando.
            </p>
          </div>
        </div>
      </div>

      {/* Lo que viene */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <Hammer className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Lo que viene
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLANIFICADO.map((item) => (
            <div
              key={item.titulo}
              className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 flex items-start gap-4"
            >
              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">{item.titulo}</p>
                <p className="text-xs font-medium text-slate-500 mt-1.5 leading-relaxed">
                  {item.detalle}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nota sobre el correo secundario */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <p className="text-xs font-medium text-slate-600 leading-relaxed">
          <span className="font-bold text-slate-800">Ojo con las fichas:</span>{" "}
          cada cliente tiene ahora un campo de{" "}
          <span className="font-bold text-slate-800">correo secundario</span>. Lo
          que anote postventa ahí va a servir cuando este módulo esté listo, así
          que mientras más fichas queden completas antes, mejor va a llegar el
          primer envío.
        </p>
      </div>
    </div>
  );
}
