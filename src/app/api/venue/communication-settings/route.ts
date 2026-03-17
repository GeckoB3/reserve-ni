import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { clearSettingsCache } from '@/lib/communications/service';

/**
 * GET /api/venue/communication-settings
 * Returns the communication settings for the authenticated venue.
 * Auto-creates a default row if none exists.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();

    let { data, error } = await admin
      .from('communication_settings')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (error) {
      console.error('[comm-settings GET] query error:', error);
      return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
    }

    if (!data) {
      const { data: created, error: insertErr } = await admin
        .from('communication_settings')
        .insert({ venue_id: staff.venue_id })
        .select('*')
        .single();

      if (insertErr) {
        console.error('[comm-settings GET] insert error:', insertErr);
        return NextResponse.json({ error: 'Failed to create default settings' }, { status: 500 });
      }
      data = created;
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[comm-settings GET] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const ALLOWED_FIELDS = new Set([
  'confirmation_email_enabled',
  'confirmation_email_custom_message',
  'deposit_sms_enabled',
  'deposit_sms_custom_message',
  'deposit_confirmation_email_enabled',
  'deposit_confirmation_email_custom_message',
  'reminder_email_enabled',
  'reminder_email_custom_message',
  'reminder_hours_before',
  'day_of_reminder_enabled',
  'day_of_reminder_time',
  'day_of_reminder_sms_enabled',
  'day_of_reminder_email_enabled',
  'day_of_reminder_custom_message',
  'post_visit_email_enabled',
  'post_visit_email_time',
  'post_visit_email_custom_message',
  'modification_email_enabled',
  'modification_sms_enabled',
  'modification_custom_message',
]);

/**
 * PUT /api/venue/communication-settings
 * Partial update of communication settings. Admin only.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_FIELDS.has(key)) {
        patch[key] = value;
      }
    }

    const admin = getSupabaseAdminClient();

    const { data: existing } = await admin
      .from('communication_settings')
      .select('id')
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    let data;
    if (existing) {
      const { data: updated, error: updErr } = await admin
        .from('communication_settings')
        .update(patch)
        .eq('venue_id', staff.venue_id)
        .select('*')
        .single();
      if (updErr) {
        console.error('[comm-settings PUT] update error:', updErr);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
      }
      data = updated;
    } else {
      const { data: created, error: insErr } = await admin
        .from('communication_settings')
        .insert({ venue_id: staff.venue_id, ...patch })
        .select('*')
        .single();
      if (insErr) {
        console.error('[comm-settings PUT] insert error:', insErr);
        return NextResponse.json({ error: 'Failed to create settings' }, { status: 500 });
      }
      data = created;
    }

    clearSettingsCache(staff.venue_id);

    return NextResponse.json(data);
  } catch (err) {
    console.error('[comm-settings PUT] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
