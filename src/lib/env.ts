/**
 * Environment variable validation and type-safe access
 * This ensures all required environment variables are present at runtime
 */

function getEnv() {
  const requiredEnvVars = {
    DATABASE_URL: process.env.DATABASE_URL,
  } as const;

  const optionalEnvVars = {
    NODE_ENV: process.env.NODE_ENV || 'development',
  } as const;

  // Validate required environment variables (skip during build phase)
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    const missing: string[] = [];

    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      const errorMessage =
        `Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}\n\n` +
        `Please check your .env.local file or environment configuration.`;

      // In development, just warn instead of crashing
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️', errorMessage);
      } else {
        throw new Error(errorMessage);
      }
    }
  }

  return {
    ...requiredEnvVars,
    ...optionalEnvVars,
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
  } as {
    DATABASE_URL: string;
    NODE_ENV: string;
    isDevelopment: boolean;
    isProduction: boolean;
  };
}

export const env = getEnv();
