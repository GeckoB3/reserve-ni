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
    if (!res.ok) {
      setError('Failed to load');
      return;
    }
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

  const updateStatus = useCallback(
    async (newStatus: string) => {
      if (!detail) return;
      const now = new Date();
      const [y, m, d] = detail.booking_date.split('-').map(Number);
      const [hh, mm] = (detail.booking_time?.slice(0, 5) ?? '12:00').split(':').map(Number);
      const bookingDt = new Date(y, m - 1, d, hh, mm, 0);
      const diffMin = (bookingDt.getTime() - now.getTime()) / (60 * 1000);

      if (newStatus === 'No-Show' && diffMin > -15 && diffMin < 15) {
        if (!confirm('Booking time is within 15 minutes. Are you sure you want to mark as No-Show?')) return;
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
      } finally {
        setActionLoading(false);
      }
    },
    [bookingId, detail, load, onUpdated]
  );

  const submitModify = useCallback(async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: modifyDate,
          booking_time: modifyTime,
          party_size: modifyPartySize,
        }),
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
    } finally {
      setActionLoading(false);
    }
  }, [bookingId, modifyDate, modifyTime, modifyPartySize, load, onUpdated]);

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
          <p className="text-neutral-500">{loading ? 'Loading…' : 'Booking not found.'}</p>
          <button type="button" onClick={onClose} className="mt-4 text-sm text-blue-600 underline">Close</button>
        </div>
      </div>
    );
  }

  const depositPaid = detail.deposit_status === 'Paid' && detail.deposit_amount_pence;
  const canChangeStatus = ['Pending', 'Confirmed', 'Seated'].includes(detail.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 p-0 md:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-y-auto bg-white shadow-xl md:rounded-l-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
          <h2 className="text-lg font-semibold">Booking details</h2>
          <button type="button" onClick={onClose} className="rounded p-2 text-neutral-500 hover:bg-neutral-100">
            ✕
          </button>
        </div>

        <div className="space-y-4 p-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</div>
          )}

          <dl className="grid grid-cols-1 gap-2 text-sm">
            <div><dt className="text-neutral-500">Guest</dt><dd className="font-medium">{detail.guest?.name ?? '—'}</dd></div>
            <div><dt className="text-neutral-500">Email</dt><dd className="font-medium">{detail.guest?.email ?? '—'}</dd></div>
            <div><dt className="text-neutral-500">Phone</dt><dd className="font-medium">{detail.guest?.phone ?? '—'}</dd></div>
            <div><dt className="text-neutral-500">Visit count</dt><dd className="font-medium">{detail.guest?.visit_count ?? 0}</dd></div>
            <div><dt className="text-neutral-500">Date & time</dt><dd className="font-medium">{detail.booking_date} {detail.booking_time}</dd></div>
            <div><dt className="text-neutral-500">Party size</dt><dd className="font-medium">{detail.party_size}</dd></div>
            <div><dt className="text-neutral-500">Source</dt><dd className="font-medium">{detail.source}</dd></div>
            <div><dt className="text-neutral-500">Status</dt><dd className="font-medium">{detail.status}</dd></div>
            <div><dt className="text-neutral-500">Deposit</dt><dd className="font-medium">{detail.deposit_status}{depositPaid ? ` £${(detail.deposit_amount_pence! / 100).toFixed(2)}` : ''}</dd></div>
            {detail.dietary_notes && <div><dt className="text-neutral-500">Dietary</dt><dd className="font-medium">{detail.dietary_notes}</dd></div>}
            {detail.occasion && <div><dt className="text-neutral-500">Occasion</dt><dd className="font-medium">{detail.occasion}</dd></div>}
            {detail.special_requests && <div><dt className="text-neutral-500">Special requests</dt><dd className="font-medium">{detail.special_requests}</dd></div>}
          </dl>

          {canChangeStatus && (
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700">Change status</p>
              <div className="flex flex-wrap gap-2">
                {detail.status === 'Confirmed' && (
                  <>
                    <button type="button" onClick={() => updateStatus('Seated')} disabled={actionLoading} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">Seated</button>
                    <button type="button" onClick={() => updateStatus('No-Show')} disabled={actionLoading} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50">No-Show</button>
                    <button type="button" onClick={() => updateStatus('Cancelled')} disabled={actionLoading} className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">Cancel</button>
                  </>
                )}
                {detail.status === 'Pending' && (
                  <button type="button" onClick={() => updateStatus('Cancelled')} disabled={actionLoading} className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">Cancel</button>
                )}
                {detail.status === 'Seated' && (
                  <>
                    <button type="button" onClick={() => updateStatus('Completed')} disabled={actionLoading} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50">Complete</button>
                    <button type="button" onClick={() => updateStatus('No-Show')} disabled={actionLoading} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50">No-Show</button>
                  </>
                )}
              </div>
            </div>
          )}

          {!showModify ? (
            <button type="button" onClick={() => setShowModify(true)} className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              Modify date / time / party size
            </button>
          ) : (
            <div className="rounded border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <p className="text-sm font-medium text-neutral-700">Modify booking</p>
              {depositPaid && <p className="text-xs text-amber-800">Changing party size will not adjust the deposit amount already paid.</p>}
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-neutral-500">Date</label>
                <label className="text-xs text-neutral-500 col-span-2">Time</label>
                <input type="date" value={modifyDate} onChange={(e) => setModifyDate(e.target.value)} className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
                <input type="time" value={modifyTime} onChange={(e) => setModifyTime(e.target.value)} className="col-span-2 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
                <label className="text-xs text-neutral-500">Party size</label>
                <input type="number" min={1} max={50} value={modifyPartySize} onChange={(e) => setModifyPartySize(Number(e.target.value))} className="col-span-2 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={submitModify} disabled={actionLoading} className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">Save</button>
                <button type="button" onClick={() => setShowModify(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">Cancel</button>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700">Timeline</p>
            <ul className="space-y-2">
              {detail.events.length === 0 ? (
                <li className="text-sm text-neutral-500">No events yet.</li>
              ) : (
                detail.events.map((ev) => (
                  <li key={ev.id} className="flex gap-2 text-sm">
                    <span className="text-neutral-400 shrink-0">{new Date(ev.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="font-medium">{ev.event_type.replace(/_/g, ' ')}</span>
                    {ev.payload && Object.keys(ev.payload).length > 0 && (
                      <span className="text-neutral-500 truncate">{JSON.stringify(ev.payload)}</span>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
