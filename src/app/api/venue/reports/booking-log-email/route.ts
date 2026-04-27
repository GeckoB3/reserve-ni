import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import {
  bookingLogEmailConfigSchema,
  normalizeBookingLogEmailConfig,
} from '@/lib/reports/booking-log-email-config';

const updateSchema = bookingLogEmailConfigSchema.superRefine((value, ctx) => {
  if (!value.enabled) return;
  if (!value.recipient_email?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recipient_email'],
      message: 'Recipient email is required when booking log emails are enabled.',
    });
  }
  if (value.schedule.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['schedule'],
      message: 'Choose at least one send day and time.',
    });
  }
});

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const config = normalizeBookingLogEmailConfig({
      enabled: parsed.data.enabled,
      recipient_email: parsed.data.recipient_email?.trim().toLowerCase() ?? null,
      schedule: parsed.data.schedule
        .map((entry) => ({ day: entry.day, time: entry.time }))
        .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)),
    });

    const { error } = await staff.db
      .from('venues')
      .update({
        daily_booking_log_email_config: config,
        updated_at: new Date().toISOString(),
      })
      .eq('id', staff.venue_id);

    if (error) {
      console.error('[booking-log-email] settings update failed:', error);
      return NextResponse.json({ error: 'Failed to save booking log email settings' }, { status: 500 });
    }

    return NextResponse.json({ config });
  } catch (err) {
    console.error('PATCH /api/venue/reports/booking-log-email failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
