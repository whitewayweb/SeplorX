/**
 * Secure logging utility for SeplorX.
 * Automatically redacts Personally Identifiable Information (PII) before logging.
 */

const SENSITIVE_KEYS = [
    "email",
    "buyerEmail",
    "customer_email",
    "name",
    "buyerName",
    "contactPerson",
    "phone",
    "shipping_phone",
    "address",
    "shipping_address",
    "notes",
    "return_notes",
    "password",
    "currentPassword",
    "newPassword",
    "apiKey",
    "apiPassword",
    "apiToken",
    "clientSecret",
    "credentials",
];

/**
 * Recursively redacts sensitive values from an object or array.
 */
function redact(data: unknown): unknown {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
        return data.map(redact);
    }

    if (typeof data === "object") {
        const obj = data as Record<string, unknown>;
        const redacted: Record<string, unknown> = {};
        for (const key in obj) {
            if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
                redacted[key] = "[REDACTED]";
            } else {
                redacted[key] = redact(obj[key]);
            }
        }
        return redacted;
    }

    return data;
}

export const logger = {
    info: (message: string, ...args: unknown[]) => {
        console.log(`[INFO] ${message}`, ...args.map(redact));
    },
    warn: (message: string, ...args: unknown[]) => {
        console.warn(`[WARN] ${message}`, ...args.map(redact));
    },
    error: (message: string, ...args: unknown[]) => {
        console.error(`[ERROR] ${message}`, ...args.map(redact));
    },
};
