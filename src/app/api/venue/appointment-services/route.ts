import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const serviceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  duration_minutes: z.number().int().min(5).max(480),
  buffer_minutes: z.number().int().min(0).max(120).optional(),
  price_pence: z.number().int().min(0).optional(),
  deposit_pence: z.number().int().min(0).optional(),
  colour: z.string().max(20).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

/** GET /api/venue/appointment-services — list appointment services for the venue. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const [servicesRes, linksRes] = await Promise.all([
      admin
        .from('appointment_services')
        .select('*')
        .eq('venue_id', staff.venue_id)
        .order('sort_order', { ascending: true }),
      admin
        .from('practitioner_services')
        .select('*, practitioner:practitioners!inner(venue_id)')
        .eq('practitioner.venue_id', staff.venue_id),
    ]);

    if (servicesRes.error) {
      console.error('GET /api/venue/appointment-services failed:', servicesRes.error);
      return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
    }

    return NextResponse.json({
      services: servicesRes.data,
      practitioner_services: linksRes.data ?? [],
    });
  } catch (err) {
    console.error('GET /api/venue/appointment-services failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/appointment-services — create an appointment service (admin only). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = serviceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('appointment_services')
      .insert({ venue_id: staff.venue_id, ...parsed.data })
      .select()
      .single();

    if (error) {
      console.error('POST /api/venue/appointment-services failed:', error);
      return NextResponse.json({ error: 'Failed to create service' }, { status: 500 });
    }

    // Link to practitioners if provided
    const practitioner_ids: string[] = body.practitioner_ids ?? [];
    if (practitioner_ids.length > 0) {
      const links = practitioner_ids.map((pid: string) => ({
        practitioner_id: pid,
        service_id: data.id,
      }));
      await admin.from('practitioner_services').insert(links);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/appointment-services failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/appointment-services — update a service (admin only). */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const { id, practitioner_ids, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const parsed = serviceSchema.partial().safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('appointment_services')
      .update(parsed.data)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select()
      .single();

    if (error) {
      console.error('PATCH /api/venue/appointment-services failed:', error);
      return NextResponse.json({ error: 'Failed to update service' }, { status: 500 });
    }

    // Re-sync practitioner links if provided
    if (Array.isArray(practitioner_ids)) {
      await admin.from('practitioner_services').delete().eq('service_id', id);
      if (practitioner_ids.length > 0) {
        const links = practitioner_ids.map((pid: string) => ({
          practitioner_id: pid,
          service_id: id,
        }));
        await admin.from('practitioner_services').insert(links);
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('PATCH /api/venue/appointment-services failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/appointment-services — delete a service (admin only). */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { error } = await admin
      .from('appointment_services')
      .delete()
      .eq('id', id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('DELETE /api/venue/appointment-services failed:', error);
      return NextResponse.json({ error: 'Failed to delete service' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/appointment-services failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
