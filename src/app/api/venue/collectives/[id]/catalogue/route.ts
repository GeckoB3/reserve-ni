import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveLinkAdmin, enforceLinkRateLimit } from '@/lib/linked-accounts/route-helpers';
import { catalogueActionSchema, type CatalogueActionInput } from '@/lib/linked-accounts/validation';
import {
  loadCatalogueForManagement,
  loadVenueCatalogueData,
  providerApprovalOnCreate,
  approvalAfterTermsChange,
} from '@/lib/linked-accounts/catalogue';
import { loadVenueLookup } from '@/lib/linked-accounts/queries';
import {
  notifyCombinedProviderProposed,
  notifyCombinedProviderDecision,
} from '@/lib/linked-accounts/notifications';

/** Best-effort: notification failures must never fail a catalogue action. */
async function safeNotify(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (err) {
    console.error('[combined-page] notification failed:', err);
  }
}

async function collectiveContext(
  admin: SupabaseClient,
  collectiveId: string,
): Promise<{ name: string; hostVenueId: string } | null> {
  const { data } = await admin
    .from('venue_collectives')
    .select('name, host_venue_id')
    .eq('id', collectiveId)
    .maybeSingle();
  if (!data) return null;
  return { name: (data.name as string) ?? 'a venue collective', hostVenueId: data.host_venue_id as string };
}

async function offeringName(admin: SupabaseClient, itemId: string): Promise<string> {
  const { data } = await admin
    .from('collective_service_items')
    .select('name')
    .eq('id', itemId)
    .maybeSingle();
  return (data?.name as string) ?? 'an offering';
}

interface CollectiveAccess {
  id: string;
  hostVenueId: string;
  status: string;
  pageMode: string;
  isHost: boolean;
  memberId: string | null;
}

/** Resolve the caller's relationship to a collective (host / active member). */
async function loadCollectiveAccess(
  admin: SupabaseClient,
  collectiveId: string,
  venueId: string,
): Promise<CollectiveAccess | null> {
  const { data: collective } = await admin
    .from('venue_collectives')
    .select('id, host_venue_id, status, page_mode')
    .eq('id', collectiveId)
    .maybeSingle();
  if (!collective) return null;
  const { data: member } = await admin
    .from('venue_collective_members')
    .select('id')
    .eq('collective_id', collectiveId)
    .eq('venue_id', venueId)
    .eq('status', 'active')
    .maybeSingle();
  return {
    id: collective.id as string,
    hostVenueId: collective.host_venue_id as string,
    status: collective.status as string,
    pageMode: collective.page_mode as string,
    isHost: (collective.host_venue_id as string) === venueId,
    memberId: (member?.id as string | null) ?? null,
  };
}

