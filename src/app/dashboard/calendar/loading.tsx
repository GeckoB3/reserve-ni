import { DashboardCalendarSkeleton } from '@/components/ui/dashboard/DashboardSkeletons';

export default function CalendarLoading() {
  return (
    <div className="p-3 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <DashboardCalendarSkeleton />
      </div>
    </div>
  );
}
