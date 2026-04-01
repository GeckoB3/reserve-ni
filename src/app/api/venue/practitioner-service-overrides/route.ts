import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';
import type { AppointmentService } from '@/types/booking-models';

const patchSchema = z.object({
  service_id: z.string().uuid(),
  custom_name: z.union([z.string().min(1).max(200), z.null()]).optional(),
  custom_description: z.union([z.string().max(2000), z.null()]).optional(),
  custom_duration_minutes: z.union([z.number().int().min(5).max(480), z.null()]).optional(),
  custom_buffer_minutes: z.union([z.number().int().min(0).max(120), z.null()]).optional(),
  custom_price_pence: z.union([z.number().int().min(0), z.null()]).optional(),
  custom_deposit_pence: z.union([z.number().int().min(0), z.null()]).optional(),
  custom_colour: z.union([z.string().max(20), z.null()]).optional(),
});

const OVERRIDE_TO_PERMISSION: Record<
  string,
  keyof Pick<
    AppointmentService,
    | 'staff_may_customize_name'
    | 'staff_may_customize_description'
    | 'staff_may_customize_duration'
    | 'staff_may_customize_buffer'
    | 'staff_may_customize_price'
    | 'staff_may_customize_deposit'
    | 'staff_may_customize_colour'
  >
> = {
  custom_name: 'staff_may_customize_name',
  custom_description: 'staff_may_customize_description',
  custom_duration_minutes: 'staff_may_customize_duration',
  custom_buffer_minutes: 'staff_may_customize_buffer',
  custom_price_pence: 'staff_may_customize_price',
  custom_deposit_pence: 'staff_may_customize_deposit',
  custom_colour: 'staff_may_customize_colour',
};

async function practitionerOffersService(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  practitionerId: string,
  serviceId: string,
): Promise<boolean> {
  const { data: links, error } = await admin
    .from('practitioner_services')
    .select('service_id')
    .eq('practitioner_id', practitionerId);
  if (error) {
    console.error('practitionerOffersService:', error.message);
    return false;
  }
  const list = links ?? [];
  if (list.length === 0) return true;
  return list.some((l: { service_id: string }) => l.service_id === serviceId);
}

async function calendarOffersServiceItem(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  calendarId: string,
  serviceItemId: string,
): Promise<boolean> {
  const { data: links, error } = await admin
    .from('calendar_service_assignments')
    .select('service_item_id')
    .eq('calendar_id', calendarId);
  if (error) {
    console.error('calendarOffersServiceItem:', error.message);
    return false;
  }
  const list = links ?? [];
  if (list.length === 0) return true;
  return list.some((l: { service_item_id: string }) => l.service_item_id === serviceItemId);
}

