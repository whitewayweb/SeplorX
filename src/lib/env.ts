/**
 * Environment variable validation and type-safe access
 * This ensures all required environment variables are present at runtime
 *
 * Supports both naming conventions:
 * - DATABASE_URL (manual setup / .env.local)
 * - POSTGRES_URL (Vercel + Supabase integration)
 */

function getEnv() {
  // Resolve database URL: prefer POSTGRES_URL (Vercel/Supabase pooler), fallback to DATABASE_URL
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  // ENCRYPTION_KEY: 64-char hex string (32 bytes) for AES-256-GCM config encryption
  const encryptionKey = process.env.ENCRYPTION_KEY;

  // GOOGLE_GENERATIVE_AI_API_KEY: Google Gemini API key for AI agents (optional — agents won't run without it)
  const googleAiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  const optionalEnvVars = {
    NODE_ENV: process.env.NODE_ENV || 'development',
  } as const;

  // Validate required environment variables (skip during build phase)
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    const missing: string[] = [];

    if (!databaseUrl) missing.push('DATABASE_URL (or POSTGRES_URL)');
    if (!encryptionKey) missing.push('ENCRYPTION_KEY');

    if (missing.length > 0) {
      const errorMessage =
        `Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}\n\n` +
        `Please check your .env.local file or Vercel environment configuration.`;

      if (process.env.NODE_ENV === 'development') {
        console.warn('\u26a0\ufe0f', errorMessage);
      } else {
        throw new Error(errorMessage);
      }
    }
  }

  return {
    DATABASE_URL: databaseUrl as string,
    ENCRYPTION_KEY: encryptionKey as string,
    GOOGLE_GENERATIVE_AI_API_KEY: googleAiKey,
    ...optionalEnvVars,
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
  };
}

export const env = getEnv();
