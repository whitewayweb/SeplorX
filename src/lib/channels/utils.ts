import { decrypt } from "@/lib/crypto";

/**
 * Decrypt all stored credential fields for a channel.
 *
 * Channel credentials are stored as a JSONB object in the DB where every value
 * is AES-256-GCM encrypted with `encrypt()`.  The field *keys* are channel-specific
 * (e.g. WooCommerce: consumerKey/consumerSecret; Amazon: clientId/clientSecret/refreshToken).
 *
 * This helper iterates every key and decrypts the value, so callers never need to
 * know which keys a particular channel type uses.  The resulting object is passed
 * directly to `ChannelHandler` methods which each know their own field names.
 *
 * Non-string or empty values are silently skipped.
 * Values that fail decryption are passed through as-is (handles plain-text legacy values).
 */
export function decryptChannelCredentials(
  raw: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!raw) return {};

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string" || !value) continue;
    try {
      result[key] = decrypt(value);
    } catch {
      // Value is not encrypted (e.g. migrated plain-text) — pass through as-is
      result[key] = value;
    }
  }

  return result;
}
