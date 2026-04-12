import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "@/lib/env";

export const auth = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
        env.BETTER_AUTH_URL,
        "http://localhost:3000"
    ],
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            user: schema.users,
            session: schema.sessions,
            account: schema.accounts,
            verification: schema.verifications
        }
    }),
    emailAndPassword: {
        enabled: true
    },
    advanced: {
        database: {
            generateId: false,
        }
    },
    plugins: [
        nextCookies()
    ]
});

/**
 * Get the authenticated user's session.
 * Redirects to /login if the session is invalid or expired.
 * 
 * Wrapped in React `cache` so multiple server components calling this
 * in the same request only hit the DB once.
 */
export const getAuthenticatedSession = cache(async () => {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        redirect("/login");
    }

    return session;
});

/**
 * Get the authenticated user's numeric ID from the session.
 * Redirects to /login if the session is invalid or expired.
 *
 * Use in Server Components and Server Actions that need the current user.
 */
export async function getAuthenticatedUserId(): Promise<number> {
    const session = await getAuthenticatedSession();
    return Number(session.user.id);
}
