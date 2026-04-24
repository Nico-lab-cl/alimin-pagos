"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Bell, Users, User, CreditCard } from "lucide-react";

export function MobileNav() {
  const pathname = usePathname();

  const navItems = [
    { label: "Inicio", icon: Home, href: "/admin" },
    { label: "Alertas", icon: Bell, href: "/admin/alerts" },
    { label: "Clientes", icon: Users, href: "/admin/clients" },
    { label: "Perfil", icon: User, href: "/admin/profile" },
  ];

  // If we are in a non-admin page, maybe we want different items?
  // For now, let's assume it's for the admin since the user is likely the admin.
  // If the user is a normal client, we'd need different links.

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden glass-panel border-t border-white/10 px-6 py-3 flex items-center justify-between pb-[calc(env(safe-area-inset-bottom)+12px)]">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 transition-all ${
              isActive ? "text-accent" : "text-white/40"
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
