'use client';

import { DashboardStatCard } from '@/components/dashboard/DashboardStatCard';
import {
  nextBookingsTileContent,
  type NextBookingsSlotSummary,
} from '@/lib/table-management/next-bookings-slot';

interface Props {
  summary: {
    total_covers_booked: number;
    total_covers_capacity: number;
    tables_in_use: number;
    tables_total: number;
    unassigned_count: number;
    combos_in_use?: number;
    covers_in_use_now?: number;
    next_bookings_slot?: NextBookingsSlotSummary | null;
  };
}

/** KPI strip for operations toolbars (same data contract as SummaryBar). */
export function SummaryStrip({ summary }: Props) {
  const useLiveCovers = typeof summary.covers_in_use_now === 'number';
  const coversShown = useLiveCovers ? summary.covers_in_use_now! : summary.total_covers_booked;
  const coversPct =
    summary.total_covers_capacity > 0 ? Math.round((coversShown / summary.total_covers_capacity) * 100) : 0;

  const nextBookings =
    summary.next_bookings_slot !== undefined ? nextBookingsTileContent(summary.next_bookings_slot) : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
      <DashboardStatCard
        label={useLiveCovers ? 'Covers in use' : 'Covers booked'}
        value={`${coversShown}/${summary.total_covers_capacity}`}
        color="brand"
        subValue={summary.total_covers_capacity > 0 ? `${coversPct}% of capacity` : undefined}
      />
      <DashboardStatCard
        label="Tables in use"
        value={`${summary.tables_in_use}/${summary.tables_total}`}
        color="violet"
      />
      <DashboardStatCard label="Unassigned" value={summary.unassigned_count} color="emerald" />
      {nextBookings !== null ? (
        <DashboardStatCard
          value={nextBookings.primaryValue}
          color="amber"
          subValue={nextBookings.guestsLine}
          subValue2={nextBookings.bookingsLine}
        />
      ) : (
        <DashboardStatCard label="Table combos" value={summary.combos_in_use ?? 0} color="amber" />
      )}
    </div>
  );
}
