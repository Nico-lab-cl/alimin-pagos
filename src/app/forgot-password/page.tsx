"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestPasswordReset } from "@/actions/user";
import { Loader2, Mail, ArrowLeft, Send } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await requestPasswordReset(email);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage("Si el correo existe en nuestro sistema, recibirás instrucciones para restablecer tu clave.");
        // In a real app, the token is sent by email. 
        // For this project, we might display it or just tell the user to check their email.
      }
    } catch (err) {
      setError("Error al procesar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden emerald-mesh">
      <div className="w-full max-w-[480px] animate-slide-up relative z-10">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">
            Recuperar <span className="text-accent">Acceso</span>
          </h1>
          <p className="text-white/40 text-xs font-medium uppercase tracking-widest">Ingresa tu email para continuar</p>
        </div>

        <div className="glass-card rounded-[3rem] p-10 md:p-12 border-white/10 relative overflow-hidden">
          {message ? (
            <div className="space-y-8 text-center py-4">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="w-10 h-10 text-emerald-400" />
              </div>
              <p className="text-white/80 text-sm font-medium leading-relaxed">
                {message}
              </p>
              <Link 
                href="/login"
                className="inline-flex items-center gap-2 text-accent text-[10px] font-black uppercase tracking-[0.2em] hover:brightness-125 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al Inicio
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-2">
                <label className="label-premium">Email Registrado</label>
                <div className="relative group">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="w-full input-premium pl-4 pr-4 py-5 text-sm font-medium"
                  />
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-[10px] font-bold text-error text-center uppercase">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-6 rounded-2xl btn-metallic-gold text-xs flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Solicitar Recuperación
                    <Send className="w-5 h-5" />
                  </>
                )}
              </button>

              <div className="text-center">
                <Link 
                  href="/login"
                  className="text-white/20 hover:text-accent text-[9px] font-black uppercase tracking-widest transition-colors"
                >
                  Volver al Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
