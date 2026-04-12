import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      async authorize(credentials) {
        try {
          const parsedCredentials = z
            .object({
              email: z.string().email(),
              password: z.string().min(6),
            })
            .safeParse(credentials);

          if (parsedCredentials.success) {
            const { email: rawEmail, password } = parsedCredentials.data;
            const email = rawEmail.toLowerCase();

            console.log(`[Auth] Attempting login for: ${email}`);

            const user = await prisma.user.findUnique({
              where: { email },
            });

            if (!user) {
              console.log(`[Auth] User not found: ${email}`);
              return null;
            }

            const passwordsMatch = await bcrypt.compare(
              password,
              user.password
            );
            if (passwordsMatch) {
              console.log(`[Auth] Login successful for: ${email}`);
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
            console.log("[Auth] Invalid credentials format");
          }

          return null;
        } catch (error) {
          console.error("[Auth] Error in authorize:", error);
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
