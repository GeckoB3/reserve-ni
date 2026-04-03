import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { z } from 'zod';

const templateOverrideSchema = z.object({
  communication_templates: z.record(
    z.string(),
    z.object({
      subject: z.string().max(500).optional(),
      body: z.string().max(5000).optional(),
    })
  ),
});

/** PATCH /api/venue/communication-templates - save per-venue template overrides. */
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

    const body = await request.json();
    const parsed = templateOverrideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { data: venue, error } = await staff.db
      .from('venues')
      .update({
        communication_templates: parsed.data.communication_templates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', staff.venue_id)
      .select('communication_templates')
      .single();

    if (error) {
      console.error('PATCH /api/venue/communication-templates failed:', error);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ communication_templates: venue.communication_templates });
  } catch (err) {
    console.error('PATCH /api/venue/communication-templates failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
