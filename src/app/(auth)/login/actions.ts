"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

const loginSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(1, "Password is required"),
});

export async function loginAction(prevState: { error: string }, formData: FormData) {
    const result = loginSchema.safeParse(Object.fromEntries(formData));

    if (!result.success) {
        return {
            error: "Invalid input values.",
        };
    }

    const { email, password } = result.data;

    // Find user by email
    const existingUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let user = existingUsers[0];

    // DEVELOPMENT ONLY / FIRST RUN SEEDING:
    // If no users exist at all in the database, automatically register this as the admin user.
    if (!user) {
        const allUsers = await db.select({ id: users.id }).from(users).limit(1);
        if (allUsers.length === 0) {
            // Seed the first user as admin
            const hashedPassword = hashPassword(password);
            const inserted = await db.insert(users).values({
                email,
                password: hashedPassword,
                name: "Admin User",
                role: "admin",
            }).returning();

            user = inserted[0];
        } else {
            return {
                error: "Invalid email or password.",
            };
        }
    }

    // Validate the password
    if (!user.password || !verifyPassword(password, user.password)) {
        // Basic catch if password column data was un-hashed from older version
        if (user.password === password) {
            // We can quietly update it to the hash (migration step)
            await db.update(users).set({ password: hashPassword(password) }).where(eq(users.id, user.id));
        } else {
            return {
                error: "Invalid email or password.",
            };
        }
    }

    // Generate session cookie
    await createSession(user.id, user.role);

    redirect("/");
}
