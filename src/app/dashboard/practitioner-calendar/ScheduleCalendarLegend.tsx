'use client';

import type { ScheduleModelFilter } from '@/lib/calendar/schedule-blocks-grouping';

type ViewMode = 'day' | 'week' | 'month';

interface Props {
  showMergedFeeds: boolean;
  showEventsColumn: boolean;
  scheduleModelFilter: ScheduleModelFilter;
  onScheduleModelFilterChange: (v: ScheduleModelFilter) => void;
  viewMode: ViewMode;
}

/**
 * Shared legend (appointments vs C/D/E) + schedule feed filter for day / week / month.
 * Resources are now calendar columns and are not part of the schedule feed.
 */
export function ScheduleCalendarLegend({
  showMergedFeeds,
  showEventsColumn,
  scheduleModelFilter,
  onScheduleModelFilterChange,
  viewMode,
}: Props) {
  if (!showMergedFeeds) return null;

  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <span className="font-medium text-slate-700">Show</span>
      <select
        value={scheduleModelFilter}
        onChange={(e) => onScheduleModelFilterChange(e.target.value as ScheduleModelFilter)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        aria-label={`Schedule feed filter (${viewMode} view)`}
      >
        <option value="all">All types</option>
        <option value="appointments">
          Practitioner appointments only (hide events lane; class sessions stay on team columns)
        </option>
        {showEventsColumn ? <option value="event_ticket">Events only</option> : null}
      </select>
    </label>
  );
}
