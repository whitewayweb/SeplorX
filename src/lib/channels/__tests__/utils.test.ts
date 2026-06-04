import { describe, it, expect } from "vitest";
import { encryptSync } from "@/lib/crypto";
import { decryptChannelCredentials, getAmazonTimeZone, getChannelTimeZone, getAmazonLocale, getChannelLocale, formatChannelDateTime, formatChannelDateTimeLong } from "../utils";

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

describe("getAmazonTimeZone", () => {
  it("returns specific timezones for all known Amazon marketplace IDs", () => {
    const cases = [
      { id: "ATVPDKIKX0DER", tz: "America/Los_Angeles" },
      { id: "A2EUQ1WTGCTBG2", tz: "America/Toronto" },
      { id: "A1AM78C64UM0Y8", tz: "America/Mexico_City" },
      { id: "A2Q3Y263D00KWC", tz: "America/Sao_Paulo" },
      { id: "A1F83G8C2ARO7P", tz: "Europe/London" },
      { id: "A1PA67BAS5O4GM", tz: "Europe/Berlin" },
      { id: "A13V1IB3VIYZZH", tz: "Europe/Paris" },
      { id: "APJ6JRA9NG5V4", tz: "Europe/Rome" },
      { id: "A1RKKUPIHCS9HS", tz: "Europe/Madrid" },
      { id: "A1805IZSGTT6HS", tz: "Europe/Amsterdam" },
      { id: "A21TJRUUN4KGV", tz: "Asia/Kolkata" },
      { id: "A1VC38T7YXB528", tz: "Asia/Tokyo" },
      { id: "A39IBJ37TRP1C6", tz: "Australia/Sydney" },
      { id: "A2VIGQ35RCS4UG", tz: "Asia/Dubai" },
      { id: "A17E79C6D8DWNP", tz: "Asia/Riyadh" },
      { id: "ARBP9OOSHTCHU", tz: "Africa/Cairo" },
    ];
    for (const { id, tz } of cases) {
      expect(getAmazonTimeZone(id)).toBe(tz);
    }
  });

  it("returns UTC for unknown marketplace IDs", () => {
    expect(getAmazonTimeZone("UNKNOWN")).toBe("UTC");
    expect(getAmazonTimeZone()).toBe("UTC");
  });
});

describe("getChannelTimeZone", () => {
  it("returns UTC for non-amazon channels", async () => {
    expect(await getChannelTimeZone("woocommerce", null)).toBe("UTC");
  });

  it("returns specific timezone for amazon channel with known marketplace ID", async () => {
    const creds = { marketplaceId: "A1F83G8C2ARO7P" };
    expect(await getChannelTimeZone("amazon", creds)).toBe("Europe/London");
  });

  it("returns UTC for amazon channel with unknown marketplace ID", async () => {
    const creds = { marketplaceId: "UNKNOWN" };
    expect(await getChannelTimeZone("amazon", creds)).toBe("UTC");
  });
});

describe("getAmazonLocale", () => {
  it("returns specific locales for known Amazon marketplace IDs", () => {
    const cases = [
      { id: "A21TJRUUN4KGV", locale: "en-IN" },
      { id: "A1F83G8C2ARO7P", locale: "en-GB" },
    ];
    for (const { id, locale } of cases) {
      expect(getAmazonLocale(id)).toBe(locale);
    }
  });

  it("returns en-US for unknown marketplace IDs", () => {
    expect(getAmazonLocale("UNKNOWN")).toBe("en-US");
    expect(getAmazonLocale()).toBe("en-US");
  });
});

describe("getChannelLocale", () => {
  it("returns en-US for non-amazon channels", async () => {
    expect(await getChannelLocale("woocommerce", null)).toBe("en-US");
  });

  it("returns specific locale for amazon channel with known marketplace ID", async () => {
    const creds = { marketplaceId: "A21TJRUUN4KGV" };
    expect(await getChannelLocale("amazon", creds)).toBe("en-IN");
  });

  it("returns en-US for amazon channel with unknown marketplace ID", async () => {
    const creds = { marketplaceId: "UNKNOWN" };
    expect(await getChannelLocale("amazon", creds)).toBe("en-US");
  });
});

describe("formatChannelDateTime", () => {
  const testDate = new Date("2026-06-03T18:30:00.000Z"); // Midnight IST next day, or 6:30 PM UTC

  it("returns fallback for invalid dates", () => {
    expect(formatChannelDateTime(null)).toBe("—");
    expect(formatChannelDateTime("invalid-date")).toBe("—");
  });

  it("formats date correctly with given timezone and locale", () => {
    // en-GB uses DD MMM YYYY format
    const formatted = formatChannelDateTime(testDate, "Europe/London", "en-GB");
    // 18:30 in UTC is 19:30 in BST (London summer time in June)
    expect(formatted).toMatch(/3 Jun 2026/);
    expect(formatted).toMatch(/19:30/);
  });
});

describe("formatChannelDateTimeLong", () => {
  const testDate = new Date("2026-06-03T18:30:00.000Z");

  it("returns fallback for invalid dates", () => {
    expect(formatChannelDateTimeLong(null)).toBe("—");
    expect(formatChannelDateTimeLong("invalid-date")).toBe("—");
  });

  it("formats date to long format with given timezone and locale", () => {
    const formatted = formatChannelDateTimeLong(testDate, "Asia/Kolkata", "en-IN");
    // 18:30 UTC is exactly 00:00 next day (June 4) in IST (+05:30)
    expect(formatted).toMatch(/Thursday, 4 June 2026/i);
    expect(formatted).toMatch(/12:00\s*am/i);
  });
});
