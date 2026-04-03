'use client';

import { useCallback, useEffect, useState } from 'react';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';

interface TicketTypeAvail {
  id: string;
  name: string;
  price_pence: number;
  capacity: number | null;
  remaining: number;
}

interface EventAvail {
  event_id: string;
  event_name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  description: string | null;
  remaining_capacity: number;
  ticket_types: TicketTypeAvail[];
}

type Source = 'phone' | 'walk-in';

export function StaffEventBookingForm({
  venueId,
  currency = 'GBP',
  onCreated,
}: {
  venueId: string;
  currency?: string;
  onCreated?: () => void;
}) {
  const phoneDefaultCountry = defaultPhoneCountryForVenueCurrency(currency);
  const sym = currency === 'EUR' ? '€' : '£';
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [events, setEvents] = useState<EventAvail[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventAvail | null>(null);
  const [ticketSelections, setTicketSelections] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<Source>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/booking/availability?venue_id=${venueId}&date=${date}`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setSelectedEvent(null);
      setTicketSelections({});
    } catch {
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [venueId, date]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const totalTickets = Object.values(ticketSelections).reduce((a, b) => a + b, 0);
  const totalPricePence = selectedEvent
    ? selectedEvent.ticket_types.reduce((sum, tt) => sum + (ticketSelections[tt.id] ?? 0) * tt.price_pence, 0)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selectedEvent || totalTickets < 1) {
      setError('Select an event and at least one ticket.');
      return;
    }
    if (!name.trim()) {
      setError('Guest name is required.');
      return;
    }
    if (!phone.trim()) {
      setError('Phone number is required.');
      return;
    }

    const ticket_lines = selectedEvent.ticket_types
      .filter((tt) => (ticketSelections[tt.id] ?? 0) > 0)
      .map((tt) => ({
        ticket_type_id: tt.id,
        label: tt.name,
        quantity: ticketSelections[tt.id]!,
        unit_price_pence: tt.price_pence,
      }));

    setLoading(true);
    try {
      const res = await fetch('/api/venue/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: selectedEvent.event_date,
          booking_time: selectedEvent.start_time,
          party_size: totalTickets,
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim(),
          experience_event_id: selectedEvent.event_id,
          ticket_lines,
          source,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Booking failed');
      setSuccess(
        data.payment_url
          ? 'Booking created. Deposit request sent to the guest.'
          : 'Booking created and confirmation sent.',
      );
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New event booking</h1>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Event date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="phone">Phone</option>
            <option value="walk-in">Walk-in</option>
          </select>
        </div>

        {loading && !events.length ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Event</label>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {events.length === 0 ? (
                <p className="text-sm text-slate-500">No events on this date.</p>
              ) : (
                events.map((ev) => (
                  <button
                    key={ev.event_id}
                    type="button"
                    onClick={() => {
                      setSelectedEvent(ev);
                      setTicketSelections({});
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      selectedEvent?.event_id === ev.event_id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-medium">{ev.event_name}</div>
                    <div className="text-xs opacity-80">
                      {ev.start_time.slice(0, 5)} – {ev.end_time.slice(0, 5)} · {ev.remaining_capacity} places left
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {selectedEvent && (
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Tickets</label>
            <div className="space-y-2">
              {selectedEvent.ticket_types.map((tt) => (
                <div key={tt.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{tt.name}</div>
                    <div className="text-xs text-slate-500">
                      {sym}
                      {(tt.price_pence / 100).toFixed(2)} · {tt.remaining} left
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={tt.remaining}
                    value={ticketSelections[tt.id] ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(tt.remaining, parseInt(e.target.value, 10) || 0));
                      setTicketSelections((prev) => ({ ...prev, [tt.id]: v }));
                    }}
                    className="w-16 rounded border border-slate-200 px-2 py-1 text-sm"
                  />
                </div>
              ))}
            </div>
            {totalTickets > 0 && (
              <p className="mt-2 text-sm text-slate-600">
                Total: {totalTickets} ticket{totalTickets === 1 ? '' : 's'} · {sym}
                {(totalPricePence / 100).toFixed(2)}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Guest name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Phone ({phoneDefaultCountry})</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email (optional)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={loading || totalTickets < 1}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create booking'}
        </button>
      </form>
    </div>
  );
}
