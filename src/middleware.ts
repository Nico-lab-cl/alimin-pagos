import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const user = req.auth?.user as any;

  // Public routes
  const publicPaths = ["/login", "/api/auth"];
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
