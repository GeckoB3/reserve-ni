'use client';

import { useState, useMemo } from 'react';
import type { VenueTable, TableGridCell } from '@/types/table-management';
import { NumericInput } from '@/components/ui/NumericInput';
import { PhoneWithCountryField } from '@/components/phone/PhoneWithCountryField';
import { normalizeToE164 } from '@/lib/phone/e164';

interface Props {
  tables: VenueTable[];
  cells: TableGridCell[];
  onCreated: () => void;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function WalkInFab({ tables, cells, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [tableId, setTableId] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const occupiedTableIds = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const occupied = new Set<string>();

    for (const cell of cells) {
      if (!cell.booking_id || !cell.booking_details) continue;
      const cStart = timeToMinutes(cell.booking_details.start_time);
      const cEnd = cell.booking_details.end_time
        ? timeToMinutes(cell.booking_details.end_time)
        : cStart + 90;
      if (nowMin >= cStart && nowMin < cEnd) {
        occupied.add(cell.table_id);
      }
    }
    for (const cell of cells) {
      if (!cell.is_blocked) continue;
      const cStart = timeToMinutes(cell.block_details?.start_time ?? cell.time);
      const cEnd = timeToMinutes(cell.block_details?.end_time ?? cell.time) || cStart + 15;
      if (nowMin >= cStart && nowMin < cEnd) {
        occupied.add(cell.table_id);
      }
    }

    return occupied;
  }, [cells]);

  const handleSubmit = async () => {
    if (!tableId) {
      setError('Select a table');
      return;
    }
    const selectedTable = tables.find((t) => t.id === tableId);
    if (selectedTable && partySize > selectedTable.max_covers) {
      setError(`Party of ${partySize} exceeds ${selectedTable.name} capacity (max ${selectedTable.max_covers})`);
      return;
    }

    setSaving(true);
    setError(null);

    const walkinPhone = normalizeToE164(phone, 'GB');
    if (phone.trim() && !walkinPhone) {
      setError('Enter a valid phone number or leave phone blank');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/venue/bookings/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_id: tableId,
          party_size: partySize,
          name: name.trim() || 'Walk In',
          phone: walkinPhone || undefined,
          booking_date: new Date().toISOString().slice(0, 10),
          booking_time: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to create walk-in');
        return;
      }

      setOpen(false);
      setTableId('');
      setPartySize(2);
      setName('');
      setPhone('');
      onCreated();
    } catch (err) {
      console.error('Walk-in failed:', err);
      setError('Failed to create walk-in');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl transition-transform hover:scale-105 hover:bg-brand-700 active:scale-95 bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))]"
        title="Add Walk-in"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] shadow-2xl sm:rounded-2xl sm:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Quick Walk-in</h3>

            {error && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">Table</label>
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select table...</option>
                  {tables.filter((t) => t.is_active).map((t) => {
                    const isOccupied = occupiedTableIds.has(t.id);
                    const tooSmall = partySize > t.max_covers;
                    return (
                      <option key={t.id} value={t.id} disabled={isOccupied || tooSmall}>
                        {t.name} (max {t.max_covers})
                        {isOccupied ? ' - Occupied' : ''}
                        {tooSmall && !isOccupied ? ' - Too small' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">Party Size</label>
                <div className="mt-1 flex gap-1">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => setPartySize(n)}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium ${
                        partySize === n
                          ? 'border-brand-300 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <NumericInput
                    value={partySize}
                    onChange={(v) => setPartySize(v)}
                    min={1}
                    className="h-10 w-16 rounded-lg border border-slate-200 text-center text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">Name (optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Guest name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">Phone</label>
                <div className="mt-1">
                  <PhoneWithCountryField
                    value={phone}
                    onChange={setPhone}
                    inputClassName="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? 'Seating...' : 'Seat Walk-in'}
              </button>
              <button
                onClick={() => { setOpen(false); setError(null); }}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
