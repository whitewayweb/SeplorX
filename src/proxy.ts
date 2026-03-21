import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_ROUTES = ["/login"];

/**
 * Middleware function that handles route protection conceptually.
 * It uses a fast, optimistic cookie check to avoid DB roundtrips on every request.
 * Real, secure session validation happens in the Server Components/Actions via getAuthenticatedUserId().
 */
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    // Optimized: Use Better Auth's cookie check
    // This eliminates the internal HTTP fetch overhead (~2s delay) and prevents recursion loops
    // in the Next.js 16 Node.js runtime proxy.
    const sessionCookie = getSessionCookie(request);

    if (!isPublicRoute) {
        // Protected route — optimistically redirect if no session cookie exists
        if (!sessionCookie) {
            return NextResponse.redirect(new URL("/login", request.url));
        }
    } else {
        // Public route (e.g., /login) — if session cookie exists, optimistic redirect to dashboard
        if (sessionCookie) {
            return NextResponse.redirect(new URL("/", request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Match all routes except api, _next, and static assets
        "/((?!api|_next/static|_next/image|favicon.ico|channels|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)",
    ],
};
