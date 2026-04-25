import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "@/lib/env";
import { KMSClient, EncryptCommand, DecryptCommand, type KMSClientConfig } from "@aws-sdk/client-kms";
import { logger } from "@/lib/logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Initialize KMS client lazily if region is provided
let kmsClient: KMSClient | null = null;
function getKmsClient() {
  if (kmsClient) return kmsClient;
  if (env.AWS_REGION) {
    const config: KMSClientConfig = { region: env.AWS_REGION };
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      };
    }
    kmsClient = new KMSClient(config);
    return kmsClient;
  }
  return null;
}

/**
 * Get the encryption key as a Buffer from the hex-encoded env var.
 * ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
 */
function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

/**
 * Encrypt a plaintext string using AES-256-GCM (Local).
 * Returns a colon-delimited string: `iv:authTag:ciphertext` (all hex-encoded).
 */
export function encryptSync(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Encrypt a plaintext string using AWS KMS (if configured) or Local AES-256-GCM.
 */
export async function encrypt(plaintext: string): Promise<string> {
  const client = getKmsClient();
  const keyId = env.AWS_KMS_KEY_ID;

  if (client && keyId) {
    try {
      const command = new EncryptCommand({
        KeyId: keyId,
        Plaintext: Buffer.from(plaintext, "utf8"),
      });
      const response = await client.send(command);
      if (response.CiphertextBlob) {
        return `kms:${Buffer.from(response.CiphertextBlob).toString("base64")}`;
      }
      throw new Error("KMS Encryption failed to return ciphertext");
    } catch (err) {
      logger.error("[KMS] Encryption failed", err);
      throw err;
    }
  }

  return encryptSync(plaintext);
}

/**
 * Decrypt an encrypted string (Local AES-256-GCM).
 * Expects the format: `iv:authTag:ciphertext` (all hex-encoded).
 */
export function decryptSync(encryptedValue: string): string {
  const [ivHex, authTagHex, ciphertext] = encryptedValue.split(":");
  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error("Invalid encrypted value format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Decrypt an encrypted string (Supports both KMS and Local).
 */
export async function decrypt(encryptedValue: string): Promise<string> {
  if (encryptedValue.startsWith("kms:")) {
    const client = getKmsClient();
    if (!client) throw new Error("AWS KMS is not configured, but value is kms-encrypted");

    const ciphertextBlob = Buffer.from(encryptedValue.slice(4), "base64");
    const command = new DecryptCommand({
      CiphertextBlob: ciphertextBlob,
    });

    const response = await client.send(command);
    if (response.Plaintext) {
      return Buffer.from(response.Plaintext).toString("utf8");
    }
    throw new Error("KMS Decryption failed to return plaintext");
  }

  return decryptSync(encryptedValue);
}

/**
 * Check if a string looks like an encrypted value (Local or KMS).
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.startsWith("kms:")) return true;

  const parts = value.split(":");
  if (parts.length !== 3) return false;
  // IV = 32 hex chars (16 bytes), authTag = 32 hex chars (16 bytes)
  return parts[0].length === IV_LENGTH * 2 && parts[1].length === AUTH_TAG_LENGTH * 2;
}
