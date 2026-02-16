import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/db";

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
    status: 'healthy' as 'healthy' | 'unhealthy',
    checks: {
      database: { status: 'unknown' as 'ok' | 'error' | 'unknown', message: '' },
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

  const statusCode = checks.status === 'healthy' ? 200 : 503;

  return NextResponse.json(checks, { status: statusCode });
}
