import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { orchestrateClassCartCheckout } from '@/lib/class-commerce/orchestrate-class-cart-checkout';

const bodySchema = z.object({
  venue_id: z.string().uuid(),
  lines: z.array(
    z.object({
      class_instance_id: z.string().uuid(),
      party_size: z.number().int().min(1).max(50),
    }),
  ),
  pay_with_class_credits: z.boolean().optional(),
});

/**
 * POST /api/booking/class-cart/checkout — authenticated; creates class_session rows
 * linked by `group_booking_id`. Free-only carts complete immediately; paid carts
 * return a Stripe Elements `client_secret` on the venue connected account.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    const { data: profile } = await admin
      .from('user_profiles')
      .select('display_name, first_name, last_name')
      .eq('id', user.id)
      .maybeSingle();

    const prof = profile as { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
    const displayName =
      prof?.display_name?.trim() ||
      [prof?.first_name, prof?.last_name].filter(Boolean).join(' ').trim() ||
      user.email.split('@')[0] ||
      'Guest';

    const result = await orchestrateClassCartCheckout(admin, {
      venueId: parsed.data.venue_id,
      lines: parsed.data.lines,
      userId: user.id,
      userEmail: user.email,
      displayName,
      payWithClassCredits: parsed.data.pay_with_class_credits === true,
    });

    if (!result.ok) {
      const status = result.status;
      if (result.quote) {
        return NextResponse.json({ error: result.error, quote: result.quote }, { status });
      }
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.body);
  } catch (e) {
    console.error('[class-cart/checkout]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
