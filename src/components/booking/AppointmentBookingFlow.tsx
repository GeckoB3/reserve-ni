'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VenuePublic, GuestDetails } from './types';
import { DetailsStep } from './DetailsStep';
import { PaymentStep } from './PaymentStep';
import { ConfirmationStep } from './ConfirmationStep';

interface Practitioner {
  id: string;
  name: string;
  services: Array<{ id: string; name: string; duration_minutes: number; price_pence: number | null }>;
  slots: Array<{ start_time: string; service_id: string; duration_minutes: number; price_pence: number | null }>;
}

type Step = 'service' | 'practitioner' | 'slot' | 'details' | 'payment' | 'confirmation';

interface AppointmentBookingFlowProps {
  venue: VenuePublic;
  cancellationPolicy?: string;
  embed?: boolean;
  onHeightChange?: (height: number) => void;
  accentColour?: string;
}

export function AppointmentBookingFlow({ venue, cancellationPolicy, embed, onHeightChange, accentColour }: AppointmentBookingFlowProps) {
  const terms = venue.terminology ?? { client: 'Client', booking: 'Appointment', staff: 'Staff' };

  const [step, setStep] = useState<Step>('service');
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [guestDetails, setGuestDetails] = useState<GuestDetails | null>(null);
  const [createResult, setCreateResult] = useState<{ booking_id: string; client_secret?: string; stripe_account_id?: string; requires_deposit: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onHeightChange || !containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) onHeightChange(Math.ceil(entry.contentRect.height));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [onHeightChange]);

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ venue_id: venue.id, date });
      if (selectedServiceId) params.set('service_id', selectedServiceId);
      if (selectedPractitionerId) params.set('practitioner_id', selectedPractitionerId);
      const res = await fetch(`/api/booking/availability?${params}`);
      const data = await res.json();
      setPractitioners(data.practitioners ?? []);
    } catch {
      setError('Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [venue.id, date, selectedServiceId, selectedPractitionerId]);

  useEffect(() => {
    if (step === 'service' || step === 'practitioner' || step === 'slot') fetchAvailability();
  }, [fetchAvailability, step]);

  // Collect all unique services across all practitioners
  const allServices = practitioners.flatMap((p) => p.services);
  const uniqueServices = Array.from(new Map(allServices.map((s) => [s.id, s])).values());

  const selectedPrac = practitioners.find((p) => p.id === selectedPractitionerId);
  const availableSlots = selectedPrac?.slots.filter((s) => !selectedServiceId || s.service_id === selectedServiceId) ?? [];
  const selectedService = uniqueServices.find((s) => s.id === selectedServiceId);

  const handleDetailsSubmit = useCallback(async (details: GuestDetails) => {
    setGuestDetails(details);
    setError(null);
    try {
      const res = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venue.id,
          booking_date: date,
          booking_time: selectedTime,
          party_size: 1,
          name: details.name,
          email: details.email || undefined,
          phone: details.phone,
          source: 'booking_page',
          practitioner_id: selectedPractitionerId,
          appointment_service_id: selectedServiceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Booking failed');
      setCreateResult({ booking_id: data.booking_id, client_secret: data.client_secret, stripe_account_id: data.stripe_account_id, requires_deposit: data.requires_deposit ?? false });
      setStep(data.requires_deposit && data.client_secret ? 'payment' : 'confirmation');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    }
  }, [venue.id, date, selectedTime, selectedPractitionerId, selectedServiceId]);

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

  const sym = venue.currency === 'EUR' ? '€' : '£';

  function formatPrice(pence: number | null): string {
    if (pence == null) return 'POA';
    return `${sym}${(pence / 100).toFixed(2)}`;
  }

  return (
    <div ref={containerRef} className="mx-auto max-w-lg" style={accentColour ? { '--accent': accentColour } as React.CSSProperties : undefined}>
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {step === 'service' && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Select a service</h2>
          <div className="mb-4">
            <label className="text-sm text-slate-500">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : uniqueServices.length === 0 ? (
            <p className="text-sm text-slate-500">No services available. Please select a different date.</p>
          ) : (
            <div className="space-y-2">
              {uniqueServices.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => { setSelectedServiceId(svc.id); setStep('practitioner'); }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-brand-300 hover:shadow"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-900">{svc.name}</div>
                      <div className="text-xs text-slate-500">{svc.duration_minutes} min</div>
                    </div>
                    <span className="text-sm font-semibold text-brand-600">{formatPrice(svc.price_pence)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'practitioner' && (
        <div>
          <button onClick={() => { setSelectedServiceId(null); setSelectedPractitionerId(null); setStep('service'); }} className="mb-4 text-sm text-brand-600 hover:underline">&larr; Back</button>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Choose {terms.staff.toLowerCase()}</h2>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : practitioners.length === 0 ? (
            <p className="text-sm text-slate-500">No {terms.staff.toLowerCase()}s available on this date.</p>
          ) : (
            <div className="space-y-2">
              {practitioners.map((prac) => (
                <button
                  key={prac.id}
                  onClick={() => { setSelectedPractitionerId(prac.id); setStep('slot'); }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-brand-300 hover:shadow"
                >
                  <span className="font-medium text-slate-900">{prac.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'slot' && (
        <div>
          <button onClick={() => { setSelectedPractitionerId(null); setSelectedTime(null); setStep('practitioner'); }} className="mb-4 text-sm text-brand-600 hover:underline">&larr; Back</button>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Pick a time</h2>
          {loading ? (
            <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
          ) : availableSlots.length === 0 ? (
            <p className="text-sm text-slate-500">No times available. Try another date or {terms.staff.toLowerCase()}.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableSlots.map((slot) => (
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
          <button onClick={() => { setSelectedTime(null); setStep('slot'); }} className="mb-4 text-sm text-brand-600 hover:underline">&larr; Back</button>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="font-medium text-slate-900">{selectedService?.name}</div>
            <div className="text-slate-500">{date} at {selectedTime} &middot; {selectedPrac?.name}</div>
          </div>
          <DetailsStep
            slot={{ key: selectedTime, label: selectedTime, start_time: selectedTime, end_time: '', available_covers: 1 }}
            date={date}
            partySize={1}
            onSubmit={handleDetailsSubmit}
            onBack={() => { setSelectedTime(null); setStep('slot'); }}
            requiresDeposit={false}
          />
        </div>
      )}

      {step === 'payment' && createResult?.client_secret && (
        <PaymentStep
          clientSecret={createResult.client_secret}
          stripeAccountId={createResult.stripe_account_id}
          amountPence={selectedService?.price_pence ?? 0}
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
            {selectedService?.name} with {selectedPrac?.name}<br />
            {date} at {selectedTime}
          </p>
        </div>
      )}
    </div>
  );
}
