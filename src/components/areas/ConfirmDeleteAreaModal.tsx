'use client';

import { useEffect, useId } from 'react';

interface ConfirmDeleteAreaModalProps {
  open: boolean;
  areaName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  submitting: boolean;
}

export function ConfirmDeleteAreaModal({
  open,
  areaName,
  onClose,
  onConfirm,
  submitting,
}: ConfirmDeleteAreaModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

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
          Remove dining area?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Are you sure you want to remove <span className="font-semibold text-slate-900">&quot;{areaName}&quot;</span>?
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-500">
          <li>The area will be hidden from lists and cannot receive new bookings.</li>
          <li>You cannot remove an area that has upcoming reservations (pending, confirmed, or seated).</li>
          <li>You must keep at least one dining area for the venue.</li>
        </ul>

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
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            disabled={submitting}
            onClick={() => void onConfirm()}
          >
            {submitting ? 'Removing…' : 'Remove area'}
          </button>
        </div>
      </div>
    </div>
  );
}
