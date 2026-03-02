'use client';

import { useCallback, useState } from 'react';

interface Slot {
  key: string;
  label: string;
  start_time: string;
  end_time: string;
  available_covers: number;
}

export function PhoneBookingForm({ venueId }: { venueId: string }) {
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ booking_id: string; payment_url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(() => {
    if (!date) return;
    setLoadingSlots(true);
    setError(null);
    fetch(`/api/booking/availability?venue_id=${encodeURIComponent(venueId)}&date=${encodeURIComponent(date)}&party_size=${partySize}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((data) => {
        setSlots(data.slots ?? []);
        setSelectedTime('');
      })
      .catch(() => setError('Failed to load times'))
      .finally(() => setLoadingSlots(false));
  }, [venueId, date, partySize]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !selectedTime || !name.trim() || !phone.trim()) return;
    setError(null);
    setSubmitting(true);
    fetch('/api/venue/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_date: date,
        booking_time: selectedTime,
        party_size: partySize,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((j) => Promise.reject(new Error(j.error ?? 'Failed')));
        return r.json();
      })
      .then((data) => setResult({ booking_id: data.booking_id, payment_url: data.payment_url }))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      {result ? (
        <div className="space-y-4">
          <div className="rounded border border-green-200 bg-green-50 p-4 text-green-800">
            <p className="font-medium">Booking created</p>
            <p className="mt-1 text-sm">Status: Pending. Deposit link sent to guest (stub: see server logs).</p>
          </div>
          {result.payment_url && (
            <p className="text-sm text-neutral-600">
              Payment link: <a href={result.payment_url} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">{result.payment_url}</a>
            </p>
          )}
          <p className="text-xs text-neutral-500">If deposit not paid within 24 hours, the booking will be auto-cancelled.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-neutral-700 mb-1">Date</label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setSlots([]); }}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full rounded border border-neutral-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Party size</label>
            <input
              type="number"
              min={1}
              max={50}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <button type="button" onClick={fetchSlots} disabled={!date || loadingSlots} className="rounded bg-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-300 disabled:opacity-50">
              {loadingSlots ? 'Loading…' : 'Load times'}
            </button>
          </div>

          {slots.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Time / sitting</label>
              <select
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full rounded border border-neutral-300 px-3 py-2"
                required
              >
                <option value="">Select…</option>
                {slots.map((s) => (
                  <option key={s.key} value={s.start_time}>
                    {s.label} ({s.available_covers} left)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-1">Guest name *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-neutral-300 px-3 py-2" required />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-neutral-700 mb-1">Phone *</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded border border-neutral-300 px-3 py-2" required />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">Email (optional)</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border border-neutral-300 px-3 py-2" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={!date || !selectedTime || !name.trim() || !phone.trim() || submitting} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {submitting ? 'Creating…' : 'Create booking'}
          </button>
        </form>
      )}
    </div>
  );
}
