import { decrypt, isEncrypted } from "@/lib/crypto";
import { logger } from "@/lib/logger";

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
 * Behaviour per value:
 *  - Non-string or empty          → skipped (key omitted from result)
 *  - Looks encrypted, decrypts OK → decrypted plaintext included
 *  - Looks encrypted, decrypt fails → key mismatch / corruption; key omitted + warning logged
 *  - Does not look encrypted       → legacy plaintext; passed through as-is
 */
export async function decryptChannelCredentials(
  raw: Record<string, unknown> | null | undefined,
): Promise<Record<string, string>> {
  if (!raw) return {};

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string" || !value) continue;

    if (isEncrypted(value)) {
      try {
        result[key] = await decrypt(value);
      } catch (err) {
        logger.warn(
          `[decryptChannelCredentials] Failed to decrypt credential key "${key}". ` +
            "Possible key mismatch or data corruption — key omitted from result.",
          err instanceof Error ? err.message : String(err),
        );
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}
