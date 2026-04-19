/**
 * Vitest global setup — runs before every test file.
 *
 * Injects test-safe environment variables so that:
 * - src/lib/env.ts does not throw "Missing required environment variables"
 * - src/lib/crypto.ts has a valid AES-256-GCM key (64 hex chars = 32 bytes)
 *
 * The NEXT_PHASE trick mirrors what Next.js does during builds to suppress
 * runtime env validation in env.ts (see `if (process.env.NEXT_PHASE !== ...)`)
 */

// Disable env.ts validation gate during tests
process.env.NEXT_PHASE = "phase-production-build";

// AES-256-GCM key: must be exactly 64 hex characters (32 bytes)
// "a" is a valid hex digit — this is safe, deterministic, and test-only
process.env.ENCRYPTION_KEY = "a".repeat(64);

// Satisfy better-auth requirements
process.env.BETTER_AUTH_SECRET = "vitest-test-secret-not-for-production";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

// Satisfy database URL check (not used in unit tests — DB is mocked)
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/seplorx_test";

// Public app URL (used in webhook URL construction tests)
process.env.NEXT_PUBLIC_APP_URL = "https://test.example.com";

// Ensure test environment
process.env.NODE_ENV = "test";
