import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login"];

/**
 * Next.js Edge Middleware — protects dashboard routes by validating the
 * session token against the Better Auth API endpoint. Checking cookie
 * presence alone is bypassable with a forged or expired cookie, so we
 * call Better Auth's get-session endpoint server-side to confirm the
 * session is genuine and not expired.
 */
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    const sessionCookie =
        request.cookies.get("better-auth.session_token") ||
        request.cookies.get("__Secure-better-auth.session_token");

    // No cookie at all → redirect to login (fast path, no fetch needed)
    if (!isPublicRoute && !sessionCookie) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    // Cookie exists → validate it against Better Auth
    if (sessionCookie) {
        let isValid = false;

        try {
            const sessionUrl = new URL("/api/auth/get-session", request.url);
            const response = await fetch(sessionUrl, {
                headers: { cookie: request.headers.get("cookie") || "" },
            });

            if (response.ok) {
                const session = await response.json();
                isValid = Boolean(session?.session && session?.user);
            }
        } catch {
            // Network/parsing failure → treat as invalid
        }

        // Logged-in user on public route → redirect to dashboard
        if (isPublicRoute && isValid) {
            return NextResponse.redirect(new URL("/", request.url));
        }

        // Invalid/expired cookie on protected route → redirect to login
        if (!isPublicRoute && !isValid) {
            return NextResponse.redirect(new URL("/login", request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Ignore api, _next/static, _next/image, favicon.ico, etc.
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
};
