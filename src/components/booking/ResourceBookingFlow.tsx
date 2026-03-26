'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VenuePublic, GuestDetails } from './types';
import { DetailsStep } from './DetailsStep';
import { PaymentStep } from './PaymentStep';

interface ResourceSlot {
  resource_id: string;
  resource_name: string;
  start_time: string;
  price_per_slot_pence: number | null;
}

interface ResourceAvail {
  id: string;
  name: string;
  resource_type: string | null;
  min_booking_minutes: number;
  max_booking_minutes: number;
  slot_interval_minutes: number;
  price_per_slot_pence: number | null;
  slots: ResourceSlot[];
}

type Step = 'resource' | 'slot' | 'details' | 'payment' | 'confirmation';

export function ResourceBookingFlow({ venue, cancellationPolicy }: { venue: VenuePublic; cancellationPolicy?: string }) {
  const terms = venue.terminology ?? { client: 'Booker', booking: 'Booking', staff: 'Manager' };

  const [step, setStep] = useState<Step>('resource');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState(60);
  const [resources, setResources] = useState<ResourceAvail[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceAvail | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<{ booking_id: string; client_secret?: string; stripe_account_id?: string; requires_deposit: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ venue_id: venue.id, date, duration: String(duration) });
      if (selectedResource) params.set('resource_id', selectedResource.id);
      const res = await fetch(`/api/booking/availability?${params}`);
      const data = await res.json();
      setResources(data.resources ?? []);
    } catch {
      setError('Failed to load resources');
    } finally {
      setLoading(false);
    }
  }, [venue.id, date, duration, selectedResource]);

  useEffect(() => { fetchResources(); }, [fetchResources]);

  function computeEndTime(start: string, mins: number): string {
    const [h, m] = start.split(':').map(Number);
    const totalMins = h! * 60 + m! + mins;
    const eh = Math.floor(totalMins / 60) % 24;
    const em = totalMins % 60;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  }

  const handleDetailsSubmit = useCallback(async (details: GuestDetails) => {
    setError(null);
    if (!selectedResource || !selectedTime) return;
    const endTime = computeEndTime(selectedTime, duration);
    try {
      const res = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venue.id,
          booking_date: date,
          booking_time: selectedTime,
          booking_end_time: endTime,
          party_size: 1,
          name: details.name,
          email: details.email || undefined,
          phone: details.phone,
          source: 'booking_page',
          resource_id: selectedResource.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Booking failed');
      setCreateResult({ booking_id: data.booking_id, client_secret: data.client_secret, stripe_account_id: data.stripe_account_id, requires_deposit: data.requires_deposit ?? false });
      setStep(data.requires_deposit && data.client_secret ? 'payment' : 'confirmation');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    }
  }, [venue.id, date, selectedTime, selectedResource, duration]);

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

  const numSlots = selectedResource ? Math.ceil(duration / selectedResource.slot_interval_minutes) : 1;
  const totalPricePence = (selectedResource?.price_per_slot_pence ?? 0) * numSlots;

  return (
    <div className="mx-auto max-w-lg">
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {step === 'resource' && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Book a Resource</h2>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-500">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm text-slate-500">Duration</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : resources.length === 0 ? (
            <p className="text-sm text-slate-500">No resources available on this date.</p>
          ) : (
            <div className="space-y-3">
              {resources.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedResource(r); setStep('slot'); }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-brand-300"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{r.name}</div>
                      {r.resource_type && <div className="text-xs text-slate-500">{r.resource_type}</div>}
                    </div>
                    <div className="text-right text-sm">
                      {r.price_per_slot_pence != null && (
                        <span className="font-medium text-brand-600">£{(r.price_per_slot_pence / 100).toFixed(2)}/slot</span>
                      )}
                      <div className="text-xs text-slate-400">{r.slots.length} times</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'slot' && selectedResource && (
        <div>
          <button onClick={() => { setSelectedResource(null); setStep('resource'); }} className="mb-4 text-sm text-brand-600 hover:underline">&larr; Back</button>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{selectedResource.name} — Pick a time</h2>
          {selectedResource.slots.length === 0 ? (
            <p className="text-sm text-slate-500">No available times for this duration.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedResource.slots.map((slot) => (
                <button
                  key={slot.start_time}
                  onClick={() => { setSelectedTime(slot.start_time); setStep('details'); }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-brand-300 hover:text-brand-600"
                >
                  {slot.start_time}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'details' && selectedTime && (
        <div>
          <button onClick={() => setStep('slot')} className="mb-4 text-sm text-brand-600 hover:underline">&larr; Back</button>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="font-medium text-slate-900">{selectedResource?.name}</div>
            <div className="text-slate-500">{date} &middot; {selectedTime} – {computeEndTime(selectedTime, duration)}</div>
            {totalPricePence > 0 && <div className="mt-1 font-medium text-brand-600">£{(totalPricePence / 100).toFixed(2)}</div>}
          </div>
          <DetailsStep
            slot={{ key: selectedTime, label: selectedTime, start_time: selectedTime, end_time: computeEndTime(selectedTime, duration), available_covers: 1 }}
            date={date}
            partySize={1}
            onSubmit={handleDetailsSubmit}
            onBack={() => setStep('slot')}
            requiresDeposit={totalPricePence > 0}
          />
        </div>
      )}

      {step === 'payment' && createResult?.client_secret && (
        <PaymentStep
          clientSecret={createResult.client_secret}
          stripeAccountId={createResult.stripe_account_id}
          amountPence={totalPricePence}
          partySize={1}
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
            {selectedResource?.name}<br />
            {date} &middot; {selectedTime} – {selectedTime ? computeEndTime(selectedTime, duration) : ''}
          </p>
        </div>
      )}
    </div>
  );
}
