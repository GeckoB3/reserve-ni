import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * GET /api/debug-staff
 * Temporary diagnostic endpoint — remove after debugging.
 * Tests: auth, admin client, staff lookup, enum values, guest insert, booking insert.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr) return NextResponse.json({ step: 'auth', error: authErr.message });
    if (!user) return NextResponse.json({ step: 'auth', error: 'No user session' });

    const email = user.email ?? '';
    const normalised = email.toLowerCase().trim();

    let admin;
    try {
      admin = getSupabaseAdminClient();
    } catch (e) {
      return NextResponse.json({ step: 'admin_client', error: e instanceof Error ? e.message : 'unknown' });
    }

    const { data: matchedStaff, error: matchErr } = await admin
      .from('staff')
      .select('id, email, venue_id, role')
      .ilike('email', normalised)
      .limit(5);

    const venueId = matchedStaff?.[0]?.venue_id;

    const { data: enumRows, error: enumErr } = await admin.rpc('sql', undefined).select('*');
    let enumValues: string[] = [];
    let enumError: string | null = enumErr?.message ?? null;
    try {
      const { data: ev, error: evErr } = await admin
        .from('bookings')
        .select('id')
        .eq('source', 'booking_page')
        .limit(0);
      if (evErr) {
        enumError = evErr.message;
      } else {
        enumValues.push('booking_page: OK');
      }
    } catch (e) {
      enumError = e instanceof Error ? e.message : 'unknown';
    }

    let guestTest: { ok: boolean; error?: string } = { ok: false };
    if (venueId) {
      const { data: g, error: gErr } = await admin
        .from('guests')
        .select('id')
        .eq('venue_id', venueId)
        .limit(1);
      guestTest = { ok: !gErr, error: gErr?.message };
    }

    let bookingInsertTest: { ok: boolean; error?: string } = { ok: false };
    if (venueId) {
      const { data: testGuest } = await admin
        .from('guests')
        .insert({ venue_id: venueId, name: '__test__', phone: '+440000000000', visit_count: 0 })
        .select('id')
        .single();

      if (testGuest) {
        const { error: bErr } = await admin
          .from('bookings')
          .insert({
            venue_id: venueId,
            guest_id: testGuest.id,
            booking_date: '2099-01-01',
            booking_time: '19:00:00',
            party_size: 2,
            status: 'Confirmed',
            source: 'booking_page',
            deposit_status: 'Not Required',
          })
          .select('id')
          .single();

        if (bErr) {
          bookingInsertTest = { ok: false, error: bErr.message };
        } else {
          bookingInsertTest = { ok: true };
        }

        await admin.from('bookings').delete().eq('venue_id', venueId).eq('booking_date', '2099-01-01');
        await admin.from('guests').delete().eq('id', testGuest.id);
      }
    }

    const hasSendgrid = !!process.env.SENDGRID_API_KEY;
    const hasTwilio = !!process.env.TWILIO_ACCOUNT_SID;

    return NextResponse.json({
      auth_user_email: email,
      staff: {
        count: matchedStaff?.length ?? 0,
        error: matchErr?.message ?? null,
        venue_id: venueId ?? null,
      },
      booking_source_enum_test: { values: enumValues, error: enumError },
      guest_table_access: guestTest,
      booking_insert_test: bookingInsertTest,
      comms: { sendgrid_configured: hasSendgrid, twilio_configured: hasTwilio },
    });
  } catch (err) {
    return NextResponse.json({ step: 'unexpected', error: err instanceof Error ? err.message : 'unknown' });
  }
}
