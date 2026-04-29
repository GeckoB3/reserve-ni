import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { quoteClassCart } from '@/lib/class-commerce/quote-class-cart';

const bodySchema = z.object({
  venue_id: z.string().uuid(),
  lines: z.array(
    z.object({
      class_instance_id: z.string().uuid(),
      party_size: z.number().int().min(1).max(50),
    }),
  ),
});

/** POST /api/booking/class-cart/quote — public capacity quote for multi-session cart. */
export async function POST(request: NextRequest) {
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const quote = await quoteClassCart(admin, {
      venueId: parsed.data.venue_id,
      lines: parsed.data.lines,
    });

    return NextResponse.json(quote);
  } catch (e) {
    console.error('[class-cart/quote]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
