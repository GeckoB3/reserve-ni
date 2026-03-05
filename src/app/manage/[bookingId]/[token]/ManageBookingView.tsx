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
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const fetchDetails = useCallback(async () => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await fetch(`${base}/api/confirm?booking_id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Invalid link');
    }
    setDetails(await res.json());
  }, [bookingId, token]);

  useEffect(() => {
    fetchDetails().catch((e) => setError(e instanceof Error ? e.message : 'Invalid link')).finally(() => setLoading(false));
  }, [fetchDetails]);

  const handleCancel = useCallback(async () => {
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
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className="w-full max-w-md text-center">
        <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
          </div>
          <p className="text-sm text-red-600">{error}</p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">Go home</Link>
        </div>
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="w-full max-w-md text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Booking Cancelled</h2>
          <p className="mt-2 text-sm text-slate-500">Your reservation has been cancelled.</p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">Go home</Link>
        </div>
      </div>
    );
  }

  if (!details) return null;

  const dateStr = new Date(details.booking_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const canCancel = details.status === 'Confirmed' || details.status === 'Pending';

  return (
    <div className="w-full max-w-md">
      {/* Brand header */}
      <div className="mb-6">
        <img src="/Logo.png" alt="Reserve NI" className="h-8 w-auto" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Venue header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-5">
          <h2 className="text-lg font-semibold text-white">{details.venue_name}</h2>
          {details.venue_address && <p className="mt-0.5 text-sm text-teal-100">{details.venue_address}</p>}
        </div>

        {/* Booking details */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <DetailTile label="Date" value={dateStr} />
            <DetailTile label="Time" value={details.booking_time.slice(0, 5)} />
            <DetailTile label="Guests" value={`${details.party_size}`} />
            <DetailTile label="Status" value={details.status} />
          </div>

          {details.deposit_paid && details.deposit_amount_pence != null && (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm">
              <span className="font-medium text-emerald-800">Deposit paid:</span>{' '}
              <span className="text-emerald-700">&pound;{(details.deposit_amount_pence / 100).toFixed(2)}</span>
            </div>
          )}

          <p className="text-xs text-slate-400">To change the date or time, please contact the venue directly.</p>

          {/* Cancel section */}
          {canCancel && !showCancelConfirm && (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="w-full rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Cancel Reservation
            </button>
          )}

          {canCancel && showCancelConfirm && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <p className="text-sm font-medium text-red-800">Are you sure?</p>
              <p className="text-xs text-red-700">
                Full refund if cancelled 48+ hours before your reservation. No refund within 48 hours or for no-shows.
              </p>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={handleCancel} disabled={cancelling} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
                <button type="button" onClick={() => { setShowCancelConfirm(false); setError(null); }} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Keep Booking
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        <Link href="/" className="hover:text-teal-600">Powered by Reserve NI</Link>
      </p>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
