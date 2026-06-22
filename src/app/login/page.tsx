"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, User, Lock, Eye, EyeOff } from "lucide-react";

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
        setError("Las credenciales proporcionadas no son válidas");
      } else {
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
      setError("Error de comunicación con el servidor central");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center font-body-md text-on-surface p-4 bg-[#F8FAFC]">
      <main className="w-full max-w-md animate-slide-up">
        {/* Central Card */}
        <div className="bg-white rounded-2xl p-6 md:p-10 flex flex-col items-center border border-border-subtle shadow-[0_10px_15px_-3px_rgba(0,0,0,0.05),0_4px_6px_-2px_rgba(0,0,0,0.02)]">
          {/* Identity Section */}
          <div className="flex flex-col items-center mb-6">
            <img 
              alt="Logo Alimin Cobranzas" 
              className="w-20 h-20 mb-4 object-contain" 
              src="/logo.png"
            />
            <h1 className="font-headline-sm text-headline-sm text-cobalt-blue">Alimin Cobranzas</h1>
            <p className="font-headline-md text-headline-md text-on-surface-variant mt-1 text-center">
              Ingreso al Portal Administrativo
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="w-full space-y-6">
            {/* RUT / Email Input */}
            <div className="flex flex-col space-y-1">
              <label className="font-label-md text-label-md text-text-muted" htmlFor="email">
                RUT o Correo Electrónico
              </label>
              <div className="relative border border-outline-variant rounded-lg transition-all focus-within:border-cobalt-blue focus-within:ring-2 focus-within:ring-cobalt-blue/10 bg-transparent">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="w-5 h-5 text-outline-variant" />
                </span>
                <input 
                  className="block w-full pl-10 pr-3 py-3 font-body-md text-body-md rounded-lg border-none focus:ring-0 focus:outline-none bg-transparent placeholder:text-outline-variant text-on-surface" 
                  id="email" 
                  placeholder="ej: 12.345.678-9" 
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="flex flex-col space-y-1">
              <div className="flex justify-between items-center">
                <label className="font-label-md text-label-md text-text-muted" htmlFor="password">
                  Contraseña
                </label>
                <a className="font-body-sm text-body-sm text-cobalt-blue hover:underline" href="/forgot-password">
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <div className="relative border border-outline-variant rounded-lg transition-all focus-within:border-cobalt-blue focus-within:ring-2 focus-within:ring-cobalt-blue/10 bg-transparent">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-outline-variant" />
                </span>
                <input 
                  className="block w-full pl-10 pr-10 py-3 font-body-md text-body-md rounded-lg border-none focus:ring-0 focus:outline-none bg-transparent text-on-surface" 
                  id="password" 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button 
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline-variant hover:text-on-surface transition-colors" 
                  onClick={() => setShowPassword(!showPassword)} 
                  type="button"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 rounded-lg bg-error-container border border-error/20 text-xs font-bold text-on-error-container text-center animate-fade-in uppercase tracking-wider">
                {error}
              </div>
            )}

            {/* Primary Action */}
            <button 
              className="w-full bg-cobalt-blue text-white font-headline-md text-headline-md py-4 rounded-lg shadow-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer" 
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Verificando Credenciales...</span>
                </>
              ) : (
                <span>Iniciar Sesión</span>
              )}
            </button>
          </form>

          {/* Card Footer */}
          <div className="mt-10 border-t border-border-subtle pt-4 w-full text-center">
            <p className="font-body-sm text-body-sm text-text-muted">Alimin Cobranzas</p>
          </div>
        </div>

        {/* External Footer Links */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <nav className="flex gap-6 font-body-sm text-body-sm text-text-muted">
            <a className="hover:text-cobalt-blue transition-colors" href="#">Términos y Condiciones</a>
            <a className="hover:text-cobalt-blue transition-colors" href="#">Privacidad</a>
            <a className="hover:text-cobalt-blue transition-colors" href="#">Soporte</a>
          </nav>
        </div>
      </main>
    </div>
  );
}
