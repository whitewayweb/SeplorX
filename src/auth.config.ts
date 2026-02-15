import type { NextAuthConfig } from "next-auth";
import { env } from "@/lib/env";


export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage = nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/register");

      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      if (!isLoggedIn && !nextUrl.pathname.startsWith("/api")) {
        return false; // Redirect to login
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.role) {
        session.user.role = token.role as "admin" | "customer";
      }
      return session;
    },
  },
  providers: [], // Add providers in auth.ts
  secret: env.AUTH_SECRET || process.env.AUTH_SECRET,
} satisfies NextAuthConfig;
