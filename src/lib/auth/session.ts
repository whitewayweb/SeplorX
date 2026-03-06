import "server-only";
import { encrypt, decrypt } from "@/lib/crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export interface SessionPayload {
    userId: number;
    role: string;
    expiresAt: string;
}

const SESSION_COOKIE_NAME = "seplorx_session";
const SESSION_EXPIRY_DAYS = 7;

export async function createSession(userId: number, role: string) {
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const payload: SessionPayload = {
        userId,
        role,
        expiresAt: expiresAt.toISOString()
    };

    const cookieStore = await cookies();
    const encryptedSession = encrypt(JSON.stringify(payload));

    cookieStore.set(SESSION_COOKIE_NAME, encryptedSession, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        expires: expiresAt,
        sameSite: "lax",
        path: "/",
    });
}

export async function verifySession(): Promise<SessionPayload | null> {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!cookie) return null;

    try {
        const decrypted = decrypt(cookie);
        const payload = JSON.parse(decrypted) as SessionPayload;

        if (new Date(payload.expiresAt) < new Date()) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

export async function getSession() {
    const session = await verifySession();
    return session;
}

export async function deleteSession() {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    redirect("/login");
}
