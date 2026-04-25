import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-kms", () => {
  function MockKMS() {}
  MockKMS.prototype.send = mockSend;
  return {
    KMSClient: MockKMS,
    EncryptCommand: vi.fn(),
    DecryptCommand: vi.fn(),
  };
});

import { encrypt, decrypt, isEncrypted, encryptSync, decryptSync } from "../crypto";
import { env } from "@/lib/env";

type EnvWithWriteableAWS = typeof env & {
  AWS_KMS_KEY_ID?: string;
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
};

describe("encrypt / decrypt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  it("round-trip: decrypt(encrypt(x)) === x", async () => {
    const plaintext = "my-secret-api-key-123";
    const ciphertext = await encrypt(plaintext);
    const result = await decrypt(ciphertext);
    expect(result).toBe(plaintext);
  });

  it("preserves unicode / special characters through round-trip", async () => {
    const plaintext = "पांसेका-key-£-€-中文-🔑";
    expect(await decrypt(await encrypt(plaintext))).toBe(plaintext);
  });

  it("produces different ciphertext on each call (random IV) via sync path", () => {
    const a = encryptSync("hello");
    const b = encryptSync("hello");
    expect(a).not.toBe(b);
  });

  it("encrypted output has iv:authTag:ciphertext format when using local sync path", () => {
    const result = encryptSync("test-value");
    const parts = result.split(":");
    expect(parts).toHaveLength(3);
  });

  it("IV part is 32 hex chars (16 bytes) via sync path", () => {
    const result = encryptSync("test");
    const iv = result.split(":")[0];
    expect(iv).toHaveLength(32);
    expect(iv).toMatch(/^[0-9a-f]+$/);
  });

  it("authTag part is 32 hex chars (16 bytes) via sync path", () => {
    const result = encryptSync("test");
    const authTag = result.split(":")[1];
    expect(authTag).toHaveLength(32);
    expect(authTag).toMatch(/^[0-9a-f]+$/);
  });

  it("decryptSync throws on malformed input with only one part", () => {
    expect(() => decryptSync("not-encrypted-at-all")).toThrow("Invalid encrypted value format");
  });

  it("decryptSync throws on malformed input with only two parts", () => {
    expect(() => decryptSync("part1:part2")).toThrow("Invalid encrypted value format");
  });

  it("decryptSync throws on corrupted ciphertext (bad GCM auth tag)", () => {
    const valid = encryptSync("hello world");
    const parts = valid.split(":");
    const corrupted = `${parts[0]}:${parts[1]}:deadbeefdeadbeef`;
    expect(() => decryptSync(corrupted)).toThrow();
  });

  it("decrypt throws on non-existent KMS configuration for kms: prefix", async () => {
    const writableEnv = env as unknown as EnvWithWriteableAWS;
    const originalKey = writableEnv.AWS_ACCESS_KEY_ID;
    writableEnv.AWS_ACCESS_KEY_ID = undefined;
    try {
      await expect(decrypt("kms:YWJjZGVm")).rejects.toThrow("AWS KMS is not configured");
    } finally {
      writableEnv.AWS_ACCESS_KEY_ID = originalKey;
    }
  });

  it("uses KMS for encryption when configured", async () => {
    const writableEnv = env as unknown as EnvWithWriteableAWS;
    const originalId = writableEnv.AWS_KMS_KEY_ID;
    const originalRegion = writableEnv.AWS_REGION;
    const originalKey = writableEnv.AWS_ACCESS_KEY_ID;
    const originalSecret = writableEnv.AWS_SECRET_ACCESS_KEY;

    writableEnv.AWS_KMS_KEY_ID = "mock-key-id";
    writableEnv.AWS_REGION = "ap-south-1";
    writableEnv.AWS_ACCESS_KEY_ID = "mock-access-key";
    writableEnv.AWS_SECRET_ACCESS_KEY = "mock-secret";

    try {
      mockSend.mockResolvedValue({
        CiphertextBlob: Buffer.from("mock-encrypted-blob"),
      });

      const result = await encrypt("secret-data");
      expect(result).toBe(`kms:${Buffer.from("mock-encrypted-blob").toString("base64")}`);
      expect(mockSend).toHaveBeenCalled();
    } finally {
      writableEnv.AWS_KMS_KEY_ID = originalId;
      writableEnv.AWS_REGION = originalRegion;
      writableEnv.AWS_ACCESS_KEY_ID = originalKey;
      writableEnv.AWS_SECRET_ACCESS_KEY = originalSecret;
    }
  });

  it("uses KMS for decryption when prefix is present", async () => {
    const writableEnv = env as unknown as EnvWithWriteableAWS;
    const originalRegion = writableEnv.AWS_REGION;
    const originalKey = writableEnv.AWS_ACCESS_KEY_ID;
    const originalSecret = writableEnv.AWS_SECRET_ACCESS_KEY;

    writableEnv.AWS_REGION = "ap-south-1";
    writableEnv.AWS_ACCESS_KEY_ID = "mock-access-key";
    writableEnv.AWS_SECRET_ACCESS_KEY = "mock-secret";

    try {
      mockSend.mockResolvedValue({
        Plaintext: Buffer.from("decrypted-data", "utf8"),
      });

      const result = await decrypt("kms:YWJjZGVm");
      expect(result).toBe("decrypted-data");
      expect(mockSend).toHaveBeenCalled();
    } finally {
      writableEnv.AWS_REGION = originalRegion;
      writableEnv.AWS_ACCESS_KEY_ID = originalKey;
      writableEnv.AWS_SECRET_ACCESS_KEY = originalSecret;
    }
  });
});

// ─── isEncrypted ─────────────────────────────────────────────────────────────

describe("isEncrypted", () => {
  it("returns true for a value produced by encryptSync()", () => {
    expect(isEncrypted(encryptSync("test-value"))).toBe(true);
  });

  it("returns true for a value starting with kms:", () => {
    expect(isEncrypted("kms:base64data")).toBe(true);
  });

  it("returns false for a plain string with no colons", () => {
    expect(isEncrypted("plain-text-api-key")).toBe(false);
  });

  it("returns false for a string with only two colon-separated parts", () => {
    expect(isEncrypted("part1:part2")).toBe(false);
  });

  it("returns false for correct parts but short IV (not 32 chars)", () => {
    // IV too short — not a real encrypted value
    expect(isEncrypted("short:abc:ciphertext")).toBe(false);
  });

  it("returns false for correct parts but short authTag", () => {
    const validIv = "a".repeat(32);
    expect(isEncrypted(`${validIv}:short:ciphertext`)).toBe(false);
  });

  it("returns true when IV and authTag are correctly sized (even if ciphertext is wrong)", () => {
    // isEncrypted only checks format, not whether decryption would succeed
    const validIv = "a".repeat(32);
    const validAuthTag = "b".repeat(32);
    expect(isEncrypted(`${validIv}:${validAuthTag}:anyciphertext`)).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isEncrypted("")).toBe(false);
  });
});
