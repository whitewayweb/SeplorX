import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_ROUTES = ["/login"];

/**
 * Middleware function that handles route protection and session validation.
 */
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    // Optimized: Check session directly from the Auth API
    // This avoids internal HTTP fetch overhead (~2s delay) and recursion loops.
    const sessionResponse = await auth.api.getSession({
        headers: request.headers,
    });
    const session = sessionResponse?.session;
    const user = sessionResponse?.user;
    const isAuthenticated = !!(session && user);

    if (!isPublicRoute) {
        // Protected route
        if (!isAuthenticated) {
            return NextResponse.redirect(new URL("/login", request.url));
        }
    } else {
        // Public route (e.g., /login)
        // If already authenticated, redirect to dashboard
        if (isAuthenticated) {
            return NextResponse.redirect(new URL("/", request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Match all routes except api, _next, and static assets
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
};
