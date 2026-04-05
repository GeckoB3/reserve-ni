'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';
import { ResourceCalendarMonth, todayYmdLocal } from './ResourceCalendarMonth';
import { slotIntervalDurationLabel } from '@/lib/booking/slot-interval-label';

interface ResourceSlot {
  resource_id: string;
  resource_name: string;
  start_time: string;
  price_per_slot_pence: number | null;
}

interface ResourceOption {
  id: string;
  name: string;
  resource_type: string | null;
  min_booking_minutes: number;
  max_booking_minutes: number;
  slot_interval_minutes: number;
  price_per_slot_pence: number | null;
}

interface ResourceAvail extends ResourceOption {
  slots: ResourceSlot[];
}

type Source = 'phone' | 'walk-in';

type Step = 'resource' | 'calendar' | 'time' | 'summary' | 'guest';

function timeForApi(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/** Add minutes to HH:mm (same-day; wraps at 24h). */
function addMinutesToHHmm(start: string, minutesToAdd: number): string {
  const hm = timeForApi(start);
  const [h, m] = hm.split(':').map(Number);
  let total = h * 60 + m + minutesToAdd;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

export function StaffResourceBookingForm({
  venueId: _venueId,
  currency = 'GBP',
  onCreated,
  embedded = false,
  defaultSource,
  initialDate,
}: {
  venueId: string;
  currency?: string;
  onCreated?: () => void;
  embedded?: boolean;
  defaultSource?: Source;
  initialDate?: string;
}) {
  const phoneDefaultCountry = defaultPhoneCountryForVenueCurrency(currency);
  const sym = currency === 'EUR' ? '€' : '£';

  const [step, setStep] = useState<Step>('resource');
  const [resourceOptions, setResourceOptions] = useState<ResourceOption[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const [durationMinutes, setDurationMinutes] = useState(60);
  const [source, setSource] = useState<Source>(defaultSource ?? 'phone');

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  const [date, setDate] = useState('');
  const [slotsResource, setSlotsResource] = useState<ResourceAvail | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);

  const [partySize] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedResource = useMemo(
    () => resourceOptions.find((r) => r.id === selectedResourceId) ?? null,
    [resourceOptions, selectedResourceId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      try {
        const res = await fetch('/api/venue/resource-options');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Failed to load resources');
        setResourceOptions(data.resources ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load resources');
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedResource) return;
    setDurationMinutes((d) =>
      Math.min(Math.max(d, selectedResource.min_booking_minutes), selectedResource.max_booking_minutes),
    );
  }, [selectedResource]);

  useEffect(() => {
    if (step !== 'calendar' || !selectedResourceId) return;
    let cancelled = false;
    (async () => {
      setLoadingCalendar(true);
      try {
        const params = new URLSearchParams({
          resource_id: selectedResourceId,
          year: String(calendarMonth.year),
          month: String(calendarMonth.month),
          duration: String(durationMinutes),
        });
        const res = await fetch(`/api/venue/resource-calendar?${params}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Failed to load calendar');
        setAvailableDates(new Set((data.available_dates ?? []) as string[]));
      } catch (e) {
        if (!cancelled) {
          setAvailableDates(new Set());
          setError(e instanceof Error ? e.message : 'Failed to load calendar');
        }
      } finally {
        if (!cancelled) setLoadingCalendar(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, selectedResourceId, calendarMonth.year, calendarMonth.month, durationMinutes]);

  useEffect(() => {
    if (step !== 'calendar' || !date) return;
    const [y, m] = date.split('-').map(Number);
    if (y !== calendarMonth.year || m !== calendarMonth.month) {
      setDate('');
    }
  }, [step, calendarMonth.year, calendarMonth.month, date]);

  useEffect(() => {
    if (step !== 'time' && step !== 'summary' && step !== 'guest') return;
    if (!selectedResourceId || !date) return;
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const res = await fetch(`/api/venue/resource-availability?date=${date}&duration=${durationMinutes}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Failed to load times');
        const list = (data.resources ?? []) as ResourceAvail[];
        const r = list.find((x) => x.id === selectedResourceId) ?? null;
        setSlotsResource(r);
      } catch (e) {
        if (!cancelled) {
          setSlotsResource(null);
          setError(e instanceof Error ? e.message : 'Failed to load times');
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, selectedResourceId, date, durationMinutes]);

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    if (defaultSource) setSource(defaultSource);
  }, [defaultSource]);

  const bookingEndTime = useMemo(() => {
    if (!selectedStart) return null;
    return addMinutesToHHmm(selectedStart, durationMinutes);
  }, [selectedStart, durationMinutes]);

  const selectResource = useCallback(
    (id: string) => {
      setError(null);
      setSuccess(null);
      setSelectedResourceId(id);
      const n = new Date();
      setCalendarMonth({ year: n.getFullYear(), month: n.getMonth() + 1 });
      setDate('');
      setSelectedStart(null);
      setSlotsResource(null);
      setStep('calendar');
    },
    [],
  );

  const onCalendarPickDay = (ymd: string) => {
    setError(null);
    setDate(ymd);
    setSelectedStart(null);
    setStep('time');
  };

  const goPrevMonth = () => {
    setCalendarMonth((cm) => (cm.month <= 1 ? { year: cm.year - 1, month: 12 } : { year: cm.year, month: cm.month - 1 }));
  };

  const goNextMonth = () => {
    setCalendarMonth((cm) => (cm.month >= 12 ? { year: cm.year + 1, month: 1 } : { year: cm.year, month: cm.month + 1 }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selectedResource || !selectedStart || !bookingEndTime) {
      setError('Select a resource and start time.');
      return;
    }
    if (durationMinutes < selectedResource.min_booking_minutes || durationMinutes > selectedResource.max_booking_minutes) {
      setError(
        `Duration must be between ${selectedResource.min_booking_minutes} and ${selectedResource.max_booking_minutes} minutes for this resource.`,
      );
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
          booking_date: date,
          booking_time: timeForApi(selectedStart),
          booking_end_time: bookingEndTime,
          party_size: partySize,
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim(),
          resource_id: selectedResource.id,
          source,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Booking failed');
      setSuccess(
        data.payment_url ? 'Booking created. Deposit request sent to the guest.' : 'Booking created and confirmation sent.',
      );
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  const minYmd = todayYmdLocal();

  return (
    <div className={embedded ? 'max-w-full' : 'mx-auto max-w-lg'}>
      {!embedded && <h1 className="mb-6 text-2xl font-semibold text-slate-900">New resource booking</h1>}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {step === 'resource' && (
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Duration (minutes)</label>
            <input
              type="number"
              min={5}
              max={1440}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Math.max(5, parseInt(e.target.value, 10) || 60))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">You will pick a date and time next. Slots depend on this duration.</p>
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
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Choose a resource</h2>
            {loadingList ? (
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ) : resourceOptions.length === 0 ? (
              <p className="text-sm text-slate-500">No resources configured.</p>
            ) : (
              <div className="space-y-2">
                {resourceOptions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => selectResource(r.id)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition hover:border-slate-300"
                  >
                    <div className="font-medium text-slate-900">{r.name}</div>
                    {r.resource_type && <div className="text-xs text-slate-500">{r.resource_type}</div>}
                    <div className="mt-1 text-xs text-slate-500">
                      {r.min_booking_minutes}–{r.max_booking_minutes} min ·{' '}
                      {r.price_per_slot_pence != null
                        ? `${sym}${(r.price_per_slot_pence / 100).toFixed(2)} per ${slotIntervalDurationLabel(r.slot_interval_minutes)}`
                        : '—'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'calendar' && selectedResource && (
        <div>
          <button
            type="button"
            onClick={() => {
              setSelectedResourceId(null);
              setStep('resource');
            }}
            className="mb-4 text-sm text-slate-600 hover:underline"
          >
            ← Back to resources
          </button>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">{selectedResource.name}</h2>
          <p className="mb-4 text-sm text-slate-600">
            Green days have availability for {durationMinutes} minutes. Select a day to choose a start time.
          </p>
          <ResourceCalendarMonth
            year={calendarMonth.year}
            month={calendarMonth.month}
            availableDates={availableDates}
            selectedDate={date || null}
            onSelectDate={onCalendarPickDay}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
            minSelectableDate={minYmd}
            loading={loadingCalendar}
          />
        </div>
      )}

      {step === 'time' && selectedResource && (
        <div>
          <button
            type="button"
            onClick={() => {
              setSelectedStart(null);
              setStep('calendar');
            }}
            className="mb-4 text-sm text-slate-600 hover:underline"
          >
            ← Back to calendar
          </button>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Start time</h2>
          <p className="mb-4 text-sm text-slate-500">
            {selectedResource.name} · {date}
          </p>
          {loadingSlots ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : !slotsResource || slotsResource.slots.length === 0 ? (
            <p className="text-sm text-slate-500">No slots for this resource. Go back and pick another day.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slotsResource.slots.map((slot) => (
                <button
                  key={slot.start_time}
                  type="button"
                  onClick={() => {
                    setSelectedStart(slot.start_time);
                    setStep('summary');
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    selectedStart === slot.start_time
                      ? 'bg-slate-900 text-white'
                      : 'bg-green-50 text-green-800 hover:bg-green-100'
                  }`}
                >
                  {timeForApi(slot.start_time)}
                  {slot.price_per_slot_pence != null
                    ? ` · ${sym}${(slot.price_per_slot_pence / 100).toFixed(2)} per ${slotIntervalDurationLabel(selectedResource.slot_interval_minutes)}`
                    : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'summary' && selectedResource && selectedStart && (
        <div className="space-y-4">
          <button type="button" onClick={() => setStep('time')} className="text-sm text-slate-600 hover:underline">
            ← Back to times
          </button>
          <h2 className="text-lg font-semibold text-slate-900">Booking summary</h2>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm">
            <div className="font-medium text-slate-900">{selectedResource.name}</div>
            <div className="mt-1 text-slate-600">
              {date} · {timeForApi(selectedStart)} – {addMinutesToHHmm(selectedStart, durationMinutes)} ({durationMinutes} min)
            </div>
            {selectedResource.price_per_slot_pence != null && (
              <div className="mt-2 text-slate-700">
                From {sym}
                {((selectedResource.price_per_slot_pence * Math.ceil(durationMinutes / selectedResource.slot_interval_minutes)) / 100).toFixed(2)}{' '}
                <span className="text-slate-500">
                  (price per {slotIntervalDurationLabel(selectedResource.slot_interval_minutes)})
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStep('guest')}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
          >
            Continue to guest details
          </button>
        </div>
      )}

      {step === 'guest' && selectedResource && selectedStart && bookingEndTime && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <button type="button" onClick={() => setStep('summary')} className="text-sm text-slate-600 hover:underline">
            ← Back to summary
          </button>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <div className="font-medium text-slate-900">{selectedResource.name}</div>
            <div>
              {date} · {timeForApi(selectedStart)} – {bookingEndTime}
            </div>
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
