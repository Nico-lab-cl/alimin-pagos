"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  ChevronLeft,
  Zap,
  Globe,
  Bell,
  Search,
  Mail,
  BookOpen,
  TrendingUp,
  Settings,
  BarChart3
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { SearchProvider, useSearch } from "@/context/SearchContext";
import { getFullPostventaData } from "@/actions/postventa";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const menuItems = [
  { 
    href: "/admin", 
    label: "Inicio", 
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
  { href: "/admin/email-marketing", label: "Informes", icon: BarChart3 },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
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
  const router = useRouter();
  const { 
    search, 
    setSearch, 
    selectedClientId, 
    setSelectedClientId,
    selectedClientProject,
    setSelectedClientProject
  } = useSearch();

  const [allClients, setAllClients] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load collapse state from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem("admin_sidebar_collapsed");
    if (saved === "true") {
      setIsCollapsed(true);
    }
  }, []);

  const toggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem("admin_sidebar_collapsed", String(nextState));
  };

  // Load all clients for search autocomplete on mount
  useEffect(() => {
    async function loadAllClients() {
      try {
        const [arenaRes, libertadRes] = await Promise.all([
          getFullPostventaData({ projectSlug: "arena-y-sol" }),
          getFullPostventaData({ projectSlug: "libertad-y-alegria" })
        ]);
        
        const arenaClients = (arenaRes.data || []).map((c: any) => ({
          ...c,
          projectName: "Arena y Sol",
          projectSlug: "arena-y-sol"
        }));
        
        const libertadClients = (libertadRes.data || []).map((c: any) => ({
          ...c,
          projectName: "Libertad y Alegría",
          projectSlug: "libertad-y-alegria"
        }));
        
        setAllClients([...arenaClients, ...libertadClients]);
      } catch (err) {
        console.error("Error loading search clients:", err);
      }
    }
    
    if (session) {
      loadAllClients();
    }
  }, [session]);

  // Filter clients based on search query
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    const term = search.toLowerCase();
    const filtered = allClients.filter(c => 
      c.clientName?.toLowerCase().includes(term) ||
      c.rut?.toLowerCase().includes(term) ||
      c.clientEmail?.toLowerCase().includes(term)
    ).slice(0, 8);
    setSearchResults(filtered);
  }, [search, allClients]);

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
      <div className={cn(
        "hidden lg:block flex-shrink-0 transition-all duration-300",
        isCollapsed ? "w-20" : "w-64"
      )} />

      {/* Sidebar - Desktop & Mobile */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200/80 transition-all duration-300",
        isOpen 
          ? "translate-x-0 w-64" 
          : isCollapsed 
            ? "-translate-x-full lg:translate-x-0 lg:w-20" 
            : "-translate-x-full lg:translate-x-0 lg:w-64"
      )}>
        <div className={cn("h-full flex flex-col p-6 transition-all duration-300", isCollapsed && "lg:px-4")}>
          {/* Logo Section */}
          <div className={cn("flex items-center justify-between mb-10 px-2", isCollapsed && "lg:px-0 lg:justify-center lg:flex-col lg:gap-3")}>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Alimin Logo" className="w-8 h-8 object-contain" />
              {!isCollapsed && <h1 className="text-xl font-bold tracking-tight text-blue-650 animate-fade-in">Alimin</h1>}
            </div>
            
            <button
              onClick={toggleCollapse}
              className={cn(
                "hidden lg:flex p-1.5 rounded-lg hover:bg-slate-100 border border-slate-200/50 text-slate-400 hover:text-slate-600 transition-all cursor-pointer shadow-sm",
                isCollapsed && "lg:mt-2"
              )}
              title={isCollapsed ? "Expandir menú" : "Colapsar menú"}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.href || (item.subItems?.some(s => pathname === s.href));
              return (
                <div key={item.href} className="space-y-1">
                  <Link
                    href={item.href}
                    onClick={(e) => {
                      if (item.href === "/admin/configuracion") {
                        e.preventDefault();
                        toast.info("Módulo de Configuración disponible próximamente");
                      }
                    }}
                    className={cn(
                      "group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200",
                      isActive 
                        ? "bg-blue-600 text-white font-semibold shadow-sm" 
                        : "text-slate-650 hover:text-slate-900 hover:bg-slate-50",
                      isCollapsed && "lg:px-0 lg:justify-center"
                    )}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={cn(
                        "w-5 h-5 flex-shrink-0 transition-colors",
                        isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600"
                      )} />
                      {!isCollapsed && <span className="text-sm font-medium tracking-tight animate-fade-in">{item.label}</span>}
                    </div>
                    {item.subItems && !isCollapsed && (
                      <ChevronRight className={cn(
                        "w-4 h-4 opacity-50 transition-transform duration-200",
                        isActive ? "text-white rotate-90" : "rotate-0"
                      )} />
                    )}
                  </Link>
                  
                  {item.subItems && isActive && !isCollapsed && (
                    <div className="pl-6 mt-1 space-y-1">
                      {item.subItems.map((sub) => {
                        const isSubActive = pathname === sub.href;
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={cn(
                              "flex items-center gap-2.5 px-4 py-2 rounded-lg text-xs font-medium transition-all",
                              isSubActive ? "text-blue-600 bg-blue-50/50 font-semibold" : "text-slate-550 hover:text-slate-800 hover:bg-slate-50"
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
              onClick={() => toast.info("Soporte Técnico y de Operaciones disponible próximamente")}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-655 hover:text-slate-900 hover:bg-slate-50 text-sm font-medium transition-all text-left cursor-pointer",
                isCollapsed && "lg:px-0 lg:justify-center"
              )}
              title={isCollapsed ? "Soporte" : undefined}
            >
              <Globe className="w-5 h-5 text-slate-400 flex-shrink-0" />
              {!isCollapsed && <span className="animate-fade-in">Soporte</span>}
            </button>
            
            <button
              onClick={handleSignOut}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-600 hover:bg-red-50/50 text-sm font-semibold transition-all text-left cursor-pointer",
                isCollapsed && "lg:px-0 lg:justify-center"
              )}
              title={isCollapsed ? "Cerrar Sesión" : undefined}
            >
              <LogOut className="w-5 h-5 text-red-500 flex-shrink-0" />
              {!isCollapsed && <span className="animate-fade-in">Cerrar Sesión</span>}
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
              placeholder="Buscar clientes..." 
              value={search}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-55 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-850 placeholder-slate-400 focus:border-blue-500 outline-none transition-all font-medium"
            />
            
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto divide-y divide-slate-100">
                {searchResults.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedClientId(client.id);
                      setSelectedClientProject(client.projectSlug);
                      setSearch("");
                      router.push("/admin/clients");
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex flex-col gap-0.5 cursor-pointer"
                  >
                    <span className="text-sm font-bold text-slate-800 uppercase">{client.clientName}</span>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                      <span>RUT: {client.rut}</span>
                      <span>•</span>
                      <span className="text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.2 rounded font-extrabold">{client.projectName} - Lote {client.lotNumber}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-6">
            <button className="relative p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-550 hover:text-slate-850 transition-all shadow-sm">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
            </button>
            
            <button className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-550 hover:text-slate-850 transition-all shadow-sm">
              <BookOpen className="w-4 h-4" />
            </button>
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
