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
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid credentials" };
        default:
          return { error: "Something went wrong" };
      }
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
