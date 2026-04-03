'use client';

import { useState } from 'react';
import { ResourceCalendarGrid } from '@/components/calendar/ResourceCalendarGrid';

export function ResourceTimelineView({
  venueId,
  currency = 'GBP',
}: {
  venueId: string;
  currency?: string;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Resource timeline</h1>
        <p className="mt-1 text-sm text-slate-500">
          Day view by resource: bookings and optional free slot starts for staff.
        </p>
      </div>
      <ResourceCalendarGrid venueId={venueId} date={date} currency={currency} onDateChange={setDate} />
    </div>
  );
}
