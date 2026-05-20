import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { requireCronAuthorisation } from '@/lib/cron-auth';
import { finalizeCronRun } from '@/lib/cron/finalize-cron-run';
import { processExpiredWaitlistOffers } from '@/lib/booking/process-expired-waitlist-offers';

/**
 * GET/POST /api/cron/expire-waitlist-offers
 * Expires notify_in_order waitlist offers after 30 minutes and notifies the next guest.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const denied = requireCronAuthorisation(request);
  if (denied) return denied;

  try {
    const admin = getSupabaseAdminClient();
    const results = await processExpiredWaitlistOffers(admin);
    const outcome = await finalizeCronRun({
      job: 'expire-waitlist-offers',
      results: {
        scanned: results.scanned,
        expired: results.expired,
        cascaded: results.cascaded,
        filled: results.filled,
      },
      errors: results.errors,
    });
    return NextResponse.json(outcome.body, { status: outcome.httpStatus });
  } catch (err) {
    console.error('[cron/expire-waitlist-offers] failed:', err);
    const outcome = await finalizeCronRun({
      job: 'expire-waitlist-offers',
      results: {},
      errors: 1,
    });
    return NextResponse.json(outcome.body, { status: outcome.httpStatus });
  }
}
