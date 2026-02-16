import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { LoginSchema } from "@/lib/validations/auth";
import { authConfig } from "./auth.config";

// Dummy hash for constant-time comparison when user is not found.
// Prevents timing attacks that could enumerate valid emails.
const DUMMY_HASH = "$2b$10$K4GByxKq9vYbKOYvStGmke3VLGnFOHyVfOCj5e3zoJbKLwiEfISti";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const validatedFields = LoginSchema.safeParse(credentials);

        if (!validatedFields.success) return null;

        const { email, password } = validatedFields.data;

        let results: (typeof users.$inferSelect)[];

        try {
          results = await db
            .select()
            .from(users)
            .where(eq(users.email, email));
        } catch {
          console.error("Database error during authentication");
          return null;
        }

        const user = results[0];

        // Always run bcrypt.compare to prevent timing-based user enumeration
        const hashToCompare = user?.password ?? DUMMY_HASH;
        const isPasswordValid = await bcrypt.compare(password, hashToCompare);

        if (!user || !user.password || !isPasswordValid) return null;

        return {
          id: user.id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});
