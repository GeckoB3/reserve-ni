'use client';

import { useEffect, useState } from 'react';

export function WalkInModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tableId, setTableId] = useState('');
  const [tableManagementEnabled, setTableManagementEnabled] = useState(false);
  const [tables, setTables] = useState<Array<{ id: string; name: string; max_covers: number; is_active: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/venue/tables');
        if (!res.ok) return;
        const data = await res.json();
        setTableManagementEnabled(data.settings?.table_management_enabled ?? false);
        setTables((data.tables ?? []).filter((t: { is_active: boolean }) => t.is_active));
      } catch {
        // noop
      }
    })();
  }, []);

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
          table_id: tableManagementEnabled && tableId ? tableId : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed');
        return;
      }
      onCreated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">Add Walk-in</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="walkin-party" className="mb-1.5 block text-sm font-medium text-slate-700">Party size</label>
            <input
              id="walkin-party"
              type="number"
              min={1}
              max={50}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              required
            />
          </div>
          <div>
            <label htmlFor="walkin-name" className="mb-1.5 block text-sm font-medium text-slate-700">Guest name <span className="text-slate-400">(optional)</span></label>
            <input
              id="walkin-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Walk-in guest"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="walkin-phone" className="mb-1.5 block text-sm font-medium text-slate-700">Phone <span className="text-slate-400">(optional)</span></label>
            <input
              id="walkin-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {tableManagementEnabled && (
            <div>
              <label htmlFor="walkin-table" className="mb-1.5 block text-sm font-medium text-slate-700">Assign table <span className="text-slate-400">(optional)</span></label>
              <select
                id="walkin-table"
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Leave unassigned</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} (max {table.max_covers})
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
              {loading ? 'Adding...' : 'Add Walk-in'}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
