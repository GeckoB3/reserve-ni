'use client';

import { useCallback, useEffect, useState } from 'react';

interface Guest {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  visit_count: number;
}

interface EventRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface CommRow {
  id: string;
  message_type: string;
  channel: string;
  status: string;
  created_at: string;
}

interface BookingDetail {
  id: string;
  booking_date: string;
  booking_time: string;
  party_size: number;
  status: string;
  source: string;
  deposit_status: string;
  deposit_amount_pence: number | null;
  dietary_notes: string | null;
  occasion: string | null;
  special_requests: string | null;
  cancellation_deadline: string | null;
  guest: Guest | null;
  events: EventRow[];
  communications: CommRow[];
}

export function BookingDetailPanel({
  bookingId,
  onClose,
  onUpdated,
}: {
  bookingId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showModify, setShowModify] = useState(false);
  const [modifyDate, setModifyDate] = useState('');
  const [modifyTime, setModifyTime] = useState('');
  const [modifyPartySize, setModifyPartySize] = useState(2);

  const load = useCallback(async () => {
    const res = await fetch(`/api/venue/bookings/${bookingId}`);
    if (!res.ok) { setError('Failed to load'); return; }
    const data = await res.json();
    setDetail(data);
    setModifyDate(data.booking_date);
    setModifyTime(data.booking_time?.slice(0, 5) ?? '12:00');
    setModifyPartySize(data.party_size);
  }, [bookingId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    load().finally(() => setLoading(false));
  }, [load]);

  const updateStatus = useCallback(async (newStatus: string) => {
    if (!detail) return;
    const now = new Date();
    const [y, m, d] = detail.booking_date.split('-').map(Number);
    const [hh, mm] = (detail.booking_time?.slice(0, 5) ?? '12:00').split(':').map(Number);
    const bookingDt = new Date(y, m - 1, d, hh, mm, 0);
    const diffMin = (bookingDt.getTime() - now.getTime()) / (60 * 1000);
    if (newStatus === 'No-Show' && diffMin > -15 && diffMin < 15) {
      if (!confirm('Booking time is within 15 minutes. Mark as No-Show?')) return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed');
        return;
      }
      setError(null);
      await load();
      onUpdated();
    } finally { setActionLoading(false); }
  }, [bookingId, detail, load, onUpdated]);

  const submitModify = useCallback(async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_date: modifyDate, booking_time: modifyTime, party_size: modifyPartySize }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed');
        return;
      }
      setError(null);
      setShowModify(false);
      await load();
      onUpdated();
    } finally { setActionLoading(false); }
  }, [bookingId, modifyDate, modifyTime, modifyPartySize, load, onUpdated]);

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
          <p className="text-slate-500">{loading ? 'Loading...' : 'Booking not found.'}</p>
          <button type="button" onClick={onClose} className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700">Close</button>
        </div>
      </div>
    );
  }

  const depositPaid = detail.deposit_status === 'Paid' && detail.deposit_amount_pence;
  const canChangeStatus = ['Pending', 'Confirmed', 'Seated'].includes(detail.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-y-auto bg-white shadow-2xl lg:rounded-l-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Booking Details</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 p-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* Guest info card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                {(detail.guest?.name ?? '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{detail.guest?.name ?? 'Unknown guest'}</p>
                <p className="text-xs text-slate-500">{detail.guest?.visit_count ?? 0} previous visits</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5 text-sm">
              {detail.guest?.email && (
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                  {detail.guest.email}
                </div>
              )}
              {detail.guest?.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>
                  {detail.guest.phone}
                </div>
              )}
            </div>
          </div>

          {/* Booking details grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoTile label="Date" value={detail.booking_date} />
            <InfoTile label="Time" value={detail.booking_time?.slice(0, 5) ?? ''} />
            <InfoTile label="Covers" value={String(detail.party_size)} />
            <InfoTile label="Source" value={detail.source} />
            <InfoTile label="Status" value={detail.status} />
            <InfoTile label="Deposit" value={depositPaid ? `£${(detail.deposit_amount_pence! / 100).toFixed(2)} Paid` : detail.deposit_status} />
          </div>

          {/* Special notes */}
          {(detail.dietary_notes || detail.occasion || detail.special_requests) && (
            <div className="space-y-2">
              {detail.dietary_notes && (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm">
                  <span className="font-medium text-amber-800">Dietary:</span>{' '}
                  <span className="text-amber-700">{detail.dietary_notes}</span>
                </div>
              )}
              {detail.occasion && (
                <div className="rounded-lg bg-violet-50 px-3 py-2 text-sm">
                  <span className="font-medium text-violet-800">Occasion:</span>{' '}
                  <span className="text-violet-700">{detail.occasion}</span>
                </div>
              )}
              {detail.special_requests && (
                <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm">
                  <span className="font-medium text-sky-800">Requests:</span>{' '}
                  <span className="text-sky-700">{detail.special_requests}</span>
                </div>
              )}
            </div>
          )}

          {/* Status actions */}
          {canChangeStatus && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</p>
              <div className="flex flex-wrap gap-2">
                {detail.status === 'Confirmed' && (
                  <>
                    <ActionButton onClick={() => updateStatus('Seated')} disabled={actionLoading} variant="primary">Seat Guest</ActionButton>
                    <ActionButton onClick={() => updateStatus('No-Show')} disabled={actionLoading} variant="danger">No-Show</ActionButton>
                    <ActionButton onClick={() => updateStatus('Cancelled')} disabled={actionLoading} variant="outline-danger">Cancel</ActionButton>
                  </>
                )}
                {detail.status === 'Pending' && (
                  <ActionButton onClick={() => updateStatus('Cancelled')} disabled={actionLoading} variant="outline-danger">Cancel</ActionButton>
                )}
                {detail.status === 'Seated' && (
                  <>
                    <ActionButton onClick={() => updateStatus('Completed')} disabled={actionLoading} variant="primary">Complete</ActionButton>
                    <ActionButton onClick={() => updateStatus('No-Show')} disabled={actionLoading} variant="danger">No-Show</ActionButton>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Modify section */}
          {!showModify ? (
            <button type="button" onClick={() => setShowModify(true)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Modify Date / Time / Party Size
            </button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Modify Booking</p>
              {depositPaid && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Changing party size won&apos;t adjust the deposit already paid.</p>}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
                  <input type="date" value={modifyDate} onChange={(e) => setModifyDate(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Time</label>
                  <input type="time" value={modifyTime} onChange={(e) => setModifyTime(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Covers</label>
                  <input type="number" min={1} max={50} value={modifyPartySize} onChange={(e) => setModifyPartySize(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={submitModify} disabled={actionLoading} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">Save</button>
                <button type="button" onClick={() => setShowModify(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Timeline</p>
            {detail.events.length === 0 ? (
              <p className="text-sm text-slate-400">No events yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-100">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    </span>
                    <div className="flex-1">
                      <span className="font-medium text-slate-700">{ev.event_type.replace(/_/g, ' ')}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {new Date(ev.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Communications */}
          {detail.communications && detail.communications.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Communications</p>
              <div className="space-y-2">
                {detail.communications.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.channel === 'email' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                      {c.channel}
                    </span>
                    <span className="font-medium text-slate-700">{c.message_type.replace(/_/g, ' ')}</span>
                    <span className={`ml-auto text-xs ${c.status === 'sent' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function ActionButton({ onClick, disabled, variant, children }: {
  onClick: () => void;
  disabled: boolean;
  variant: 'primary' | 'danger' | 'outline-danger';
  children: React.ReactNode;
}) {
  const styles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    'outline-danger': 'border border-red-200 text-red-600 hover:bg-red-50',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
