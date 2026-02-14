import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: "admin" | "customer";
    } & DefaultSession["user"];
  }

  interface User {
    role: "admin" | "customer";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "admin" | "customer";
  }
}
