import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * GET /api/booking/venue?slug=venue-slug
 * Public: returns venue profile for the booking page (name, cover, slug, deposit_config, booking_rules, id).
 * Does not expose stripe_connected_account_id to client.
 */
export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get('slug');
    if (!slug?.trim()) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: venue, error } = await supabase
      .from('venues')
      .select('id, name, slug, cover_photo_url, address, phone, deposit_config, booking_rules, timezone')
      .eq('slug', slug.trim())
      .single();

    if (error || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    return NextResponse.json(venue);
  } catch (err) {
    console.error('GET /api/booking/venue failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
