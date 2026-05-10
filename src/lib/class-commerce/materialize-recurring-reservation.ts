import type { SupabaseClient } from '@supabase/supabase-js';
import { findOrCreateGuest } from '@/lib/guests';
import { insertFreeClassSessionBooking } from '@/lib/booking/insert-free-class-session-booking';
import { splitLegacyGuestName } from '@/lib/guests/name';

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface MaterializeRecurringReservationResult {
  status: 'success' | 'partial' | 'failed' | 'skipped';
  booking_ids: string[];
  /** Next calendar date the cron should consider this rule (always advances). */
  next_materialize_on: string;
  message?: string;
}

/**
 * Creates concrete free class_session bookings for upcoming instances of the reservation's class type.
 * Does not send per-booking guest emails (`skipGuestNotifications`); venue ops should follow up or add digest comms later.
 */
export async function materializeRecurringReservation(
  admin: SupabaseClient,
  reservationId: string,
): Promise<MaterializeRecurringReservationResult> {
  const { data: res, error: rErr } = await admin
    .from('class_recurring_reservations')
    .select('id, venue_id, user_id, class_type_id, status, next_materialize_on')
    .eq('id', reservationId)
    .maybeSingle();

  if (rErr || !res) {
    return { status: 'failed', booking_ids: [], next_materialize_on: addDaysYmd(new Date().toISOString().slice(0, 10), 7), message: 'Reservation not found' };
  }

  const row = res as {
    venue_id: string;
    user_id: string;
    class_type_id: string;
    status: string;
    next_materialize_on: string | null;
  };

  if (row.status !== 'active') {
    return {
      status: 'skipped',
      booking_ids: [],
      next_materialize_on: addDaysYmd(new Date().toISOString().slice(0, 10), 7),
      message: 'Reservation not active',
    };
  }

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(row.user_id);
  const email = authUser.user?.email?.trim().toLowerCase();
  if (authErr || !email) {
    return {
      status: 'failed',
      booking_ids: [],
      next_materialize_on: addDaysYmd(new Date().toISOString().slice(0, 10), 7),
      message: 'Could not resolve user email',
    };
  }

  const { data: profile } = await admin
    .from('user_profiles')
    .select('display_name, first_name, last_name')
    .eq('id', row.user_id)
    .maybeSingle();

  const prof = profile as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
  const displayName =
    prof?.display_name?.trim() ||
    [prof?.first_name, prof?.last_name].filter(Boolean).join(' ').trim() ||
    email.split('@')[0] ||
    'Guest';

  const { data: venue, error: vErr } = await admin
    .from('venues')
    .select('id, name, address, email, reply_to_email, timezone')
    .eq('id', row.venue_id)
    .maybeSingle();

  if (vErr || !venue) {
    return {
      status: 'failed',
      booking_ids: [],
      next_materialize_on: addDaysYmd(new Date().toISOString().slice(0, 10), 7),
      message: 'Venue not found',
    };
  }

  const { data: ctRow, error: ctErr } = await admin
    .from('class_types')
    .select('payment_requirement, price_pence, deposit_amount_pence')
    .eq('id', row.class_type_id)
    .maybeSingle();

  if (ctErr || !ctRow) {
    return {
      status: 'failed',
      booking_ids: [],
      next_materialize_on: addDaysYmd(new Date().toISOString().slice(0, 10), 7),
      message: 'Class type not found',
    };
  }

  const ct = ctRow as {
    payment_requirement?: string;
    price_pence?: number | null;
    deposit_amount_pence?: number | null;
  };
  const payReq = ct.payment_requirement ?? 'none';
  const priceP = ct.price_pence ?? 0;
  const depPer = ct.deposit_amount_pence ?? 0;
  const requiresPaid =
    (payReq === 'full_payment' && priceP > 0) || (payReq === 'deposit' && depPer > 0 && priceP > 0);
  if (requiresPaid) {
    const today = new Date().toISOString().slice(0, 10);
    const fromDateEarly = row.next_materialize_on && row.next_materialize_on >= today ? row.next_materialize_on : today;
    return {
      status: 'skipped',
      booking_ids: [],
      next_materialize_on: addDaysYmd(fromDateEarly, 7),
      message: 'Auto-booking is only supported for classes with no online card charge',
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const fromDate = row.next_materialize_on && row.next_materialize_on >= today ? row.next_materialize_on : today;

  const { data: instances, error: iErr } = await admin
    .from('class_instances')
    .select('id, instance_date, start_time, is_cancelled')
    .eq('class_type_id', row.class_type_id)
    .eq('is_cancelled', false)
    .gte('instance_date', fromDate)
    .order('instance_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(6);

  if (iErr) {
    console.error('[materializeRecurringReservation] instances', iErr);
    return {
      status: 'failed',
      booking_ids: [],
      next_materialize_on: addDaysYmd(fromDate, 7),
      message: 'Failed to load sessions',
    };
  }

  const instList = (instances ?? []) as Array<{ id: string; instance_date: string; start_time: string }>;
  if (instList.length === 0) {
    return {
      status: 'skipped',
      booking_ids: [],
      next_materialize_on: addDaysYmd(fromDate, 7),
      message: 'No upcoming sessions',
    };
  }

  const nameParts = splitLegacyGuestName(displayName);
  const { guest } = await findOrCreateGuest(
    admin,
    row.venue_id,
    {
      first_name: nameParts.first || null,
      last_name: nameParts.last || null,
      email,
      phone: null,
    },
    { silentAuthSignup: true },
  );

  const bookingIds: string[] = [];
  let failures = 0;

  for (const inst of instList) {
    const { data: existing } = await admin
      .from('bookings')
      .select('id')
      .eq('class_instance_id', inst.id)
      .eq('guest_id', guest.id)
      .maybeSingle();

    if (existing) continue;

    const ins = await insertFreeClassSessionBooking({
      admin,
      venueId: row.venue_id,
      venue: venue as Record<string, unknown>,
      guest,
      guestName: displayName,
      guestEmail: email,
      guestPhoneE164: '',
      classInstanceId: inst.id,
      partySize: 1,
      source: 'booking_page',
      groupBookingId: null,
      skipGuestNotifications: true,
    });

    if (ins.ok) {
      bookingIds.push(ins.bookingId);
    } else {
      failures += 1;
      console.warn('[materializeRecurringReservation] insert failed', inst.id, ins.error);
    }
  }

  const lastDate = instList[instList.length - 1]?.instance_date ?? fromDate;
  const nextMaterializeOn = addDaysYmd(lastDate, 7);

  let status: MaterializeRecurringReservationResult['status'];
  if (bookingIds.length > 0 && failures === 0) status = 'success';
  else if (bookingIds.length > 0) status = 'partial';
  else if (failures > 0) status = 'failed';
  else status = 'skipped';

  return {
    status,
    booking_ids: bookingIds,
    next_materialize_on: nextMaterializeOn,
    message:
      bookingIds.length === 0
        ? failures > 0
          ? 'Could not create bookings (capacity or rules)'
          : 'No new bookings needed'
        : undefined,
  };
}
