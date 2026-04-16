'use client';

import { useCallback, useEffect, useState } from 'react';

export type PublicBookingAreaMode = 'auto' | 'manual';

interface Props {
  open: boolean;
  onClose: () => void;
  initialMode: PublicBookingAreaMode;
  onSaved: (mode: PublicBookingAreaMode) => void;
}

export function PublicBookingAreaModeModal({ open, onClose, initialMode, onSaved }: Props) {
  const [mode, setMode] = useState<PublicBookingAreaMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
    }
  }, [open, initialMode]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_booking_area_mode: mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not save');
        return;
      }
      onSaved(mode);
      onClose();
    } catch {
      setError('Could not save');
    } finally {
      setSaving(false);
    }
  }, [mode, onClose, onSaved]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-area-mode-title"
        className="max-h-[min(90vh,32rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="public-area-mode-title" className="text-lg font-semibold text-slate-900">
          Online booking: dining areas
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose how times appear on your public booking page and the staff &ldquo;new booking&rdquo; form when you have more
          than one dining area.
        </p>

        <div className="mt-5 space-y-3">
          <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 transition-colors has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/60">
            <input
              type="radio"
              name="pbam"
              className="mt-1"
              checked={mode === 'auto'}
              onChange={() => setMode('auto')}
            />
            <span>
              <span className="font-medium text-slate-900">Combined times</span>
              <span className="mt-1 block text-sm text-slate-600">
                Show one list of available times across all areas.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 transition-colors has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/60">
            <input
              type="radio"
              name="pbam"
              className="mt-1"
              checked={mode === 'manual'}
              onChange={() => setMode('manual')}
            />
            <span>
              <span className="font-medium text-slate-900">Area tabs</span>
              <span className="mt-1 block text-sm text-slate-600">
                Guests and staff switch tabs to see times for each dining area separately.
              </span>
            </span>
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
