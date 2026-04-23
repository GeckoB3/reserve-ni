'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ScheduleBlockDTO } from '@/types/schedule-blocks';

interface ClassTypePayload {
  id: string;
  name: string;
  duration_minutes: number;
  capacity: number;
  colour?: string | null;
  instructor_name?: string | null;
}

interface InstancePayload {
  id: string;
  instance_date: string;
  start_time: string;
  is_cancelled: boolean;
  capacity_override?: number | null;
  class_type: ClassTypePayload;
}

interface AttendeeRow {
  booking_id: string;
  status: string;
  party_size: number;
  deposit_amount_pence: number | null;
  deposit_status: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  checked_in_at: string | null;
}

function symForCurrency(currency: string): string {
  return currency === 'EUR' ? '€' : '£';
}

function formatMoneyPence(pence: number | null | undefined, currency: string): string {
  if (pence == null) return '—';
  return `${symForCurrency(currency)}${(pence / 100).toFixed(2)}`;
}

const STATUS_BADGE: Record<string, string> = {
  Pending: 'bg-orange-100 text-orange-900 ring-1 ring-orange-200/80',
  Booked: 'bg-sky-100 text-sky-900 ring-1 ring-sky-200/80',
  Confirmed: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80',
  Seated: 'bg-violet-100 text-violet-900 ring-1 ring-violet-200/80',
  Completed: 'bg-teal-100 text-teal-900 ring-1 ring-teal-200/80',
  'No-Show': 'bg-red-100 text-red-900 ring-1 ring-red-200/70',
  Cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/80',
};

interface Props {
  /** When non-null, the sheet is open. Carries the clicked schedule block for instant labels. */
  selection: { instanceId: string; block: ScheduleBlockDTO } | null;
  onClose: () => void;
  currency?: string;
}

export function ClassInstanceDetailSheet({ selection, onClose, currency = 'GBP' }: Props) {
  const open = selection !== null;
  const [instance, setInstance] = useState<InstancePayload | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instanceId = selection?.instanceId ?? null;

  const load = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setError(null);
    try {
      const [instRes, attRes] = await Promise.all([
        fetch(`/api/venue/class-instances/${instanceId}`),
        fetch(`/api/venue/class-instances/${instanceId}/attendees`),
      ]);
      if (!instRes.ok) {
        const j = await instRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Could not load class');
      }
      if (!attRes.ok) {
        const j = await attRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? 'Could not load roster');
      }
      const instJson = (await instRes.json()) as InstancePayload;
      const attJson = (await attRes.json()) as { attendees?: AttendeeRow[] };
      setInstance(instJson);
      setAttendees(attJson.attendees ?? []);
    } catch (e) {
      setInstance(null);
      setAttendees([]);
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    if (!selection || !instanceId) {
      setInstance(null);
      setAttendees([]);
      setError(null);
      return;
    }
    void load();
  }, [selection, instanceId, load]);

  if (!open || !selection) return null;

  const block = selection.block;
  const ct = instance?.class_type;
  const titleFromBlock =
    block.title.includes('·') ? block.title.split('·')[0]?.trim() ?? block.title : block.title;
  const title = ct?.name ?? titleFromBlock;
  const dateStr = instance?.instance_date ?? block.date;
  const startStr = instance?.start_time ? String(instance.start_time).slice(0, 5) : block.start_time;
  const endStr = block.end_time;
  const cap =
    instance?.capacity_override != null && instance.capacity_override > 0
      ? instance.capacity_override
      : ct?.capacity ?? block.class_capacity;
  const bookedActive = attendees
    .filter((a) => a.status !== 'Cancelled')
    .reduce((s, a) => s + (a.party_size ?? 1), 0);
  const bookedDisplay =
    loading && attendees.length === 0 ? (block.class_booked_spots ?? 0) : bookedActive;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 bg-black/40 lg:bg-black/20"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom motion-safe:duration-200 lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-full lg:max-w-lg lg:rounded-none lg:rounded-l-2xl lg:border-l lg:border-t-0 lg:border-r-0 lg:border-b-0 lg:motion-safe:slide-in-from-right"
        role="dialog"
        aria-labelledby="class-detail-title"
      >
        <div className="sticky top-0 z-[1] flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
          <div className="min-w-0">
            <h2 id="class-detail-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {dateStr} · {startStr} – {endStr}
              {ct ? ` · ${ct.duration_minutes} min` : null}
            </p>
            {instance?.is_cancelled ? (
              <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                Session cancelled
              </span>
            ) : null}
            {ct?.instructor_name ? (
              <p className="mt-1 text-xs text-slate-500">Instructor: {ct.instructor_name}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
            <span className="text-slate-600">
              <span className="font-semibold text-slate-900">{bookedDisplay}</span>
              {cap != null ? (
                <>
                  {' '}
                  / {cap} booked
                </>
              ) : (
                ' spots taken'
              )}
            </span>
            <Link
              href="/dashboard/class-timetable"
              className="text-sm font-medium text-brand-600 hover:text-brand-800"
              onClick={onClose}
            >
              Class timetable →
            </Link>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {loading && !instance ? <p className="text-sm text-slate-500">Loading details…</p> : null}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Bookings & guests</h3>
            {loading && attendees.length === 0 && !error ? (
              <p className="text-sm text-slate-500">Loading roster…</p>
            ) : attendees.length === 0 ? (
              <p className="text-sm text-slate-500">No bookings for this session.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[400px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="px-3 py-2 font-medium">Guest</th>
                      <th className="px-3 py-2 font-medium">Contact</th>
                      <th className="px-3 py-2 font-medium">Qty</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Deposit</th>
                      <th className="px-3 py-2 font-medium">Checked in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendees.map((a) => (
                      <tr
                        key={a.booking_id}
                        className={`border-b border-slate-100 last:border-0 ${a.status === 'Cancelled' ? 'opacity-60' : ''}`}
                      >
                        <td className="px-3 py-2 font-medium text-slate-900">{a.guest_name ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">
                          <div className="max-w-[140px] truncate text-xs">{a.guest_email ?? '—'}</div>
                          <div className="text-[11px] text-slate-500">{a.guest_phone ?? ''}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{a.party_size}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[a.status] ?? 'bg-slate-100 text-slate-700'}`}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {formatMoneyPence(a.deposit_amount_pence, currency)}
                          {a.deposit_status ? (
                            <span className="ml-1 text-[10px] text-slate-400">({a.deposit_status})</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {a.checked_in_at ? new Date(a.checked_in_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Cancel and CSV export are available on the class timetable.
          </p>
        </div>
      </aside>
    </>
  );
}
