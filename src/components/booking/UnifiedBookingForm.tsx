'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { NumericInput } from '@/components/ui/NumericInput';
import { PhoneWithCountryField } from '@/components/phone/PhoneWithCountryField';
import { normalizeToE164 } from '@/lib/phone/e164';

interface Slot {
  key: string;
  label: string;
  start_time: string;
  end_time?: string;
  available_covers: number;
}

interface Suggestion {
  source: 'single' | 'auto' | 'manual';
  table_ids: string[];
  table_names: string[];
  combined_capacity: number;
  spare_covers: number;
}

export interface UnifiedBookingFormProps {
  venueId: string;
  advancedMode: boolean;
  initialDate?: string;
  initialTime?: string;
  asModal?: boolean;
  onCreated: (result?: { booking_id: string; payment_url?: string }) => void;
  onClose?: () => void;
}

export function UnifiedBookingForm({
  venueId,
  advancedMode,
  initialDate,
  initialTime,
  asModal = false,
  onCreated,
  onClose,
}: UnifiedBookingFormProps) {
  const { addToast } = useToast();

  const [date, setDate] = useState(initialDate ?? new Date().toISOString().slice(0, 10));
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState(initialTime ?? '');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [notes, setNotes] = useState('');

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState<string | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [requireDeposit, setRequireDeposit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<{ booking_id: string; payment_url?: string } | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Focus guest name when form opens
  useEffect(() => {
    const timer = setTimeout(() => nameRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, []);

  // Fetch available time slots when date or party size changes (debounced)
  useEffect(() => {
    if (!date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSelectedTime(initialTime ?? '');

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
              end_time: (s.end_time as string) ?? undefined,
              available_covers: (s.available_covers as number) ?? 0,
            }))
            .filter((s: Slot) => s.start_time);
          if (!controller.signal.aborted) setSlots(rawSlots);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (!controller.signal.aborted) {
            setSlots([]);
            addToast('Failed to load available times', 'error');
          }
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
  }, [addToast, date, partySize, venueId]);

  // Fetch table suggestions when in advanced mode and time is selected
  useEffect(() => {
    let cancelled = false;
    if (!advancedMode || !date || !selectedTime) {
      setSuggestions([]);
      setSelectedSuggestionKey(null);
      return;
    }
    setLoadingSuggestions(true);
    (async () => {
      try {
        const params = new URLSearchParams({
          date,
          time: selectedTime.slice(0, 5),
          party_size: String(partySize),
        });
        const res = await fetch(`/api/venue/tables/combinations/suggest?${params.toString()}`);
        if (cancelled) return;
        if (!res.ok) {
          setSuggestions([]);
          setSelectedSuggestionKey(null);
          return;
        }
        const payload = await res.json();
        const next = (payload.suggestions ?? []) as Suggestion[];
        setSuggestions(next);
        setSelectedSuggestionKey(
          next.length > 0 ? `${next[0].source}:${next[0].table_ids.join('|')}` : null,
        );
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setSelectedSuggestionKey(null);
        }
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    })();
    return () => { cancelled = true; };
  }, [advancedMode, date, selectedTime, partySize]);

  const selectedSuggestion = useMemo(
    () => suggestions.find((s) => `${s.source}:${s.table_ids.join('|')}` === selectedSuggestionKey) ?? null,
    [selectedSuggestionKey, suggestions],
  );

  const phoneE164 = normalizeToE164(phone, 'GB');
  const canSubmit = Boolean(date && selectedTime && name.trim() && phoneE164 && !saving);

  const resetForm = useCallback(() => {
    setDate(initialDate ?? new Date().toISOString().slice(0, 10));
    setPartySize(2);
    setSlots([]);
    setSelectedTime(initialTime ?? '');
    setName('');
    setPhone('');
    setEmail('');
    setDietaryNotes('');
    setNotes('');
    setSuggestions([]);
    setSelectedSuggestionKey(null);
    setRequireDeposit(false);
    setError(null);
    setResult(null);
  }, [initialDate, initialTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const resolvedPhone = normalizeToE164(phone, 'GB');
    if (!date || !selectedTime || !name.trim() || !resolvedPhone) {
      setError('Date, time, guest name, and a valid phone number are required.');
      return;
    }

    setSaving(true);
    try {
      const createRes = await fetch('/api/venue/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: date,
          booking_time: selectedTime,
          party_size: partySize,
          name: name.trim(),
          phone: resolvedPhone,
          email: email.trim() || undefined,
          dietary_notes: dietaryNotes.trim() || undefined,
          special_requests: notes.trim() || undefined,
          require_deposit: requireDeposit,
        }),
      });

      if (!createRes.ok) {
        const payload = await createRes.json().catch(() => ({}));
        setError(payload.error ?? 'Failed to create booking');
        return;
      }

      const payload = await createRes.json();

      // Assign table if in advanced mode and a suggestion is selected
      if (advancedMode && payload.booking_id && selectedSuggestion?.table_ids?.length) {
        const assignRes = await fetch('/api/venue/tables/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            booking_id: payload.booking_id,
            table_ids: selectedSuggestion.table_ids,
          }),
        });
        if (!assignRes.ok) {
          const assignPayload = await assignRes.json().catch(() => ({}));
          addToast(assignPayload.error ?? 'Booking created, but table assignment failed', 'error');
        }
      }

      const bookingResult = {
        booking_id: payload.booking_id as string,
        payment_url: payload.payment_url as string | undefined,
      };

      if (asModal) {
        addToast(
          requireDeposit ? 'Booking created — deposit link sent' : 'Booking confirmed',
          'success',
        );
        onCreated(bookingResult);
      } else {
        setResult(bookingResult);
      }
    } catch {
      setError('Failed to create booking');
    } finally {
      setSaving(false);
    }
  };

  // Success state (inline mode only — modals close on success)
  if (!asModal && result) {
    const hasDeposit = Boolean(result.payment_url);
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className={`rounded-xl border p-5 ${hasDeposit ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className="mb-2 flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full ${hasDeposit ? 'bg-amber-100' : 'bg-emerald-100'}`}>
              <svg className={`h-5 w-5 ${hasDeposit ? 'text-amber-600' : 'text-emerald-600'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <p className={`text-base font-semibold ${hasDeposit ? 'text-amber-800' : 'text-emerald-800'}`}>
              {hasDeposit ? 'Booking Created — Deposit Requested' : 'Booking Confirmed'}
            </p>
          </div>
          <p className={`text-sm ${hasDeposit ? 'text-amber-700' : 'text-emerald-700'}`}>
            {hasDeposit
              ? 'A deposit payment link has been sent to the guest.'
              : 'A confirmation has been sent to the guest.'}
          </p>
        </div>

        {result.payment_url && (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
            <p className="mb-1 text-xs font-medium text-slate-500">Payment link</p>
            <a
              href={result.payment_url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              {result.payment_url}
            </a>
          </div>
        )}

        {hasDeposit && (
          <p className="mt-3 text-xs text-slate-400">
            If deposit is not paid within 24 hours, the booking will be auto-cancelled.
          </p>
        )}

        <button
          type="button"
          onClick={resetForm}
          className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Create Another Booking
        </button>
      </div>
    );
  }

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Date + Covers */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ubf-date" className="mb-1.5 block text-sm font-medium text-slate-700">
            Date
          </label>
          <input
            id="ubf-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            required
          />
        </div>
        <div>
          <label htmlFor="ubf-covers" className="mb-1.5 block text-sm font-medium text-slate-700">
            Party Size
          </label>
          <NumericInput
            id="ubf-covers"
            min={1}
            max={50}
            value={partySize}
            onChange={(v) => setPartySize(v)}
            className="h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold tabular-nums transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      {/* Time */}
      <div>
        <label htmlFor="ubf-time" className="mb-1.5 block text-sm font-medium text-slate-700">
          Time
        </label>
        {loadingSlots ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-400">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading available times...
          </div>
        ) : !date ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-400">
            Select a date first
          </p>
        ) : slots.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
            No available times for {partySize} cover{partySize !== 1 ? 's' : ''} on this date.
          </div>
        ) : (
          <select
            id="ubf-time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            required
          >
            <option value="">Select a time...</option>
            {slots.map((slot) => (
              <option key={slot.key} value={slot.start_time}>
                {slot.label} ({slot.available_covers} cover{slot.available_covers !== 1 ? 's' : ''} remaining)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100" />

      {/* Guest Details */}
      <div className="space-y-4">
        <div>
          <label htmlFor="ubf-name" className="mb-1.5 block text-sm font-medium text-slate-700">
            Guest name
          </label>
          <input
            ref={nameRef}
            id="ubf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            required
          />
        </div>

        <div>
          <label htmlFor="ubf-phone" className="mb-1.5 block text-sm font-medium text-slate-700">
            Phone number
          </label>
          <PhoneWithCountryField
            id="ubf-phone"
            value={phone}
            onChange={setPhone}
            inputClassName="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div>
          <label htmlFor="ubf-email" className="mb-1.5 block text-sm font-medium text-slate-700">
            Email <span className="text-slate-400">(optional)</span>
          </label>
          <input
            id="ubf-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="guest@example.com"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div>
          <label htmlFor="ubf-dietary" className="mb-1.5 block text-sm font-medium text-slate-700">
            Dietary notes <span className="text-slate-400">(optional)</span>
          </label>
          <textarea
            id="ubf-dietary"
            value={dietaryNotes}
            onChange={(e) => setDietaryNotes(e.target.value)}
            rows={2}
            placeholder="Allergies, intolerances, dietary requirements..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div>
          <label htmlFor="ubf-notes" className="mb-1.5 block text-sm font-medium text-slate-700">
            Notes <span className="text-slate-400">(optional)</span>
          </label>
          <textarea
            id="ubf-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Internal notes for staff..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      {/* Table suggestions (advanced mode only) */}
      {advancedMode && date && selectedTime && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Table Assignment
          </p>
          {loadingSuggestions ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              Loading suggestions...
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-xs text-slate-500">
              No table suggestions available for this time and party size.
            </p>
          ) : (
            <div className="space-y-1.5">
              {suggestions.slice(0, 5).map((suggestion) => {
                const key = `${suggestion.source}:${suggestion.table_ids.join('|')}`;
                const isSelected = selectedSuggestionKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedSuggestionKey(key)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                      isSelected
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{suggestion.table_names.join(' + ')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          Cap {suggestion.combined_capacity}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          isSelected
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {suggestion.source === 'manual' ? 'Manual' : suggestion.source === 'auto' ? 'Auto' : 'Single'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Deposit toggle */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
        <div className="mr-3">
          <p className="text-sm font-medium text-slate-700">Require deposit</p>
          <p className="text-xs text-slate-500">Send a payment link to the guest</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={requireDeposit}
          aria-label="Require deposit"
          onClick={() => setRequireDeposit((prev) => !prev)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
            requireDeposit ? 'bg-brand-600' : 'bg-slate-200'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
              requireDeposit ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Booking'}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );

  if (asModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/20 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create booking"
          className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">New Booking</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {formContent}
    </div>
  );
}
