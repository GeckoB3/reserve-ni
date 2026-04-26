import { BookingsDashboardSkeleton } from '@/components/ui/dashboard/DashboardSkeletons';

export default function BookingsLoading() {
  return (
    <div className="p-3 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <BookingsDashboardSkeleton />
      </div>
    </div>
  );
}
