import { describe, it, expect } from "vitest";
import { encryptSync } from "@/lib/crypto";
import { decryptChannelCredentials } from "../utils";

// ─── decryptChannelCredentials ────────────────────────────────────────────────

describe("decryptChannelCredentials", () => {
  it("returns empty object for null input", async () => {
    expect(await decryptChannelCredentials(null)).toEqual({});
  });

  it("returns empty object for undefined input", async () => {
    expect(await decryptChannelCredentials(undefined)).toEqual({});
  });

  it("returns empty object for empty object input", async () => {
    expect(await decryptChannelCredentials({})).toEqual({});
  });

  it("decrypts a single encrypted credential correctly", async () => {
    const creds = { consumerKey: encryptSync("ck_abc123") };
    const result = await decryptChannelCredentials(creds);
    expect(result.consumerKey).toBe("ck_abc123");
  });

  it("decrypts multiple encrypted credentials correctly", async () => {
    const creds = {
      consumerKey: encryptSync("ck_abc123"),
      consumerSecret: encryptSync("cs_xyz789"),
      webhookSecret: encryptSync("wh_secret_key"),
    };
    const result = await decryptChannelCredentials(creds);
    expect(result.consumerKey).toBe("ck_abc123");
    expect(result.consumerSecret).toBe("cs_xyz789");
    expect(result.webhookSecret).toBe("wh_secret_key");
  });

  it("passes through legacy plaintext values unchanged (not in iv:authTag:cipher format)", async () => {
    // Values that pre-date encryption are stored as plain text and should pass through
    const creds = { apiKey: "plain-text-legacy-key" };
    const result = await decryptChannelCredentials(creds);
    expect(result.apiKey).toBe("plain-text-legacy-key");
  });

  it("omits keys with non-string values (number)", async () => {
    const creds = { validKey: encryptSync("value"), port: 8080 };
    const result = await decryptChannelCredentials(creds as Record<string, unknown>);
    expect(result).toHaveProperty("validKey");
    expect(result).not.toHaveProperty("port");
  });

  it("omits keys with null values", async () => {
    const creds = { validKey: encryptSync("value"), nullKey: null };
    const result = await decryptChannelCredentials(creds as Record<string, unknown>);
    expect(result).toHaveProperty("validKey");
    expect(result).not.toHaveProperty("nullKey");
  });

  it("omits keys with empty string values", async () => {
    const creds = { validKey: encryptSync("value"), emptyKey: "" };
    const result = await decryptChannelCredentials(creds);
    expect(result).toHaveProperty("validKey");
    expect(result).not.toHaveProperty("emptyKey");
  });

  it("omits keys where decryption fails (matching format but corrupt ciphertext)", async () => {
    // Construct a string that passes isEncrypted() format check but fails GCM auth
    // IV = 32 hex chars, authTag = 32 hex chars, corrupt ciphertext
    const fakeEncrypted = `${"a".repeat(32)}:${"b".repeat(32)}:deadbeefdeadbeef`;
    const creds = { corruptedKey: fakeEncrypted };
    // Should NOT throw — should silently omit the key and log a warning
    const result = await decryptChannelCredentials(creds);
    expect(result).not.toHaveProperty("corruptedKey");
  });

  it("handles mix of encrypted, plaintext, and invalid values", async () => {
    const creds = {
      encrypted: encryptSync("secret"),
      plaintext: "legacy-plain-value",
      numberField: 42,
      emptyField: "",
    };
    const result = await decryptChannelCredentials(creds as Record<string, unknown>);
    expect(result.encrypted).toBe("secret");
    expect(result.plaintext).toBe("legacy-plain-value");
    expect(result).not.toHaveProperty("numberField");
    expect(result).not.toHaveProperty("emptyField");
  });

  it("result contains only string values (type safety)", async () => {
    const creds = { key1: encryptSync("value1"), key2: encryptSync("value2") };
    const result = await decryptChannelCredentials(creds);
    for (const val of Object.values(result)) {
      expect(typeof val).toBe("string");
    }
  });
});
