import { redirect } from 'next/navigation';
import { resolveActiveBookingModels } from '@/lib/booking/active-models';
import { createClient } from '@/lib/supabase/server';
import { isAppointmentPlanTier } from '@/lib/tier-enforcement';
import { getVenueStaff } from '@/lib/venue-auth';

export default async function SignupBookingModelsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/signup/booking-models');
  }

  const staff = await getVenueStaff(supabase);
  if (!staff) {
    redirect('/signup/plan?plan=appointments');
  }

  const { data: venue } = await staff.db
    .from('venues')
    .select('booking_model, enabled_models, active_booking_models, pricing_tier, onboarding_completed')
    .eq('id', staff.venue_id)
    .maybeSingle();

  if (!venue) {
    redirect('/signup/plan?plan=appointments');
  }

  const v = venue as {
    booking_model?: string | null;
    enabled_models?: unknown;
    active_booking_models?: unknown;
    pricing_tier?: string | null;
    onboarding_completed?: boolean | null;
  };
  const activeModels = resolveActiveBookingModels({
    pricingTier: v.pricing_tier,
    bookingModel: v.booking_model,
    enabledModels: v.enabled_models,
    activeBookingModels: v.active_booking_models,
  });

  if (!isAppointmentPlanTier(v.pricing_tier) || v.onboarding_completed === true || activeModels.length > 0) {
    redirect('/onboarding');
  }

  return children;
}
