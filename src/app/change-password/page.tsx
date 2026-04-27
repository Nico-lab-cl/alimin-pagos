"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Contraseña actualizada correctamente");
        router.push("/user");
        router.refresh();
      } else {
        toast.error(data.error || "Error al cambiar contraseña");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#061010] flex items-center justify-center p-6 font-outfit relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none emerald-mesh opacity-40" />
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full blur-[150px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/10 rounded-full blur-[150px]" />

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        {/* Header Area */}
        <div className="text-center mb-10">
          <div className="inline-flex relative mb-6">
            <div className="absolute inset-0 bg-accent/20 rounded-2xl blur-xl animate-pulse" />
            <div className="relative w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-[0_10px_30px_rgba(212,168,75,0.2)]">
              <ShieldCheck className="w-8 h-8 text-accent" />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-8 h-px bg-accent/30" />
              <p className="subtitle-responsive text-accent">Protocolo de Seguridad</p>
              <div className="w-8 h-px bg-accent/30" />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic leading-none text-glow">
              Actualizar <span className="text-white/20">Acceso</span>
            </h1>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/30 max-w-[280px] mx-auto leading-relaxed">
              Es necesario renovar tus credenciales para garantizar la integridad de tu cuenta.
            </p>
          </div>
        </div>

        {/* Form Area */}
        <div className="glass-card p-10 rounded-[2.5rem] space-y-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-accent/10 transition-colors duration-1000" />
          
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div className="space-y-2">
              <label htmlFor="current" className="label-premium">
                Contraseña Temporal
              </label>
              <div className="relative">
                <input
                  id="current"
                  type="password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="input-premium w-full pr-12 focus:ring-accent/20"
                />
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              </div>
            </div>

            <div className="h-px bg-white/5 w-full" />

            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="new" className="label-premium">
                  Nueva Contraseña
                </label>
                <input
                  id="new"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="input-premium w-full focus:ring-accent/20"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm" className="label-premium">
                  Confirmar Contraseña
                </label>
                <input
                  id="confirm"
                  type="password"
                  placeholder="Repite la contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="input-premium w-full focus:ring-accent/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-metallic-gold w-full py-5 rounded-2xl flex items-center justify-center gap-3 group/btn active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <span>Actualizar Ahora</span>
                  <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Footer Note */}
          <p className="text-[9px] font-bold text-center text-white/20 uppercase tracking-widest pt-4">
            Sistema de Encriptación de Grado Militar (AES-256)
          </p>
        </div>
      </div>
    </div>
  );
}
