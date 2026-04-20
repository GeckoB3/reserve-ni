'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { NumericInput } from '@/components/ui/NumericInput';

interface ResourceInfo {
  id: string;
  name: string;
  resource_type: string | null;
  min_booking_minutes: number;
  max_booking_minutes: number;
  slot_interval_minutes: number;
  price_per_slot_pence: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  venueId: string;
  currency?: string;
  resourceId: string;
  preselectedDate?: string;
  preselectedTime?: string;
}

function formatCurrency(pence: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(pence / 100);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function ResourceSlotBookingForm({
  open,
  onClose,
  onCreated,
  venueId,
  currency = 'GBP',
  resourceId,
  preselectedDate,
  preselectedTime,
}: Props) {
  const [resource, setResource] = useState<ResourceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(preselectedDate ?? '');
  const [startTime, setStartTime] = useState(preselectedTime ?? '');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [partySize, setPartySize] = useState(1);

  // Sync preselected values when they change
  useEffect(() => {
    if (preselectedDate) setDate(preselectedDate);
  }, [preselectedDate]);
  useEffect(() => {
    if (preselectedTime) setStartTime(preselectedTime);
  }, [preselectedTime]);

  // Fetch resource info when opened
  useEffect(() => {
    if (!open || !resourceId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/venue/resources/${resourceId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load resource');
        return res.json();
      })
      .then((data) => {
        const r = data.resource;
        setResource({
          id: r.id,
          name: r.name,
          resource_type: r.resource_type,
          min_booking_minutes: r.min_booking_minutes ?? 60,
          max_booking_minutes: r.max_booking_minutes ?? 120,
          slot_interval_minutes: r.slot_interval_minutes ?? 30,
          price_per_slot_pence: r.price_per_slot_pence ?? null,
        });
        setDurationMinutes(r.min_booking_minutes ?? 60);
      })
      .catch(() => setError('Could not load resource details'))
      .finally(() => setLoading(false));
  }, [open, resourceId]);

  // Reset form when closed
  useEffect(() => {
    if (!open) {
      setGuestName('');
      setGuestEmail('');
      setGuestPhone('');
      setPartySize(1);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  // Duration options based on resource constraints
  const durationOptions = useMemo(() => {
    if (!resource) return [];
    const opts: number[] = [];
    const step = resource.slot_interval_minutes;
    for (let d = resource.min_booking_minutes; d <= resource.max_booking_minutes; d += step) {
      opts.push(d);
    }
    // Ensure at least one option
    if (opts.length === 0) opts.push(resource.min_booking_minutes);
    return opts;
  }, [resource]);

  // Computed end time
  const endTime = useMemo(() => {
    if (!startTime) return '';
    const startMins = timeToMinutes(startTime);
    return minutesToTime(startMins + durationMinutes);
  }, [startTime, durationMinutes]);

  // Computed price
  const totalPricePence = useMemo(() => {
    if (!resource?.price_per_slot_pence) return null;
    const slots = durationMinutes / resource.slot_interval_minutes;
    return Math.round(resource.price_per_slot_pence * slots);
  }, [resource, durationMinutes]);

  const formatDuration = useCallback((mins: number) => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!resource || !date || !startTime || !guestName.trim()) return;

      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/booking/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venue_id: venueId,
            booking_date: date,
            booking_time: startTime.length === 5 ? startTime + ':00' : startTime,
            booking_end_time: endTime.length === 5 ? endTime + ':00' : endTime,
            resource_id: resource.id,
            guest_name: guestName.trim(),
            guest_email: guestEmail.trim() || undefined,
            guest_phone: guestPhone.trim() || undefined,
            party_size: partySize,
            booking_model: 'resource_booking',
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to create booking');
        }
        onCreated();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create booking');
      } finally {
        setSubmitting(false);
      }
    },
    [resource, date, startTime, endTime, guestName, guestEmail, guestPhone, partySize, venueId, onCreated],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="resource-booking-title"
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 id="resource-booking-title" className="text-base font-semibold text-slate-900">
              Book resource
            </h3>
            {resource && (
              <p className="mt-0.5 text-sm text-slate-500">
                {resource.name}
                {resource.resource_type ? ` \u00b7 ${resource.resource_type}` : ''}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            </div>
          ) : error && !resource ? (
            <p className="py-4 text-center text-sm text-red-600">{error}</p>
          ) : resource ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Date & time row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Start time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Duration</label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {durationOptions.map((d) => (
                    <option key={d} value={d}>
                      {formatDuration(d)}
                    </option>
                  ))}
                </select>
                {endTime && (
                  <p className="mt-1 text-xs text-slate-500">
                    {startTime.slice(0, 5)} &ndash; {endTime.slice(0, 5)}
                    {totalPricePence != null && (
                      <span className="ml-2 font-medium text-slate-700">
                        {formatCurrency(totalPricePence, currency)}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Guest name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Guest name</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  required
                  placeholder="e.g. John Smith"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Email & phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Party size */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Party size</label>
                <NumericInput
                  min={1}
                  max={50}
                  value={partySize}
                  onChange={setPartySize}
                  className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Error */}
              {error && <p className="text-sm text-red-600">{error}</p>}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !guestName.trim() || !date || !startTime}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {submitting ? 'Booking\u2026' : 'Create booking'}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
