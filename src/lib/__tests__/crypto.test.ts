import { describe, it, expect } from "vitest";
import { encrypt, decrypt, isEncrypted } from "../crypto";

// ─── encrypt / decrypt ────────────────────────────────────────────────────────

describe("encrypt / decrypt", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    // Arrange
    const plaintext = "my-secret-api-key-123";

    // Act
    const ciphertext = encrypt(plaintext);
    const result = decrypt(ciphertext);

    // Assert
    expect(result).toBe(plaintext);
  });

  it("preserves unicode / special characters through round-trip", () => {
    const plaintext = "पांसेका-key-£-€-中文-🔑";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("produces different ciphertext on each call (random IV)", () => {
    const a = encrypt("hello");
    const b = encrypt("hello");
    // Same plaintext → different ciphertext because IV is random
    expect(a).not.toBe(b);
  });

  it("encrypted output has iv:authTag:ciphertext format (3 colon-delimited parts)", () => {
    const result = encrypt("test-value");
    const parts = result.split(":");
    expect(parts).toHaveLength(3);
  });

  it("IV part is 32 hex chars (16 bytes)", () => {
    const result = encrypt("test");
    const iv = result.split(":")[0];
    expect(iv).toHaveLength(32);
    expect(iv).toMatch(/^[0-9a-f]+$/);
  });

  it("authTag part is 32 hex chars (16 bytes)", () => {
    const result = encrypt("test");
    const authTag = result.split(":")[1];
    expect(authTag).toHaveLength(32);
    expect(authTag).toMatch(/^[0-9a-f]+$/);
  });

  it("decrypt throws on malformed input with only one part", () => {
    expect(() => decrypt("not-encrypted-at-all")).toThrow("Invalid encrypted value format");
  });

  it("decrypt throws on malformed input with only two parts", () => {
    expect(() => decrypt("part1:part2")).toThrow("Invalid encrypted value format");
  });

  it("decrypt throws on corrupted ciphertext (bad GCM auth tag)", () => {
    const valid = encrypt("hello world");
    const parts = valid.split(":");
    // Keep valid IV and authTag but corrupt the ciphertext
    const corrupted = `${parts[0]}:${parts[1]}:deadbeefdeadbeef`;
    expect(() => decrypt(corrupted)).toThrow();
  });

  it("decrypt throws on swapped IV (wrong key material)", () => {
    const a = encrypt("message-a");
    const b = encrypt("message-b");
    const aParts = a.split(":");
    const bParts = b.split(":");
    // Mix IV from a with ciphertext from b
    const mixed = `${aParts[0]}:${aParts[1]}:${bParts[2]}`;
    expect(() => decrypt(mixed)).toThrow();
  });
});

// ─── isEncrypted ─────────────────────────────────────────────────────────────

describe("isEncrypted", () => {
  it("returns true for a value produced by encrypt()", () => {
    expect(isEncrypted(encrypt("test-value"))).toBe(true);
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
