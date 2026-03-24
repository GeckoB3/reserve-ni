import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { z } from 'zod';
import { normalizeToE164 } from '@/lib/phone/e164';

const venueProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug: lowercase letters, numbers, hyphens only').optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(24).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  cover_photo_url: z.string().url().max(2000).nullable().optional(),
  cuisine_type: z.string().max(100).optional(),
  price_band: z.string().max(50).optional(),
  no_show_grace_minutes: z.number().int().min(10).max(60).optional(),
  kitchen_email: z.string().email().max(255).optional().or(z.literal('')),
  timezone: z.string().max(50).optional(),
}).refine((data) => Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined).length > 0, { message: 'At least one field required' });

/** GET /api/venue — return the authenticated user's venue profile. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    let venue = null;
    const { data: fullVenue, error } = await staff.db
      .from('venues')
      .select('id, name, slug, address, phone, email, cover_photo_url, cuisine_type, price_band, no_show_grace_minutes, kitchen_email, communication_templates, opening_hours, booking_rules, deposit_config, availability_config, stripe_connected_account_id, timezone')
      .eq('id', staff.venue_id)
      .single();

    if (fullVenue) {
      venue = fullVenue;
    } else {
      const { data: basicVenue } = await staff.db
        .from('venues')
        .select('id, name, slug, address, phone, email, cover_photo_url, opening_hours, booking_rules, deposit_config, availability_config, stripe_connected_account_id, timezone')
        .eq('id', staff.venue_id)
        .single();
      if (basicVenue) {
        venue = { ...basicVenue, cuisine_type: null, price_band: null, no_show_grace_minutes: 15, kitchen_email: null, communication_templates: null };
      }
    }

    if (!venue) {
      console.error('GET /api/venue: venue not found', error?.message);
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    return NextResponse.json({ ...venue, current_user_role: staff.role });
  } catch (err) {
    console.error('GET /api/venue failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue — update venue profile (admin only). */
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
    const parsed = venueProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) update.name = data.name;
    if (data.slug !== undefined) update.slug = data.slug;
    if (data.address !== undefined) update.address = data.address;
    if (data.phone !== undefined) {
      const t = typeof data.phone === 'string' ? data.phone.trim() : '';
      if (!t) {
        update.phone = null;
      } else {
        const e164 = normalizeToE164(t, 'GB');
        if (!e164) {
          return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
        }
        update.phone = e164;
      }
    }
    if (data.email !== undefined) update.email = data.email === '' ? null : data.email;
    if (data.cover_photo_url !== undefined) update.cover_photo_url = data.cover_photo_url;
    if (data.cuisine_type !== undefined) update.cuisine_type = data.cuisine_type;
    if (data.price_band !== undefined) update.price_band = data.price_band;
    if (data.no_show_grace_minutes !== undefined) update.no_show_grace_minutes = data.no_show_grace_minutes;
    if (data.kitchen_email !== undefined) update.kitchen_email = data.kitchen_email === '' ? null : data.kitchen_email;
    if (data.timezone !== undefined) update.timezone = data.timezone;

    const { data: venue, error } = await staff.db
      .from('venues')
      .update(update)
      .eq('id', staff.venue_id)
      .select('id, name, slug, address, phone, email, cover_photo_url, cuisine_type, price_band, no_show_grace_minutes, kitchen_email, timezone')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
      }
      console.error('PATCH /api/venue failed:', error);
      return NextResponse.json({ error: 'Failed to update venue' }, { status: 500 });
    }

    return NextResponse.json(venue);
  } catch (err) {
    console.error('PATCH /api/venue failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
