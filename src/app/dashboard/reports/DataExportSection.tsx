'use client';

import { useState } from 'react';
import { SectionCard } from '@/components/ui/dashboard/SectionCard';

export interface DataExportSectionProps {
  /** Shown after successful download or when export is blocked (e.g. API error). */
  onExportFlash?: (variant: 'success' | 'notice', message: string) => void;
  /** Model B: tailor copy to appointments / clients. */
  isAppointment?: boolean;
  clientLabel?: string;
  bookingWord?: string;
}

export function DataExportSection({
  onExportFlash,
  isAppointment = false,
  clientLabel = 'Guest',
  bookingWord = 'Booking',
}: DataExportSectionProps) {
  const [downloading, setDownloading] = useState<'bookings' | 'guests' | null>(null);

  async function handleDownload(type: 'bookings' | 'guests') {
    setDownloading(type);
    try {
      const res = await fetch(`/api/venue/export?type=${type}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          typeof body.error === 'string' ? body.error : 'Export failed - please try again.';
        if (onExportFlash) onExportFlash('notice', msg);
        else alert(msg);
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
      const label =
        type === 'bookings'
          ? `${bookingWord}s`
          : isAppointment
            ? `${clientLabel} list`
            : 'Guest list';
      onExportFlash?.(
        'success',
        `${label} CSV download started - check your downloads folder.`,
      );
    } catch {
      const msg = 'Export failed - please check your connection and try again.';
      if (onExportFlash) onExportFlash('notice', msg);
      else alert(msg);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <SectionCard elevated>
      <SectionCard.Header
        eyebrow="Data"
        title="Export your data"
        description={
          isAppointment ? (
            <>
              Download a full CSV of all {bookingWord.toLowerCase()}s or your {clientLabel.toLowerCase()} records.
              Exports cover your whole venue (not limited to the date range above). You are entitled to your data at
              any time.
            </>
          ) : (
            <>
              Download a full CSV export of your bookings or guest records. Exports include all records for your
              venue (not limited to the date range above). You are entitled to your data at any time.
            </>
          )
        }
      />
      <SectionCard.Body className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleDownload('bookings')}
          disabled={downloading !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {downloading === 'bookings' ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          ) : (
            <DownloadIcon className="h-4 w-4 text-slate-400" />
          )}
          Export all {bookingWord.toLowerCase()}s
        </button>

        <button
          type="button"
          onClick={() => void handleDownload('guests')}
          disabled={downloading !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {downloading === 'guests' ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          ) : (
            <DownloadIcon className="h-4 w-4 text-slate-400" />
          )}
          Export {isAppointment ? `${clientLabel.toLowerCase()} list` : 'guest list'}
        </button>
      </SectionCard.Body>
      <SectionCard.Footer>
        <p className="text-xs text-slate-500">Files are generated in real time from your venue&apos;s data.</p>
      </SectionCard.Footer>
    </SectionCard>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  );
}
