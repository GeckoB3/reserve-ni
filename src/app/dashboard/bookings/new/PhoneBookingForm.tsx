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
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ booking_id: string; payment_url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSlots = useCallback(() => {
    if (!date) return;
    setLoadingSlots(true);
    setError(null);
    fetch(`/api/booking/availability?venue_id=${encodeURIComponent(venueId)}&date=${encodeURIComponent(date)}&party_size=${partySize}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((data) => { setSlots(data.slots ?? []); setSelectedTime(''); })
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
        require_deposit: requireDeposit,
      }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((j) => Promise.reject(new Error(j.error ?? 'Failed')));
        return r.json();
      })
      .then((data) => setResult({ booking_id: data.booking_id, payment_url: data.payment_url }))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setSubmitting(false));
  };

  if (result) {
    const hasDeposit = Boolean(result.payment_url);
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className={`rounded-xl border p-5 ${hasDeposit ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${hasDeposit ? 'bg-amber-100' : 'bg-emerald-100'}`}>
              <svg className={`h-5 w-5 ${hasDeposit ? 'text-amber-600' : 'text-emerald-600'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <p className={`font-semibold ${hasDeposit ? 'text-amber-800' : 'text-emerald-800'}`}>
              {hasDeposit ? 'Booking Created — Deposit Requested' : 'Booking Confirmed'}
            </p>
          </div>
          <p className={`text-sm ${hasDeposit ? 'text-amber-700' : 'text-emerald-700'}`}>
            {hasDeposit
              ? 'A deposit payment link has been sent to the guest via SMS and email.'
              : 'A confirmation has been sent to the guest via SMS and email.'}
          </p>
        </div>
        {result.payment_url && (
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="mb-1 text-xs font-medium text-slate-500">Payment link</p>
            <a href={result.payment_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:text-brand-700 break-all">{result.payment_url}</a>
          </div>
        )}
        {hasDeposit && (
          <p className="text-xs text-slate-400">If deposit is not paid within 24 hours, the booking will be auto-cancelled.</p>
        )}
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setDate('');
            setSlots([]);
            setSelectedTime('');
            setPartySize(2);
            setName('');
            setPhone('');
            setEmail('');
            setRequireDeposit(false);
            setError(null);
          }}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Create Another Booking
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setSlots([]); }}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Covers</label>
            <input
              type="number"
              min={1}
              max={50}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={fetchSlots}
          disabled={!date || loadingSlots}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {loadingSlots ? 'Checking availability...' : 'Check Available Times'}
        </button>

        {slots.length > 0 && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Time slot</label>
            <select
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              required
            >
              <option value="">Select a time...</option>
              {slots.map((s) => (
                <option key={s.key} value={s.start_time}>{s.label} ({s.available_covers} covers left)</option>
              ))}
            </select>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 space-y-4">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">Guest name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" required />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" required />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">Email <span className="text-slate-400">(optional)</span></label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>

        {/* Deposit toggle */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Require deposit</p>
            <p className="text-xs text-slate-500">Send a payment link to the guest</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={requireDeposit}
            onClick={() => setRequireDeposit(!requireDeposit)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${requireDeposit ? 'bg-brand-600' : 'bg-slate-200'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${requireDeposit ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
        )}

        <button
          type="submit"
          disabled={!date || !selectedTime || !name.trim() || !phone.trim() || submitting}
          className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'Creating Booking...' : 'Create Booking'}
        </button>
      </form>
    </div>
  );
}
