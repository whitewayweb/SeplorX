import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicRoutes = ["/login"];

export default function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const isPublicRoute = publicRoutes.includes(pathname);
    const sessionCookie = request.cookies.get("better-auth.session_token") ||
        request.cookies.get("__Secure-better-auth.session_token");

    if (!isPublicRoute && !sessionCookie) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    if (isPublicRoute && sessionCookie) {
        return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Ignore api, _next/static, _next/image, favicon.ico etc.
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
};
