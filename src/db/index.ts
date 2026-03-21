import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";
import { DB_POOL_MAX, DB_IDLE_TIMEOUT, DB_CONNECT_TIMEOUT } from "@/lib/constants";

/**
 * Database connection for Supabase PostgreSQL via postgres-js
 */

// Cache the connection in module scope to reuse across hot reloads in development
const globalForDb = globalThis as unknown as {
  sql: ReturnType<typeof postgres> | undefined;
};

// PgBouncer pooler connection using centralized architectural constants
const sql = globalForDb.sql ?? postgres(env.DATABASE_URL, {
  max: DB_POOL_MAX,
  idle_timeout: DB_IDLE_TIMEOUT,
  connect_timeout: DB_CONNECT_TIMEOUT,
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
