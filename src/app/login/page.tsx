"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff, Building2, ShieldCheck, ArrowRight, Zap } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden emerald-mesh">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-emerald-500/5 blur-[120px] animate-pulse" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] rounded-full bg-accent/5 blur-[100px] animate-float" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      </div>

      <div className="w-full max-w-[480px] animate-slide-up relative z-10">
        {/* Logo & Branding */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-[2rem] glass-card mb-8 border-accent/20 group hover:border-accent/50 transition-all duration-700">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-accent-dark/20 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform p-2">
              <img src="/logo.png" alt="Alimin Logo" className="w-full h-full object-contain" />
            </div>
          </div>
          <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter mb-2 leading-none">
            Portal de <span className="text-accent underline decoration-accent/20 underline-offset-8">Pagos</span>
          </h1>
          <div className="flex items-center justify-center gap-2 opacity-40">
            <Zap className="w-3 h-3 text-accent" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em]">Inmobiliaria Alimin SPA</p>
          </div>
        </div>

        {/* Robust Login Card */}
        <div className="glass-card rounded-[3rem] p-10 md:p-12 border-white/10 relative overflow-hidden">
          {/* Subtle Internal Glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl" />
          
          <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
            <div className="space-y-6">
              {/* Email Field */}
              <div className="space-y-2">
                <label htmlFor="email" className="label-premium">
                  Email Corporativo / Cliente
                </label>
                <div className="relative group">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@aliminspa.cl"
                    required
                    className="w-full input-premium pl-4 pr-4 py-5 text-sm font-medium tracking-tight"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="password" className="label-premium">Clave de Acceso</label>
                  <button type="button" className="text-[9px] font-black uppercase text-accent/40 hover:text-accent tracking-widest transition-colors mb-2">¿Olvidaste tu clave?</button>
                </div>
                <div className="relative group">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={6}
                    className="w-full input-premium pl-4 pr-12 py-5 text-sm font-medium tracking-tight"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-accent transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-5 rounded-2xl bg-error/10 border border-error/20 text-[11px] font-bold text-error text-center animate-fade-in uppercase tracking-wider">
                {error}
              </div>
            )}

            {/* Submit Button - Brushed Gold */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-6 rounded-2xl btn-metallic-gold text-xs flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verificando Credenciales...
                </>
              ) : (
                <>
                  Acceder al Sistema
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Security Indicator */}
          <div className="mt-10 pt-8 border-t border-white/5 flex items-center justify-center gap-3 opacity-30">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Encriptación SSL de Grado Bancario</p>
          </div>
        </div>

        {/* Improved Footer */}
        <div className="mt-12 text-center space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
            © 2026 Alimin SPA <span className="mx-2 opacity-50">•</span> Gestión Inmobiliaria
          </p>
          <div className="flex justify-center gap-6 opacity-20 hover:opacity-100 transition-opacity">
            <a href="#" className="text-[9px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Términos</a>
            <a href="#" className="text-[9px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Privacidad</a>
            <a href="#" className="text-[9px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Soporte</a>
          </div>
        </div>
      </div>
    </div>
  );
}
