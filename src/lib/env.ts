/**
 * Environment variable validation and type-safe access
 * This ensures all required environment variables are present at runtime
 *
 * Supports both naming conventions:
 * - DATABASE_URL (manual setup / .env.local)
 * - POSTGRES_URL (Vercel + Supabase integration)
 */

import { logger } from "@/lib/logger";

function getEnv() {
  // Resolve database URL: prefer POSTGRES_URL (Vercel/Supabase pooler), fallback to DATABASE_URL
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  // ENCRYPTION_KEY: 64-char hex string (32 bytes) for AES-256-GCM config encryption
  const encryptionKey = process.env.ENCRYPTION_KEY;

  // GOOGLE_GENERATIVE_AI_API_KEY: Google Gemini API key for AI agents (optional — agents won't run without it)
  const googleAiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  // BETTER_AUTH_SECRET: Secret for Better Auth session signing
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET;

  // BETTER_AUTH_URL: Base URL for Better Auth redirects
  const betterAuthUrl = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // NEXT_PUBLIC_APP_URL: public base URL for building webhook callback URLs (optional)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || betterAuthUrl;

  const optionalEnvVars = {
    NODE_ENV: process.env.NODE_ENV || 'development',
  } as const;

  // Validate required environment variables (skip during build phase)
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    const missing: string[] = [];

    if (!databaseUrl) missing.push('DATABASE_URL (or POSTGRES_URL)');
    if (!encryptionKey) missing.push('ENCRYPTION_KEY');
    if (!betterAuthSecret) missing.push('BETTER_AUTH_SECRET');

    if (missing.length > 0) {
      const errorMessage =
        `Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}\n\n` +
        `Please check your .env.local file or Vercel environment configuration.`;

      if (process.env.NODE_ENV === 'development') {
        logger.warn(errorMessage);
      } else {
        throw new Error(errorMessage);
      }
    }
  }

  // AWS KMS Configuration (Optional - Falls back to local encryption if missing)
  const awsRegion = process.env.AWS_REGION;
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const awsKmsKeyId = process.env.AWS_KMS_KEY_ID;

  return {
    DATABASE_URL: databaseUrl as string,
    ENCRYPTION_KEY: encryptionKey as string,
    BETTER_AUTH_SECRET: betterAuthSecret as string,
    BETTER_AUTH_URL: betterAuthUrl,
    GOOGLE_GENERATIVE_AI_API_KEY: googleAiKey,
    NEXT_PUBLIC_APP_URL: appUrl,
    AWS_REGION: awsRegion,
    AWS_ACCESS_KEY_ID: awsAccessKeyId,
    AWS_SECRET_ACCESS_KEY: awsSecretAccessKey,
    AWS_KMS_KEY_ID: awsKmsKeyId,
    ...optionalEnvVars,
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
  };
}

export const env = getEnv();
