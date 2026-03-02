'use client';

import { useState } from 'react';

export function WalkInModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add Walk-in</h2>
          <button type="button" onClick={onClose} className="rounded p-2 text-neutral-500 hover:bg-neutral-100">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="walkin-party" className="block text-sm font-medium text-neutral-700 mb-1">Party size *</label>
            <input
              id="walkin-party"
              type="number"
              min={1}
              max={50}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="w-full rounded border border-neutral-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="walkin-name" className="block text-sm font-medium text-neutral-700 mb-1">Guest name (optional)</label>
            <input
              id="walkin-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Walk-in"
              className="w-full rounded border border-neutral-300 px-3 py-2"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
              {loading ? 'Adding…' : 'Add'}
            </button>
            <button type="button" onClick={onClose} className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
