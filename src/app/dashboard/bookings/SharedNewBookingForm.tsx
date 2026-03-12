'use client';

import { useEffect, useMemo, useState } from 'react';
import type { VenueTable } from '@/types/table-management';
import { useToast } from '@/components/ui/Toast';

interface Suggestion {
  source: 'single' | 'auto' | 'manual';
  table_ids: string[];
  table_names: string[];
  combined_capacity: number;
  spare_covers: number;
}

interface SharedNewBookingFormProps {
  date: string;
  initialTime: string;
  defaultTableId?: string;
  tables: VenueTable[];
  availableTimes?: string[];
  compact?: boolean;
  onCreated: () => void;
  onCancel?: () => void;
}

export function SharedNewBookingForm({
  date,
  initialTime,
  defaultTableId,
  tables,
  availableTimes,
  compact = false,
  onCreated,
  onCancel,
}: SharedNewBookingFormProps) {
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [tableId, setTableId] = useState(defaultTableId ?? '');
  const [time, setTime] = useState(initialTime);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestionKey, setSelectedSuggestionKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const activeTables = useMemo(() => tables.filter((table) => table.is_active), [tables]);

  useEffect(() => {
    setTime(initialTime);
  }, [initialTime]);

  useEffect(() => {
    if (defaultTableId) setTableId(defaultTableId);
  }, [defaultTableId]);

  useEffect(() => {
    let cancelled = false;
    const loadSuggestions = async () => {
      if (!time) {
        setSuggestions([]);
        setSelectedSuggestionKey(null);
        return;
      }
      try {
        const params = new URLSearchParams({
          date,
          time,
          party_size: String(partySize),
        });
        const res = await fetch(`/api/venue/tables/combinations/suggest?${params.toString()}`);
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        const next = (payload.suggestions ?? []) as Suggestion[];
        setSuggestions(next);
        if (next.length > 0) {
          setSelectedSuggestionKey(`${next[0].source}:${next[0].table_ids.join('|')}`);
        } else {
          setSelectedSuggestionKey(null);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setSelectedSuggestionKey(null);
        }
      }
    };
    void loadSuggestions();
    return () => { cancelled = true; };
  }, [date, time, partySize]);

  const submit = async () => {
    setFormError(null);
    if (!name.trim() || !phone.trim() || !time) {
      const message = 'Guest name, phone, and time are required.';
      setFormError(message);
      addToast(message, 'error');
      return;
    }
    setSaving(true);
    try {
      const createRes = await fetch('/api/venue/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: date,
          booking_time: time,
          party_size: partySize,
          name,
          phone,
        }),
      });
      if (!createRes.ok) {
        const json = await createRes.json().catch(() => ({}));
        const message = json.error ?? 'Failed to create booking';
        setFormError(message);
        addToast(message, 'error');
        return;
      }
      const payload = await createRes.json();
      const selectedSuggestion = suggestions.find(
        (suggestion) => `${suggestion.source}:${suggestion.table_ids.join('|')}` === selectedSuggestionKey,
      );
      const targetTableIds = selectedSuggestion?.table_ids ?? (tableId ? [tableId] : []);
      if (payload.booking_id && targetTableIds.length > 0) {
        const assignRes = await fetch('/api/venue/tables/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: payload.booking_id, table_ids: targetTableIds }),
        });
        if (!assignRes.ok) {
          const json = await assignRes.json().catch(() => ({}));
          const message = json.error ?? 'Booking created but table assignment failed';
          setFormError(message);
          addToast(message, 'error');
          return;
        }
      }
      addToast('Booking created', 'success');
      onCreated();
    } catch {
      const message = 'Failed to create booking';
      setFormError(message);
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Guest name"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        type="number"
        min={1}
        value={partySize}
        onChange={(e) => setPartySize(Number(e.target.value) || 1)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <select
        value={tableId}
        onChange={(e) => setTableId(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        <option value="">Select table...</option>
        {activeTables.map((table) => (
          <option key={table.id} value={table.id}>
            {table.name} (max {table.max_covers})
          </option>
        ))}
      </select>
      <select
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        <option value="">Select time...</option>
        {(availableTimes ?? [initialTime]).map((slotTime) => (
          <option key={slotTime} value={slotTime}>
            {slotTime}
          </option>
        ))}
      </select>
      {formError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {formError}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-white p-2">
          <p className="mb-1 text-[11px] font-semibold text-slate-600">Suggested assignment</p>
          <div className="space-y-1">
            {suggestions.slice(0, 5).map((suggestion) => {
              const key = `${suggestion.source}:${suggestion.table_ids.join('|')}`;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedSuggestionKey(key)}
                  className={`w-full rounded border px-2 py-1 text-left text-[11px] ${
                    selectedSuggestionKey === key
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{suggestion.table_names.join(' + ')}</span>
                    <span className="text-[10px] uppercase">{suggestion.source === 'manual' ? 'Manual' : suggestion.source === 'auto' ? 'Auto' : 'Single'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="flex-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Booking'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
