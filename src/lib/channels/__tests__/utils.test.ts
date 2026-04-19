import { describe, it, expect } from "vitest";
import { encrypt } from "@/lib/crypto";
import { decryptChannelCredentials } from "../utils";

// ─── decryptChannelCredentials ────────────────────────────────────────────────

describe("decryptChannelCredentials", () => {
  it("returns empty object for null input", () => {
    expect(decryptChannelCredentials(null)).toEqual({});
  });

  it("returns empty object for undefined input", () => {
    expect(decryptChannelCredentials(undefined)).toEqual({});
  });

  it("returns empty object for empty object input", () => {
    expect(decryptChannelCredentials({})).toEqual({});
  });

  it("decrypts a single encrypted credential correctly", () => {
    const creds = { consumerKey: encrypt("ck_abc123") };
    const result = decryptChannelCredentials(creds);
    expect(result.consumerKey).toBe("ck_abc123");
  });

  it("decrypts multiple encrypted credentials correctly", () => {
    const creds = {
      consumerKey: encrypt("ck_abc123"),
      consumerSecret: encrypt("cs_xyz789"),
      webhookSecret: encrypt("wh_secret_key"),
    };
    const result = decryptChannelCredentials(creds);
    expect(result.consumerKey).toBe("ck_abc123");
    expect(result.consumerSecret).toBe("cs_xyz789");
    expect(result.webhookSecret).toBe("wh_secret_key");
  });

  it("passes through legacy plaintext values unchanged (not in iv:authTag:cipher format)", () => {
    // Values that pre-date encryption are stored as plain text and should pass through
    const creds = { apiKey: "plain-text-legacy-key" };
    const result = decryptChannelCredentials(creds);
    expect(result.apiKey).toBe("plain-text-legacy-key");
  });

  it("omits keys with non-string values (number)", () => {
    const creds = { validKey: encrypt("value"), port: 8080 };
    const result = decryptChannelCredentials(creds as Record<string, unknown>);
    expect(result).toHaveProperty("validKey");
    expect(result).not.toHaveProperty("port");
  });

  it("omits keys with null values", () => {
    const creds = { validKey: encrypt("value"), nullKey: null };
    const result = decryptChannelCredentials(creds as Record<string, unknown>);
    expect(result).toHaveProperty("validKey");
    expect(result).not.toHaveProperty("nullKey");
  });

  it("omits keys with empty string values", () => {
    const creds = { validKey: encrypt("value"), emptyKey: "" };
    const result = decryptChannelCredentials(creds);
    expect(result).toHaveProperty("validKey");
    expect(result).not.toHaveProperty("emptyKey");
  });

  it("omits keys where decryption fails (matching format but corrupt ciphertext)", () => {
    // Construct a string that passes isEncrypted() format check but fails GCM auth
    // IV = 32 hex chars, authTag = 32 hex chars, corrupt ciphertext
    const fakeEncrypted = `${"a".repeat(32)}:${"b".repeat(32)}:deadbeefdeadbeef`;
    const creds = { corruptedKey: fakeEncrypted };
    // Should NOT throw — should silently omit the key and log a warning
    const result = decryptChannelCredentials(creds);
    expect(result).not.toHaveProperty("corruptedKey");
  });

  it("handles mix of encrypted, plaintext, and invalid values", () => {
    const creds = {
      encrypted: encrypt("secret"),
      plaintext: "legacy-plain-value",
      numberField: 42,
      emptyField: "",
    };
    const result = decryptChannelCredentials(creds as Record<string, unknown>);
    expect(result.encrypted).toBe("secret");
    expect(result.plaintext).toBe("legacy-plain-value");
    expect(result).not.toHaveProperty("numberField");
    expect(result).not.toHaveProperty("emptyField");
  });

  it("result contains only string values (type safety)", () => {
    const creds = { key1: encrypt("value1"), key2: encrypt("value2") };
    const result = decryptChannelCredentials(creds);
    for (const val of Object.values(result)) {
      expect(typeof val).toBe("string");
    }
  });
});
