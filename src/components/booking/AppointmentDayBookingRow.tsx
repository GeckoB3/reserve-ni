'use client';

import { useEffect, useState } from 'react';

export interface DayBooking {
  id: string;
  booking_date: string;
  booking_time: string;
  booking_end_time: string | null;
  party_size: number;
  status: string;
  source: string;
  practitioner_id: string | null;
  appointment_service_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  guest_visit_count: number | null;
  estimated_end_time: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  client_arrived_at: string | null;
  deposit_amount_pence: number | null;
  deposit_status: string;
}

/**
 * Model B day sheet — one semantic colour per lifecycle stage (badges + rows + buttons).
 * Blue = scheduled (Confirmed), Amber = on-site waiting, Violet = in session, Emerald = done.
 * Orange Pending = payment/action still needed (distinct from amber “waiting”).
 */
const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-orange-100 text-orange-900 ring-1 ring-orange-200/80',
  Confirmed: 'bg-blue-100 text-blue-900 ring-1 ring-blue-200/80',
  Seated: 'bg-violet-100 text-violet-900 ring-1 ring-violet-200/80',
  Completed: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80',
  'No-Show': 'bg-red-100 text-red-900 ring-1 ring-red-200/70',
  Cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/80',
};

const STATUS_LABELS: Record<string, string> = {
  Pending: 'Pending',
  Confirmed: 'Confirmed',
  Seated: 'In Progress',
  Completed: 'Completed',
  'No-Show': 'No Show',
  Cancelled: 'Cancelled',
};

/** Row bar tint — matches STATUS_STYLES; Pending vs Confirmed vs Waiting stay visually distinct. */
function rowSurfaceClass(status: string, arrived: boolean, isCancelled: boolean): string {
  if (isCancelled) {
    return 'bg-slate-100/80 border-slate-200/90';
  }
  if (status === 'Completed') {
    return 'bg-emerald-50/92 border-emerald-200/90';
  }
  if (status === 'Seated') {
    return 'bg-violet-50/92 border-violet-200/90';
  }
  if (arrived && (status === 'Pending' || status === 'Confirmed')) {
    return 'bg-amber-50/92 border-amber-300/90';
  }
  if (status === 'Pending') {
    return 'bg-orange-50/90 border-orange-200/85';
  }
  if (status === 'Confirmed') {
    return 'bg-blue-50/90 border-blue-200/85';
  }
  return 'bg-white border-slate-200/90';
}

interface Props {
  b: DayBooking;
  expanded: boolean;
  onToggleExpand: () => void;
  serviceName: string | null;
  serviceColour: string;
  practitionerName: string | null;
  durationMins: number;
  endTimeLabel: string;
  sym: string;
  servicePricePence: number | null;
  isCancelled: boolean;
  statusUpdating: boolean;
  savingNotes: boolean;
  onConfirm: () => void;
  onStart: () => void;
  onDone: () => void;
  onNoShow: () => void;
  onReopen: () => void;
  onArrived: (arrived: boolean) => void;
  onSaveInternalNotes: (notes: string) => void;
}

