import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { availabilityConfigSchema } from '@/types/config-schemas';
import type { AvailabilityConfig } from '@/types/availability';

const LEGACY_CONFIG_LOCKED_MESSAGE =
  'Availability is managed under Dashboard → Availability. Remove or deactivate services there to edit legacy settings, or contact support.';

/** PATCH /api/venue/availability-config — update availability_config (admin only). Blocked when any active venue_service exists. */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const admin = getSupabaseAdminClient();
    const { count: activeServiceCount, error: countErr } = await admin
      .from('venue_services')
      .select('*', { count: 'exact', head: true })
      .eq('venue_id', staff.venue_id)
      .eq('is_active', true);

    if (countErr) {
      console.error('PATCH /api/venue/availability-config active service count failed:', countErr);
      return NextResponse.json({ error: 'Failed to verify venue configuration' }, { status: 500 });
    }
    if ((activeServiceCount ?? 0) > 0) {
      return NextResponse.json({ error: LEGACY_CONFIG_LOCKED_MESSAGE }, { status: 403 });
    }

    const body = await request.json();
    const parsed = availabilityConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const availability_config = parsed.data as AvailabilityConfig;

    const { data: venue, error } = await admin
      .from('venues')
      .update({ availability_config, updated_at: new Date().toISOString() })
      .eq('id', staff.venue_id)
      .select('availability_config')
      .single();

    if (error) {
      console.error('PATCH /api/venue/availability-config failed:', error);
      return NextResponse.json({ error: 'Failed to update availability config' }, { status: 500 });
    }

    return NextResponse.json({ availability_config: venue.availability_config });
  } catch (err) {
    console.error('PATCH /api/venue/availability-config failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
