'use client';

import { useCallback, useEffect, useState } from 'react';

interface BookingDetails {
  booking_id: string;
  venue_name: string;
  venue_address: string | null;
  booking_date: string;
  booking_time: string;
  party_size: number;
  deposit_paid: boolean;
  deposit_amount_pence: number | null;
  status: string;
}

type View = 'main' | 'cancel_confirm' | 'done';

export function ConfirmCancelView({ bookingId, token }: { bookingId: string; token: string }) {
  const [details, setDetails] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('main');
  const [actionLoading, setActionLoading] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  useEffect(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    fetch(`${base}/api/confirm?booking_id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`)
      .then((r) => {
        if (!r.ok) return r.json().then((j) => Promise.reject(new Error(j.error ?? 'Failed')));
        return r.json();
      })
      .then(setDetails)
      .catch((e) => setError(e instanceof Error ? e.message : 'Invalid link'))
      .finally(() => setLoading(false));
  }, [bookingId, token]);

  const doAction = useCallback(
    async (action: 'confirm' | 'cancel') => {
      setActionLoading(true);
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      try {
        const res = await fetch(`${base}/api/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId, token, action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        setDoneMessage(data.message ?? (action === 'confirm' ? "You're confirmed!" : 'Booking cancelled.'));
        setView('done');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setActionLoading(false);
      }
    },
    [bookingId, token]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-md text-center py-12">
        <p className="text-neutral-500">Loading…</p>
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className="mx-auto max-w-md text-center py-12">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!details) return null;

  const dateStr = new Date(details.booking_date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const depositStr = details.deposit_amount_pence
    ? `£${(details.deposit_amount_pence / 100).toFixed(2)}`
    : null;

  if (view === 'done') {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="font-medium text-green-800">{doneMessage}</p>
      </div>
    );
  }

  if (view === 'cancel_confirm') {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-xl font-semibold text-neutral-900">Cancel booking?</h1>
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Deposit policy</p>
          <p className="mt-1">
            If you cancel at least 48 hours before your reservation, your deposit will be refunded.
            If you cancel within 48 hours or do not show up, the deposit is not refunded.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { setView('main'); setError(null); }}
            className="flex-1 rounded border border-neutral-300 bg-white px-4 py-3 text-neutral-700"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => doAction('cancel')}
            disabled={actionLoading}
            className="flex-1 rounded bg-red-600 px-4 py-3 text-white font-medium disabled:opacity-50"
          >
            {actionLoading ? 'Cancelling…' : 'Yes, cancel my booking'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900">Your reservation</h1>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <p className="font-medium text-neutral-900">{details.venue_name}</p>
        {details.venue_address && (
          <p className="mt-1 text-sm text-neutral-600">{details.venue_address}</p>
        )}
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-neutral-500">Date & time</dt>
            <dd className="font-medium">{dateStr}, {details.booking_time}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Party size</dt>
            <dd className="font-medium">{details.party_size} {details.party_size === 1 ? 'guest' : 'guests'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Deposit</dt>
            <dd className="font-medium">
              {details.deposit_paid ? `Paid ${depositStr ?? ''}` : 'Not required'}
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-sm text-neutral-600">
        Please confirm you’re coming or cancel if your plans have changed.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => doAction('confirm')}
          disabled={actionLoading}
          className="w-full rounded bg-green-600 px-4 py-3 text-white font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {actionLoading ? 'Updating…' : "Confirm I'm Coming"}
        </button>
        <button
          type="button"
          onClick={() => setView('cancel_confirm')}
          disabled={actionLoading}
          className="w-full rounded border border-red-300 bg-white px-4 py-3 text-red-700 font-medium hover:bg-red-50 disabled:opacity-50"
        >
          Cancel My Booking
        </button>
      </div>
    </div>
  );
}
