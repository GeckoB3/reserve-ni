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
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" aria-hidden />
          Appointments
        </span>
        {showEventsColumn ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden />
            Events
          </span>
        ) : null}
        {showClassesColumn ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden />
            Classes
          </span>
        ) : null}
        {showResourcesLane ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-500" aria-hidden />
            Resources
          </span>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <span className="font-medium text-slate-700">Show</span>
        <select
          value={scheduleModelFilter}
          onChange={(e) => onScheduleModelFilterChange(e.target.value as ScheduleModelFilter)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          aria-label={`Schedule feed filter (${viewMode} view)`}
        >
          <option value="all">All types</option>
          <option value="appointments">Appointments only</option>
          {showEventsColumn ? <option value="event_ticket">Events only</option> : null}
          {showClassesColumn ? <option value="class_session">Classes only</option> : null}
          {showResourcesLane ? <option value="resource_booking">Resources only</option> : null}
        </select>
      </label>
    </div>
  );
}
