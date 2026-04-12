"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff, Building2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Correo o contraseña incorrectos");
      } else {
        // Fetch fresh session to get user role
        const session = await getSession();
        const role = (session?.user as any)?.role;
        
        if (role === "ADMIN") {
          router.push("/admin");
        } else {
          router.push("/user");
        }
        router.refresh();
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0f1f1f 0%, #1a3a3a 40%, #2d5a5a 70%, #1a3a3a 100%)",
      }}
    >
      {/* Animated decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(212,168,75,0.12) 0%, transparent 70%)",
            animation: "pulse-soft 6s ease-in-out infinite",
          }}
        />
        <div
          className="absolute top-1/2 -left-48 w-[400px] h-[400px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(45,90,90,0.3) 0%, transparent 70%)",
            animation: "pulse-soft 8s ease-in-out infinite 2s",
          }}
        />
        <div
          className="absolute -bottom-24 right-1/4 w-[300px] h-[300px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(212,168,75,0.06) 0%, transparent 70%)",
            animation: "pulse-soft 7s ease-in-out infinite 1s",
          }}
        />
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="w-full max-w-[420px] animate-fade-in relative z-10">
        {/* Logo & Header */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
              boxShadow: "0 12px 40px rgba(212, 168, 75, 0.35), 0 0 0 1px rgba(212,168,75,0.1)",
            }}
          >
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: "rgba(255,255,255,0.95)" }}
          >
            Portal de Pagos
          </h1>
          <p className="text-sm mt-2 font-medium" style={{ color: "var(--accent-light)" }}>
            Inmobiliaria Alimin SPA
          </p>
        </div>

        {/* Login Card */}
        <div
          className="rounded-3xl p-8"
          style={{
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                className="w-full px-4 py-3.5 rounded-xl text-sm transition-all duration-200"
                style={{
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--accent)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(212,168,75,0.15)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255,255,255,0.1)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold mb-2 uppercase tracking-wider"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-4 py-3.5 pr-12 rounded-xl text-sm transition-all duration-200"
                  style={{
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--accent)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(212,168,75,0.15)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(255,255,255,0.1)";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors cursor-pointer"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="p-3.5 rounded-xl text-sm font-medium text-center animate-fade-in"
                style={{
                  background: "rgba(220, 38, 38, 0.15)",
                  color: "#ff6b6b",
                  border: "1px solid rgba(220, 38, 38, 0.25)",
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl text-white font-bold text-sm tracking-wide transition-all duration-300 disabled:opacity-60 cursor-pointer"
              style={{
                background: loading
                  ? "rgba(212,168,75,0.4)"
                  : "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
                boxShadow: loading
                  ? "none"
                  : "0 8px 24px rgba(212,168,75,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  (e.target as HTMLElement).style.transform = "translateY(-2px)";
                  (e.target as HTMLElement).style.boxShadow = "0 12px 32px rgba(212,168,75,0.45), inset 0 1px 0 rgba(255,255,255,0.15)";
                }
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.transform = "translateY(0)";
                (e.target as HTMLElement).style.boxShadow = "0 8px 24px rgba(212,168,75,0.35), inset 0 1px 0 rgba(255,255,255,0.15)";
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Iniciando sesión...
                </span>
              ) : (
                "Iniciar Sesión"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p
          className="text-center text-xs mt-8 font-medium"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          © 2026 Inmobiliaria Alimin SPA — Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}
