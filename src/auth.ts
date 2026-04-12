import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  debug: process.env.NODE_ENV === "development" || true, // Force debug for now to see issues in Easypanel
  providers: [
    Credentials({
      async authorize(credentials) {
        try {
          console.log("[Auth] Starting authorization process...");
          const parsedCredentials = z
            .object({
              email: z.string().email(),
              password: z.string().min(6),
            })
            .safeParse(credentials);

          if (parsedCredentials.success) {
            const { email: rawEmail, password } = parsedCredentials.data;
            const email = rawEmail.toLowerCase();

            console.log(`[Auth] Checking database for user: ${email}`);

            let user;
            try {
              user = await prisma.user.findUnique({
                where: { email },
              });
            } catch (dbError: any) {
              console.error("[Auth] Database error during lookup:", dbError.message);
              throw new Error("DATABASE_CONNECTION_ERROR");
            }

            if (!user) {
              console.log(`[Auth] User record not found: ${email}`);
              return null;
            }

            console.log(`[Auth] User found. Verifying password for: ${email}`);
            const passwordsMatch = await bcrypt.compare(
              password,
              user.password
            );

            if (passwordsMatch) {
              console.log(`[Auth] Password verified. Login successful: ${email}`);
              return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                mustChangePassword: user.must_change_password,
                allowedProjects: user.allowed_projects,
              };
            }

            console.log(`[Auth] Password mismatch for: ${email}`);
          } else {
            console.log("[Auth] Invalid login form data structure");
          }

          return null;
        } catch (error: any) {
          console.error("[Auth] Fatal error in authorize callback:", error.message || error);
          // Return null instead of throwing to avoid generic 500 where possible, 
          // but logging the error is key for the user to see in Easypanel
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.id = user.id;
        token.mustChangePassword = (user as any).mustChangePassword;
        token.allowedProjects = (user as any).allowedProjects;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).role = token.role as string;
        (session.user as any).id = token.id as string;
        (session.user as any).mustChangePassword =
          token.mustChangePassword as boolean;
        (session.user as any).allowedProjects = token.allowedProjects;
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
  trustHost: true,
});
