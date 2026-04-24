import { Skeleton } from '@/components/ui/Skeleton';
import { PageFrame } from '@/components/ui/dashboard/PageFrame';

/**
 * Shared shimmer layouts for dashboard pages and tab panels.
 * Compose from `Skeleton` primitives (globals.css `.skeleton`).
 */

export function DashboardTabRowSkeleton({ tabCount = 5 }: { tabCount?: number }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-1">
      {Array.from({ length: tabCount }).map((_, i) => (
        <Skeleton.Block key={i} className="h-10 w-24" />
      ))}
    </div>
  );
}

/** Generic page: eyebrow + title + optional actions + tab row + main cards */
export function DashboardPageSkeleton({
  maxWidthClass = 'max-w-6xl',
  tabCount = 0,
  cardCount = 2,
}: {
  maxWidthClass?: string;
  tabCount?: number;
  cardCount?: number;
}) {
  return (
    <PageFrame maxWidthClass={maxWidthClass}>
      <div className="space-y-6" role="status" aria-label="Loading">
        <header className="space-y-3">
          <Skeleton.Line className="w-20" />
          <Skeleton.Line className="h-8 w-56 max-w-full sm:h-9 sm:w-72" />
          <Skeleton.Line className="h-3 w-full max-w-xl" />
        </header>
        {tabCount > 0 ? <DashboardTabRowSkeleton tabCount={tabCount} /> : null}
        <div className="space-y-4">
          {Array.from({ length: cardCount }).map((_, i) => (
            <Skeleton.Card key={i}>
              <div className="space-y-3">
                <Skeleton.Line className="w-1/3" />
                <Skeleton.Line className="w-full" />
                <Skeleton.Line className="w-4/5" />
                <Skeleton.Block className="h-24" />
              </div>
            </Skeleton.Card>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}

/** List/table views: toolbar + stacked rows */
export function DashboardListSkeleton({ rowCount = 8 }: { rowCount?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading list">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton.Block className="h-10 flex-1 min-w-[180px] max-w-xs" />
        <Skeleton.Block className="h-10 w-28" />
        <Skeleton.Block className="h-10 w-28" />
      </div>
      <Skeleton.Card className="p-0 overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <Skeleton.Line className="w-32" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: rowCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Skeleton.Circle className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton.Line className="w-2/3 max-w-md" />
                <Skeleton.Line className="w-1/3 max-w-xs" />
              </div>
              <Skeleton.Block className="h-8 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </Skeleton.Card>
    </div>
  );
}

/** Bookings route Suspense: title area is outside in page — skeleton is inner content only */
export function BookingsDashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading bookings">
      <DashboardTabRowSkeleton tabCount={4} />
      <DashboardListSkeleton rowCount={6} />
    </div>
  );
}

/** Calendar-style: sidebar + time grid */
export function DashboardCalendarSkeleton() {
  return (
    <div className="flex min-h-[420px] gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4" role="status" aria-label="Loading calendar">
      <div className="hidden w-52 shrink-0 space-y-3 border-r border-slate-100 pr-3 sm:block">
        <Skeleton.Line className="w-24" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton.Block key={i} className="h-10" />
        ))}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex gap-1 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton.Line key={i} className="h-8 flex-1" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton.Block key={i} className="aspect-square min-h-[48px]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Floor plan / grid stage */
export function DashboardGridSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading grid">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton.Block className="h-9 w-32" />
        <Skeleton.Block className="h-9 w-24" />
        <Skeleton.Block className="h-9 w-24" />
      </div>
      <Skeleton.Card className="min-h-[320px] p-3 sm:p-4">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
          {Array.from({ length: 24 }).map((_, i) => (
            <Skeleton.Block key={i} className="aspect-square" />
          ))}
        </div>
      </Skeleton.Card>
    </div>
  );
}

/** Reports / analytics */
export function DashboardChartSkeleton({ kpiCount = 4 }: { kpiCount?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading reports">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: kpiCount }).map((_, i) => (
          <Skeleton.Card key={i} className="py-4">
            <Skeleton.Line className="w-20" />
            <Skeleton.Line className="mt-3 h-8 w-16" />
            <Skeleton.Line className="mt-2 w-28" />
          </Skeleton.Card>
        ))}
      </div>
      <Skeleton.Card>
        <Skeleton.Line className="h-64 w-full rounded-xl" />
      </Skeleton.Card>
      <Skeleton.Card>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton.Line key={i} className="w-full" />
          ))}
        </div>
      </Skeleton.Card>
    </div>
  );
}

/** Two-column panel under calendar availability tabs (calendars + editor). */
export function AppointmentAvailabilityTabPanelSkeleton() {
  return (
    <div
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
      role="status"
      aria-label="Loading availability"
    >
      <Skeleton.Card>
        <div className="space-y-3">
          <Skeleton.Line className="w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton.Block key={i} className="h-14" />
          ))}
        </div>
      </Skeleton.Card>
      <Skeleton.Card>
        <Skeleton.Line className="mb-3 w-24" />
        <Skeleton.Block className="h-64" />
      </Skeleton.Card>
    </div>
  );
}

/** Appointment availability settings (use inside route wrapper; no extra PageFrame). */
export function AppointmentAvailabilitySkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading calendar availability">
      <header className="space-y-2">
        <Skeleton.Line className="w-28" />
        <Skeleton.Line className="h-8 w-64 max-w-full" />
        <Skeleton.Line className="h-3 w-full max-w-2xl" />
      </header>
      <DashboardTabRowSkeleton tabCount={5} />
      <AppointmentAvailabilityTabPanelSkeleton />
    </div>
  );
}

/** Floor plan editor: tables or combinations list loading */
export function FloorPlanTablesPanelSkeleton() {
  return (
    <div className="space-y-3 py-2" role="status" aria-label="Loading tables">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton.Block className="h-10 w-16 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton.Line className="w-40" />
            <Skeleton.Line className="w-24" />
          </div>
          <Skeleton.Block className="h-9 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Availability rule tabs: form-like placeholders */
export function AvailabilityFormTabSkeleton() {
  return (
    <Skeleton.Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton.Block className="h-11" />
        <Skeleton.Block className="h-11" />
        <Skeleton.Block className="h-11 sm:col-span-2" />
        <Skeleton.Block className="h-24 sm:col-span-2" />
      </div>
    </Skeleton.Card>
  );
}

/** Card grid for services / events lists */
export function DashboardCardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Loading">
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton.Card key={i}>
          <Skeleton.Line className="w-2/3" />
          <Skeleton.Line className="mt-3 w-full" />
          <Skeleton.Block className="mt-4 h-16" />
        </Skeleton.Card>
      ))}
    </div>
  );
}

/** Waitlist / day-sheet style row list */
export function DashboardCompactListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton.Card key={i} className="py-3">
          <div className="flex items-center gap-3">
            <Skeleton.Line className="h-4 w-24" />
            <Skeleton.Line className="h-4 flex-1" />
            <Skeleton.Block className="h-8 w-20" />
          </div>
        </Skeleton.Card>
      ))}
    </div>
  );
}
