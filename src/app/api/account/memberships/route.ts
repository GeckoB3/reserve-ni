import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

/** GET /api/account/memberships */
export async function GET(request: Request) {
  try {
    const supabase = await createRouteHandlerClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data: memberships, error: mErr } = await admin
      .from('class_memberships')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (mErr) {
      console.error('[account/memberships]', mErr);
      return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
    }

    const rows = memberships ?? [];
    const productIds = [...new Set(rows.map((r: { product_id: string }) => r.product_id))];
    const venueIds = [...new Set(rows.map((r: { venue_id: string }) => r.venue_id))];

    const [{ data: products }, { data: venues }] = await Promise.all([
      productIds.length
        ? admin.from('class_membership_products').select('id, name, venue_id, rules').in('id', productIds)
        : Promise.resolve({ data: [] as unknown[] }),
      venueIds.length ? admin.from('venues').select('id, name').in('id', venueIds) : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const { data: catalogProducts, error: catErr } = await admin
      .from('class_membership_products')
      .select('id, name, venue_id, currency, stripe_price_id')
      .eq('active', true)
      .not('stripe_price_id', 'is', null)
      .order('name', { ascending: true })
      .limit(200);

    if (catErr) {
      console.error('[account/memberships] catalog', catErr);
    }

    const pRows = (catalogProducts ?? []) as Array<{ venue_id: string }>;
    const catalogVenueIds = [...new Set(pRows.map((r) => r.venue_id))];
    const { data: catalogVenues } =
      catalogVenueIds.length > 0
        ? await admin.from('venues').select('id, name').in('id', catalogVenueIds).order('name')
        : { data: [] as unknown[] };

    return NextResponse.json({
      memberships: rows,
      products: products ?? [],
      venues: venues ?? [],
      purchase_catalog: {
        venues: catalogVenues ?? [],
        products: catalogProducts ?? [],
      },
    });
  } catch (e) {
    console.error('[account/memberships] GET', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
