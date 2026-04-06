'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';
import { ClassOfferingsCalendar } from './ClassOfferingsCalendar';

interface EventOfferingSummary {
  series_key: string;
  event_name: string;
  description: string | null;
  image_url: string | null;
  dates: string[];
  occurrence_count: number;
  from_price_pence: number | null;
}

interface TicketTypeAvail {
  id: string;
  name: string;
  price_pence: number;
  capacity: number | null;
  remaining: number;
  sort_order: number;
}

interface EventInstance {
  event_id: string;
  series_key: string;
  parent_event_id: string | null;
  event_name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  description: string | null;
  image_url: string | null;
  total_capacity: number;
  remaining_capacity: number;
  ticket_types: TicketTypeAvail[];
}

type Source = 'phone' | 'walk-in';

type Step = 1 | 2 | 3 | 4;

function timeForApi(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function localTodayISO(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function StaffEventBookingForm({
  venueId: _venueId,
  currency = 'GBP',
  onCreated,
  embedded = false,
  defaultSource,
  initialDate: _initialDate,
}: {
  venueId: string;
  currency?: string;
  onCreated?: () => void;
  embedded?: boolean;
  defaultSource?: Source;
  /** @deprecated Date is chosen after event; kept for API compatibility. */
  initialDate?: string;
}) {
  const phoneDefaultCountry = defaultPhoneCountryForVenueCurrency(currency);
  const sym = currency === 'EUR' ? '€' : '£';

  const [step, setStep] = useState<Step>(1);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [eventSummaries, setEventSummaries] = useState<EventOfferingSummary[]>([]);
  const [instances, setInstances] = useState<EventInstance[]>([]);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [selectedOccurrence, setSelectedOccurrence] = useState<EventInstance | null>(null);
  const [ticketSelections, setTicketSelections] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<Source>(defaultSource ?? 'phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchOfferings = useCallback(async () => {
    setLoading(true);
    try {
      const from = localTodayISO();
      const res = await fetch(`/api/venue/event-offerings?from=${from}&days=90`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load events');
      setError(null);
      setRangeFrom(data.from ?? from);
      setRangeTo(data.to ?? '');
      setEventSummaries((data.events ?? []) as EventOfferingSummary[]);
      setInstances((data.instances ?? []) as EventInstance[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load events');
      setEventSummaries([]);
      setInstances([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOfferings();
  }, [fetchOfferings]);

  useEffect(() => {
    if (defaultSource) setSource(defaultSource);
  }, [defaultSource]);

  const selectedSummary = useMemo(
    () => eventSummaries.find((e) => e.series_key === selectedSeriesKey) ?? null,
    [eventSummaries, selectedSeriesKey],
  );

  const instancesForSeries = useMemo(
    () => instances.filter((i) => i.series_key === selectedSeriesKey && i.remaining_capacity > 0),
    [instances, selectedSeriesKey],
  );

  const candidatesForCalendarDate = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return instancesForSeries.filter((i) => i.event_date === selectedCalendarDate);
  }, [instancesForSeries, selectedCalendarDate]);

  function handleCalendarSelectDate(iso: string) {
    const candidates = instancesForSeries.filter((i) => i.event_date === iso && i.remaining_capacity > 0);
    if (candidates.length === 1) {
      setSelectedOccurrence(candidates[0]!);
      setTicketSelections({});
      setStep(3);
      setSelectedCalendarDate(null);
      return;
    }
    setSelectedCalendarDate(iso);
  }

  function pickTimeSlot(slot: EventInstance) {
    setSelectedOccurrence(slot);
    setTicketSelections({});
    setStep(3);
    setSelectedCalendarDate(null);
  }

  const totalTickets = selectedOccurrence
    ? selectedOccurrence.ticket_types.reduce((sum, tt) => sum + (ticketSelections[tt.id] ?? 0), 0)
    : 0;
  const totalPricePence = selectedOccurrence
    ? selectedOccurrence.ticket_types.reduce((sum, tt) => sum + (ticketSelections[tt.id] ?? 0) * tt.price_pence, 0)
    : 0;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selectedOccurrence || totalTickets < 1) {
      setError('Select an event session and at least one ticket.');
      return;
    }
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone are required.');
      return;
    }

    const ticket_lines = selectedOccurrence.ticket_types
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
          booking_date: selectedOccurrence.event_date,
          booking_time: timeForApi(selectedOccurrence.start_time),
          party_size: totalTickets,
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim(),
          experience_event_id: selectedOccurrence.event_id,
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
    <div className={embedded ? 'max-w-full' : 'mx-auto max-w-lg'}>
      {!embedded && <h1 className="mb-6 text-2xl font-semibold text-slate-900">New event booking</h1>}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Choose an event</h2>
          <p className="mb-4 text-sm text-slate-500">Events with sessions in the next 3 months.</p>
          {loading && !eventSummaries.length ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : eventSummaries.length === 0 ? (
            <p className="text-sm text-slate-500">No upcoming events in range.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {eventSummaries.map((ev) => {
                const priceLabel =
                  ev.from_price_pence == null || ev.from_price_pence <= 0
                    ? 'Free'
                    : `From ${sym}${(ev.from_price_pence / 100).toFixed(2)}`;
                return (
                  <button
                    key={ev.series_key}
                    type="button"
                    onClick={() => {
                      setSelectedSeriesKey(ev.series_key);
                      setSelectedCalendarDate(null);
                      setStep(2);
                    }}
                    className="w-full rounded-lg px-3 py-3 text-left text-sm bg-slate-50 text-slate-800 hover:bg-slate-100"
                  >
                    <div className="font-medium">{ev.event_name}</div>
                    <div className="text-xs text-slate-500">
                      {ev.occurrence_count} date{ev.occurrence_count !== 1 ? 's' : ''}
                    </div>
                    {ev.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-600">{ev.description}</p> : null}
                    <div className="mt-2 text-sm font-medium text-slate-700">{priceLabel}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === 2 && selectedSummary && rangeFrom && rangeTo && (
        <div>
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setSelectedSeriesKey(null);
              setSelectedCalendarDate(null);
            }}
            className="mb-4 text-sm text-brand-600 hover:underline"
          >
            &larr; Back to events
          </button>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">{selectedSummary.event_name}</h2>
          <p className="mb-4 text-sm text-slate-500">Pick a date when this event is running.</p>
          <ClassOfferingsCalendar
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            highlightedDates={selectedSummary.dates}
            selectedDate={selectedCalendarDate}
            onSelectDate={handleCalendarSelectDate}
            footerMessage="Dates when this event runs are highlighted in green. Select a date to continue."
          />
          {selectedCalendarDate && candidatesForCalendarDate.length > 1 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-800">Choose a time</p>
              <div className="flex flex-wrap gap-2">
                {candidatesForCalendarDate.map((slot) => (
                  <button
                    key={slot.event_id}
                    type="button"
                    onClick={() => pickTimeSlot(slot)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:border-brand-400 hover:bg-brand-50"
                  >
                    {timeForApi(slot.start_time)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && selectedOccurrence && (
        <div>
          <button
            type="button"
            onClick={() => {
              setSelectedOccurrence(null);
              setTicketSelections({});
              setStep(2);
            }}
            className="mb-2 text-sm text-brand-600 hover:underline"
          >
            &larr; Back to date
          </button>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session summary</p>
            <div className="mt-2 font-semibold text-slate-900">{selectedOccurrence.event_name}</div>
            <div className="text-slate-600">
              {selectedOccurrence.event_date} at {timeForApi(selectedOccurrence.start_time)} –{' '}
              {timeForApi(selectedOccurrence.end_time)}
            </div>
            {selectedOccurrence.description ? (
              <p className="mt-2 text-xs text-slate-600">{selectedOccurrence.description}</p>
            ) : null}
          </div>

          <div className="mt-5 space-y-2">
            <p className="text-sm font-medium text-slate-800">Tickets</p>
            {selectedOccurrence.ticket_types.map((tt) => (
              <div
                key={tt.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
              >
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
            <p className="mt-3 text-sm text-slate-600">
              Total: {totalTickets} ticket{totalTickets === 1 ? '' : 's'} · {sym}
              {(totalPricePence / 100).toFixed(2)}
            </p>
          )}

          <button
            type="button"
            disabled={totalTickets < 1}
            onClick={() => setStep(4)}
            className="mt-6 w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            Continue to guest details
          </button>
        </div>
      )}

      {step === 4 && selectedOccurrence && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <button
            type="button"
            onClick={() => setStep(3)}
            className="mb-2 text-sm text-brand-600 hover:underline"
          >
            &larr; Back to tickets
          </button>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Booking</p>
            <div className="mt-2 font-semibold text-slate-900">{selectedOccurrence.event_name}</div>
            <div className="text-slate-600">
              {selectedOccurrence.event_date} at {timeForApi(selectedOccurrence.start_time)} · {totalTickets} ticket
              {totalTickets !== 1 ? 's' : ''} · {sym}
              {(totalPricePence / 100).toFixed(2)}
            </div>
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
      )}
    </div>
  );
}