export function AppointmentDayBookingRow({
  b,
  expanded,
  onToggleExpand,
  serviceName,
  serviceColour,
  practitionerName,
  durationMins,
  endTimeLabel,
  sym,
  servicePricePence,
  isCancelled,
  statusUpdating,
  savingNotes,
  onConfirm,
  onStart,
  onDone,
  onNoShow,
  onReopen,
  onArrived,
  onSaveInternalNotes,
}: Props) {
  const [notesDraft, setNotesDraft] = useState(b.internal_notes ?? '');

  useEffect(() => {
    if (!expanded) return;
    const id = requestAnimationFrame(() => setNotesDraft(b.internal_notes ?? ''));
    return () => cancelAnimationFrame(id);
  }, [expanded, b.internal_notes]);

  const arrived = Boolean(b.client_arrived_at);
  const surface = rowSurfaceClass(b.status, arrived, isCancelled);

  return (
    <div
      className={`overflow-hidden rounded-xl border shadow-sm transition-[background-color,border-color,box-shadow] duration-200 ${surface} ${isCancelled ? 'opacity-80' : ''}`}
      style={{ borderLeftWidth: 4, borderLeftColor: serviceColour }}
    >
      {/* Clickable summary row */}
      <div className="flex flex-wrap items-start gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-lg"
          aria-expanded={expanded}
        >
          <div className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex-shrink-0 text-slate-400 transition-transform duration-200 ease-out ${expanded ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{b.guest_name}</span>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status] ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80'}`}
                >
                  {STATUS_LABELS[b.status] ?? b.status}
                </span>
                {arrived && b.status !== 'Seated' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950 ring-1 ring-amber-300/70 shadow-sm shadow-amber-900/5">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
                    Waiting
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
                <span className="font-medium text-slate-700">
                  {b.booking_time.slice(0, 5)} – {endTimeLabel}
                </span>
                {serviceName && <span>{serviceName}</span>}
                {practitionerName && <span>with {practitionerName}</span>}
                <span>{durationMins} mins</span>
              </div>
            </div>
          </div>
        </button>

        {!isCancelled && (
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {(b.status === 'Pending' || b.status === 'Confirmed') && (
              <>
                {!arrived ? (
                  <button
                    type="button"
                    onClick={() => onArrived(true)}
                    disabled={statusUpdating}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Arrived
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onArrived(false)}
                    disabled={statusUpdating}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Clear waiting
                  </button>
                )}
              </>
            )}
            {b.status === 'Pending' && (
              <button
                type="button"
                onClick={onConfirm}
                disabled={statusUpdating}
                className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm
              </button>
            )}
            {b.status === 'Confirmed' && (
              <button
                type="button"
                onClick={onStart}
                disabled={statusUpdating}
                className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Start
              </button>
            )}
            {b.status === 'Seated' && (
              <button
                type="button"
                onClick={onDone}
                disabled={statusUpdating}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                Done
              </button>
            )}
            {b.status === 'Completed' && (
              <button
                type="button"
                onClick={onReopen}
                disabled={statusUpdating}
                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                Reopen
              </button>
            )}
            {b.status === 'Confirmed' && (
              <button
                type="button"
                onClick={onNoShow}
                disabled={statusUpdating}
                className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                No Show
              </button>
            )}
          </div>
        )}
      </div>

      {/* Concertina detail — CSS grid height transition */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-slate-200/60 px-3 pb-4 pt-1 sm:px-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Client name</dt>
                <dd className="mt-0.5 text-slate-900">{b.guest_name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</dt>
                <dd className="mt-0.5 break-all text-slate-700">{b.guest_email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Phone</dt>
                <dd className="mt-0.5 text-slate-700">{b.guest_phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Visits recorded</dt>
                <dd className="mt-0.5 text-slate-700">
                  {b.guest_visit_count != null ? (
                    <>
                      <span className="font-semibold tabular-nums">{b.guest_visit_count}</span>
                      <span className="ml-1 text-xs text-slate-500">(from guest profile when phone/email matches)</span>
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Service</dt>
                <dd className="mt-0.5 text-slate-900">{serviceName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Staff member</dt>
                <dd className="mt-0.5 text-slate-900">{practitionerName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Duration</dt>
                <dd className="mt-0.5 text-slate-700">{durationMins} minutes</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Price</dt>
                <dd className="mt-0.5 text-slate-700">
                  {servicePricePence != null ? `${sym}${(servicePricePence / 100).toFixed(2)}` : '—'}
                </dd>
              </div>
              {b.deposit_amount_pence != null && b.deposit_amount_pence > 0 && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Deposit</dt>
                  <dd className="mt-0.5 text-slate-700">
                    {sym}
                    {(b.deposit_amount_pence / 100).toFixed(2)} ({b.deposit_status})
                  </dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Customer comments</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-slate-700">{b.special_requests?.trim() || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Staff comments</dt>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => {
                    if ((b.internal_notes ?? '') !== notesDraft) {
                      onSaveInternalNotes(notesDraft);
                    }
                  }}
                  disabled={savingNotes}
                  rows={3}
                  placeholder="Internal notes (visible to staff only)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
                />
                {savingNotes && <p className="mt-1 text-xs text-slate-400">Saving…</p>}
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
