"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/actions/user";
import { Loader2, ShieldCheck, Eye, EyeOff, CheckCircle2, Lock } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token de recuperación no encontrado");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await resetPassword(token!, password);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      }
    } catch (err) {
      setError("Error al restablecer la contraseña");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="w-full flex flex-col items-center text-center space-y-4 py-2">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="font-headline-sm text-headline-sm text-cobalt-blue">Contraseña Actualizada</h2>
        <p className="font-body-sm text-body-sm text-text-muted leading-relaxed max-w-xs">
          Tu clave ha sido cambiada con éxito. Serás redirigido al inicio de sesión en unos segundos...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      {/* Nueva Contraseña */}
      <div className="flex flex-col space-y-1">
        <label className="font-label-md text-label-md text-text-muted" htmlFor="password">
          Nueva Contraseña
        </label>
        <div className="relative border border-outline-variant rounded-lg transition-all focus-within:border-cobalt-blue focus-within:ring-2 focus-within:ring-cobalt-blue/10 bg-transparent">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Lock className="w-5 h-5 text-outline-variant" />
          </span>
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="block w-full pl-10 pr-10 py-3 font-body-md text-body-md rounded-lg border-none focus:ring-0 focus:outline-none bg-transparent text-on-surface"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline-variant hover:text-on-surface transition-colors"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Confirmar Contraseña */}
      <div className="flex flex-col space-y-1">
        <label className="font-label-md text-label-md text-text-muted" htmlFor="confirmPassword">
          Confirmar Contraseña
        </label>
        <div className="relative border border-outline-variant rounded-lg transition-all focus-within:border-cobalt-blue focus-within:ring-2 focus-within:ring-cobalt-blue/10 bg-transparent">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Lock className="w-5 h-5 text-outline-variant" />
          </span>
          <input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="block w-full pl-10 pr-3 py-3 font-body-md text-body-md rounded-lg border-none focus:ring-0 focus:outline-none bg-transparent text-on-surface"
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
        disabled={loading || !token}
        className="w-full bg-cobalt-blue text-white font-headline-md text-headline-md py-4 rounded-lg shadow-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Actualizando...</span>
          </>
        ) : (
          <>
            <span>Actualizar Contraseña</span>
            <ShieldCheck className="w-5 h-5" />
          </>
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center font-body-md text-on-surface p-4 bg-[#F8FAFC]">
      <main className="w-full max-w-md animate-slide-up">
        <div className="bg-white rounded-2xl p-6 md:p-10 flex flex-col items-center border border-border-subtle shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05),0_4px_6px_-2px_rgba(0,0,0,0.02)]">
          {/* Identity Section */}
          <div className="flex flex-col items-center mb-6">
            <img
              alt="Logo Alimin Cobranzas"
              className="w-20 h-20 mb-4 object-contain"
              src="/logo.png"
            />
            <h1 className="font-headline-sm text-headline-sm text-cobalt-blue">Nueva Contraseña</h1>
            <p className="font-headline-md text-headline-md text-on-surface-variant mt-1 text-center">
              Establece tu nueva clave de acceso
            </p>
          </div>

          <Suspense fallback={<div className="flex justify-center p-8 w-full"><Loader2 className="animate-spin text-cobalt-blue" /></div>}>
            <ResetPasswordForm />
          </Suspense>

          {/* Card Footer */}
          <div className="mt-10 border-t border-border-subtle pt-4 w-full text-center">
            <p className="font-body-sm text-body-sm text-text-muted">Alimin Cobranzas</p>
          </div>
        </div>
      </main>
    </div>
  );
}
