'use client';

import { useCallback, useEffect, useState } from 'react';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';

interface ClassAvail {
  instance_id: string;
  class_name: string;
  instance_date: string;
  start_time: string;
  duration_minutes: number;
  remaining: number;
  price_pence: number | null;
  colour: string;
}

type Source = 'phone' | 'walk-in';

function timeForApi(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function StaffClassBookingForm({
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
  const [classes, setClasses] = useState<ClassAvail[]>([]);
  const [selected, setSelected] = useState<ClassAvail | null>(null);
  const [partySize, setPartySize] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<Source>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/venue/class-availability?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load classes');
      setError(null);
      setClasses(data.classes ?? []);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load classes');
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void fetchClasses();
  }, [fetchClasses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selected) {
      setError('Select a class.');
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
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">New class booking</h1>

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

        {loading && !classes.length ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Class</label>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {classes.length === 0 ? (
                <p className="text-sm text-slate-500">No classes on this date.</p>
              ) : (
                classes.map((c) => (
                  <button
                    key={c.instance_id}
                    type="button"
                    onClick={() => setSelected(c)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      selected?.instance_id === c.instance_id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-medium">{c.class_name}</div>
                    <div className="text-xs opacity-80">
                      {timeForApi(c.start_time)} · {c.remaining} places · {c.duration_minutes} min
                      {c.price_pence != null && c.price_pence > 0
                        ? ` · ${sym}${((c.price_pence * partySize) / 100).toFixed(2)} total est.`
                        : ''}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {selected && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Party size</label>
            <input
              type="number"
              min={1}
              max={selected.remaining}
              value={partySize}
              onChange={(e) => setPartySize(Math.max(1, Math.min(selected.remaining, parseInt(e.target.value, 10) || 1)))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">Up to {selected.remaining} spaces left.</p>
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
          disabled={loading || !selected}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create booking'}
        </button>
      </form>
    </div>
  );
}
