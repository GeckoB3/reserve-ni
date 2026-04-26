import { DashboardGridSkeleton } from '@/components/ui/dashboard/DashboardSkeletons';

export default function FloorPlanLoading() {
  return (
    <div className="p-3 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <DashboardGridSkeleton />
      </div>
    </div>
  );
}
