import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';
import { duplicateVenueServicesToArea } from '@/lib/areas/duplicate-services-to-area';

const createSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  description: z.string().max(500).optional().nullable(),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sort_order: z.number().int().optional(),
  /** When set, copy JSON settings and clone `venue_services` (+ rules) from this area. */
  copy_from_area_id: z.string().uuid().optional(),
});

/** GET /api/venue/areas — list dining areas for the venue. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('areas')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('GET /api/venue/areas:', error.message);
      return NextResponse.json({ error: 'Failed to load areas' }, { status: 500 });
    }

    return NextResponse.json({ areas: data ?? [] });
  } catch (err) {
    console.error('GET /api/venue/areas:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/areas — create a dining area (admin). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { copy_from_area_id, ...fields } = parsed.data;

    let booking_rules: unknown = null;
    let availability_config: unknown = null;
    let communication_templates: unknown = null;
    let deposit_config: unknown = null;

    if (copy_from_area_id) {
      const { data: src, error: srcErr } = await admin
        .from('areas')
        .select('booking_rules, availability_config, communication_templates, deposit_config')
        .eq('id', copy_from_area_id)
        .eq('venue_id', staff.venue_id)
        .maybeSingle();
      if (srcErr || !src) {
        return NextResponse.json({ error: 'Source area not found' }, { status: 404 });
      }
      booking_rules = src.booking_rules;
      availability_config = src.availability_config;
      communication_templates = src.communication_templates;
      deposit_config = src.deposit_config;
    } else {
      const { data: venueRow } = await admin
        .from('venues')
        .select('booking_rules, availability_config, communication_templates, deposit_config')
        .eq('id', staff.venue_id)
        .single();
      if (venueRow) {
        booking_rules = venueRow.booking_rules;
        availability_config = venueRow.availability_config;
        communication_templates = venueRow.communication_templates;
        deposit_config = venueRow.deposit_config;
      }
    }

    const { count } = await admin
      .from('areas')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', staff.venue_id);

    const { data: created, error: insErr } = await admin
      .from('areas')
      .insert({
        venue_id: staff.venue_id,
        name: fields.name,
        description: fields.description ?? null,
        colour: fields.colour ?? '#6366F1',
        sort_order: fields.sort_order ?? (count ?? 0),
        is_active: true,
        booking_rules,
        availability_config,
        communication_templates,
        deposit_config,
      })
      .select('*')
      .single();

    if (insErr || !created) {
      console.error('POST /api/venue/areas:', insErr?.message);
      const code = (insErr as { code?: string } | null)?.code;
      if (code === '23505') {
        return NextResponse.json(
          { error: 'An area with this name already exists. Choose a different name.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: 'Failed to create area' }, { status: 500 });
    }

    const newId = (created as { id: string }).id;

    if (copy_from_area_id) {
      try {
        await duplicateVenueServicesToArea(admin, staff.venue_id, copy_from_area_id, newId);
      } catch (e) {
        console.error('POST /api/venue/areas: duplicate services failed', e);
        await admin.from('areas').delete().eq('id', newId);
        return NextResponse.json({ error: 'Failed to copy services into the new area' }, { status: 500 });
      }
    }

    return NextResponse.json({ area: created }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/areas:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
