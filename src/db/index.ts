import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

/**
 * Database connection for Supabase PostgreSQL via postgres-js
 *
 * Connection pooling is handled at two levels:
 * 1. Supabase PgBouncer (server-side, port 6543)
 * 2. postgres-js internal connection pool
 *
 * For Vercel serverless, use the Supabase "Transaction" pooler URL (port 6543).
 */

// Cache the connection in module scope to reuse across hot reloads in development
const globalForDb = globalThis as unknown as {
  sql: ReturnType<typeof postgres> | undefined;
};

const sql = globalForDb.sql ?? postgres(env.DATABASE_URL, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
});

if (env.isDevelopment) {
  globalForDb.sql = sql;
}

export const db = drizzle(sql, { schema });

/**
 * Check if database connection is healthy
 */
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; error?: string }> {
  try {
    await sql`SELECT 1`;
    return { healthy: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Database health check failed:", message);
    return { healthy: false, error: message };
  }
}

/**
 * Close database connections gracefully
 */
export async function closeDatabaseConnections(): Promise<void> {
  await sql.end();
}
