import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { z } from 'zod';
import { normalizeToE164 } from '@/lib/phone/e164';
import { normaliseGuestTagsInput } from '@/lib/guests/tags';
import { inferBookingRowModel, bookingModelShortLabel } from '@/lib/booking/infer-booking-row-model';

const patchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().max(255).optional().or(z.literal('')),
    phone: z.string().max(24).optional().or(z.literal('')),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined || d.email !== undefined || d.phone !== undefined || d.tags !== undefined,
    { message: 'At least one field required' },
  );

function bookingTimeShort(t: string | null | undefined): string {
  if (!t || typeof t !== 'string') return '';
  return t.slice(0, 5);
}

function partySizeShort(ps: number | null): string {
  if (ps == null || !Number.isFinite(ps)) return '-';
  return String(ps);
}

/**
 * GET /api/venue/guests/[guestId] - guest profile, stats, recent bookings (admin only).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ guestId: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const { guestId } = await params;

    const { data: guest, error: gErr } = await staff.db
      .from('guests')
      .select(
        'id, venue_id, name, email, phone, tags, visit_count, no_show_count, last_visit_date, created_at, updated_at',
      )
      .eq('id', guestId)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (gErr || !guest) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    const { data: statBookings, error: sbErr } = await staff.db
      .from('bookings')
      .select('booking_date, status, deposit_status, deposit_amount_pence')
      .eq('guest_id', guestId)
      .eq('venue_id', staff.venue_id);

    if (sbErr) {
      console.error('GET guest stats failed:', sbErr);
      return NextResponse.json({ error: 'Failed to load guest stats' }, { status: 500 });
    }

    let cancellations = 0;
    let noShows = 0;
    let depositTotalPence = 0;
    let firstVisit: string | null = null;
    let lastVisit: string | null = null;

    for (const b of statBookings ?? []) {
      const row = b as {
        booking_date?: string | null;
        status?: string;
        deposit_status?: string | null;
        deposit_amount_pence?: number | null;
      };
      if (row.status === 'Cancelled') cancellations += 1;
      if (row.status === 'No-Show') noShows += 1;
      if (row.deposit_status === 'Paid' && typeof row.deposit_amount_pence === 'number') {
        depositTotalPence += row.deposit_amount_pence;
      }
      const d = row.booking_date;
      if (d) {
        if (!firstVisit || d < firstVisit) firstVisit = d;
        if (!lastVisit || d > lastVisit) lastVisit = d;
      }
    }

    const { data: recentRaw, error: rbErr } = await staff.db
      .from('bookings')
      .select(
        'id, booking_date, booking_time, party_size, status, deposit_status, practitioner_id, appointment_service_id, calendar_id, service_item_id, experience_event_id, class_instance_id, resource_id, event_session_id',
      )
      .eq('guest_id', guestId)
      .eq('venue_id', staff.venue_id)
      .order('booking_date', { ascending: false })
      .order('booking_time', { ascending: false })
      .limit(20);

    if (rbErr) {
      console.error('GET guest recent bookings failed:', rbErr);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }

    const recent = recentRaw ?? [];
    const practitionerIds = [...new Set(recent.map((r) => r.practitioner_id).filter(Boolean))] as string[];
    const serviceIds = [...new Set(recent.map((r) => r.appointment_service_id).filter(Boolean))] as string[];
    const calendarIds = [...new Set(recent.map((r) => (r as { calendar_id?: string | null }).calendar_id).filter(Boolean))] as string[];
    const serviceItemIds = [...new Set(recent.map((r) => (r as { service_item_id?: string | null }).service_item_id).filter(Boolean))] as string[];
    const eventIds = [...new Set(recent.map((r) => (r as { experience_event_id?: string | null }).experience_event_id).filter(Boolean))] as string[];
    const classInstIds = [...new Set(recent.map((r) => (r as { class_instance_id?: string | null }).class_instance_id).filter(Boolean))] as string[];
    const resourceIds = [...new Set(recent.map((r) => (r as { resource_id?: string | null }).resource_id).filter(Boolean))] as string[];

    const prMap = new Map<string, string>();
    const svcMap = new Map<string, string>();
    const calMap = new Map<string, string>();
    const siMap = new Map<string, string>();
    const evMap = new Map<string, string>();
    const resMap = new Map<string, string>();
    const classLabelMap = new Map<string, string>();

    if (practitionerIds.length > 0) {
      const { data: prs } = await staff.db.from('practitioners').select('id, name').in('id', practitionerIds);
      for (const p of prs ?? []) {
        prMap.set((p as { id: string }).id, (p as { name: string }).name);
      }
    }
    if (serviceIds.length > 0) {
      const { data: svcs } = await staff.db.from('appointment_services').select('id, name').in('id', serviceIds);
      for (const s of svcs ?? []) {
        svcMap.set((s as { id: string }).id, (s as { name: string }).name);
      }
    }
    if (calendarIds.length > 0) {
      const { data: cals } = await staff.db.from('unified_calendars').select('id, name').in('id', calendarIds);
      for (const c of cals ?? []) {
        calMap.set((c as { id: string }).id, (c as { name: string }).name);
      }
    }
    if (serviceItemIds.length > 0) {
      const { data: sis } = await staff.db.from('service_items').select('id, name').in('id', serviceItemIds);
      for (const s of sis ?? []) {
        siMap.set((s as { id: string }).id, (s as { name: string }).name);
      }
    }
    if (eventIds.length > 0) {
      const { data: evs } = await staff.db.from('experience_events').select('id, name').in('id', eventIds);
      for (const e of evs ?? []) {
        evMap.set((e as { id: string }).id, (e as { name: string }).name);
      }
    }
    if (resourceIds.length > 0) {
      const { data: vrs } = await staff.db.from('venue_resources').select('id, name').in('id', resourceIds);
      for (const v of vrs ?? []) {
        resMap.set((v as { id: string }).id, (v as { name: string }).name);
      }
    }
    if (classInstIds.length > 0) {
      const { data: instRows } = await staff.db
        .from('class_instances')
        .select('id, class_type_id')
        .in('id', classInstIds);
      const typeIds = [...new Set((instRows ?? []).map((r) => (r as { class_type_id?: string }).class_type_id).filter(Boolean))] as string[];
      const typeMap = new Map<string, string>();
      if (typeIds.length > 0) {
        const { data: types } = await staff.db.from('class_types').select('id, name').in('id', typeIds);
        for (const t of types ?? []) {
          typeMap.set((t as { id: string }).id, (t as { name: string }).name);
        }
      }
      for (const row of instRows ?? []) {
        const id = (row as { id: string }).id;
        const ct = (row as { class_type_id?: string }).class_type_id;
        classLabelMap.set(id, ct ? typeMap.get(ct) ?? 'Class' : 'Class');
      }
    }

    const booking_history = recent.map((r) => {
      const row = r as {
        id: string;
        booking_date: string;
        booking_time: string;
        party_size: number | null;
        status: string;
        deposit_status: string | null;
        practitioner_id: string | null;
        appointment_service_id: string | null;
        calendar_id?: string | null;
        service_item_id?: string | null;
        experience_event_id?: string | null;
        class_instance_id?: string | null;
        resource_id?: string | null;
        event_session_id?: string | null;
      };
      const model = inferBookingRowModel(row);
      const practitioner_name = row.practitioner_id ? prMap.get(row.practitioner_id) ?? null : null;
      const service_name = row.appointment_service_id ? svcMap.get(row.appointment_service_id) ?? null : null;
      const calendar_name = row.calendar_id ? calMap.get(row.calendar_id) ?? null : null;
      const service_item_name = row.service_item_id ? siMap.get(row.service_item_id) ?? null : null;

      let detail_label = '';
      if (model === 'event_ticket' && row.experience_event_id) {
        detail_label = evMap.get(row.experience_event_id) ?? 'Event';
      } else if (model === 'class_session' && row.class_instance_id) {
        detail_label = classLabelMap.get(row.class_instance_id) ?? 'Class';
      } else if (model === 'resource_booking' && row.resource_id) {
        detail_label = resMap.get(row.resource_id) ?? 'Resource';
      } else if (model === 'unified_scheduling') {
        const parts = [calendar_name, service_item_name].filter(Boolean);
        detail_label = parts.length > 0 ? parts.join(' · ') : 'Appointment';
      } else if (model === 'practitioner_appointment') {
        const parts = [practitioner_name, service_name].filter(Boolean);
        detail_label = parts.length > 0 ? parts.join(' · ') : 'Appointment';
      } else {
        detail_label =
          partySizeShort(row.party_size) === '-' ? 'Table reservation' : `Table · ${partySizeShort(row.party_size)} guests`;
      }

      return {
        id: row.id,
        booking_date: row.booking_date,
        booking_time: bookingTimeShort(row.booking_time),
        party_size: row.party_size,
        status: row.status,
        deposit_status: row.deposit_status,
        booking_model: model,
        kind_label: bookingModelShortLabel(model),
        detail_label,
        practitioner_name,
        service_name,
      };
    });

    const tags = Array.isArray((guest as { tags?: string[] }).tags)
      ? (guest as { tags: string[] }).tags
      : [];

    return NextResponse.json({
      guest: {
        id: guest.id,
        name: guest.name,
        email: guest.email,
        phone: guest.phone,
        tags,
        visit_count: (guest as { visit_count?: number }).visit_count ?? 0,
        no_show_count: (guest as { no_show_count?: number }).no_show_count ?? 0,
        last_visit_date: (guest as { last_visit_date?: string | null }).last_visit_date ?? null,
        created_at: (guest as { created_at?: string }).created_at,
        updated_at: (guest as { updated_at?: string }).updated_at,
      },
      stats: {
        total_bookings: statBookings?.length ?? 0,
        cancellations,
        no_shows: noShows,
        total_deposit_pence_paid: depositTotalPence,
        first_visit_date: firstVisit,
        last_visit_date: lastVisit,
      },
      booking_history,
    });
  } catch (err) {
    console.error('GET /api/venue/guests/[guestId] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/venue/guests/[guestId] - update guest (venue staff).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ guestId: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { guestId } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { data: existing, error: exErr } = await staff.db
      .from('guests')
      .select('id')
      .eq('id', guestId)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (exErr || !existing) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (parsed.data.name !== undefined) {
      update.name = parsed.data.name.trim();
    }
    if (parsed.data.email !== undefined) {
      const e = parsed.data.email.trim();
      update.email = e === '' ? null : e.toLowerCase();
    }
    if (parsed.data.phone !== undefined) {
      const raw = parsed.data.phone.trim();
      if (raw === '') {
        update.phone = null;
      } else {
        const e164 = normalizeToE164(raw);
        if (!e164) {
          return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
        }
        update.phone = e164;
      }
    }
    if (parsed.data.tags !== undefined) {
      update.tags = normaliseGuestTagsInput(parsed.data.tags);
    }

    const dataKeys = Object.keys(update).filter((k) => k !== 'updated_at');
    if (dataKeys.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updated, error: upErr } = await staff.db
      .from('guests')
      .update(update)
      .eq('id', guestId)
      .eq('venue_id', staff.venue_id)
      .select(
        'id, name, email, phone, tags, visit_count, no_show_count, last_visit_date, created_at, updated_at',
      )
      .single();

    if (upErr) {
      console.error('PATCH /api/venue/guests/[guestId] failed:', upErr);
      return NextResponse.json({ error: 'Failed to update guest' }, { status: 500 });
    }

    return NextResponse.json({ guest: updated });
  } catch (err) {
    console.error('PATCH /api/venue/guests/[guestId] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
