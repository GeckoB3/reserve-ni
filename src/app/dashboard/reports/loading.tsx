import { DashboardChartSkeleton } from '@/components/ui/dashboard/DashboardSkeletons';

export default function ReportsLoading() {
  return (
    <div className="p-3 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <DashboardChartSkeleton kpiCount={4} />
      </div>
    </div>
  );
}
