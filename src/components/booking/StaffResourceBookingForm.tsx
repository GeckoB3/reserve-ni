'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';

interface ResourceSlot {
  resource_id: string;
  resource_name: string;
  start_time: string;
  price_per_slot_pence: number | null;
}

interface ResourceAvail {
  id: string;
  name: string;
  min_booking_minutes: number;
  max_booking_minutes: number;
  slot_interval_minutes: number;
  slots: ResourceSlot[];
}

type Source = 'phone' | 'walk-in';

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
}: {
  venueId: string;
  currency?: string;
  onCreated?: () => void;
}) {
  const phoneDefaultCountry = defaultPhoneCountryForVenueCurrency(currency);
  const sym = currency === 'EUR' ? '€' : '£';
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [resources, setResources] = useState<ResourceAvail[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [partySize] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<Source>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedResource = useMemo(
    () => resources.find((r) => r.id === selectedResourceId) ?? null,
    [resources, selectedResourceId],
  );

  useEffect(() => {
    if (!selectedResource) return;
    setDurationMinutes((d) =>
      Math.min(Math.max(d, selectedResource.min_booking_minutes), selectedResource.max_booking_minutes),
    );
  }, [selectedResource]);

  const fetchResources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/venue/resource-availability?date=${date}&duration=${durationMinutes}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load resources');
      setError(null);
      setResources(data.resources ?? []);
      setSelectedResourceId(null);
      setSelectedStart(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load resources');
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, [date, durationMinutes]);

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  const bookingEndTime = useMemo(() => {
    if (!selectedStart) return null;
    return addMinutesToHHmm(selectedStart, durationMinutes);
  }, [selectedStart, durationMinutes]);

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
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New resource booking</h1>

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
          <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

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
          <p className="mt-1 text-xs text-slate-500">
            Slots are recalculated for this duration. Pricing uses slot intervals (see venue resource settings).
          </p>
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

        {loading && !resources.length ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Resource</label>
            <select
              value={selectedResourceId ?? ''}
              onChange={(e) => {
                setSelectedResourceId(e.target.value || null);
                setSelectedStart(null);
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Choose…</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.min_booking_minutes}–{r.max_booking_minutes} min)
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedResource && selectedResource.slots.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Start time</label>
            <div className="flex flex-wrap gap-2">
              {selectedResource.slots.map((slot) => (
                <button
                  key={slot.start_time}
                  type="button"
                  onClick={() => setSelectedStart(slot.start_time)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    selectedStart === slot.start_time
                      ? 'bg-slate-900 text-white'
                      : 'bg-green-50 text-green-800 hover:bg-green-100'
                  }`}
                >
                  {timeForApi(slot.start_time)}
                  {slot.price_per_slot_pence != null ? ` · ${sym}${(slot.price_per_slot_pence / 100).toFixed(2)}/slot` : ''}
                </button>
              ))}
            </div>
            {bookingEndTime && selectedStart && (
              <p className="mt-2 text-xs text-slate-600">
                Ends at {bookingEndTime} ({durationMinutes} minutes).
              </p>
            )}
          </div>
        )}

        {selectedResource && selectedResource.slots.length === 0 && (
          <p className="text-sm text-slate-500">No slots for this resource at the chosen duration.</p>
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
          disabled={loading || !selectedResource || !selectedStart}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create booking'}
        </button>
      </form>
    </div>
  );
}
