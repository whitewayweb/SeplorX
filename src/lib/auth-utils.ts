import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Get the authenticated user's numeric ID from the session.
 * Redirects to /login if the session is invalid or expired.
 *
 * Use in Server Components and Server Actions that need the current user.
 */
export async function getAuthenticatedUserId(): Promise<number> {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        redirect("/login");
    }

    return Number(session.user.id);
}
