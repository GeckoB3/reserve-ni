'use client';

import { useCallback, useEffect, useState } from 'react';

interface TicketType {
  id: string;
  name: string;
  price_pence: number;
  capacity: number | null;
  sort_order: number;
}

interface ExperienceEvent {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  image_url: string | null;
  is_active: boolean;
  ticket_types: TicketType[];
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function EventManagerView({ venueId, isAdmin }: { venueId: string; isAdmin: boolean }) {
  const [events, setEvents] = useState<ExperienceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/venue/experience-events');
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      console.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const upcoming = events.filter((e) => e.event_date >= new Date().toISOString().slice(0, 10));
  const past = events.filter((e) => e.event_date < new Date().toISOString().slice(0, 10));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Event Manager</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-500">No events created yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-slate-700">Upcoming</h2>
              <div className="space-y-3">
                {upcoming.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-slate-400">Past</h2>
              <div className="space-y-3 opacity-60">
                {past.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: ExperienceEvent }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">{event.name}</h3>
          <p className="text-sm text-slate-500">
            {event.event_date} &middot; {event.start_time.slice(0, 5)} – {event.end_time.slice(0, 5)}
          </p>
          {event.description && (
            <p className="mt-1 text-sm text-slate-600 line-clamp-2">{event.description}</p>
          )}
        </div>
        <div className="text-right text-sm">
          <div className="font-medium text-slate-700">{event.capacity} capacity</div>
          {!event.is_active && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>
          )}
        </div>
      </div>
      {event.ticket_types.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {event.ticket_types.map((tt) => (
            <span key={tt.id} className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600">
              {tt.name} — {formatPrice(tt.price_pence)}
              {tt.capacity && ` (${tt.capacity} max)`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
