"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, 
  FileText, 
  LogOut, 
  Menu, 
  X,
  ChevronRight,
  Zap,
  Bell
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

  const userName = session?.user?.name || "Propietario";
  const initials = userName
    ? userName.split(" ").filter(Boolean).map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()
    : "US";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Top Navbar */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b bg-white",
        scrolled ? "py-3 border-slate-200 shadow-sm" : "py-4 border-slate-100"
      )}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          {/* Logo Area */}
          <Link href="/user" className="flex items-center gap-3 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1.5 shadow-sm">
              <img src="/logo.png" alt="Alimin Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-800 leading-none">Alimin</h1>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wider transition-colors hover:text-blue-600",
                    isActive ? "text-blue-600 border-b-2 border-blue-600 pb-1 -mb-1" : "text-slate-500"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* User & Session Status */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3">
              <span className="text-xs text-slate-500">
                ¡Hola, <span className="font-semibold text-slate-800">{userName}</span>! Bienvenido a tu hogar.
              </span>
              <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 shadow-sm select-none">
                {initials}
              </div>
            </div>

            <button 
              onClick={handleSignOut}
              className="hidden sm:inline-block text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
            >
              Cerrar Sesión
            </button>

            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 active:scale-95 transition-transform"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 pt-24 pb-16 px-6 md:px-12 max-w-7xl mx-auto w-full relative z-10">
        {children}
      </main>

      {/* Mobile Navigation Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          
          {/* Drawer Panel */}
          <div className="absolute right-0 top-0 bottom-0 w-64 bg-white border-l border-slate-200 p-6 flex flex-col justify-between shadow-2xl animate-slide-in">
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="font-bold text-slate-800">Menú</span>
                <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Greeting (Mobile) */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-150">
                <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-xs font-bold text-blue-750">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Hola</p>
                  <p className="text-xs font-bold text-slate-800 truncate">{userName}</p>
                </div>
              </div>
              
              {/* Navigation Links */}
              <nav className="flex flex-col gap-2">
                {menuItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                        isActive ? "bg-blue-50 text-blue-600 border border-blue-150" : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </span>
                      <ChevronRight className="w-4 h-4 opacity-50" />
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Logout button */}
            <button 
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 border border-red-150 text-red-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 border-t border-slate-200 bg-white text-center text-xs text-slate-500 font-medium">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap gap-4">
            <Link href="/legal?type=terms" className="hover:text-blue-600">Términos y Condiciones</Link>
            <Link href="/legal?type=privacy" className="hover:text-blue-600">Privacidad</Link>
            <Link href="/legal?type=support" className="hover:text-blue-600">Soporte</Link>
          </div>
          <p>Alimin Cobranzas v2.1.0 • © 2024 Todos los derechos reservados</p>
        </div>
      </footer>
    </div>
  );
}
