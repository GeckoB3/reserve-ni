'use client';

import { useEffect, useMemo, useState } from 'react';
import { NumericInput } from '@/components/ui/NumericInput';

interface Suggestion {
  source: 'single' | 'auto' | 'manual';
  table_ids: string[];
  table_names: string[];
  combined_capacity: number;
  spare_covers: number;
}

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function WalkInModal({
  advancedMode = false,
  initialDate,
  initialTime,
  onClose,
  onCreated,
}: {
  advancedMode?: boolean;
  initialDate?: string;
  initialTime?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [occasion, setOccasion] = useState('');
  const [bookingDate, setBookingDate] = useState(initialDate ?? new Date().toISOString().slice(0, 10));
  const [bookingTime, setBookingTime] = useState(initialTime ?? currentTime());

  useEffect(() => {
    setBookingDate(initialDate ?? new Date().toISOString().slice(0, 10));
    setBookingTime(initialTime ?? currentTime());
  }, [initialDate, initialTime]);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState<string | null>(null);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch table suggestions eagerly so they're ready when the user opens the picker
  useEffect(() => {
    if (!advancedMode || !bookingDate || !bookingTime) {
      setSuggestions([]);
      setSelectedSuggestionKey(null);
      return;
    }
    let cancelled = false;
    setSuggestionLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({
          date: bookingDate,
          time: bookingTime,
          party_size: String(partySize),
        });
        const res = await fetch(`/api/venue/tables/combinations/suggest?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        if (cancelled) return;
        const next = (payload.suggestions ?? []) as Suggestion[];
        setSuggestions(next);
        // Auto-select the first suggestion if nothing is chosen yet
        setSelectedSuggestionKey((prev) => {
          if (prev !== null) return prev;
          return next.length > 0 ? `${next[0].source}:${next[0].table_ids.join('|')}` : null;
        });
      } finally {
        if (!cancelled) setSuggestionLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [advancedMode, bookingDate, bookingTime, partySize]);

  const selectedSuggestion = useMemo(
    () => suggestions.find((s) => `${s.source}:${s.table_ids.join('|')}` === selectedSuggestionKey) ?? null,
    [selectedSuggestionKey, suggestions],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/venue/bookings/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          party_size: partySize,
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          dietary_notes: dietaryNotes.trim() || undefined,
          occasion: occasion.trim() || undefined,
          booking_date: bookingDate,
          booking_time: bookingTime,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? 'Failed to create walk-in');
        return;
      }
      const payload = await res.json() as { id?: string };
      if (advancedMode && payload.id && selectedSuggestion?.table_ids?.length) {
        const assignRes = await fetch('/api/venue/tables/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            booking_id: payload.id,
            table_ids: selectedSuggestion.table_ids,
          }),
        });
        if (!assignRes.ok) {
          const assignPayload = await assignRes.json().catch(() => ({}));
          setError((assignPayload as { error?: string }).error ?? 'Walk-in added, but table assignment failed');
          return;
        }
      }
      onCreated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/20 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add walk-in booking"
        className="my-8 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Add Walk-in</h2>
            <p className="text-xs text-slate-500">Seat a guest immediately</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="walkin-date" className="mb-1.5 block text-sm font-medium text-slate-700">
                Date
              </label>
              <input
                id="walkin-date"
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <div>
              <label htmlFor="walkin-time" className="mb-1.5 block text-sm font-medium text-slate-700">
                Time
              </label>
              <input
                id="walkin-time"
                type="time"
                value={bookingTime}
                onChange={(e) => setBookingTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          {/* Party size */}
          <div>
            <label htmlFor="walkin-party" className="mb-1.5 block text-sm font-medium text-slate-700">
              Party size
            </label>
            <NumericInput
              id="walkin-party"
              min={1}
              max={50}
              value={partySize}
              onChange={(v) => setPartySize(v)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              required
            />
          </div>

          {/* Guest name */}
          <div>
            <label htmlFor="walkin-name" className="mb-1.5 block text-sm font-medium text-slate-700">
              Guest name <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="walkin-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Walk-in guest"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="walkin-phone" className="mb-1.5 block text-sm font-medium text-slate-700">
              Phone <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="walkin-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Dietary notes */}
          <div>
            <label htmlFor="walkin-dietary" className="mb-1.5 block text-sm font-medium text-slate-700">
              Dietary notes <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="walkin-dietary"
              value={dietaryNotes}
              onChange={(e) => setDietaryNotes(e.target.value)}
              rows={2}
              placeholder="Allergies, intolerances, dietary requirements..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Occasion */}
          <div>
            <label htmlFor="walkin-occasion" className="mb-1.5 block text-sm font-medium text-slate-700">
              Occasion <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="walkin-occasion"
              type="text"
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              placeholder="Birthday, anniversary..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Table assignment — advanced mode only */}
          {advancedMode && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Table assignment</p>

              {/* Select Table trigger button */}
              <button
                type="button"
                onClick={() => setTablePickerOpen((v) => !v)}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                  selectedSuggestion
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={selectedSuggestion ? 'font-medium' : ''}>
                    {selectedSuggestion
                      ? selectedSuggestion.table_names.join(' + ')
                      : 'Select table...'}
                  </span>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {suggestionLoading && (
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent opacity-50" />
                    )}
                    <svg
                      className={`h-4 w-4 transition-transform duration-200 ${tablePickerOpen ? 'rotate-180' : ''} ${selectedSuggestion ? 'text-emerald-600' : 'text-slate-400'}`}
                      fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </button>

              {/* Table assignment panel (same style as New Booking form) */}
              {tablePickerOpen && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Table Assignment
                  </p>
                  {suggestionLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                      Loading suggestions...
                    </div>
                  ) : suggestions.length === 0 ? (
                    <p className="text-xs text-amber-700">
                      No table suggestions available for a party of {partySize} at this time.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {/* Clear selection option */}
                      <button
                        type="button"
                        onClick={() => { setSelectedSuggestionKey(null); setTablePickerOpen(false); }}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                          selectedSuggestionKey === null
                            ? 'border-slate-300 bg-slate-100 text-slate-700 ring-1 ring-slate-200'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        No table assignment
                      </button>

                      {suggestions.slice(0, 5).map((suggestion) => {
                        const key = `${suggestion.source}:${suggestion.table_ids.join('|')}`;
                        const isSelected = selectedSuggestionKey === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => { setSelectedSuggestionKey(key); setTablePickerOpen(false); }}
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
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Seat Walk-in'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