/** GET /api/venue/collectives/[id]/catalogue — the builder dataset (host + members). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveLinkAdmin();
  if (!resolved.ok) return resolved.response;
  const { ctx } = resolved;
  const { id } = await params;

  try {
    const access = await loadCollectiveAccess(ctx.admin, id, ctx.venueId);
    if (!access) return NextResponse.json({ error: 'Collective not found.' }, { status: 404 });
    if (!access.isHost && !access.memberId) {
      return NextResponse.json({ error: 'You are not a member of this collective.' }, { status: 403 });
    }
    const catalogue = await loadCatalogueForManagement(ctx.admin, id);
    return NextResponse.json({ catalogue });
  } catch (err) {
    console.error('GET /api/venue/collectives/[id]/catalogue failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const HOST_ACTIONS = new Set([
  'create_item',
  'update_item',
  'archive_item',
  'add_provider',
  'update_provider',
  'remove_provider',
]);
const MEMBER_ACTIONS = new Set(['approve_provider', 'reject_provider', 'set_provider_terms']);

/** PATCH /api/venue/collectives/[id]/catalogue — host curation + member consent. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveLinkAdmin();
  if (!resolved.ok) return resolved.response;
  const { ctx } = resolved;
  const { id } = await params;

  const limited = enforceLinkRateLimit(ctx.venueId, 'catalogue', 60, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = catalogueActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  try {
    const access = await loadCollectiveAccess(ctx.admin, id, ctx.venueId);
    if (!access) return NextResponse.json({ error: 'Collective not found.' }, { status: 404 });
    if (access.status !== 'active') {
      return NextResponse.json({ error: 'This collective has been dissolved.' }, { status: 409 });
    }
    if (HOST_ACTIONS.has(input.action) && !access.isHost) {
      return NextResponse.json(
        { error: 'Only the host venue can curate the catalogue.' },
        { status: 403 },
      );
    }
    if (MEMBER_ACTIONS.has(input.action) && !access.memberId && !access.isHost) {
      return NextResponse.json({ error: 'You are not a member of this collective.' }, { status: 403 });
    }

    const result = await applyCatalogueAction(ctx.admin, id, ctx.venueId, ctx.userId, input);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const catalogue = await loadCatalogueForManagement(ctx.admin, id);
    return NextResponse.json({ catalogue });
  } catch (err) {
    console.error('PATCH /api/venue/collectives/[id]/catalogue failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

type ActionResult = { ok: true } | { ok: false; error: string; status: number };

/** Verify a (venue, service, practitioner) triple belongs to an active member and is live. */
async function validateProviderSource(
  admin: SupabaseClient,
  collectiveId: string,
  venueId: string,
  sourceServiceId: string,
  practitionerId: string | null,
): Promise<{ ok: true; memberId: string } | { ok: false; error: string; status: number }> {
  const { data: member } = await admin
    .from('venue_collective_members')
    .select('id')
    .eq('collective_id', collectiveId)
    .eq('venue_id', venueId)
    .eq('status', 'active')
    .maybeSingle();
  if (!member) {
    return { ok: false, error: 'That venue is not an active member of this collective.', status: 400 };
  }
  // Validate the service + calendar MODEL-AGNOSTICALLY (the venue may be on the
  // legacy practitioner_appointment model OR unified_scheduling — service_items /
  // unified_calendars). loadVenueCatalogueData normalises both.
  const data = await loadVenueCatalogueData(admin, venueId);
  if (!data.services.has(sourceServiceId)) {
    return { ok: false, error: 'That service is not available at the chosen venue.', status: 400 };
  }
  if (practitionerId && !data.calendars.has(practitionerId)) {
    return { ok: false, error: 'That practitioner is not available at the chosen venue.', status: 400 };
  }
  return { ok: true, memberId: member.id as string };
}

/** Load a provider scoped to this collective (via its item). */
async function loadProviderInCollective(
  admin: SupabaseClient,
  collectiveId: string,
  providerId: string,
): Promise<{
  id: string;
  itemId: string;
  venue_id: string;
  price_pence_override: number | null;
  duration_minutes_override: number | null;
} | null> {
  const { data } = await admin
    .from('collective_service_providers')
    .select('id, venue_id, price_pence_override, duration_minutes_override, item_id')
    .eq('id', providerId)
    .maybeSingle();
  if (!data) return null;
  const { data: item } = await admin
    .from('collective_service_items')
    .select('id')
    .eq('id', data.item_id as string)
    .eq('collective_id', collectiveId)
    .maybeSingle();
  if (!item) return null;
  return {
    id: data.id as string,
    itemId: data.item_id as string,
    venue_id: data.venue_id as string,
    price_pence_override: (data.price_pence_override as number | null) ?? null,
    duration_minutes_override: (data.duration_minutes_override as number | null) ?? null,
  };
}

/** Verify an item belongs to this collective. */
async function itemBelongsToCollective(
  admin: SupabaseClient,
  collectiveId: string,
  itemId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('collective_service_items')
    .select('id')
    .eq('id', itemId)
    .eq('collective_id', collectiveId)
    .maybeSingle();
  return Boolean(data);
}

