import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * GET /api/account/courses — course enrollments for the signed-in user.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createRouteHandlerClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data: enrollments, error: eErr } = await admin
      .from('class_course_enrollments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (eErr) {
      console.error('[account/courses] enrollments', eErr);
      return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
    }

    const rows = enrollments ?? [];
    const productIds = [...new Set(rows.map((r: { course_product_id: string }) => r.course_product_id))];
    const venueIds = [...new Set(rows.map((r: { venue_id: string }) => r.venue_id))];

    const [{ data: products }, { data: venues }] = await Promise.all([
      productIds.length
        ? admin.from('class_course_products').select('id, name, venue_id, price_pence').in('id', productIds)
        : Promise.resolve({ data: [] as unknown[] }),
      venueIds.length ? admin.from('venues').select('id, name').in('id', venueIds) : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const { data: catalogCourses, error: catErr } = await admin
      .from('class_course_products')
      .select('id, name, venue_id, price_pence, currency')
      .eq('active', true)
      .order('name', { ascending: true })
      .limit(200);

    if (catErr) {
      console.error('[account/courses] catalog', catErr);
    }

    const cRows = (catalogCourses ?? []) as Array<{ venue_id: string }>;
    const catalogVenueIds = [...new Set(cRows.map((r) => r.venue_id))];
    const { data: catalogVenues } =
      catalogVenueIds.length > 0
        ? await admin.from('venues').select('id, name').in('id', catalogVenueIds).order('name')
        : { data: [] as unknown[] };

    return NextResponse.json({
      enrollments: rows,
      products: products ?? [],
      venues: venues ?? [],
      purchase_catalog: {
        venues: catalogVenues ?? [],
        courses: catalogCourses ?? [],
      },
    });
  } catch (e) {
    console.error('[account/courses] GET', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
