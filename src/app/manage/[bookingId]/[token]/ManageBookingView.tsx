'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

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

export function ManageBookingView({ bookingId, token }: { bookingId: string; token: string }) {
  const [details, setDetails] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const fetchDetails = useCallback(async () => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await fetch(`${base}/api/confirm?booking_id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Invalid link');
    }
    const data = await res.json();
    setDetails(data);
  }, [bookingId, token]);

  useEffect(() => {
    fetchDetails().catch((e) => setError(e instanceof Error ? e.message : 'Invalid link')).finally(() => setLoading(false));
  }, [fetchDetails]);

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel this reservation? You may not get a refund if within 48 hours of your booking time.')) return;
    setCancelling(true);
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    try {
      const res = await fetch(`${base}/api/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, token, action: 'cancel' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setCancelled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setCancelling(false);
    }
  }, [bookingId, token]);

  if (loading) {
    return <p className="text-neutral-600">Loading…</p>;
  }
  if (error && !details) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-red-600">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-blue-600 underline">Go home</Link>
      </div>
    );
  }
  if (cancelled) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-6 text-center">
        <p className="font-medium text-neutral-900">Booking cancelled</p>
        <p className="mt-2 text-sm text-neutral-600">Your reservation has been cancelled.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-blue-600 underline">Go home</Link>
      </div>
    );
  }
  if (!details) return null;

  const dateStr = new Date(details.booking_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const canCancel = details.status === 'Confirmed' || details.status === 'Pending';

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold text-neutral-900">Your reservation</h1>
      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-neutral-500">Venue</dt>
            <dd className="font-medium">{details.venue_name}</dd>
            {details.venue_address && <dd className="text-neutral-600">{details.venue_address}</dd>}
          </div>
          <div>
            <dt className="text-neutral-500">Date & time</dt>
            <dd className="font-medium">{dateStr}, {details.booking_time}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Party size</dt>
            <dd className="font-medium">{details.party_size}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Status</dt>
            <dd className="font-medium">{details.status}</dd>
          </div>
          {details.deposit_paid && details.deposit_amount_pence != null && (
            <div>
              <dt className="text-neutral-500">Deposit</dt>
              <dd className="font-medium">£{(details.deposit_amount_pence / 100).toFixed(2)} paid</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-xs text-neutral-500">
          To change the date or time, please contact the venue directly.
        </p>
        {canCancel && (
          <div className="mt-6 pt-4 border-t border-neutral-100">
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full rounded border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel reservation'}
            </button>
          </div>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-neutral-500">
        <Link href="/" className="underline">Powered by Reserve NI</Link>
      </p>
    </div>
  );
}
