"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Building2 } from "lucide-react";
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
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #1a3a3a 0%, #2d5a5a 50%, #1a3a3a 100%)",
      }}
    >
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
            }}
          >
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Cambiar Contraseña</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>
            Debes actualizar tu contraseña para continuar
          </p>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{
            background: "rgba(255,255,255,0.97)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="current" className="block text-sm font-semibold mb-2" style={{ color: "var(--primary)" }}>
                Contraseña actual
              </label>
              <input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl text-sm border-2"
                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
              />
            </div>

            <div>
              <label htmlFor="new" className="block text-sm font-semibold mb-2" style={{ color: "var(--primary)" }}>
                Nueva contraseña
              </label>
              <input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl text-sm border-2"
                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-semibold mb-2" style={{ color: "var(--primary)" }}>
                Confirmar nueva contraseña
              </label>
              <input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl text-sm border-2"
                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all duration-200 disabled:opacity-60 cursor-pointer"
              style={{
                background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Actualizando...
                </span>
              ) : (
                "Actualizar Contraseña"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
