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

interface AttendeeRow {
  booking_id: string;
  status: string;
  party_size: number;
  deposit_amount_pence: number | null;
  deposit_status: string | null;
  booking_date: string;
  booking_time: string;
  checked_in_at: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
}

export function EventManagerView({
  venueId: _venueId,
  isAdmin,
  currency = 'GBP',
}: {
  venueId: string;
  isAdmin: boolean;
  currency?: string;
}) {
  const sym = currency === 'EUR' ? '€' : '£';

  function formatPrice(pence: number): string {
    return `${sym}${(pence / 100).toFixed(2)}`;
  }
  const [events, setEvents] = useState<ExperienceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExperienceEvent | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [evRes, attRes] = await Promise.all([
        fetch(`/api/venue/experience-events/${id}`),
        fetch(`/api/venue/experience-events/${id}/attendees`),
      ]);
      const evJson = await evRes.json();
      const attJson = await attRes.json();
      if (!evRes.ok) {
        setDetailError(evJson.error ?? 'Failed to load event');
        setDetail(null);
        setAttendees([]);
        return;
      }
      if (!attRes.ok) {
        setDetailError(attJson.error ?? 'Failed to load attendees');
        setDetail(evJson as ExperienceEvent);
        setAttendees([]);
        return;
      }
      setDetail(evJson as ExperienceEvent);
      setAttendees((attJson.attendees ?? []) as AttendeeRow[]);
    } catch {
      setDetailError('Failed to load event');
      setDetail(null);
      setAttendees([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setAttendees([]);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const handleCancelEvent = async () => {
    if (!selectedId || !detail) return;
    const ok = window.confirm(
      `Cancel "${detail.name}"? All active bookings will be cancelled and guests notified according to your refund policy.`,
    );
    if (!ok) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/venue/experience-events/${selectedId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? 'Could not cancel event');
        return;
      }
      setSelectedId(null);
      await fetchEvents();
    } catch {
      window.alert('Could not cancel event');
    } finally {
      setCancelLoading(false);
    }
  };

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
                  <EventCard
                    key={event.id}
                    event={event}
                    formatPrice={formatPrice}
                    selected={selectedId === event.id}
                    onSelect={() => setSelectedId(selectedId === event.id ? null : event.id)}
                  />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-slate-400">Past</h2>
              <div className="space-y-3 opacity-60">
                {past.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    formatPrice={formatPrice}
                    selected={selectedId === event.id}
                    onSelect={() => setSelectedId(selectedId === event.id ? null : event.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {selectedId && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {detailLoading && <p className="text-sm text-slate-500">Loading details…</p>}
          {detailError && <p className="text-sm text-red-600">{detailError}</p>}
          {!detailLoading && detail && (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{detail.name}</h3>
                  <p className="text-sm text-slate-500">
                    {detail.event_date} · {detail.start_time.slice(0, 5)} – {detail.end_time.slice(0, 5)} ·{' '}
                    {detail.capacity} capacity
                  </p>
                  {!detail.is_active && (
                    <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Cancelled / inactive
                    </span>
                  )}
                </div>
                {isAdmin && detail.is_active && (
                  <button
                    type="button"
                    onClick={() => void handleCancelEvent()}
                    disabled={cancelLoading}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                  >
                    {cancelLoading ? 'Cancelling…' : 'Cancel event & notify guests'}
                  </button>
                )}
              </div>

              <h4 className="mb-2 text-sm font-medium text-slate-700">Attendees</h4>
              {attendees.length === 0 ? (
                <p className="text-sm text-slate-500">No bookings for this event.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Guest</th>
                        <th className="py-2 pr-3 font-medium">Contact</th>
                        <th className="py-2 pr-3 font-medium">Qty</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Deposit</th>
                        <th className="py-2 font-medium">Checked in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendees.map((a) => (
                        <tr key={a.booking_id} className="border-b border-slate-100">
                          <td className="py-2 pr-3 text-slate-800">{a.guest_name ?? '—'}</td>
                          <td className="py-2 pr-3 text-slate-600">
                            <div className="max-w-[200px] truncate">{a.guest_email ?? '—'}</div>
                            <div className="text-xs text-slate-500">{a.guest_phone ?? ''}</div>
                          </td>
                          <td className="py-2 pr-3">{a.party_size}</td>
                          <td className="py-2 pr-3">{a.status}</td>
                          <td className="py-2 pr-3">
                            {a.deposit_amount_pence != null ? formatPrice(a.deposit_amount_pence) : '—'}
                            {a.deposit_status ? (
                              <span className="ml-1 text-xs text-slate-500">({a.deposit_status})</span>
                            ) : null}
                          </td>
                          <td className="py-2 text-slate-600">
                            {a.checked_in_at ? new Date(a.checked_in_at).toLocaleString('en-GB') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  formatPrice,
  selected,
  onSelect,
}: {
  event: ExperienceEvent;
  formatPrice: (pence: number) => string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-5 py-4 text-left shadow-sm transition-colors ${
        selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
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
              {tt.name}: {formatPrice(tt.price_pence)}
              {tt.capacity && ` (${tt.capacity} max)`}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">{selected ? 'Hide details' : 'View attendees & actions'}</p>
    </button>
  );
}
