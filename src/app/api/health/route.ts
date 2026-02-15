import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/db";
import { env } from "@/lib/env";

/**
 * Health check endpoint for monitoring
 * GET /api/health
 * 
 * Returns 200 if all systems operational
 * Returns 503 if any critical system is down
 */
export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    status: 'healthy' as 'healthy' | 'unhealthy',
    checks: {
      database: { status: 'unknown' as 'ok' | 'error' | 'unknown', message: '' },
      auth: { status: 'ok' as 'ok' | 'error', message: 'Configuration validated' },
    }
  };

  // Check database
  const dbHealth = await checkDatabaseHealth();
  if (dbHealth.healthy) {
    checks.checks.database = { status: 'ok', message: 'Connected' };
  } else {
    checks.checks.database = { status: 'error', message: dbHealth.error || 'Connection failed' };
    checks.status = 'unhealthy';
  }

  // Check auth configuration
  if (!env.AUTH_SECRET) {
    checks.checks.auth = { status: 'error', message: 'AUTH_SECRET not configured' };
    checks.status = 'unhealthy';
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;

  return NextResponse.json(checks, { status: statusCode });
}
