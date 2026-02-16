"use server";

import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import { LoginSchema } from "@/lib/validations/auth";

export async function loginAction(_prevState: unknown, formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");

  const validatedFields = LoginSchema.safeParse({
    email,
    password,
  });

  if (!validatedFields.success) {
    return { error: "Invalid fields" };
  }

  try {
    await signIn("credentials", {
      email: validatedFields.data.email,
      password: validatedFields.data.password,
      redirectTo: "/",
    });
  } catch (error) {
    // NextAuth redirect must be re-thrown
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Invalid email or password" };
      }
      console.error("Auth error:", error.type);
      return { error: "Authentication failed. Please try again." };
    }
    console.error("Login error:", error instanceof Error ? error.message : error);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
