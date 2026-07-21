"use client";

import Image from "next/image";
import Link from "next/link";
import { Wrench, ShieldCheck, RefreshCw, Lock, Sparkles, Clock, CheckCircle2 } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen emerald-mesh relative flex flex-col items-center justify-between p-4 sm:p-6 md:p-10 text-white overflow-hidden select-none">
      {/* Background Decorative Ambient Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] sm:w-[600px] h-[350px] sm:h-[600px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] bg-[#d4a84b]/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header Branding */}
      <header className="w-full max-w-5xl flex items-center justify-between z-10 py-2">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/5 border border-white/10 p-2 shadow-2xl backdrop-blur-md flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="Alimin SPA Logo"
              width={48}
              height={48}
              className="object-contain"
              priority
            />
          </div>
          <div>
            <span className="text-xl sm:text-2xl font-black tracking-tight text-white font-outfit uppercase">
              ALIMIN <span className="text-[#d4a84b]">SPA</span>
            </span>
            <p className="subtitle-responsive text-emerald-400/80 text-[9px] sm:text-[10px]">
              Portal Inmobiliario & Pagos
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Servicios en Pausa Programada
        </div>
      </header>

      {/* Main Content Card */}
      <main className="w-full max-w-xl my-auto z-10 py-6">
        <div className="glass-card rounded-3xl p-6 sm:p-10 border border-white/10 shadow-2xl relative overflow-hidden backdrop-blur-2xl">
          {/* Top Metallic Gold Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#b68b2f] via-[#e6c57a] to-[#d4a84b]" />

          {/* Floating Icon Orb */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-[#0a2a2a] to-[#061010] border border-[#d4a84b]/40 flex items-center justify-center shadow-2xl group">
                <Wrench className="w-10 h-10 sm:w-12 sm:h-12 text-[#d4a84b] animate-bounce" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400/40 backdrop-blur-md flex items-center justify-center text-emerald-400 shadow-lg">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Title & Badge */}
          <div className="text-center space-y-3 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#d4a84b]/10 border border-[#d4a84b]/30 text-[#e6c57a] text-xs font-bold tracking-wider uppercase">
              <Clock className="w-3.5 h-3.5" />
              Mantenimiento Programado
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white font-outfit uppercase text-glow">
              Estamos Mejorando Tu Plataforma
            </h1>

            <p className="text-sm sm:text-base text-gray-300 font-inter leading-relaxed max-w-md mx-auto">
              En <strong className="text-[#e6c57a] font-semibold">Alimin SPA</strong> estamos llevando a cabo optimizaciones en nuestros servidores para ofrecerte una experiencia de pago y gestión más rápida, fluida y segura.
            </p>
          </div>

          {/* Real-time Status Card Checklist */}
          <div className="bg-black/30 rounded-2xl p-4 border border-white/5 space-y-3 mb-8">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              <span>Estado de la Actualización</span>
              <span className="text-emerald-400">En Progreso</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Optimización de Base de Datos y Seguridad</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-300">
              <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-[#d4a84b] animate-spin shrink-0" />
              <span className="text-[#e6c57a]">Despliegue de Mejoras de Rendimiento</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-400">
              <div className="w-4 h-4 rounded-full border border-gray-600 shrink-0" />
              <span>Verificación de Conexiones de Pago</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full sm:w-1/2 btn-metallic-gold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs cursor-pointer shadow-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar Conexión
            </button>

            <Link
              href="/login"
              className="w-full sm:w-1/2 bg-white/5 hover:bg-white/10 border border-white/10 transition-all py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-gray-300 hover:text-white"
            >
              <Lock className="w-4 h-4 text-[#d4a84b]" />
              Acceso Administrador
            </Link>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-5xl z-10 text-center py-4 text-xs text-gray-400 space-y-1">
        <div className="flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Tus datos y comprobantes se encuentran totalmente protegidos.</span>
        </div>
        <p className="text-[11px] text-gray-400">
          © {new Date().getFullYear()} <span className="text-[#d4a84b]">Alimin SPA</span> — Solidez e Innovación Inmobiliaria
        </p>
      </footer>
    </div>
  );
}
