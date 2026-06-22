"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, CheckSquare, Bell, FileText } from "lucide-react";

export function MobileNav() {
  const pathname = usePathname();

  const isAdmin = pathname.startsWith("/admin");
  const isUser = pathname.startsWith("/user");

  // Only render on admin or user pages
  if (!isAdmin && !isUser) {
    return null;
  }

  const adminItems = [
    { label: "Inicio", icon: Home, href: "/admin" },
    { label: "Clientes", icon: Users, href: "/admin/clients" },
    { label: "Bandeja", icon: CheckSquare, href: "/admin/receipts" },
    { label: "Alertas", icon: Bell, href: "/admin/alerts" },
  ];

  const userItems = [
    { label: "Inicio", icon: Home, href: "/user" },
    { label: "Documentos", icon: FileText, href: "/user/documents" },
  ];

  const items = isAdmin ? adminItems : userItems;

  if (isAdmin) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-3 flex items-center justify-between pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-lg">
        {items.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 transition-all ${
                isActive ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? "scale-110" : ""}`} />
              <span className="text-[9px] font-semibold uppercase tracking-wider">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    );
  }

  // User style: dark luxury, gold/metallic accent
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden glass-panel border-t border-white/10 px-6 py-3 flex items-center justify-around pb-[calc(env(safe-area-inset-bottom)+12px)]">
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/user" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 transition-all ${
              isActive ? "text-accent" : "text-white/40 hover:text-white/60"
            }`}
          >
            <item.icon className={`w-5 h-5 ${isActive ? "animate-pulse" : ""}`} />
            <span className="text-[9px] font-black uppercase tracking-widest">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

