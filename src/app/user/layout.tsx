"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, 
  FileText, 
  CreditCard, 
  LogOut, 
  Menu, 
  X,
  ChevronRight,
  Zap,
  LayoutDashboard,
  User as UserIcon,
  Bell
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";

const menuItems = [
  { href: "/user", label: "Dashboard", icon: Home },
  { href: "/user/documents", label: "Documentos", icon: FileText },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const handleSignOut = () => signOut({ callbackUrl: "/login" });

  return (
    <div className="min-h-screen bg-[#061010] text-white flex flex-col font-outfit">
      {/* Premium Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden emerald-mesh opacity-40">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/5 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[150px]" />
      </div>

      {/* Header / Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ${scrolled ? 'bg-[#061010]/95 backdrop-blur-xl py-5 border-b border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'bg-transparent py-10'}`}>
        <div className="max-w-7xl mx-auto px-8 md:px-12 flex items-center justify-between">
          {/* Logo Area */}
          <Link href="/user" className="group flex items-center gap-5 transition-all hover:scale-105 active:scale-95">
            <div className="relative">
              <div className="absolute inset-0 bg-accent/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
              <div className="relative w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center shadow-[0_10px_30px_rgba(212,168,75,0.2)] transition-transform duration-500 group-hover:rotate-3 p-2">
                <img src="/logo.png" alt="Alimin Logo" className="w-full h-full object-contain" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase leading-none text-white italic text-glow">Alimin</h1>
              <p className="text-[10px] font-black text-accent tracking-[0.4em] uppercase mt-1.5 opacity-60">Portal de Inversión</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-12">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative text-[11px] font-black uppercase tracking-[0.3em] transition-all hover:text-accent ${isActive ? 'text-accent' : 'text-white/30'}`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-accent rounded-full animate-fade-in shadow-[0_0_10px_rgba(212,168,75,0.5)]" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* User Header Section */}
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-1.5">Titular Activo</span>
              <span className="text-sm font-black text-white italic truncate max-w-[180px] uppercase tracking-tighter leading-none">{session?.user?.name || "Propietario"}</span>
            </div>
            <button className="relative p-4 rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all hidden sm:flex hover:border-accent/40 group">
              <Bell className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="absolute top-3.5 right-3.5 w-2 h-2 bg-accent rounded-full shadow-[0_0_10px_rgba(212,168,75,0.8)]" />
            </button>
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="lg:hidden p-4 rounded-2xl bg-white/5 text-accent border border-white/10 active:scale-90 transition-transform"
            >
              <Menu className="w-7 h-7" />
            </button>
            <button 
              onClick={handleSignOut}
              className="hidden lg:flex px-6 py-4 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-400/60 hover:text-white hover:bg-red-500 hover:border-red-500 transition-all font-black text-[10px] uppercase tracking-[0.2em]"
            >
              <LogOut className="w-4 h-4 mr-3" />
              Log Out
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 pt-32 pb-20 px-6 md:px-12 max-w-7xl mx-auto w-full relative z-10 animate-fade-in">
        {children}
      </main>

      {/* Mobile Sidebar Menu */}
      <div className={`fixed inset-0 z-[60] transition-all duration-500 md:hidden ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsOpen(false)} />
        <div className={`absolute right-0 top-0 bottom-0 w-80 glass-panel border-l border-white/10 p-10 transform transition-transform duration-500 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex justify-between items-center mb-16">
            <span className="text-xl font-black italic uppercase italic tracking-tighter">Explorar</span>
            <button onClick={() => setIsOpen(false)} className="p-2 text-white/40"><X className="w-6 h-6" /></button>
          </div>
          
          <nav className="space-y-6">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between text-2xl font-black italic tracking-tighter uppercase text-white/40 hover:text-white transition-all"
              >
                {item.label}
                <ChevronRight className="w-5 h-5 text-accent" />
              </Link>
            ))}
            <div className="h-px bg-white/5 my-10" />
            <button 
              onClick={handleSignOut}
              className="flex items-center gap-4 text-xl font-black text-red-500 uppercase italic tracking-tighter"
            >
              <LogOut className="w-6 h-6" />
              Cerrar Sesión
            </button>
          </nav>
        </div>
      </div>

      {/* Footer (Simplified) */}
      <footer className="py-12 px-6 md:px-12 border-t border-white/5 text-center opacity-30">
        <p className="text-[10px] font-black uppercase tracking-[0.4em]">Alimin SPA — Wealth & Assets Management</p>
      </footer>
    </div>
  );
}
