'use client';

import { useEffect, useId, useState } from 'react';

export interface AddDiningAreaPayload {
  name: string;
  colour: string;
  /** When true, server copies JSON from source area and duplicates venue_services (+ rules). */
  copyFromSource: boolean;
}

interface AddDiningAreaModalProps {
  open: boolean;
  onClose: () => void;
  /** Label for the currently selected area (copy source). */
  sourceAreaName: string;
  sourceAreaId: string | null;
  onSubmit: (payload: AddDiningAreaPayload) => Promise<void>;
  submitting: boolean;
}

export function AddDiningAreaModal({
  open,
  onClose,
  sourceAreaName,
  sourceAreaId,
  onSubmit,
  submitting,
}: AddDiningAreaModalProps) {
  const titleId = useId();
  const [name, setName] = useState('');
  const [colour, setColour] = useState('#6366F1');
  const [copyFromSource, setCopyFromSource] = useState(true);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setName('');
      setColour('#6366F1');
      setCopyFromSource(true);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && /^#[0-9A-Fa-f]{6}$/.test(colour);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialog"
        disabled={submitting}
        onClick={() => !submitting && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[101] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          Add dining area
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Create a new section of the restaurant with its own services, tables, and floor plan.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="add-area-name" className="block text-sm font-medium text-slate-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="add-area-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Garden Room"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="add-area-colour" className="block text-sm font-medium text-slate-700">
              Colour
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="add-area-colour"
                type="color"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-slate-200 bg-white"
                disabled={submitting}
              />
              <input
                type="text"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                pattern="^#[0-9A-Fa-f]{6}$"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                disabled={submitting}
                aria-label="Colour hex value"
              />
            </div>
          </div>

          {sourceAreaId && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300"
                checked={copyFromSource}
                onChange={(e) => setCopyFromSource(e.target.checked)}
                disabled={submitting}
              />
              <span>
                Copy services, capacity rules, durations, and booking rules from{' '}
                <span className="font-medium text-slate-900">{sourceAreaName}</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  Area-level booking rules and templates are copied; tables and floor plans stay with each area unless you
                  add them separately.
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={!canSubmit || submitting}
            onClick={async () => {
              if (!canSubmit) return;
              await onSubmit({
                name: name.trim(),
                colour,
                copyFromSource: Boolean(sourceAreaId && copyFromSource),
              });
            }}
          >
            {submitting ? 'Creating…' : 'Create area'}
          </button>
        </div>
      </div>
    </div>
  );
}