async function applyCatalogueAction(
  admin: SupabaseClient,
  collectiveId: string,
  actingVenueId: string,
  userId: string | null,
  input: CatalogueActionInput,
): Promise<ActionResult> {
  switch (input.action) {
    case 'create_item': {
      if (!input.name) return { ok: false, error: 'A service name is required.', status: 400 };
      const { data: item, error } = await admin
        .from('collective_service_items')
        .insert({
          collective_id: collectiveId,
          name: input.name.trim(),
          description: input.description ?? null,
          category: input.category ?? null,
          display_order: input.displayOrder ?? 0,
          default_duration_minutes: input.defaultDurationMinutes ?? null,
          default_price_pence: input.defaultPricePence ?? null,
          pricing_display: input.pricingDisplay ?? 'from',
          allow_any_available: input.allowAnyAvailable ?? true,
          status: 'active',
        })
        .select('id')
        .single();
      if (error || !item) return { ok: false, error: 'Failed to create the offering.', status: 500 };
      // Optionally seed providers from a set of source services (e.g. an accepted merge).
      const seededMemberVenues = new Set<string>();
      for (const src of input.sourceServiceIds ?? []) {
        const check = await validateProviderSource(
          admin,
          collectiveId,
          src.venueId,
          src.sourceServiceId,
          null,
        );
        if (!check.ok) continue; // skip invalid seeds rather than failing the whole create
        await admin.from('collective_service_providers').insert({
          item_id: item.id as string,
          member_id: check.memberId,
          venue_id: src.venueId,
          source_service_id: src.sourceServiceId,
          practitioner_id: null,
          approval_status: providerApprovalOnCreate(actingVenueId, src.venueId),
          approved_by_user_id: actingVenueId === src.venueId ? userId : null,
          status: 'active',
        });
        if (src.venueId !== actingVenueId) seededMemberVenues.add(src.venueId);
      }
      // Ask each seeded member to approve the terms for its calendars (plan D6).
      if (seededMemberVenues.size > 0) {
        const others = [...seededMemberVenues];
        const [ctx, lookup] = await Promise.all([
          collectiveContext(admin, collectiveId),
          loadVenueLookup(admin, [actingVenueId, ...others]),
        ]);
        const host = lookup[actingVenueId]?.name ?? 'The host venue';
        await Promise.allSettled(
          others.map((v) =>
            safeNotify(
              notifyCombinedProviderProposed(
                admin,
                v,
                ctx?.name ?? 'a venue collective',
                host,
                input.name!.trim(),
                collectiveId,
              ),
            ),
          ),
        );
      }
      return { ok: true };
    }

    case 'update_item': {
      if (!input.itemId || !(await itemBelongsToCollective(admin, collectiveId, input.itemId))) {
        return { ok: false, error: 'Offering not found.', status: 404 };
      }
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name.trim();
      if (input.description !== undefined) updates.description = input.description;
      if (input.category !== undefined) updates.category = input.category;
      if (input.displayOrder !== undefined) updates.display_order = input.displayOrder;
      if (input.defaultDurationMinutes !== undefined)
        updates.default_duration_minutes = input.defaultDurationMinutes;
      if (input.defaultPricePence !== undefined) updates.default_price_pence = input.defaultPricePence;
      if (input.pricingDisplay !== undefined) updates.pricing_display = input.pricingDisplay;
      if (input.allowAnyAvailable !== undefined) updates.allow_any_available = input.allowAnyAvailable;
      if (input.imageUrl !== undefined) updates.image_url = input.imageUrl || null;
      if (Object.keys(updates).length === 0) return { ok: false, error: 'No changes supplied.', status: 400 };
      const { error } = await admin
        .from('collective_service_items')
        .update(updates)
        .eq('id', input.itemId);
      if (error) return { ok: false, error: 'Failed to update the offering.', status: 500 };
      return { ok: true };
    }

    case 'archive_item': {
      if (!input.itemId || !(await itemBelongsToCollective(admin, collectiveId, input.itemId))) {
        return { ok: false, error: 'Offering not found.', status: 404 };
      }
      await admin
        .from('collective_service_items')
        .update({ status: 'archived' })
        .eq('id', input.itemId);
      // Archiving the offering also removes its providers from public bookability.
      await admin
        .from('collective_service_providers')
        .update({ status: 'removed' })
        .eq('item_id', input.itemId)
        .neq('status', 'removed');
      return { ok: true };
    }

    case 'add_provider': {
      if (!input.itemId || !(await itemBelongsToCollective(admin, collectiveId, input.itemId))) {
        return { ok: false, error: 'Offering not found.', status: 404 };
      }
      if (!input.venueId || !input.sourceServiceId) {
        return { ok: false, error: 'A venue and service are required.', status: 400 };
      }
      const check = await validateProviderSource(
        admin,
        collectiveId,
        input.venueId,
        input.sourceServiceId,
        input.practitionerId ?? null,
      );
      if (!check.ok) return check;
      const { error } = await admin.from('collective_service_providers').insert({
        item_id: input.itemId,
        member_id: check.memberId,
        venue_id: input.venueId,
        source_service_id: input.sourceServiceId,
        practitioner_id: input.practitionerId ?? null,
        price_pence_override: input.pricePenceOverride ?? null,
        duration_minutes_override: input.durationMinutesOverride ?? null,
        approval_status: providerApprovalOnCreate(actingVenueId, input.venueId),
        approved_by_user_id: actingVenueId === input.venueId ? userId : null,
        status: 'active',
      });
      if (error) {
        // Most likely the unique index (this calendar is already a provider).
        return { ok: false, error: 'That calendar already provides this offering.', status: 409 };
      }
      // Ask the member to approve the terms for its calendar (plan D6).
      if (input.venueId !== actingVenueId) {
        const [ctx, name, lookup] = await Promise.all([
          collectiveContext(admin, collectiveId),
          offeringName(admin, input.itemId),
          loadVenueLookup(admin, [actingVenueId, input.venueId]),
        ]);
        await safeNotify(
          notifyCombinedProviderProposed(
            admin,
            input.venueId,
            ctx?.name ?? 'a venue collective',
            lookup[actingVenueId]?.name ?? 'The host venue',
            name,
            collectiveId,
          ),
        );
      }
      return { ok: true };
    }

    case 'update_provider': {
      if (!input.providerId) return { ok: false, error: 'Provider not found.', status: 404 };
      const provider = await loadProviderInCollective(admin, collectiveId, input.providerId);
      if (!provider) return { ok: false, error: 'Provider not found.', status: 404 };
      const updates: Record<string, unknown> = {};
      let termsChanged = false;
      if (input.pricePenceOverride !== undefined) {
        updates.price_pence_override = input.pricePenceOverride;
        if (input.pricePenceOverride !== provider.price_pence_override) termsChanged = true;
      }
      if (input.durationMinutesOverride !== undefined) {
        updates.duration_minutes_override = input.durationMinutesOverride;
        if (input.durationMinutesOverride !== provider.duration_minutes_override) termsChanged = true;
      }
      if (input.practitionerId !== undefined) updates.practitioner_id = input.practitionerId;
      if (Object.keys(updates).length === 0) return { ok: false, error: 'No changes supplied.', status: 400 };
      // plan D6 — host changing a member's terms resets approval to pending.
      const nextApproval = approvalAfterTermsChange(actingVenueId, provider.venue_id, termsChanged);
      if (nextApproval) {
        updates.approval_status = nextApproval;
        updates.approved_by_user_id = nextApproval === 'approved' ? userId : null;
      }
      const { error } = await admin
        .from('collective_service_providers')
        .update(updates)
        .eq('id', provider.id);
      if (error) return { ok: false, error: 'Failed to update the provider.', status: 500 };
      return { ok: true };
    }

    case 'remove_provider': {
      if (!input.providerId) return { ok: false, error: 'Provider not found.', status: 404 };
      const provider = await loadProviderInCollective(admin, collectiveId, input.providerId);
      if (!provider) return { ok: false, error: 'Provider not found.', status: 404 };
      await admin
        .from('collective_service_providers')
        .update({ status: 'removed' })
        .eq('id', provider.id);
      return { ok: true };
    }

    case 'approve_provider':
    case 'reject_provider':
    case 'set_provider_terms': {
      if (!input.providerId) return { ok: false, error: 'Provider not found.', status: 404 };
      const provider = await loadProviderInCollective(admin, collectiveId, input.providerId);
      if (!provider) return { ok: false, error: 'Provider not found.', status: 404 };
      // A member may only act on its OWN calendars' commercial terms (plan D6).
      if (provider.venue_id !== actingVenueId) {
        return {
          ok: false,
          error: 'You can only manage offerings that use your own calendars.',
          status: 403,
        };
      }
      const updates: Record<string, unknown> = {};
      if (input.action === 'approve_provider') {
        updates.approval_status = 'approved';
        updates.approved_by_user_id = userId;
      } else if (input.action === 'reject_provider') {
        updates.approval_status = 'rejected';
        updates.approved_by_user_id = null;
      } else {
        // set_provider_terms: member adjusts its own price/duration → self-consent.
        if (input.pricePenceOverride !== undefined)
          updates.price_pence_override = input.pricePenceOverride;
        if (input.durationMinutesOverride !== undefined)
          updates.duration_minutes_override = input.durationMinutesOverride;
        updates.approval_status = 'approved';
        updates.approved_by_user_id = userId;
      }
      const { error } = await admin
        .from('collective_service_providers')
        .update(updates)
        .eq('id', provider.id);
      if (error) return { ok: false, error: 'Failed to update the offering.', status: 500 };
      // Tell the host the member's decision (approve / adjust-and-approve count as
      // approved; reject as declined) — plan §7.4.
      const approved = input.action !== 'reject_provider';
      const [ctx, name, lookup] = await Promise.all([
        collectiveContext(admin, collectiveId),
        offeringName(admin, provider.itemId),
        loadVenueLookup(admin, [actingVenueId]),
      ]);
      if (ctx && ctx.hostVenueId !== actingVenueId) {
        await safeNotify(
          notifyCombinedProviderDecision(
            admin,
            ctx.hostVenueId,
            lookup[actingVenueId]?.name ?? 'A member venue',
            name,
            approved,
            collectiveId,
          ),
        );
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: 'Unknown action.', status: 400 };
  }
}
