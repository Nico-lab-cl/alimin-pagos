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
  Search,
  Mail,
  BookOpen,
  TrendingUp
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { SearchProvider, useSearch } from "@/context/SearchContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const menuItems = [
  { 
    href: "/admin", 
    label: "Panel de Control", 
    icon: LayoutDashboard
  },
  { href: "/admin/clients", label: "Clientes", icon: Users },
  { 
    href: "/admin/receipts", 
    label: "Bandeja de Pagos", 
    icon: CheckSquare,
    subItems: [
      { href: "/admin/receipts/reservas", label: "Reservas", icon: BookOpen }
    ]
  },
  { href: "/admin/lots", label: "Lotes", icon: Map },
  { href: "/admin/email-marketing", label: "Informes", icon: Mail },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SearchProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </SearchProvider>
  );
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();
  const { search, setSearch } = useSearch();

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
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex overflow-hidden font-outfit">
      {/* Sidebar Placeholder - Desktop Only */}
      <div className="hidden lg:block lg:w-64 flex-shrink-0" />

      {/* Sidebar - Desktop & Mobile */}
      <aside className={`
        fixed inset-y-0 left-0 z-50
        bg-white border-r border-slate-200/80
        transition-all duration-300
        ${isOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0 lg:w-64"}
      `}>
        <div className="h-full flex flex-col p-6">
          {/* Logo Section */}
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center p-1.5 flex-shrink-0 shadow-sm">
              <img src="/logo.png" alt="Alimin Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-base font-bold tracking-tight text-slate-800 leading-none">Alimin</h1>
              <p className="text-[9px] font-semibold text-slate-400 uppercase mt-0.5">Portal Admin</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.href || (item.subItems?.some(s => pathname === s.href));
              return (
                <div key={item.href} className="space-y-1">
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200",
                      isActive 
                        ? "bg-slate-100/80 text-blue-600 font-semibold" 
                        : "text-slate-650 hover:text-slate-900 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={cn(
                        "w-5 h-5 flex-shrink-0 transition-colors",
                        isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                      )} />
                      <span className="text-sm font-medium tracking-tight">{item.label}</span>
                    </div>
                    {item.subItems && (
                      <ChevronRight className={cn(
                        "w-4 h-4 opacity-50 transition-transform duration-200",
                        isActive && "rotate-90"
                      )} />
                    )}
                  </Link>
                  
                  {item.subItems && isActive && (
                    <div className="pl-6 mt-1 space-y-1">
                      {item.subItems.map((sub) => {
                        const isSubActive = pathname === sub.href;
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={cn(
                              "flex items-center gap-2.5 px-4 py-2 rounded-lg text-xs font-medium transition-all",
                              isSubActive ? "text-blue-600 bg-blue-50/50 font-semibold" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                            )}
                          >
                            <sub.icon className="w-4 h-4 flex-shrink-0" />
                            <span>{sub.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Bottom Section */}
          <div className="mt-auto pt-6 border-t border-slate-100 space-y-1">
            <button
              onClick={() => toast.info("Módulo de Configuración disponible próximamente")}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-sm font-medium transition-all text-left cursor-pointer"
            >
              <Zap className="w-5 h-5 text-slate-400" />
              <span>Configuración</span>
            </button>
            <button
              onClick={() => toast.info("Soporte Técnico y de Operaciones disponible próximamente")}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-sm font-medium transition-all text-left cursor-pointer"
            >
              <Globe className="w-5 h-5 text-slate-400" />
              <span>Soporte</span>
            </button>
            
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-500 hover:text-red-650 hover:bg-red-50 text-sm font-medium transition-all text-left cursor-pointer"
            >
              <LogOut className="w-5 h-5 text-slate-400" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className={cn(
          "lg:hidden flex items-center justify-between p-4 transition-all duration-350 z-50 border-b",
          scrolled ? "bg-white/95 backdrop-blur-xl border-slate-200/80 shadow-sm" : "bg-white border-slate-100"
        )}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-bold uppercase tracking-tight text-slate-800 text-base">Alimin</span>
          </div>
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="p-2.5 rounded-xl bg-slate-50 text-slate-600 border border-slate-250"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {/* Top Internal Header (Desktop Only) */}
        <header className="hidden lg:flex items-center justify-between px-12 py-5 bg-white border-b border-slate-200/80">
          <h2 className="text-base font-bold text-slate-850">Alimin Admin</h2>
          
          {/* Search Input in Center */}
          <div className="relative max-w-md w-full mx-8">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar lotes, clientes..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-850 placeholder-slate-400 focus:border-blue-500 outline-none transition-all font-medium"
            />
          </div>
          
          <div className="flex items-center gap-6">
            <button className="relative p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-550 hover:text-slate-800 transition-all shadow-sm">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
            </button>
            
            <button className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-550 hover:text-slate-800 transition-all shadow-sm">
              <BookOpen className="w-4 h-4" />
            </button>
            
            <div className="w-px h-6 bg-slate-200" />
            
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
                <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=256&auto=format&fit=facearea&facepad=2" alt="User Avatar" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-6 md:p-12 lg:px-12 lg:py-10 scroll-smooth">
          <div className="max-w-7xl mx-auto animate-fade-in pb-20">
            {children}
          </div>
        </main>
      </div>

      {/* Overlay for mobile sidebar */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-all duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
