import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "Portal de Pagos — Alimin SPA",
  description: "Portal de pagos para proyectos inmobiliarios Alimin SPA. Gestiona tus cuotas, comprobantes y documentos.",
  icons: {
    icon: "/favicon.png",
  },
};

import { MobileNav } from "@/components/MobileNav";
import { FCMInitializer } from "@/components/FCMInitializer";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${outfit.variable} font-outfit antialiased`}>
        <AuthProvider>
          <FCMInitializer />
          <div className="mobile-nav-safe">
            {children}
          </div>
          <MobileNav />
        </AuthProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              fontFamily: "var(--font-inter)",
            },
          }}
        />
      </body>
    </html>
  );
}
