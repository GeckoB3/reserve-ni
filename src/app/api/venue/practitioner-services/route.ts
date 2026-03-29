import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { PractitionerService } from '@/types/booking-models';
import { z } from 'zod';

const syncSchema = z.object({
  practitioner_id: z.string().uuid(),
  service_ids: z.array(z.string().uuid()),
});

/**
 * PUT /api/venue/practitioner-services
 * Replaces all service links for a practitioner with the provided set.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await request.json();
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { practitioner_id, service_ids } = parsed.data;
    const admin = getSupabaseAdminClient();

    const { data: prac } = await admin
      .from('practitioners')
      .select('id, staff_id')
      .eq('id', practitioner_id)
      .eq('venue_id', staff.venue_id)
      .single();

    if (!prac) {
      return NextResponse.json({ error: 'Practitioner not found' }, { status: 404 });
    }

    if (staff.role !== 'admin') {
      if (prac.staff_id !== staff.id) {
        return NextResponse.json(
          { error: 'You can only update service links for your own calendar.' },
          { status: 403 },
        );
      }
    }

    const { data: existingRows } = await admin
      .from('practitioner_services')
      .select('*')
      .eq('practitioner_id', practitioner_id);

    const preserve = new Map(
      (existingRows ?? []).map((r: PractitionerService) => [r.service_id, r]),
    );

    await admin.from('practitioner_services').delete().eq('practitioner_id', practitioner_id);

    if (service_ids.length > 0) {
      const links = service_ids.map((sid) => {
        const prev = preserve.get(sid);
        return {
          practitioner_id,
          service_id: sid,
          custom_price_pence: prev?.custom_price_pence ?? null,
          custom_duration_minutes: prev?.custom_duration_minutes ?? null,
          custom_name: prev?.custom_name ?? null,
          custom_description: prev?.custom_description ?? null,
          custom_buffer_minutes: prev?.custom_buffer_minutes ?? null,
          custom_deposit_pence: prev?.custom_deposit_pence ?? null,
          custom_colour: prev?.custom_colour ?? null,
        };
      });
      const { error } = await admin.from('practitioner_services').insert(links);
      if (error) {
        console.error('PUT /api/venue/practitioner-services insert failed:', error);
        return NextResponse.json({ error: 'Failed to save service links' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/venue/practitioner-services failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
