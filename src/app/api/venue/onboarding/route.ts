import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { BookingModel } from '@/types/booking-models';
import {
  activeModelsToLegacyEnabledModels,
  appointmentPlanDefaultModels,
  resolveActiveBookingModels,
} from '@/lib/booking/active-models';
import { isAppointmentPlanTier } from '@/lib/tier-enforcement';

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();

    const { data: staffRows } = await admin
      .from('staff')
      .select('venue_id, role')
      .ilike('email', (user.email ?? '').toLowerCase().trim())
      .limit(1);
    const staffRow = staffRows?.[0] ?? null;

    if (!staffRow?.venue_id) {
      return NextResponse.json({ error: 'No venue found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.onboarding_step === 'number') {
      updates.onboarding_step = body.onboarding_step;
    }

    if (typeof body.appointments_onboarding_unified_flow === 'boolean') {
      updates.appointments_onboarding_unified_flow = body.appointments_onboarding_unified_flow;
    }

    if (typeof body.onboarding_completed === 'boolean') {
      updates.onboarding_completed = body.onboarding_completed;
    }

    if (typeof body.name === 'string' && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (typeof body.address === 'string') {
      updates.address = body.address.trim();
    }

    if (typeof body.phone === 'string') {
      updates.phone = body.phone.trim();
    }

    if (typeof body.slug === 'string' && body.slug.trim()) {
      updates.slug = body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }

    if (typeof body.currency === 'string' && ['GBP', 'EUR'].includes(body.currency)) {
      updates.currency = body.currency;
    }

    if (body.active_booking_models !== undefined) {
      const { data: venueRow, error: venueErr } = await admin
        .from('venues')
        .select('booking_model, enabled_models, active_booking_models, pricing_tier')
        .eq('id', staffRow.venue_id)
        .single();
      if (venueErr || !venueRow) {
        return NextResponse.json({ error: 'Failed to validate booking models' }, { status: 500 });
      }
      let activeModels = resolveActiveBookingModels({
        pricingTier: (venueRow as { pricing_tier?: string | null }).pricing_tier,
        bookingModel: (venueRow as { booking_model?: BookingModel }).booking_model,
        enabledModels: (venueRow as { enabled_models?: unknown }).enabled_models,
        activeBookingModels: body.active_booking_models,
      });
      if (isAppointmentPlanTier((venueRow as { pricing_tier?: string | null }).pricing_tier) && activeModels.length === 0) {
        activeModels = appointmentPlanDefaultModels();
      }
      const bookingModel =
        activeModels[0] ??
        (((venueRow as { booking_model?: BookingModel }).booking_model as BookingModel | undefined) ??
          'table_reservation');
      updates.booking_model = bookingModel;
      updates.active_booking_models = activeModels;
      updates.enabled_models = activeModelsToLegacyEnabledModels(activeModels, bookingModel);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('venues')
      .update(updates)
      .eq('id', staffRow.venue_id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update: ' + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[venue/onboarding] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();

    const { data: staffRows } = await admin
      .from('staff')
      .select('venue_id, role')
      .ilike('email', (user.email ?? '').toLowerCase().trim())
      .limit(1);
    const staffRow = staffRows?.[0] ?? null;

    if (!staffRow?.venue_id) {
      return NextResponse.json({ error: 'No venue found' }, { status: 404 });
    }

    const { data: venue, error: venueError } = await admin
      .from('venues')
      .select(
        'id, name, slug, address, phone, booking_model, enabled_models, active_booking_models, business_type, business_category, terminology, pricing_tier, calendar_count, onboarding_step, onboarding_completed, appointments_onboarding_unified_flow, currency, stripe_connected_account_id'
      )
      .eq('id', staffRow.venue_id)
      .single();

    if (venueError || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const v = venue as Record<string, unknown>;
    const activeModels = resolveActiveBookingModels({
      pricingTier: v.pricing_tier as string | null | undefined,
      bookingModel: v.booking_model as BookingModel | undefined,
      enabledModels: v.enabled_models,
      activeBookingModels: v.active_booking_models,
    });
    const bookingModel = activeModels[0] ?? ((v.booking_model as BookingModel) ?? 'table_reservation');

    return NextResponse.json({
      venue: {
        ...venue,
        booking_model: bookingModel,
        active_booking_models: activeModels,
        enabled_models: activeModelsToLegacyEnabledModels(activeModels, bookingModel),
        is_admin: staffRow.role === 'admin',
      },
    });
  } catch (err) {
    console.error('[venue/onboarding] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
