'use client';

import { useEffect, useId, useState } from 'react';

export interface EditDiningAreaPayload {
  name: string;
  colour: string;
}

interface EditDiningAreaModalProps {
  open: boolean;
  initialName: string;
  initialColour: string;
  onClose: () => void;
  onSubmit: (payload: EditDiningAreaPayload) => Promise<void>;
  submitting: boolean;
}

export function EditDiningAreaModal({
  open,
  initialName,
  initialColour,
  onClose,
  onSubmit,
  submitting,
}: EditDiningAreaModalProps) {
  const titleId = useId();
  const [name, setName] = useState(initialName);
  const [colour, setColour] = useState(initialColour);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setName(initialName);
      setColour(initialColour);
    });
  }, [open, initialName, initialColour]);

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
          Rename dining area
        </h2>
        <p className="mt-1 text-sm text-slate-500">Update the display name and colour for this area.</p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="edit-area-name" className="block text-sm font-medium text-slate-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-area-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="edit-area-colour" className="block text-sm font-medium text-slate-700">
              Colour
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="edit-area-colour"
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
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                disabled={submitting}
                aria-label="Colour hex value"
              />
            </div>
          </div>
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
              await onSubmit({ name: name.trim(), colour });
            }}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
