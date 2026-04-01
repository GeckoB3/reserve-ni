import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const staffMaySchema = {
  staff_may_customize_name: z.boolean().optional(),
  staff_may_customize_description: z.boolean().optional(),
  staff_may_customize_duration: z.boolean().optional(),
  staff_may_customize_buffer: z.boolean().optional(),
  staff_may_customize_price: z.boolean().optional(),
  staff_may_customize_deposit: z.boolean().optional(),
  staff_may_customize_colour: z.boolean().optional(),
};

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
  ...staffMaySchema,
});

const DEFAULT_STAFF_MAY = {
  staff_may_customize_name: false,
  staff_may_customize_description: false,
  staff_may_customize_duration: false,
  staff_may_customize_buffer: false,
  staff_may_customize_price: false,
  staff_may_customize_deposit: false,
  staff_may_customize_colour: false,
};

function mapServiceItemRowForDashboard(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    colour: row.colour ?? '#3B82F6',
    ...DEFAULT_STAFF_MAY,
  };
}

async function getVenueBookingModel(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  venueId: string,
): Promise<string> {
  const { data } = await admin.from('venues').select('booking_model').eq('id', venueId).maybeSingle();
  return ((data as { booking_model?: string } | null)?.booking_model as string) ?? '';
}

/** GET /api/venue/appointment-services — list appointment services for the venue. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const bookingModel = await getVenueBookingModel(admin, staff.venue_id);

    if (bookingModel === 'unified_scheduling') {
      const [servicesRes, calRes] = await Promise.all([
        admin
          .from('service_items')
          .select('*')
          .eq('venue_id', staff.venue_id)
          .order('sort_order', { ascending: true }),
        admin.from('unified_calendars').select('id').eq('venue_id', staff.venue_id),
      ]);

      if (servicesRes.error) {
        console.error('GET /api/venue/appointment-services (service_items) failed:', servicesRes.error);
        return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
      }

      const calIds = (calRes.data ?? []).map((c) => c.id as string);
      const linksRes =
        calIds.length > 0
          ? await admin.from('calendar_service_assignments').select('*').in('calendar_id', calIds)
          : { data: [] as Record<string, unknown>[], error: null };

      if (linksRes.error) {
        console.error('GET /api/venue/appointment-services calendar_service_assignments failed:', linksRes.error);
        return NextResponse.json({ error: 'Failed to fetch service links' }, { status: 500 });
      }

      const practitioner_services = (linksRes.data ?? []).map((r) => {
        const row = r as {
          id: string;
          calendar_id: string;
          service_item_id: string;
          custom_duration_minutes: number | null;
          custom_price_pence: number | null;
        };
        return {
          id: row.id,
          practitioner_id: row.calendar_id,
          service_id: row.service_item_id,
          custom_duration_minutes: row.custom_duration_minutes,
          custom_price_pence: row.custom_price_pence,
          custom_name: null,
          custom_description: null,
          custom_buffer_minutes: null,
          custom_deposit_pence: null,
          custom_colour: null,
        };
      });

      const services = (servicesRes.data ?? []).map((s) => mapServiceItemRowForDashboard(s as Record<string, unknown>));

      return NextResponse.json({
        services,
        practitioner_services,
      });
    }

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
    if (linksRes.error) {
      console.error('GET /api/venue/appointment-services practitioner_services failed:', linksRes.error);
      return NextResponse.json({ error: 'Failed to fetch service links' }, { status: 500 });
    }

    const practitioner_services = linksRes.data ?? [];

    return NextResponse.json({
      services: servicesRes.data,
      practitioner_services,
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
    const bookingModel = await getVenueBookingModel(admin, staff.venue_id);

    if (bookingModel === 'unified_scheduling') {
      const insertRow = {
        venue_id: staff.venue_id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        item_type: 'service' as const,
        duration_minutes: parsed.data.duration_minutes,
        buffer_minutes: parsed.data.buffer_minutes ?? 0,
        processing_time_minutes: 0,
        price_pence: parsed.data.price_pence ?? null,
        deposit_pence: parsed.data.deposit_pence ?? null,
        price_type: 'fixed' as const,
        colour: parsed.data.colour ?? '#3B82F6',
        is_active: parsed.data.is_active ?? true,
        sort_order: parsed.data.sort_order ?? 0,
      };
      const { data, error } = await admin.from('service_items').insert(insertRow).select().single();

      if (error) {
        console.error('POST /api/venue/appointment-services (service_items) failed:', error);
        return NextResponse.json({ error: 'Failed to create service' }, { status: 500 });
      }

      const practitioner_ids: string[] = body.practitioner_ids ?? [];
      if (practitioner_ids.length > 0) {
        const links = practitioner_ids.map((calendarId: string) => ({
          calendar_id: calendarId,
          service_item_id: data.id as string,
        }));
        const { error: linkErr } = await admin.from('calendar_service_assignments').insert(links);
        if (linkErr) {
          console.error('POST /api/venue/appointment-services calendar_service_assignments failed:', linkErr);
          await admin.from('service_items').delete().eq('id', data.id).eq('venue_id', staff.venue_id);
          return NextResponse.json({ error: 'Failed to link service to calendars' }, { status: 500 });
        }
      }

      return NextResponse.json(mapServiceItemRowForDashboard(data as Record<string, unknown>), { status: 201 });
    }

    const insertRow = {
      venue_id: staff.venue_id,
      ...parsed.data,
      buffer_minutes: parsed.data.buffer_minutes ?? 0,
    };
    const { data, error } = await admin.from('appointment_services').insert(insertRow).select().single();

    if (error) {
      console.error('POST /api/venue/appointment-services failed:', error);
      return NextResponse.json({ error: 'Failed to create service' }, { status: 500 });
    }

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
    const bookingModel = await getVenueBookingModel(admin, staff.venue_id);

    if (bookingModel === 'unified_scheduling') {
      const updatePayload: Record<string, unknown> = { ...parsed.data };
      delete updatePayload.staff_may_customize_name;
      delete updatePayload.staff_may_customize_description;
      delete updatePayload.staff_may_customize_duration;
      delete updatePayload.staff_may_customize_buffer;
      delete updatePayload.staff_may_customize_price;
      delete updatePayload.staff_may_customize_deposit;
      delete updatePayload.staff_may_customize_colour;

      const { data, error } = await admin
        .from('service_items')
        .update(updatePayload)
        .eq('id', id)
        .eq('venue_id', staff.venue_id)
        .select()
        .single();

      if (error) {
        console.error('PATCH /api/venue/appointment-services (service_items) failed:', error);
        return NextResponse.json({ error: 'Failed to update service' }, { status: 500 });
      }

      if (Array.isArray(practitioner_ids)) {
        await admin.from('calendar_service_assignments').delete().eq('service_item_id', id);
        if (practitioner_ids.length > 0) {
          const links = practitioner_ids.map((calendarId: string) => ({
            calendar_id: calendarId,
            service_item_id: id,
          }));
          const { error: linkErr } = await admin.from('calendar_service_assignments').insert(links);
          if (linkErr) {
            console.error('PATCH /api/venue/appointment-services calendar_service_assignments failed:', linkErr);
            return NextResponse.json({ error: 'Failed to update service links' }, { status: 500 });
          }
        }
      }

      return NextResponse.json(mapServiceItemRowForDashboard(data as Record<string, unknown>));
    }

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
    const bookingModel = await getVenueBookingModel(admin, staff.venue_id);

    const table = bookingModel === 'unified_scheduling' ? 'service_items' : 'appointment_services';
    const { error } = await admin.from(table).delete().eq('id', id).eq('venue_id', staff.venue_id);

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
