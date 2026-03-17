'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NumericInput } from '@/components/ui/NumericInput';

interface Slot {
  key: string;
  label: string;
  start_time: string;
  available_covers: number;
}

interface ModifyBookingInlineProps {
  bookingId: string;
  venueId: string;
  currentDate: string;
  currentTime: string;
  currentPartySize: number;
  onSaved: () => void;
  onCancel: () => void;
}

export function ModifyBookingInline({
  bookingId,
  venueId,
  currentDate,
  currentTime,
  currentPartySize,
  onSaved,
  onCancel,
}: ModifyBookingInlineProps) {
  const [date, setDate] = useState(currentDate);
  const [partySize, setPartySize] = useState(currentPartySize);
  const [selectedTime, setSelectedTime] = useState(currentTime.slice(0, 5));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasChanges =
    date !== currentDate ||
    selectedTime !== currentTime.slice(0, 5) ||
    partySize !== currentPartySize;

  useEffect(() => {
    if (!date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
          const url = `/api/booking/availability?venue_id=${encodeURIComponent(venueId)}&date=${encodeURIComponent(date)}&party_size=${partySize}`;
          const res = await fetch(url, { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (!res.ok) throw new Error('Failed to load times');
          const data = await res.json();
          const rawSlots: Slot[] = (data.slots ?? [])
            .map((s: Record<string, unknown>) => ({
              key: (s.key as string) ?? (s.start_time as string) ?? '',
              label: (s.label as string) ?? (s.start_time as string)?.slice(0, 5) ?? '',
              start_time: (s.start_time as string) ?? '',
              available_covers: (s.available_covers as number) ?? 0,
            }))
            .filter((s: Slot) => s.start_time);
          if (!controller.signal.aborted) {
            setSlots(rawSlots);
            const currentTimeShort = selectedTime.slice(0, 5);
            const match = rawSlots.find(
              (s) => s.start_time.slice(0, 5) === currentTimeShort,
            );
            if (!match && rawSlots.length > 0) {
              setSelectedTime(rawSlots[0].start_time.slice(0, 5));
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (!controller.signal.aborted) setSlots([]);
        } finally {
          if (!controller.signal.aborted) setLoadingSlots(false);
        }
      })();
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, partySize, venueId]);

  const handleSave = useCallback(async () => {
    if (!hasChanges) {
      onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (date !== currentDate) body.booking_date = date;
      if (selectedTime !== currentTime.slice(0, 5))
        body.booking_time = selectedTime;
      if (partySize !== currentPartySize) body.party_size = partySize;

      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setError(
            (j as { error?: string }).error ??
              'No availability for the selected date/time/party size.',
          );
        } else {
          setError(
            (j as { error?: string }).error ?? 'Failed to save changes.',
          );
        }
        return;
      }

      onSaved();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [
    bookingId,
    currentDate,
    currentPartySize,
    currentTime,
    date,
    hasChanges,
    onCancel,
    onSaved,
    partySize,
    selectedTime,
  ]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Party Size
          </label>
          <NumericInput
            min={1}
            max={50}
            value={partySize}
            onChange={(v) => setPartySize(v)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Time
        </label>
        {loadingSlots ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            <span className="text-xs text-slate-500">
              Loading available times...
            </span>
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            No available times for this date and party size.
          </div>
        ) : (
          <select
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          >
            {slots.map((slot) => (
              <option key={slot.key} value={slot.start_time.slice(0, 5)}>
                {slot.label} — {slot.available_covers} cover
                {slot.available_covers !== 1 ? 's' : ''} available
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasChanges || (slots.length === 0 && !loadingSlots)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
