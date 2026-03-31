import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';

/** Internal sort keys (DB order). */
const INTERNAL_SORTS = new Set([
  'name_asc',
  'name_desc',
  'last_visit_desc',
  'last_visit_asc',
  'visit_count_desc',
  'created_desc',
]);

/** Public API aliases → internal. */
const SORT_ALIASES: Record<string, string> = {
  last_visit: 'last_visit_desc',
  visit_count: 'visit_count_desc',
  name: 'name_asc',
  created: 'created_desc',
};

const FILTERS = new Set(['all', 'identified', 'anonymous']);

function sanitiseIlikeSearch(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/,/g, '');
}

function resolveSort(raw: string | null): string {
  const s = (raw ?? 'last_visit').trim();
  if (INTERNAL_SORTS.has(s)) return s;
  const mapped = SORT_ALIASES[s];
  if (mapped && INTERNAL_SORTS.has(mapped)) return mapped;
  return 'last_visit_desc';
}

/**
 * GET /api/venue/guests — paginated guest list (admin only).
 * Query: search, tags, sort (last_visit|visit_count|name|created or legacy *_desc), filter (all|identified|anonymous), page (0-based), limit (max 50, default 25).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const searchRaw = sp.get('search')?.trim() ?? '';
    const search = sanitiseIlikeSearch(searchRaw);
    const tagsParam = sp.get('tags')?.trim() ?? '';
    const sort = resolveSort(sp.get('sort'));
    const filterRaw = (sp.get('filter') ?? 'identified').trim().toLowerCase();
    const filter = FILTERS.has(filterRaw) ? filterRaw : 'identified';

    const pageRaw = Number.parseInt(sp.get('page') ?? '0', 10);
    const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? pageRaw : 0;
    const limitRaw = Number.parseInt(sp.get('limit') ?? '25', 10) || 25;
    const limit = Math.min(50, Math.max(1, limitRaw));

    const from = page * limit;
    const to = from + limit - 1;

    let query = staff.db
      .from('guests')
      .select(
        'id, name, email, phone, tags, visit_count, no_show_count, last_visit_date, created_at, identifiability_tier',
        { count: 'exact' },
      )
      .eq('venue_id', staff.venue_id);

    if (filter === 'identified') {
      query = query.eq('identifiability_tier', 'identified');
    } else if (filter === 'anonymous') {
      query = query.eq('identifiability_tier', 'anonymous');
    } else {
      query = query.in('identifiability_tier', ['identified', 'named']);
    }

    const tagFilters = tagsParam
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tagFilters.length) {
      query = query.contains('tags', tagFilters);
    }

    if (search) {
      const p = `%${search}%`;
      query = query.or(`name.ilike.${p},email.ilike.${p},phone.ilike.${p}`);
    }

    switch (sort) {
      case 'name_asc':
        query = query.order('name', { ascending: true, nullsFirst: false });
        break;
      case 'name_desc':
        query = query.order('name', { ascending: false, nullsFirst: false });
        break;
      case 'last_visit_desc':
        query = query.order('last_visit_date', { ascending: false, nullsFirst: true });
        break;
      case 'last_visit_asc':
        query = query.order('last_visit_date', { ascending: true, nullsFirst: true });
        break;
      case 'visit_count_desc':
        query = query.order('visit_count', { ascending: false });
        break;
      case 'created_desc':
        query = query.order('created_at', { ascending: false });
        break;
      default:
        break;
    }

    query = query.order('id', { ascending: true });
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('GET /api/venue/guests failed:', error);
      return NextResponse.json({ error: 'Failed to load guests' }, { status: 500 });
    }

    const rows = data ?? [];
    const ids = rows.map((r) => (r as { id: string }).id);

    const totalBookingsByGuest = new Map<string, number>();
    if (ids.length > 0) {
      const { data: bookingRows, error: bErr } = await staff.db
        .from('bookings')
        .select('guest_id')
        .eq('venue_id', staff.venue_id)
        .neq('status', 'Cancelled')
        .in('guest_id', ids);

      if (bErr) {
        console.error('GET /api/venue/guests booking counts failed:', bErr);
      } else {
        for (const row of bookingRows ?? []) {
          const gid = (row as { guest_id: string }).guest_id;
          totalBookingsByGuest.set(gid, (totalBookingsByGuest.get(gid) ?? 0) + 1);
        }
      }
    }

    const guests = rows.map((g) => {
      const row = g as {
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        tags?: string[];
        visit_count?: number;
        no_show_count?: number;
        last_visit_date?: string | null;
        created_at: string;
        identifiability_tier?: string;
      };
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        tags: Array.isArray(row.tags) ? row.tags : [],
        visit_count: row.visit_count ?? 0,
        no_show_count: row.no_show_count ?? 0,
        last_visit_date: row.last_visit_date ?? null,
        created_at: row.created_at,
        identifiability_tier: row.identifiability_tier ?? 'named',
        total_bookings: totalBookingsByGuest.get(row.id) ?? 0,
      };
    });

    return NextResponse.json({
      guests,
      total: count ?? guests.length,
      page,
      limit,
      total_count: count ?? guests.length,
    });
  } catch (err) {
    console.error('GET /api/venue/guests failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
