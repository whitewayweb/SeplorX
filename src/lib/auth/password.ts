import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// Parameters for scrypt
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

/**
 * Hash a password using scrypt
 * Returns a string in format: salt:hash
 */
export function hashPassword(password: string): string {
    const salt = randomBytes(SALT_LENGTH).toString("hex");
    const derivedKey = scryptSync(password, salt, KEY_LENGTH);
    return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a password against a stored scrypt hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
    try {
        const [salt, key] = storedHash.split(":");
        if (!salt || !key) return false;

        const derivedKey = scryptSync(password, salt, KEY_LENGTH);
        const storedKeyBuffer = Buffer.from(key, "hex");

        if (derivedKey.length !== storedKeyBuffer.length) return false;

        return timingSafeEqual(derivedKey, storedKeyBuffer);
    } catch {
        return false;
    }
}
