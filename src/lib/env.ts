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

  const optionalEnvVars = {
    NODE_ENV: process.env.NODE_ENV || 'development',
  } as const;

  // Validate required environment variables (skip during build phase)
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    if (!databaseUrl) {
      const errorMessage =
        `Missing required environment variable: DATABASE_URL (or POSTGRES_URL)\n\n` +
        `Please check your .env.local file or Vercel environment configuration.`;

      // In development, just warn instead of crashing
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️', errorMessage);
      } else {
        throw new Error(errorMessage);
      }
    }
  }

  return {
    DATABASE_URL: databaseUrl as string,
    ...optionalEnvVars,
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
  };
}

export const env = getEnv();