/**
 * PATCH — staff only. Upsert per-practitioner overrides for one service (price, duration, etc.)
 * when the venue admin has enabled the matching staff_may_customize_* flags on the service.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (staff.role === 'admin') {
      return NextResponse.json(
        { error: 'Use the Services page or admin tools to edit venue-wide settings.' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { service_id, ...rawPatch } = parsed.data;
    const admin = getSupabaseAdminClient();

    const { data: venue } = await admin.from('venues').select('booking_model').eq('id', staff.venue_id).maybeSingle();
    const bookingModel = (venue as { booking_model?: string } | null)?.booking_model ?? '';

    if (bookingModel === 'unified_scheduling') {
      const { data: mine, error: mineErr } = await admin
        .from('unified_calendars')
        .select('id')
        .eq('venue_id', staff.venue_id)
        .eq('staff_id', staff.id)
        .maybeSingle();

      if (mineErr || !mine?.id) {
        return NextResponse.json({ error: 'No calendar linked to your account' }, { status: 403 });
      }

      const calendarId = mine.id;

      const offers = await calendarOffersServiceItem(admin, calendarId, service_id);
      if (!offers) {
        return NextResponse.json({ error: 'This service is not offered on your calendar' }, { status: 400 });
      }

      const { data: svc, error: svcErr } = await admin
        .from('service_items')
        .select('id')
        .eq('id', service_id)
        .eq('venue_id', staff.venue_id)
        .maybeSingle();

      if (svcErr || !svc) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404 });
      }

      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawPatch)) {
        if (value === undefined) continue;
        if (key !== 'custom_duration_minutes' && key !== 'custom_price_pence') continue;
        updates[key] = value;
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          { error: 'No valid fields to update (unified scheduling supports duration and price overrides only).' },
          { status: 400 },
        );
      }

      const { data: existing, error: exErr } = await admin
        .from('calendar_service_assignments')
        .select('id')
        .eq('calendar_id', calendarId)
        .eq('service_item_id', service_id)
        .maybeSingle();

      if (exErr) {
        console.error('PATCH practitioner-service-overrides (USE) lookup:', exErr);
        return NextResponse.json({ error: 'Failed to load link' }, { status: 500 });
      }

      const useUpdates: Record<string, unknown> = {};
      if (updates.custom_duration_minutes !== undefined) {
        useUpdates.custom_duration_minutes = updates.custom_duration_minutes;
      }
      if (updates.custom_price_pence !== undefined) {
        useUpdates.custom_price_pence = updates.custom_price_pence;
      }

      if (existing?.id) {
        const { error: upErr } = await admin
          .from('calendar_service_assignments')
          .update(useUpdates)
          .eq('id', existing.id);
        if (upErr) {
          console.error('PATCH practitioner-service-overrides (USE) update:', upErr);
          return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
        }
      } else {
        const { error: insErr } = await admin.from('calendar_service_assignments').insert({
          calendar_id: calendarId,
          service_item_id: service_id,
          ...useUpdates,
        });
        if (insErr) {
          console.error('PATCH practitioner-service-overrides (USE) insert:', insErr);
          return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
        }
      }

      return NextResponse.json({ success: true });
    }

    const { data: mine, error: mineErr } = await admin
      .from('practitioners')
      .select('id')
      .eq('venue_id', staff.venue_id)
      .eq('staff_id', staff.id)
      .maybeSingle();

    if (mineErr || !mine?.id) {
      return NextResponse.json({ error: 'No calendar linked to your account' }, { status: 403 });
    }

    const practitionerId = mine.id;

    const offers = await practitionerOffersService(admin, practitionerId, service_id);
    if (!offers) {
      return NextResponse.json({ error: 'This service is not offered on your calendar' }, { status: 400 });
    }

    const { data: svc, error: svcErr } = await admin
      .from('appointment_services')
      .select('*')
      .eq('id', service_id)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (svcErr || !svc) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const service = svc as AppointmentService;

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawPatch)) {
      if (value === undefined) continue;
      const perm = OVERRIDE_TO_PERMISSION[key];
      if (!perm) continue;
      if (!Boolean(service[perm])) {
        return NextResponse.json(
          { error: `You are not allowed to customise this field for this service (${key}).` },
          { status: 403 },
        );
      }
      updates[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: existing, error: exErr } = await admin
      .from('practitioner_services')
      .select('id')
      .eq('practitioner_id', practitionerId)
      .eq('service_id', service_id)
      .maybeSingle();

    if (exErr) {
      console.error('PATCH practitioner-service-overrides lookup:', exErr);
      return NextResponse.json({ error: 'Failed to load link' }, { status: 500 });
    }

    if (existing?.id) {
      const { error: upErr } = await admin
        .from('practitioner_services')
        .update(updates)
        .eq('id', existing.id);
      if (upErr) {
        console.error('PATCH practitioner-service-overrides update:', upErr);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
      }
    } else {
      const { error: insErr } = await admin.from('practitioner_services').insert({
        practitioner_id: practitionerId,
        service_id,
        ...updates,
      });
      if (insErr) {
        console.error('PATCH practitioner-service-overrides insert:', insErr);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/venue/practitioner-service-overrides failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
