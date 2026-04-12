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
    <div className="min-h-screen bg-[#061010] text-white flex flex-col font-['Outfit']">
      {/* Premium Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-accent/5 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/5 rounded-full blur-[150px]" />
      </div>

      {/* Header / Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b ${scrolled ? 'bg-[#061010]/90 backdrop-blur-xl py-4 border-white/5 shadow-2xl' : 'bg-transparent py-8 border-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          {/* Logo Area */}
          <Link href="/user" className="group flex items-center gap-4 transition-transform hover:scale-105 active:scale-95">
            <div className="relative">
              <div className="absolute inset-0 bg-accent/40 rounded-xl blur-lg group-hover:blur-xl transition-all" />
              <div className="relative w-11 h-11 rounded-xl bg-accent flex items-center justify-center shadow-[0_0_20px_rgba(212,168,75,0.4)]">
                <Zap className="w-6 h-6 text-[#061010] fill-current" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase leading-none text-white italic">Alimin</h1>
              <p className="text-[9px] font-black text-accent tracking-[0.2em] uppercase mt-1 opacity-70">Portal Clientes</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-10">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative text-[11px] font-black uppercase tracking-[0.2em] transition-all hover:text-white ${isActive ? 'text-white' : 'text-white/40'}`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-accent rounded-full animate-fade-in" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* User Header Section */}
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Bienvenido</span>
              <span className="text-xs font-black text-white italic truncate max-w-[150px] uppercase tracking-tighter">{session?.user?.name || "Propietario"}</span>
            </div>
            <button className="relative p-3 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all hidden sm:flex">
              <Bell className="w-4 h-4" />
              <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-accent rounded-full" />
            </button>
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-3 rounded-xl bg-white/5 text-accent border border-white/10"
            >
              <Menu className="w-6 h-6" />
            </button>
            <button 
              onClick={handleSignOut}
              className="hidden md:flex p-3 rounded-xl bg-red-400/5 border border-red-400/10 text-red-400/60 hover:text-white hover:bg-red-400 transition-all font-black text-[10px] uppercase tracking-widest"
            >
              <LogOut className="w-4 h-4" />
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
