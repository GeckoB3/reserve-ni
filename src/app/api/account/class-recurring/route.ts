import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

const postSchema = z.object({
  venue_id: z.string().uuid(),
  class_type_id: z.string().uuid(),
  rule: z.record(z.string(), z.unknown()).default({}),
  next_materialize_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function defaultNextMaterializeOn(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** GET /api/account/class-recurring */
export async function GET(request: Request) {
  try {
    const supabase = await createRouteHandlerClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('class_recurring_reservations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[account/class-recurring] GET', error);
      return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
    }

    const rows = data ?? [];
    const typeIds = [...new Set(rows.map((r: { class_type_id: string }) => r.class_type_id))];
    const venueIds = [...new Set(rows.map((r: { venue_id: string }) => r.venue_id))];

    const [{ data: types }, { data: venues }] = await Promise.all([
      typeIds.length
        ? admin.from('class_types').select('id, name, venue_id').in('id', typeIds)
        : Promise.resolve({ data: [] as unknown[] }),
      venueIds.length ? admin.from('venues').select('id, name').in('id', venueIds) : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const { data: catalogTypes, error: catErr } = await admin
      .from('class_types')
      .select('id, name, venue_id')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(400);

    if (catErr) {
      console.error('[account/class-recurring] catalog types', catErr);
    }

    const tRows = (catalogTypes ?? []) as Array<{ venue_id: string }>;
    const catalogVenueIds = [...new Set(tRows.map((r) => r.venue_id))];
    const { data: catalogVenues } =
      catalogVenueIds.length > 0
        ? await admin.from('venues').select('id, name').in('id', catalogVenueIds).order('name')
        : { data: [] as unknown[] };

    return NextResponse.json({
      reservations: rows,
      class_types: types ?? [],
      venues: venues ?? [],
      recurring_catalog: {
        venues: catalogVenues ?? [],
        class_types: catalogTypes ?? [],
      },
    });
  } catch (e) {
    console.error('[account/class-recurring] GET', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/** POST /api/account/class-recurring — create a standing rule (materialization via cron). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const json = await request.json().catch(() => ({}));
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { venue_id, class_type_id, rule } = parsed.data;

    const { data: ct, error: ctErr } = await admin
      .from('class_types')
      .select('id')
      .eq('id', class_type_id)
      .eq('venue_id', venue_id)
      .maybeSingle();

    if (ctErr || !ct) {
      return NextResponse.json({ error: 'Class type not found for this venue' }, { status: 404 });
    }

    const { data: created, error: insErr } = await admin
      .from('class_recurring_reservations')
      .insert({
        venue_id,
        user_id: user.id,
        class_type_id,
        rule,
        status: 'active',
        next_materialize_on: parsed.data.next_materialize_on ?? defaultNextMaterializeOn(),
      })
      .select('id')
      .single();

    if (insErr || !created) {
      console.error('[account/class-recurring] POST', insErr);
      return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
    }

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    console.error('[account/class-recurring] POST', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
