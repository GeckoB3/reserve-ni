import { NextResponse } from 'next/server';
import { requireImportAdmin } from '@/lib/import/auth';
import { runAiMapReferences } from '@/lib/import/ai-map-references';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const ctx = await requireImportAdmin();
  if ('response' in ctx) return ctx.response;
  const { staff } = ctx;
  const { sessionId } = await params;
  const admin = getSupabaseAdminClient();
  const venueId = staff.venue_id;

  const venueMode = await resolveVenueMode(admin, venueId);
  const bm = venueMode.bookingModel;

  const { data: refs } = await admin
    .from('import_booking_references')
    .select('id, reference_type, raw_value, is_resolved')
    .eq('session_id', sessionId)
    .eq('venue_id', venueId);

  const pending = (refs ?? []).filter((r) => !(r as { is_resolved?: boolean }).is_resolved);
  if (!pending.length) {
    return NextResponse.json({ ok: true, updated: 0, message: 'Nothing to map' });
  }

  const candidates: Array<{ id: string; name: string; kind: string }> = [];

  if (bm === 'unified_scheduling') {
    const [{ data: sis }, { data: cals }] = await Promise.all([
      admin.from('service_items').select('id, name').eq('venue_id', venueId).eq('is_active', true),
      admin.from('unified_calendars').select('id, name').eq('venue_id', venueId).eq('is_active', true),
    ]);
    for (const s of sis ?? []) {
      candidates.push({ id: (s as { id: string }).id, name: (s as { name: string }).name, kind: 'service_item' });
    }
    for (const c of cals ?? []) {
      candidates.push({ id: (c as { id: string }).id, name: (c as { name: string }).name, kind: 'calendar' });
    }
  } else if (bm === 'practitioner_appointment') {
    const [{ data: ppl }, { data: svcs }] = await Promise.all([
      admin.from('practitioners').select('id, name').eq('venue_id', venueId).eq('is_active', true),
      admin.from('appointment_services').select('id, name').eq('venue_id', venueId).eq('is_active', true),
    ]);
    for (const p of ppl ?? []) {
      candidates.push({ id: (p as { id: string }).id, name: (p as { name: string }).name, kind: 'practitioner' });
    }
    for (const s of svcs ?? []) {
      candidates.push({ id: (s as { id: string }).id, name: (s as { name: string }).name, kind: 'appointment_service' });
    }
  } else if (bm === 'event_ticket') {
    const { data: sessions } = await admin
      .from('event_sessions')
      .select('id, session_date, start_time')
      .eq('venue_id', venueId)
      .eq('is_cancelled', false)
      .limit(300);
    for (const es of sessions ?? []) {
      const x = es as { id: string; session_date: string; start_time: string };
      candidates.push({
        id: x.id,
        name: `${x.session_date} ${String(x.start_time).slice(0, 5)}`,
        kind: 'event_session',
      });
    }
  } else if (bm === 'class_session') {
    const { data: typeRows } = await admin.from('class_types').select('id').eq('venue_id', venueId);
    const typeIds = (typeRows ?? []).map((t) => (t as { id: string }).id);
    if (typeIds.length) {
      const { data: inst } = await admin
        .from('class_instances')
        .select('id, instance_date, start_time, class_types(name)')
        .in('class_type_id', typeIds)
        .eq('is_cancelled', false)
        .limit(300);
      for (const ci of inst ?? []) {
        const row = ci as {
          id: string;
          instance_date: string;
          start_time: string;
          class_types: { name?: string } | { name?: string }[] | null;
        };
        const tn = Array.isArray(row.class_types) ? row.class_types[0]?.name : row.class_types?.name;
        candidates.push({
          id: row.id,
          name: `${tn ?? 'Class'} · ${row.instance_date} ${String(row.start_time).slice(0, 5)}`,
          kind: 'class_instance',
        });
      }
    }
  } else if (bm === 'resource_booking') {
    const { data: resCals } = await admin
      .from('unified_calendars')
      .select('id, name')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .eq('calendar_type', 'resource');
    for (const c of resCals ?? []) {
      candidates.push({ id: (c as { id: string }).id, name: (c as { name: string }).name, kind: 'resource_calendar' });
    }
  }

  const ai = await runAiMapReferences({
    references: pending.map((r) => ({
      id: (r as { id: string }).id,
      reference_type: (r as { reference_type: string }).reference_type,
      raw_value: (r as { raw_value: string }).raw_value,
    })),
    candidates,
  });

  let updated = 0;
  const modelUsed = ai?.model;

  if (ai?.suggestions?.length) {
    for (const s of ai.suggestions) {
      const sugId = s.suggested_entity_id;
      if (!sugId) continue;
      const match = candidates.find((c) => c.id === sugId);
      if (!match) continue;

      const refRow = pending.find((r) => (r as { id: string }).id === s.reference_id);
      if (!refRow) continue;

      const rt = (refRow as { reference_type: string }).reference_type;
      let entityType: string | null = null;
      if (rt === 'service' && match.kind === 'service_item') entityType = 'service_item';
      if (rt === 'service' && match.kind === 'appointment_service') entityType = 'appointment_service';
      if (rt === 'staff' && match.kind === 'calendar') entityType = 'unified_calendar';
      if (rt === 'staff' && match.kind === 'practitioner') entityType = 'practitioner';
      if (rt === 'event' && match.kind === 'event_session') entityType = 'event_session';
      if (rt === 'class' && match.kind === 'class_instance') entityType = 'class_instance';
      if (rt === 'resource' && match.kind === 'resource_calendar') entityType = 'unified_calendar';
      if (!entityType) continue;

      const label =
        s.suggested_entity_label ??
        match.name ??
        '';

      const { error } = await admin
        .from('import_booking_references')
        .update({
          ai_suggested_entity_id: sugId,
          ai_suggested_entity_name: label,
          ai_confidence: s.confidence,
          ai_reasoning: s.reasoning,
          updated_at: new Date().toISOString(),
        })
        .eq('id', s.reference_id)
        .eq('session_id', sessionId)
        .eq('venue_id', venueId);

      if (!error) updated += 1;
    }
  }

  if (modelUsed) {
    await admin
      .from('import_sessions')
      .update({
        ai_mapping_used: true,
        ai_model_used: modelUsed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('venue_id', venueId);
  }

  return NextResponse.json({ ok: true, updated, model: modelUsed ?? null });
}
