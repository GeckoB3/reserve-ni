'use client';

import { useEffect, useMemo, useState } from 'react';
import { NumericInput } from '@/components/ui/NumericInput';
import { PhoneWithCountryField } from '@/components/phone/PhoneWithCountryField';
import { normalizeToE164 } from '@/lib/phone/e164';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';
import type { CountryCode } from 'libphonenumber-js';
import type { TableForSelector, OccupancyMap } from '@/components/table-tracking/TableSelector';
import MiniFloorPlanPicker, { type MiniFloorTableRow } from '@/components/floor-plan/MiniFloorPlanPicker';

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
  venueCurrency,
  embedded = false,
  suppressTitle = false,
  remainingCapacity,
  onClose,
  onCreated,
}: {
  advancedMode?: boolean;
  initialDate?: string;
  initialTime?: string;
  venueCurrency?: string;
  /** When true, render only the inner card (no full-screen backdrop); parent provides the modal shell. */
  embedded?: boolean;
  /** Hide the "Add Walk-in" header when embedded inside another titled modal. */
  suppressTitle?: boolean;
  /** Optional: show remaining covers banner (e.g. day sheet). */
  remainingCapacity?: number | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const phoneDefaultCountry: CountryCode = useMemo(
    () => defaultPhoneCountryForVenueCurrency(venueCurrency),
    [venueCurrency],
  );
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
  const [tableAssignMode, setTableAssignMode] = useState<'suggested' | 'floor'>('suggested');
  const [manualTableIds, setManualTableIds] = useState<string[]>([]);
  const [occupiedTableIds, setOccupiedTableIds] = useState<string[]>([]);

  const [prefetchedTables, setPrefetchedTables] = useState<MiniFloorTableRow[] | null>(null);
  const [publicBookingAreaMode, setPublicBookingAreaMode] = useState<'auto' | 'manual'>('auto');
  const [diningAreas, setDiningAreas] = useState<Array<{ id: string; name: string; colour: string }>>([]);
  /** Which dining area layout to show; in manual tab mode also scopes table suggestions. */
  const [floorPlanViewAreaId, setFloorPlanViewAreaId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch('/api/venue').then((r) => r.json()),
      fetch('/api/venue/areas').then((r) => (r.ok ? r.json() : { areas: [] })),
    ])
      .then(([v, a]: [Record<string, unknown>, { areas?: Array<{ id: string; name: string; colour: string; is_active: boolean }> }]) => {
        if (cancelled) return;
        setPublicBookingAreaMode(v.public_booking_area_mode === 'manual' ? 'manual' : 'auto');
        const active = (a.areas ?? []).filter((x) => x.is_active);
        const mapped = active.map(({ id, name, colour }) => ({ id, name, colour }));
        setDiningAreas(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (diningAreas.length === 0) return;
    setFloorPlanViewAreaId((prev) => {
      if (prev && diningAreas.some((x) => x.id === prev)) return prev;
      return diningAreas[0]!.id;
    });
  }, [diningAreas]);

  // Pre-fetch tables in advanced mode so floor plan loads instantly
  useEffect(() => {
    if (!advancedMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/venue/tables');
        if (cancelled || !res.ok) return;
        const payload = await res.json();
        if (!cancelled) setPrefetchedTables((payload.tables ?? []) as MiniFloorTableRow[]);
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [advancedMode]);

  // Covers-mode: simple multi-select table chips
  const [coversTables, setCoversTables] = useState<TableForSelector[]>([]);
  const [coversSelectedTableIds, setCoversSelectedTableIds] = useState<string[]>([]);
  const [coversOccupancy, setCoversOccupancy] = useState<OccupancyMap>({});
  const [coversTablesLoaded, setCoversTablesLoaded] = useState(false);

  useEffect(() => {
    if (advancedMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/venue/tables');
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        const tables: TableForSelector[] = (payload.tables ?? [])
          .filter((t: { is_active: boolean }) => t.is_active)
          .map((t: { id: string; name: string; max_covers: number; sort_order: number }) => ({
            id: t.id, name: t.name, max_covers: t.max_covers, sort_order: t.sort_order,
          }));
        if (!cancelled) {
          setCoversTables(tables);
          setCoversOccupancy({});
          setCoversTablesLoaded(true);
        }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [advancedMode]);

  // Fetch table suggestions eagerly so they're ready when the user opens the picker
  useEffect(() => {
    if (!advancedMode || !bookingDate || !bookingTime) {
      setSuggestions([]);
      setSelectedSuggestionKey(null);
      setOccupiedTableIds([]);
      setManualTableIds([]);
      return;
    }
    setManualTableIds([]);
    let cancelled = false;
    setSuggestionLoading(true);
    void (async () => {
      try {
        const timeParam = bookingTime.length >= 5 ? bookingTime.slice(0, 5) : bookingTime;
        const params = new URLSearchParams({
          date: bookingDate,
          time: timeParam,
          party_size: String(partySize),
          duration_minutes: '90',
        });
        if (publicBookingAreaMode === 'manual' && floorPlanViewAreaId) {
          params.set('area_id', floorPlanViewAreaId);
        }
        const res = await fetch(`/api/venue/tables/combinations/suggest?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        if (cancelled) return;
        const next = (payload.suggestions ?? []) as Suggestion[];
        const busy = (payload.occupied_table_ids ?? []) as string[];
        setSuggestions(next);
        setOccupiedTableIds(Array.isArray(busy) ? busy : []);
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
  }, [advancedMode, bookingDate, bookingTime, partySize, publicBookingAreaMode, floorPlanViewAreaId]);

  const tablesForFloorPlanPicker = useMemo(() => {
    if (!prefetchedTables?.length) return null;
    if (diningAreas.length <= 1) return prefetchedTables;
    if (!floorPlanViewAreaId) return prefetchedTables;
    return prefetchedTables.filter((t) => t.area_id === floorPlanViewAreaId);
  }, [prefetchedTables, diningAreas.length, floorPlanViewAreaId]);

  const selectedSuggestion = useMemo(
    () => suggestions.find((s) => `${s.source}:${s.table_ids.join('|')}` === selectedSuggestionKey) ?? null,
    [selectedSuggestionKey, suggestions],
  );

  const tableIdsToAssign = useMemo(() => {
    if (tableAssignMode === 'floor' && manualTableIds.length > 0) return manualTableIds;
    if (tableAssignMode === 'suggested' && selectedSuggestion?.table_ids?.length)
      return selectedSuggestion.table_ids;
    return null;
  }, [manualTableIds, selectedSuggestion, tableAssignMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const walkinPhone = normalizeToE164(phone, phoneDefaultCountry);
      if (phone.trim() && !walkinPhone) {
        setError('Enter a valid phone number or leave phone blank');
        setLoading(false);
        return;
      }
      const walkinBody: Record<string, unknown> = {
        party_size: partySize,
        name: name.trim() || 'Walk In',
        phone: walkinPhone || undefined,
        dietary_notes: dietaryNotes.trim() || undefined,
        occasion: occasion.trim() || undefined,
        booking_date: bookingDate,
        booking_time: bookingTime,
      };
      if (!advancedMode && coversSelectedTableIds.length > 0) {
        walkinBody.table_ids = coversSelectedTableIds;
      }
      const res = await fetch('/api/venue/bookings/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(walkinBody),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? 'Failed to create walk-in');
        return;
      }
      const payload = await res.json() as { id?: string };
      if (advancedMode && payload.id && tableIdsToAssign?.length) {
        const assignRes = await fetch('/api/venue/tables/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            booking_id: payload.id,
            table_ids: tableIdsToAssign,
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

  const capacityWarning =
    remainingCapacity != null
      ? remainingCapacity <= 0
        ? 'No capacity remaining - are you sure?'
        : partySize > remainingCapacity
          ? 'This may exceed your remaining capacity'
          : null
      : null;

  const inner = (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add walk-in booking"
        className={`w-full rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl shadow-slate-900/15 ring-1 ring-slate-100 ${
          embedded ? 'mx-auto' : 'my-8'
        } ${advancedMode ? 'max-w-2xl' : embedded ? 'max-w-lg' : 'max-w-sm'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!suppressTitle && (
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
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {remainingCapacity != null && (
            <div
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                remainingCapacity <= 0
                  ? 'bg-red-50 text-red-700'
                  : remainingCapacity <= 5
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              Remaining capacity now: {remainingCapacity} covers
            </div>
          )}
          {capacityWarning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              ⚠ {capacityWarning}
            </div>
          )}
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
            <PhoneWithCountryField
              id="walkin-phone"
              value={phone}
              onChange={setPhone}
              defaultCountry={phoneDefaultCountry}
              inputClassName="w-full min-w-0 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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

          {/* Table assignment - covers mode (simple chips) */}
          {!advancedMode && coversTablesLoaded && coversTables.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">
                Table <span className="text-slate-400">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {coversTables.map((table) => {
                  const isSelected = coversSelectedTableIds.includes(table.id);
                  const occupant = coversOccupancy[table.id] ?? null;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() =>
                        setCoversSelectedTableIds((prev) =>
                          isSelected ? prev.filter((id) => id !== table.id) : [...prev, table.id]
                        )
                      }
                      title={occupant ? `Occupied by ${occupant.guestName}` : `${table.name} (${table.max_covers} seats)`}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        isSelected
                          ? 'border-brand-400 bg-brand-50 text-brand-800 ring-1 ring-brand-400'
                          : occupant
                            ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      {table.name}
                      <span className="ml-1 text-[10px] opacity-70">({table.max_covers})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Table assignment - advanced mode only */}
          {advancedMode && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Table assignment</p>

              <div className="mb-2 inline-flex rounded-2xl border border-slate-200 bg-slate-50/80 p-1 shadow-inner ring-1 ring-slate-100/80">
                <button
                  type="button"
                  onClick={() => {
                    setTableAssignMode('suggested');
                    setManualTableIds([]);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                    tableAssignMode === 'suggested'
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-brand-200/80'
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  Suggested
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTableAssignMode('floor');
                    if (manualTableIds.length === 0 && selectedSuggestion?.table_ids?.length) {
                      setManualTableIds(selectedSuggestion.table_ids);
                    }
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                    tableAssignMode === 'floor'
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-brand-200/80'
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  Floor plan
                </button>
              </div>

              {tableAssignMode === 'suggested' && (
                <>
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
                          No table suggestions for a party of {partySize} at this time. Try floor plan.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
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
                </>
              )}

              {tableAssignMode === 'floor' && (
                <>
                  {diningAreas.length > 1 && (
                    <div
                      className="mb-2 flex flex-wrap gap-1.5"
                      role="tablist"
                      aria-label="Floor plan dining area"
                    >
                      {diningAreas.map((a) => {
                        const active = floorPlanViewAreaId === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setFloorPlanViewAreaId(a.id)}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                              active
                                ? 'border-slate-800 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: a.colour || '#94a3b8' }}
                              aria-hidden
                            />
                            {a.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <MiniFloorPlanPicker
                    tables={tablesForFloorPlanPicker}
                    selectedIds={manualTableIds}
                    onChange={setManualTableIds}
                    occupiedTableIds={occupiedTableIds}
                    partySize={partySize}
                    minHeight={220}
                  />
                </>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!embedded && (
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
          )}
          {embedded && (
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Seat Walk-in'}
              </button>
            </div>
          )}
        </form>
      </div>
  );

  if (embedded) return inner;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      {inner}
    </div>
  );
}
