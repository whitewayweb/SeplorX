import { decrypt, isEncrypted } from "@/lib/crypto";

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
export function decryptChannelCredentials(
  raw: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!raw) return {};

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string" || !value) continue;

    if (isEncrypted(value)) {
      // Value matches the iv:authTag:ciphertext format — it must decrypt cleanly.
      // A failure here indicates a key mismatch or data corruption, NOT a legacy
      // plaintext value. Omit the key so callers see an incomplete credential map
      // rather than silently receiving corrupt ciphertext as a usable string.
      try {
        result[key] = decrypt(value);
      } catch (err) {
        console.warn(
          `[decryptChannelCredentials] Failed to decrypt credential key "${key}". ` +
            "Possible key mismatch or data corruption — key omitted from result.",
          err instanceof Error ? err.message : String(err),
        );
        // key intentionally omitted
      }
    } else {
      // Value does not match the encrypted format — treat as legacy plaintext
      // migrated before encryption was introduced.
      result[key] = value;
    }
  }

  return result;
}
