'use client';

import { useCallback, useEffect, useState } from 'react';

interface ResourceSlot {
  resource_id: string;
  resource_name: string;
  start_time: string;
  price_per_slot_pence: number | null;
}

interface ResourceAvail {
  id: string;
  name: string;
  slots: ResourceSlot[];
}

export function ResourceTimelineView({ venueId }: { venueId: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [resources, setResources] = useState<ResourceAvail[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/booking/availability?venue_id=${venueId}&date=${date}`);
      const data = await res.json();
      setResources(data.resources ?? []);
    } catch {
      console.error('Failed to load resource timeline');
    } finally {
      setLoading(false);
    }
  }, [venueId, date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Resource Timeline</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : resources.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-500">No resources configured or no availability for this date.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {resources.map((resource) => (
            <div key={resource.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold text-slate-900">{resource.name}</h2>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                {resource.slots.length === 0 ? (
                  <p className="text-sm text-slate-400">No available slots</p>
                ) : (
                  resource.slots.map((slot) => (
                    <span
                      key={slot.start_time}
                      className="rounded-lg bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700"
                    >
                      {slot.start_time}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
