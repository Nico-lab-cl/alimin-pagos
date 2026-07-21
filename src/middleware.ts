import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const user = req.auth?.user as any;

  // Maintenance mode handling
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true";
  const isAdmin = user?.role === "ADMIN";

  if (isMaintenanceMode) {
    // Admins can bypass maintenance mode
    if (!isAdmin && pathname !== "/mantenimiento") {
      // Allow login and auth api endpoints so admins can authenticate
      if (pathname === "/login" || pathname.startsWith("/api/auth")) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL("/mantenimiento", req.nextUrl));
    }
  } else {
    // If maintenance mode is disabled but user hits /mantenimiento directly
    if (pathname === "/mantenimiento") {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
  }

  // Public routes
  const publicPaths = ["/login", "/api/auth", "/mantenimiento"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (isPublic) return NextResponse.next();

  // Not logged in → redirect to login
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Must change password → redirect to change-password
  if (user?.mustChangePassword && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.nextUrl));
  }

  // Legal routes protection
  if (pathname.startsWith("/legal")) {
    if (user?.role !== "LEGAL" && user?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
  }

  // If role is LEGAL, restrict access to /legal only (plus public/api paths)
  if (user?.role === "LEGAL") {
    if (!pathname.startsWith("/legal") && !pathname.startsWith("/api") && !isPublic) {
      return NextResponse.redirect(new URL("/legal", req.nextUrl));
    }
  }

  // Admin routes protection
  if (pathname.startsWith("/admin")) {
    if (user?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/user", req.nextUrl));
    }
  }

  // User routes protection — admins can also access
  if (pathname.startsWith("/user")) {
    // Both USER and ADMIN can access user routes
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo|.*\\.png|.*\\.svg|.*\\.ico).*)"],
};
