'use client';

import { StatTile } from '@/components/ui/dashboard/StatTile';

export interface ClassTimetableStatsSnapshot {
  activeClassTypes: number;
  sessionsNext7Days: number;
  upcomingSessions: number;
  totalBookedSpots: number;
}

interface ClassTimetableStatsRowProps {
  loading: boolean;
  classTypesLength: number;
  stats: ClassTimetableStatsSnapshot;
}

/** Summary tiles above the class timetable workflow card. */
export function ClassTimetableStatsRow({ loading, classTypesLength, stats }: ClassTimetableStatsRowProps) {
  if (loading || classTypesLength === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="Active class types" value={stats.activeClassTypes} color="slate" />
      <StatTile label="Sessions (next 7 days)" value={stats.sessionsNext7Days} color="brand" />
      <StatTile label="Upcoming sessions" value={stats.upcomingSessions} color="emerald" />
      <StatTile label="Booked spots (all upcoming)" value={stats.totalBookedSpots} color="amber" />
    </div>
  );
}
