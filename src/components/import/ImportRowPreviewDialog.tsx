'use client';

import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  fileId: string;
  rowNumber: number;
  filename: string;
};

export function ImportRowPreviewDialog({ open, onClose, sessionId, fileId, rowNumber, filename }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cells, setCells] = useState<Array<{ key: string; value: string }>>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/import/sessions/${sessionId}/files/${fileId}/row?row=${rowNumber}`,
        );
        const data = (await res.json()) as {
          values?: Record<string, string>;
          headers?: string[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? 'Failed to load row');
        const headers = data.headers ?? Object.keys(data.values ?? {});
        const vals = data.values ?? {};
        const list = headers.map((key) => ({ key, value: vals[key] ?? '' }));
        if (!cancelled) {
          setCells(list);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, fileId, rowNumber]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Row {rowNumber}</p>
            <p className="text-xs text-slate-500">{filename}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-4">
          {loading && <p className="text-sm text-slate-500">Loading row…</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}
          {!loading && !error && (
            <table className="w-full text-left text-xs">
              <tbody>
                {cells.map((c) => (
                  <tr key={c.key} className="border-b border-slate-100">
                    <th className="w-1/3 whitespace-nowrap py-1.5 pr-2 font-mono font-medium text-slate-600">
                      {c.key}
                    </th>
                    <td className="break-words py-1.5 text-slate-900">{c.value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
