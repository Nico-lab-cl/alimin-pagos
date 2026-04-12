"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Map, 
  AlertCircle, 
  Users, 
  CheckSquare, 
  LogOut, 
  Menu, 
  X,
  ChevronRight,
  Zap,
  Globe,
  Bell,
  Search
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";

const menuItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/lots", label: "Inventario", icon: Map },
  { href: "/admin/alerts", label: "Alertas", icon: AlertCircle },
  { href: "/admin/clients", label: "Clientes", icon: Users },
  { href: "/admin/receipts", label: "Comprobantes", icon: CheckSquare },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close sidebar on navigation
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const handleSignOut = () => signOut({ callbackUrl: "/login" });

  return (
    <div className="min-h-screen bg-[#061010] text-white flex overflow-hidden font-outfit">
      {/* Premium Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden emerald-mesh opacity-50">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/5 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[150px]" />
      </div>

      {/* Sidebar - Desktop */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-80 glass-panel border-r border-white/5
        transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]
        ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="h-full flex flex-col p-10">
          {/* Logo Section */}
          <div className="flex items-center gap-5 mb-16 group cursor-pointer">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center shadow-[0_10px_40px_rgba(212,168,75,0.2)] transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 p-2">
              <img src="/logo.png" alt="Alimin Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase leading-none italic text-glow">Alimin</h1>
              <p className="text-[10px] font-black text-accent tracking-[0.4em] uppercase mt-1.5 opacity-60">Consola Central</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-4">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    group flex items-center justify-between px-6 py-5 rounded-[1.5rem] transition-all duration-500
                    ${isActive 
                      ? "btn-metallic-gold shadow-[0_15px_35px_rgba(212,168,75,0.3)]" 
                      : "text-white/30 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/5"}
                  `}
                >
                  <div className="flex items-center gap-5">
                    <item.icon className={`w-5 h-5 transition-all duration-500 ${isActive ? 'scale-110' : 'group-hover:scale-110 group-hover:text-accent'}`} />
                    <span className="text-[11px] font-black lowercase tracking-[0.1em] uppercase">{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 opacity-50" />}
                </Link>
              );
            })}
          </nav>

          {/* User Section & Logout */}
          <div className="mt-auto pt-10 border-t border-white/5 space-y-6">
            <div className="flex items-center gap-5 px-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group overflow-hidden relative shadow-inner">
                <div className="absolute inset-0 bg-accent transition-transform duration-700 translate-y-full group-hover:translate-y-0 opacity-20" />
                <span className="text-sm font-black text-accent relative z-10">AD</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black truncate uppercase tracking-[0.15em] leading-none mb-1.5">{session?.user?.name || "Administrador"}</p>
                <div className="flex items-center gap-2 text-[9px] text-emerald-400 font-black uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-glow" />
                  <span>Terminal Activo</span>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-4 px-6 py-5 rounded-2xl text-white/20 hover:text-red-400 hover:bg-red-400/5 border border-transparent hover:border-red-400/10 transition-all duration-500"
            >
              <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className={`lg:hidden flex items-center justify-between p-6 transition-all duration-300 z-50 ${scrolled ? 'bg-[#061010]/95 backdrop-blur-xl border-b border-white/5' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#061010]" />
            </div>
            <span className="font-black uppercase tracking-tighter text-lg">Alimin</span>
          </div>
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="p-3 rounded-xl bg-white/5 text-accent border border-white/10"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </header>

        {/* Top Internal Header (Desktop Only) */}
        <header className="hidden lg:flex items-center justify-between px-12 py-8 bg-transparent">
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-accent transition-colors" />
              <input 
                type="text" 
                placeholder="BUSCAR..." 
                className="pl-12 pr-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black tracking-widest uppercase outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all w-64"
              />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button className="relative p-3 rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-accent rounded-full border-2 border-[#061010]" />
            </button>
            <div className="w-px h-6 bg-white/10" />
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/30">System Status:</span>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest border border-emerald-500/20">Operational</span>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-6 md:p-12 lg:px-12 lg:pt-0 scroll-smooth">
          <div className="max-w-7xl mx-auto animate-fade-in pb-20">
            {children}
          </div>
        </main>
      </div>

      {/* Overlay for mobile sidebar */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 lg:hidden transition-all duration-500"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
