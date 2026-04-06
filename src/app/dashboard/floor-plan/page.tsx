import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDashboardStaff } from '@/lib/venue-auth';
import { UnifiedFloorPlanView } from './UnifiedFloorPlanView';
import type { BookingModel } from '@/types/booking-models';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';

export default async function FloorPlanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/floor-plan');

  const staff = await getDashboardStaff(supabase);
  if (!staff.venue_id) redirect('/dashboard');

  const { data: venue } = await staff.db
    .from('venues')
    .select('table_management_enabled, currency, booking_model, enabled_models')
    .eq('id', staff.venue_id)
    .single();

  if (!venue?.table_management_enabled) redirect('/dashboard/day-sheet');

  const currency = ((venue as { currency?: string }).currency as string) ?? 'GBP';
  const bookingModel = ((venue as { booking_model?: string }).booking_model as BookingModel) ?? 'table_reservation';
  const enabledModels = normalizeEnabledModels(
    (venue as { enabled_models?: unknown }).enabled_models,
    bookingModel,
  );

  return (
    <div className="p-2 md:p-4 lg:p-6">
      <UnifiedFloorPlanView
        isAdmin={staff.role === 'admin'}
        venueId={staff.venue_id}
        currency={currency}
        bookingModel={bookingModel}
        enabledModels={enabledModels}
      />
    </div>
  );
}
