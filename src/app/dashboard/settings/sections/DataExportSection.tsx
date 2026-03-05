'use client';

import { useState } from 'react';

export function DataExportSection() {
  const [downloading, setDownloading] = useState<'bookings' | 'guests' | null>(null);

  async function handleDownload(type: 'bookings' | 'guests') {
    setDownloading(type);
    try {
      const res = await fetch(`/api/venue/export?type=${type}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? 'Export failed — please try again.');
        return;
      }
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const filename = `${type}-${today}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed — please check your connection and try again.');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Export your data</h2>
        <p className="mt-1 text-sm text-slate-500">
          Download a full CSV export of your bookings or guest records. You are entitled to your data at any time.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleDownload('bookings')}
          disabled={downloading !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {downloading === 'bookings' ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          ) : (
            <DownloadIcon className="h-4 w-4 text-slate-400" />
          )}
          Export all bookings
        </button>

        <button
          type="button"
          onClick={() => handleDownload('guests')}
          disabled={downloading !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {downloading === 'guests' ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          ) : (
            <DownloadIcon className="h-4 w-4 text-slate-400" />
          )}
          Export guest list
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Exports are generated in real time and include all records for your venue.
      </p>
    </section>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}
