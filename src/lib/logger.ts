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
function redact(data: unknown, seen = new WeakSet()): unknown {
    if (data === null || data === undefined) return data;

    if (data instanceof Error) {
        const errorProps: Record<string, unknown> = {
            name: data.name,
            message: data.message,
            stack: data.stack,
        };
        for (const [key, value] of Object.entries(data)) {
            if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
                errorProps[key] = "[REDACTED]";
            } else {
                errorProps[key] = redact(value, seen);
            }
        }
        return errorProps;
    }

    if (typeof data === "object") {
        if (seen.has(data)) {
            return "[CIRCULAR]";
        }
        seen.add(data);

        if (Array.isArray(data)) {
            return data.map(item => redact(item, seen));
        }

        const obj = data as Record<string, unknown>;
        const redacted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
                redacted[key] = "[REDACTED]";
            } else {
                redacted[key] = redact(value, seen);
            }
        }
        return redacted;
    }

    return data;
}

export const logger = {
    info: (message: string, ...args: unknown[]) => {
        console.log(`[INFO] ${message}`, ...args.map(arg => redact(arg)));
    },
    warn: (message: string, ...args: unknown[]) => {
        console.warn(`[WARN] ${message}`, ...args.map(arg => redact(arg)));
    },
    error: (message: string, ...args: unknown[]) => {
        console.error(`[ERROR] ${message}`, ...args.map(arg => redact(arg)));
    },
};
