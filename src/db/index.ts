import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import type { Pool, PoolConnection } from "mysql2/promise";
import * as schema from "./schema";
import { env } from "@/lib/env";

/**
 * Production-ready database connection with:
 * - Connection pooling optimized for shared hosting
 * - Automatic retry logic
 * - Health checking
 * - Proper error handling
 */

let pool: Pool | null = null;

function createConnectionPool(): Pool {
  return mysql.createPool({
    uri: env.DATABASE_URL,
    // Conservative limits for shared hosting (Hostinger)
    connectionLimit: 5,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // Timeout settings to prevent hanging
    connectTimeout: 10000,
    // Timezone handling
    timezone: 'Z',
    // Charset
    charset: 'utf8mb4',
  });
}

function getPool(): Pool {
  if (!pool) {
    pool = createConnectionPool();
    
    // Log pool creation in development
    if (env.isDevelopment) {
      console.log('📊 Database connection pool created');
    }
  }
  
  return pool;
}

/**
 * Check if database connection is healthy
 */
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; error?: string }> {
  try {
    const connection: PoolConnection = await getPool().getConnection();
    await connection.ping();
    connection.release();
    return { healthy: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Database health check failed:', message);
    return { healthy: false, error: message };
  }
}

/**
 * Execute a function with automatic retry on connection errors
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // Only retry on connection errors
      const isConnectionError = 
        lastError.message.includes('ECONNREFUSED') || 
        lastError.message.includes('ETIMEDOUT') ||
        lastError.message.includes('PROTOCOL_CONNECTION_LOST');
      
      if (!isConnectionError || attempt >= maxRetries) {
        throw lastError;
      }
      
      console.warn(`⚠️  Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// Create base Drizzle instance
export const db = drizzle(getPool(), { schema, mode: "default" });

/**
 * Wrapper for database queries with retry logic
 */
export async function dbQuery<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn);
}

/**
 * Gracefully close database connections
 * Call this in your shutdown handlers
 */
export async function closeDatabaseConnections(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('🔌 Database connections closed');
  }
}

// Log successful connection in development
if (env.isDevelopment) {
  checkDatabaseHealth().then(({ healthy, error }) => {
    if (healthy) {
      console.log('✅ Database connection healthy');
    } else {
      console.error('❌ Database connection failed:', error);
    }
  }).catch(err => {
    console.error('❌ Error checking database health:', err);
  });
}
