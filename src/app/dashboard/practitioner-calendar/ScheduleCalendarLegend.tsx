'use client';

import type { ScheduleModelFilter } from '@/lib/calendar/schedule-blocks-grouping';

type ViewMode = 'day' | 'week' | 'month';

interface Props {
  showMergedFeeds: boolean;
  showEventsColumn: boolean;
  showClassesColumn: boolean;
  showResourcesLane: boolean;
  scheduleModelFilter: ScheduleModelFilter;
  onScheduleModelFilterChange: (v: ScheduleModelFilter) => void;
  viewMode: ViewMode;
}

/**
 * Shared legend (appointments vs C/D/E) + schedule feed filter for day / week / month.
 */
export function ScheduleCalendarLegend({
  showMergedFeeds,
  showEventsColumn,
  showClassesColumn,
  showResourcesLane,
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
          Practitioner appointments only (hide events, classes, resources lanes)
        </option>
        {showEventsColumn ? <option value="event_ticket">Events only</option> : null}
        {showClassesColumn ? <option value="class_session">Classes only</option> : null}
        {showResourcesLane ? <option value="resource_booking">Resources only</option> : null}
      </select>
    </label>
  );
}
