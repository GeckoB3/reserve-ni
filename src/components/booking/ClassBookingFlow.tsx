'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VenuePublic, GuestDetails } from './types';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';
import { DetailsStep } from './DetailsStep';
import { PaymentStep } from './PaymentStep';

interface ClassSlot {
  instance_id: string;
  class_name: string;
  description: string | null;
  instance_date: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  remaining: number;
  price_pence: number | null;
  colour: string;
}

type Step = 'classes' | 'details' | 'payment' | 'confirmation';

export function ClassBookingFlow({ venue, cancellationPolicy }: { venue: VenuePublic; cancellationPolicy?: string }) {
  const phoneDefaultCountry = defaultPhoneCountryForVenueCurrency(venue.currency);
  const terms = venue.terminology ?? { client: 'Member', booking: 'Booking', staff: 'Instructor' };

  const [step, setStep] = useState<Step>('classes');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [classes, setClasses] = useState<ClassSlot[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassSlot | null>(null);
  const [spots, setSpots] = useState(1);
  const [createResult, setCreateResult] = useState<{ booking_id: string; client_secret?: string; stripe_account_id?: string; requires_deposit: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/booking/availability?venue_id=${venue.id}&date=${date}&booking_model=class_session`,
      );
      const data = await res.json();
      setClasses(data.classes ?? []);
    } catch {
      setError('Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, [venue.id, date]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  const handleDetailsSubmit = useCallback(async (details: GuestDetails) => {
    setError(null);
    if (!selectedClass) return;
    try {
      const res = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venue.id,
          booking_date: selectedClass.instance_date,
          booking_time: selectedClass.start_time,
          party_size: spots,
          name: details.name,
          email: details.email || undefined,
          phone: details.phone,
          source: 'booking_page',
          class_instance_id: selectedClass.instance_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Booking failed');
      setCreateResult({ booking_id: data.booking_id, client_secret: data.client_secret, stripe_account_id: data.stripe_account_id, requires_deposit: data.requires_deposit ?? false });
      setStep(data.requires_deposit && data.client_secret ? 'payment' : 'confirmation');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    }
  }, [venue.id, selectedClass, spots]);

  const handlePaymentComplete = useCallback(async () => {
    if (createResult?.booking_id) {
      try {
        await fetch('/api/booking/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: createResult.booking_id }),
        });
      } catch { /* webhook fallback */ }
    }
    setStep('confirmation');
  }, [createResult?.booking_id]);

  return (
    <div className="mx-auto max-w-lg">
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {step === 'classes' && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Classes</h2>
          <div className="mb-4">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : classes.length === 0 ? (
            <p className="text-sm text-slate-500">
              No classes on this date. Try another date or contact the venue.
            </p>
          ) : (
            <div className="space-y-3">
              {classes.map((cls) => (
                <button
                  key={cls.instance_id}
                  onClick={() => { setSelectedClass(cls); setSpots(1); setStep('details'); }}
                  disabled={cls.remaining <= 0}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-brand-300 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cls.colour }} />
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900">{cls.class_name}</div>
                      <div className="text-sm text-slate-500">
                        {cls.start_time.slice(0, 5)} &middot; {cls.duration_minutes} min
                        {cls.price_pence != null && ` · ${venue.currency === 'EUR' ? '€' : '£'}${(cls.price_pence / 100).toFixed(2)}`}
                      </div>
                    </div>
                    <span className={`text-xs font-medium ${cls.remaining > 3 ? 'text-green-600' : cls.remaining > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                      {cls.remaining > 0 ? `${cls.remaining} spot${cls.remaining !== 1 ? 's' : ''}` : 'Full'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'details' && selectedClass && (
        <div>
          <button onClick={() => setStep('classes')} className="mb-4 text-sm text-brand-600 hover:underline">&larr; Back</button>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="font-medium text-slate-900">{selectedClass.class_name}</div>
            <div className="text-slate-500">{selectedClass.instance_date} at {selectedClass.start_time.slice(0, 5)}</div>
          </div>
          {selectedClass.remaining > 1 && (
            <div className="mb-4">
              <label className="text-sm font-medium text-slate-700">Spots</label>
              <select value={spots} onChange={(e) => setSpots(Number(e.target.value))} className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                {Array.from({ length: Math.min(selectedClass.remaining, 10) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          )}
          <DetailsStep
            slot={{ key: selectedClass.instance_id, label: selectedClass.class_name, start_time: selectedClass.start_time, end_time: '', available_covers: selectedClass.remaining }}
            date={selectedClass.instance_date}
            partySize={spots}
            onSubmit={handleDetailsSubmit}
            onBack={() => setStep('classes')}
            requiresDeposit={(selectedClass.price_pence ?? 0) > 0}
            phoneDefaultCountry={phoneDefaultCountry}
          />
        </div>
      )}

      {step === 'payment' && createResult?.client_secret && (
        <PaymentStep
          clientSecret={createResult.client_secret}
          stripeAccountId={createResult.stripe_account_id}
          amountPence={(selectedClass?.price_pence ?? 0) * spots}
          partySize={spots}
          onComplete={handlePaymentComplete}
          onBack={() => setStep('details')}
          cancellationPolicy={cancellationPolicy}
        />
      )}

      {step === 'confirmation' && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-green-900">{terms.booking} Confirmed</h2>
          <p className="mt-2 text-sm text-green-700">
            {selectedClass?.class_name}<br />
            {selectedClass?.instance_date} at {selectedClass?.start_time.slice(0, 5)}<br />
            {spots} spot{spots !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
