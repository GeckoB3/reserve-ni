'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';
import { ClassOfferingsCalendar } from './ClassOfferingsCalendar';

interface ClassOfferingSummary {
  class_type_id: string;
  class_name: string;
  description: string | null;
  colour: string;
  price_pence: number | null;
  instructor_name: string | null;
  dates: string[];
  session_count: number;
}

interface ClassAvail {
  instance_id: string;
  class_type_id: string;
  class_name: string;
  description: string | null;
  instance_date: string;
  start_time: string;
  duration_minutes: number;
  remaining: number;
  price_pence: number | null;
  colour: string;
}

type Source = 'phone' | 'walk-in';

type Step = 1 | 2 | 3;

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

function mapRow(row: Record<string, unknown>): ClassAvail {
  return {
    instance_id: row.instance_id as string,
    class_type_id: row.class_type_id as string,
    class_name: row.class_name as string,
    description: (row.description as string | null) ?? null,
    instance_date: row.instance_date as string,
    start_time: row.start_time as string,
    duration_minutes: row.duration_minutes as number,
    remaining: row.remaining as number,
    price_pence: (row.price_pence as number | null) ?? null,
    colour: (row.colour as string) ?? '#6366f1',
  };
}

export function StaffClassBookingForm({
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
  /** @deprecated Date is chosen after class; kept for API compatibility. */
  initialDate?: string;
}) {
  const phoneDefaultCountry = defaultPhoneCountryForVenueCurrency(currency);
  const sym = currency === 'EUR' ? '€' : '£';

  const [step, setStep] = useState<Step>(1);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [classSummaries, setClassSummaries] = useState<ClassOfferingSummary[]>([]);
  const [instances, setInstances] = useState<ClassAvail[]>([]);
  const [selectedClassTypeId, setSelectedClassTypeId] = useState<string | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<ClassAvail | null>(null);
  const [partySize, setPartySize] = useState(1);
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
      const res = await fetch(`/api/venue/class-offerings?from=${from}&days=90`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load classes');
      setError(null);
      setRangeFrom(data.from ?? from);
      setRangeTo(data.to ?? '');
      setClassSummaries((data.classes ?? []) as ClassOfferingSummary[]);
      const raw = (data.instances ?? []) as Record<string, unknown>[];
      setInstances(raw.map(mapRow));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load classes');
      setClassSummaries([]);
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
    () => classSummaries.find((c) => c.class_type_id === selectedClassTypeId) ?? null,
    [classSummaries, selectedClassTypeId],
  );

  const instancesForType = useMemo(
    () => instances.filter((i) => i.class_type_id === selectedClassTypeId && i.remaining > 0),
    [instances, selectedClassTypeId],
  );

  const candidatesForCalendarDate = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return instancesForType.filter((i) => i.instance_date === selectedCalendarDate);
  }, [instancesForType, selectedCalendarDate]);

  function handleCalendarSelectDate(iso: string) {
    const candidates = instancesForType.filter((i) => i.instance_date === iso && i.remaining > 0);
    if (candidates.length === 1) {
      setSelected(candidates[0]!);
      setPartySize(1);
      setStep(3);
      setSelectedCalendarDate(null);
      return;
    }
    setSelectedCalendarDate(iso);
  }

  function pickTimeSlot(slot: ClassAvail) {
    setSelected(slot);
    setPartySize(1);
    setStep(3);
    setSelectedCalendarDate(null);
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selected) {
      setError('Select a class session.');
      return;
    }
    if (partySize < 1 || partySize > selected.remaining) {
      setError(`Party size must be between 1 and ${selected.remaining}.`);
      return;
    }
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone are required.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/venue/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: selected.instance_date,
          booking_time: timeForApi(selected.start_time),
          party_size: partySize,
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim(),
          class_instance_id: selected.instance_id,
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
      {!embedded && <h1 className="mb-6 text-2xl font-semibold text-slate-900">New class booking</h1>}

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
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Choose a class</h2>
          <p className="mb-4 text-sm text-slate-500">Sessions available in the next 3 months.</p>
          {loading && !classSummaries.length ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : classSummaries.length === 0 ? (
            <p className="text-sm text-slate-500">No upcoming classes in range.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {classSummaries.map((cls) => (
                <button
                  key={cls.class_type_id}
                  type="button"
                  onClick={() => {
                    setSelectedClassTypeId(cls.class_type_id);
                    setSelectedCalendarDate(null);
                    setStep(2);
                  }}
                  className="w-full rounded-lg px-3 py-3 text-left text-sm bg-slate-50 text-slate-800 hover:bg-slate-100"
                >
                  <div className="font-medium">{cls.class_name}</div>
                  <div className="text-xs text-slate-500">
                    {cls.session_count} session{cls.session_count !== 1 ? 's' : ''}
                    {cls.instructor_name ? ` · ${cls.instructor_name}` : ''}
                  </div>
                </button>
              ))}
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
              setSelectedClassTypeId(null);
              setSelectedCalendarDate(null);
            }}
            className="mb-4 text-sm text-brand-600 hover:underline"
          >
            &larr; Back to classes
          </button>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">{selectedSummary.class_name}</h2>
          <p className="mb-4 text-sm text-slate-500">Pick a date when this class runs.</p>
          <ClassOfferingsCalendar
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            highlightedDates={selectedSummary.dates}
            selectedDate={selectedCalendarDate}
            onSelectDate={handleCalendarSelectDate}
          />
          {selectedCalendarDate && candidatesForCalendarDate.length > 1 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-800">Choose a time</p>
              <div className="flex flex-wrap gap-2">
                {candidatesForCalendarDate.map((slot) => (
                  <button
                    key={slot.instance_id}
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

      {step === 3 && selected && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setStep(2);
            }}
            className="mb-2 text-sm text-brand-600 hover:underline"
          >
            &larr; Back to date
          </button>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session summary</p>
            <div className="mt-2 font-semibold text-slate-900">{selected.class_name}</div>
            <div className="text-slate-600">
              {selected.instance_date} at {timeForApi(selected.start_time)} · {selected.duration_minutes} min
            </div>
            {selected.description ? <p className="mt-2 text-xs text-slate-600">{selected.description}</p> : null}
            {selected.price_pence != null && selected.price_pence > 0 ? (
              <div className="mt-2 text-slate-800">
                {sym}
                {(selected.price_pence / 100).toFixed(2)} per person (informational)
              </div>
            ) : null}
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Party size</label>
            <input
              type="number"
              min={1}
              max={selected.remaining}
              value={partySize}
              onChange={(e) =>
                setPartySize(Math.max(1, Math.min(selected.remaining, parseInt(e.target.value, 10) || 1)))
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">Up to {selected.remaining} spaces left.</p>
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
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create booking'}
          </button>
        </form>
      )}
    </div>
  );
}
