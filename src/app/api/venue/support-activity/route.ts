import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';

function formatTimeUk(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/London',
    });
  } catch {
    return iso;
  }
}

function formatDisplayLine(params: {
  superName: string;
  apparentName: string;
  summary: string;
  createdAt: string;
  eventType: string;
}): string {
  const t = formatTimeUk(params.createdAt);
  if (params.eventType === 'api_mutation') {
    return `${params.superName} (acting as ${params.apparentName}) ${params.summary} at ${t}.`;
  }
  if (params.eventType === 'session_started') {
    return `${params.superName} started a support session (acting as ${params.apparentName}) at ${t}.`;
  }
  if (params.eventType === 'session_ended') {
    return `${params.superName} ended the support session at ${t}.`;
  }
  if (params.eventType === 'session_extended') {
    return `${params.superName} extended the support session at ${t}.`;
  }
  return `${params.superName} — ${params.summary} at ${t}.`;
}

/** GET /api/venue/support-activity — venue admin view of support audit for this venue only. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = getSupabaseAdminClient();
    const { data: rows, error } = await admin
      .from('support_audit_events')
      .select(
        `id, venue_id, apparent_staff_id, superuser_email, event_type, summary, created_at, support_session_id`,
      )
      .eq('venue_id', staff.venue_id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[venue/support-activity] query failed:', error.message);
      return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
    }

    const sessionIds = [
      ...new Set(
        (rows ?? [])
          .map((r) => (r as { support_session_id?: string | null }).support_session_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const superNameBySessionId = new Map<string, string>();
    if (sessionIds.length > 0) {
      const { data: sessRows } = await admin
        .from('support_sessions')
        .select('id, superuser_display_name, superuser_email')
        .in('id', sessionIds);
      for (const s of sessRows ?? []) {
        const row = s as { id: string; superuser_display_name?: string | null; superuser_email?: string | null };
        superNameBySessionId.set(
          row.id,
          row.superuser_display_name?.trim() || row.superuser_email?.trim() || 'Reserve NI support',
        );
      }
    }

    const staffIds = [...new Set((rows ?? []).map((r) => (r as { apparent_staff_id?: string | null }).apparent_staff_id).filter(Boolean))] as string[];
    const staffNameById = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: staffRows } = await admin.from('staff').select('id, name, email').in('id', staffIds);
      for (const s of staffRows ?? []) {
        const row = s as { id: string; name?: string | null; email?: string | null };
        staffNameById.set(row.id, row.name?.trim() || row.email?.trim() || row.id);
      }
    }

    const events = (rows ?? []).map((raw) => {
      const r = raw as {
        id: string;
        apparent_staff_id: string | null;
        superuser_email: string | null;
        event_type: string;
        summary: string;
        created_at: string;
        support_session_id: string | null;
      };
      const superName =
        (r.support_session_id && superNameBySessionId.get(r.support_session_id)) ||
        r.superuser_email?.trim() ||
        'Reserve NI support';
      const apparentName = r.apparent_staff_id ? staffNameById.get(r.apparent_staff_id) ?? 'Venue user' : 'Venue user';
      return {
        id: r.id,
        event_type: r.event_type,
        created_at: r.created_at,
        display_line: formatDisplayLine({
          superName,
          apparentName,
          summary: r.summary,
          createdAt: r.created_at,
          eventType: r.event_type,
        }),
      };
    });

    return NextResponse.json({ events });
  } catch (err) {
    console.error('[venue/support-activity] GET:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
