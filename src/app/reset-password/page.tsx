"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/actions/user";
import { Loader2, ShieldCheck, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import Link from "next/link";

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
      <div className="space-y-8 text-center py-4">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white uppercase tracking-tight">Contraseña Actualizada</h2>
        <p className="text-white/40 text-sm font-medium leading-relaxed">
          Tu clave ha sido cambiada con éxito. Serás redirigido al login en unos segundos...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="label-premium">Nueva Contraseña</label>
        <div className="relative group">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            minLength={6}
            className="w-full input-premium pl-4 pr-12 py-5 text-sm font-medium"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-accent"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="label-premium">Confirmar Contraseña</label>
        <input
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••••••"
          required
          className="w-full input-premium pl-4 pr-4 py-5 text-sm font-medium"
        />
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-[10px] font-bold text-error text-center uppercase">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !token}
        className="w-full py-6 rounded-2xl btn-metallic-gold text-xs flex items-center justify-center gap-3 active:scale-[0.98]"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            Actualizar Contraseña
            <ShieldCheck className="w-5 h-5" />
          </>
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden emerald-mesh">
      <div className="w-full max-w-[480px] animate-slide-up relative z-10">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">
            Nueva <span className="text-accent">Contraseña</span>
          </h1>
          <p className="text-white/40 text-xs font-medium uppercase tracking-widest">Establece tu nueva clave de acceso</p>
        </div>

        <div className="glass-card rounded-[3rem] p-10 md:p-12 border-white/10 relative overflow-hidden">
          <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin text-accent" /></div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
