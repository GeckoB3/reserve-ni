import { DashboardListSkeleton } from '@/components/ui/dashboard/DashboardSkeletons';

export default function DaySheetLoading() {
  return (
    <div className="p-3 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <DashboardListSkeleton rowCount={10} />
      </div>
    </div>
  );
}
