import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getTableAvailabilityGrid } from '@/lib/table-availability';

/**
 * GET /api/venue/tables/availability?date=YYYY-MM-DD&service_id=X
 * Returns full grid data for the timeline grid view.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Valid date (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const serviceId = searchParams.get('service_id');
    let serviceStart: string | undefined;
    let serviceEnd: string | undefined;
    let slotInterval = 15;

    if (serviceId) {
      const { data: service } = await staff.db
        .from('venue_services')
        .select('start_time, end_time')
        .eq('id', serviceId)
        .single();

      if (service) {
        serviceStart = service.start_time;
        serviceEnd = service.end_time;
      }

      const { data: rule } = await staff.db
        .from('service_capacity_rules')
        .select('slot_interval_minutes')
        .eq('service_id', serviceId)
        .is('day_of_week', null)
        .is('time_range_start', null)
        .limit(1)
        .maybeSingle();

      if (rule) slotInterval = rule.slot_interval_minutes;
    }

    const areaId = searchParams.get('area_id');
    const areaUuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const resolvedArea =
      areaId && areaUuidRe.test(areaId) ? areaId : null;

    const grid = await getTableAvailabilityGrid(
      staff.db,
      staff.venue_id,
      date,
      serviceStart,
      serviceEnd,
      slotInterval,
      resolvedArea,
    );

    return NextResponse.json(grid);
  } catch (error) {
    console.error('GET /api/venue/tables/availability failed:', error);
    return NextResponse.json({ error: 'Failed to load table availability' }, { status: 500 });
  }
}
