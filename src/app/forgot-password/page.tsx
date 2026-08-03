"use client";

import { useState } from "react";
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
      }
    } catch (err) {
      setError("Error al procesar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center font-body-md text-on-surface p-4 bg-slate-50">
      <main className="w-full max-w-md animate-slide-up">
        <div className="bg-white rounded-2xl p-6 md:p-10 flex flex-col items-center border border-border-subtle shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05),0_4px_6px_-2px_rgba(0,0,0,0.02)]">
          {/* Identity Section */}
          <div className="flex flex-col items-center mb-6">
            <img
              alt="Logo Alimin Cobranzas"
              className="w-20 h-20 mb-4 object-contain"
              src="/logo.png"
            />
            <h1 className="font-headline-sm text-headline-sm text-brand-600">Recuperar Acceso</h1>
            <p className="font-headline-md text-headline-md text-on-surface-variant mt-1 text-center">
              Ingresa tu email para continuar
            </p>
          </div>

          {message ? (
            <div className="w-full flex flex-col items-center text-center space-y-4 py-2">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <Mail className="w-8 h-8 text-emerald-700" />
              </div>
              <p className="font-body-sm text-body-sm text-text-muted leading-relaxed max-w-xs">
                {message}
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-brand-600 text-body-sm font-body-sm hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="w-full space-y-6">
              <div className="flex flex-col space-y-1">
                <label className="font-label-md text-label-md text-text-muted" htmlFor="email">
                  Correo Electrónico Registrado
                </label>
                <div className="relative border border-outline-variant rounded-lg transition-all focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/10 bg-transparent">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-outline-variant" />
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="block w-full pl-10 pr-3 py-3 font-body-md text-body-md rounded-lg border-none focus:ring-0 focus:outline-none bg-transparent placeholder:text-outline-variant text-on-surface"
                  />
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-lg bg-error-container border border-error/20 text-xs font-bold text-on-error-container text-center animate-fade-in uppercase tracking-wider">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 text-white font-headline-md text-headline-md py-4 rounded-lg shadow-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <span>Solicitar Recuperación</span>
                    <Send className="w-5 h-5" />
                  </>
                )}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="font-body-sm text-body-sm text-text-muted hover:text-brand-600 transition-colors"
                >
                  Volver al inicio de sesión
                </Link>
              </div>
            </form>
          )}

          {/* Card Footer */}
          <div className="mt-10 border-t border-border-subtle pt-4 w-full text-center">
            <p className="font-body-sm text-body-sm text-text-muted">Alimin Cobranzas</p>
          </div>
        </div>
      </main>
    </div>
  );
}
