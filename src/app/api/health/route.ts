import { NextResponse } from 'next/server';

/**
 * GET /api/health — load balancer / uptime checks. No auth; no DB (avoids pool exhaustion from probes).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'reserve-ni',
    timestamp: new Date().toISOString(),
  });
}
