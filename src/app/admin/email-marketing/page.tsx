"use client";

import { useState, useEffect } from "react";
import { 
  Mail, 
  Users, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Layout, 
  Filter,
  ChevronRight,
  MessageSquare,
  Sparkles
} from "lucide-react";
import { getProjectEmails, sendBulkEmail } from "@/actions/marketing";
import { toast } from "sonner";

export default function EmailMarketingPage() {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [emails, setEmails] = useState<{name: string, email: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [step, setStep] = useState(1);

  const projects = [
    { name: "Arena y Sol", slug: "arena-y-sol", color: "from-amber-400 to-orange-600" },
    { name: "Libertad y Alegría", slug: "libertad-y-alegria", color: "from-emerald-400 to-teal-600" }
  ];

  const handleSelectProject = async (slug: string) => {
    setLoading(true);
    setSelectedProject(slug);
    const res = await getProjectEmails(slug);
    setLoading(false);
    
    if (res.success) {
      setEmails(res.emails || []);
      setStep(2);
    } else {
      toast.error(res.error || "Error al cargar correos");
    }
  };

  const handleSend = async () => {
    if (!subject || !message) {
      toast.error("Por favor completa el asunto y el mensaje");
      return;
    }

    setSending(true);
    const res = await sendBulkEmail({
      projectSlug: selectedProject!,
      subject,
      message
    });
    setSending(false);

    if (res.success) {
      toast.success("Mensaje masivo enviado correctamente");
      setStep(3);
    } else {
      toast.error(res.error || "Error al enviar");
    }
  };

  return (
    <div className="space-y-10 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-glow mb-2">
            Email <span className="text-accent">Marketing</span>
          </h1>
          <p className="text-white/40 text-sm font-medium tracking-wide">Comunica novedades y avisos importantes de forma masiva.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 p-1 rounded-2xl">
           <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${step >= 1 ? 'bg-accent text-[#061010]' : 'bg-white/5 text-white/20'}`}>1</div>
           <div className="w-4 h-px bg-white/10" />
           <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${step >= 2 ? 'bg-accent text-[#061010]' : 'bg-white/5 text-white/20'}`}>2</div>
           <div className="w-4 h-px bg-white/10" />
           <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${step >= 3 ? 'bg-accent text-[#061010]' : 'bg-white/5 text-white/20'}`}>3</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Step 1: Project Selection */}
        <div className={`lg:col-span-1 space-y-6 transition-all duration-500 ${step > 1 ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-3 mb-2">
            <Layout className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-black uppercase tracking-widest italic">1. Seleccionar Proyecto</h2>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {projects.map((p) => (
              <button
                key={p.slug}
                onClick={() => handleSelectProject(p.slug)}
                className={`
                  relative overflow-hidden group p-8 rounded-3xl border transition-all duration-500 text-left
                  ${selectedProject === p.slug 
                    ? 'border-accent bg-accent/10 shadow-[0_20px_50px_rgba(212,168,75,0.15)]' 
                    : 'border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'}
                `}
              >
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${p.color} opacity-10 blur-3xl group-hover:opacity-20 transition-opacity`} />
                
                <h3 className="text-xl font-black uppercase tracking-tight mb-2 flex items-center justify-between">
                  {p.name}
                  <ChevronRight className={`w-5 h-5 text-accent transition-transform duration-500 ${selectedProject === p.slug ? 'translate-x-1' : ''}`} />
                </h3>
                <p className="text-xs text-white/40 font-bold tracking-widest uppercase">Gestionar Campaña</p>
                
                {loading && selectedProject === p.slug && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-accent animate-spin" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Composition */}
        <div className={`lg:col-span-2 space-y-6 transition-all duration-700 ${step === 1 ? 'opacity-20 pointer-events-none' : ''}`}>
          {step === 2 && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-accent" />
                  <h2 className="text-lg font-black uppercase tracking-widest italic">2. Redactar Mensaje</h2>
                </div>
                <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{emails.length} Destinatarios</span>
                </div>
              </div>

              <div className="glass-panel border border-white/5 rounded-[2.5rem] p-8 md:p-12 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
                
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">Asunto del Correo</label>
                  <input 
                    type="text" 
                    placeholder="Eje: Recordatorio de Pago - Proyecto Arena y Sol"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold placeholder:text-white/10 focus:border-accent/40 focus:bg-white/10 transition-all outline-none"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-2">Contenido del Mensaje</label>
                  <textarea 
                    placeholder="Escribe tu mensaje aquí..."
                    rows={8}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-6 text-sm font-medium placeholder:text-white/10 focus:border-accent/40 focus:bg-white/10 transition-all outline-none resize-none leading-relaxed"
                  />
                  <p className="text-[9px] text-white/20 font-black uppercase tracking-widest ml-2 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-accent" />
                    Consejo: Usa un tono profesional y directo.
                  </p>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-6 pt-4">
                  <button 
                    onClick={handleSend}
                    disabled={sending || !subject || !message}
                    className="w-full md:w-auto px-10 py-5 rounded-2xl btn-metallic-gold shadow-[0_20px_40px_rgba(212,168,75,0.2)] flex items-center justify-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <span className="text-xs font-black uppercase tracking-[0.2em]">Enviar a {emails.length} clientes</span>
                        <Send className="w-4 h-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                      </>
                    )}
                  </button>
                  
                  <button 
                    onClick={() => setStep(1)}
                    className="text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors"
                  >
                    Volver y cambiar proyecto
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="glass-panel border border-white/5 rounded-[3rem] p-16 text-center space-y-8 animate-fade-in relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent pointer-events-none" />
               
               <div className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                 <CheckCircle2 className="w-12 h-12 text-emerald-400" />
               </div>
               
               <div>
                 <h2 className="text-3xl font-black uppercase tracking-tight mb-3">¡Campaña Enviada!</h2>
                 <p className="text-white/40 font-medium">El mensaje ha sido procesado y enviado a los {emails.length} clientes de <span className="text-white">{projects.find(p => p.slug === selectedProject)?.name}</span>.</p>
               </div>

               <button 
                 onClick={() => {
                   setStep(1);
                   setSelectedProject(null);
                   setSubject("");
                   setMessage("");
                 }}
                 className="px-10 py-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black uppercase tracking-[0.2em] transition-all"
               >
                 Crear Nueva Campaña
               </button>
            </div>
          )}
        </div>
      </div>

      {/* Info Panel */}
      {step < 3 && (
        <div className="bg-amber-500/5 border border-amber-500/10 rounded-3xl p-6 flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1">Información Importante</h4>
            <p className="text-xs text-amber-200/60 leading-relaxed font-medium">
              Esta herramienta envía correos electrónicos directamente a los clientes registrados en cada proyecto. Asegúrate de que el contenido cumple con las normativas de privacidad y que la información es correcta antes de presionar enviar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
