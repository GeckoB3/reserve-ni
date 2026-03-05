'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AvailableSlot, BookingRulesPublic, GuestDetails, VenuePublic } from './types';
import { DateStep } from './DateStep';
import { SlotStep } from './SlotStep';
import { DetailsStep } from './DetailsStep';
import { PaymentStep } from './PaymentStep';
import { ConfirmationStep } from './ConfirmationStep';

export interface BookingFlowProps {
  venue: VenuePublic;
  embed?: boolean;
  onHeightChange?: (height: number) => void;
  cancellationPolicy?: string;
  accentColour?: string;
}

const steps: Array<'date' | 'slot' | 'details' | 'payment' | 'confirmation'> = ['date', 'slot', 'details', 'payment', 'confirmation'];
const STEP_LABELS = ['Date', 'Time', 'Details', 'Payment', 'Done'];

export function BookingFlow({ venue, embed, onHeightChange, cancellationPolicy, accentColour }: BookingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [partySize, setPartySize] = useState(venue.booking_rules?.min_party_size ?? 2);
  const [guestDetails, setGuestDetails] = useState<GuestDetails | null>(null);
  const [createResult, setCreateResult] = useState<{ booking_id: string; client_secret?: string; stripe_account_id?: string; requires_deposit: boolean } | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = steps[stepIndex];
  const rules: BookingRulesPublic = venue.booking_rules ?? { min_party_size: 1, max_party_size: 20 };

  // Recompute whenever partySize or selectedDate changes so the cancellation policy
  // and payment step only appear when a deposit actually applies.
  const requiresDeposit = useMemo(() => {
    const cfg = venue.deposit_config;
    if (!cfg?.enabled) return false;
    if (cfg.online_requires_deposit === false) return false;
    if (cfg.min_party_size_for_deposit && partySize < cfg.min_party_size_for_deposit) return false;
    if (cfg.weekend_only && selectedDate) {
      const dow = new Date(selectedDate + 'T12:00:00').getDay();
      const isWeekend = dow === 0 || dow === 5 || dow === 6;
      if (!isWeekend) return false;
    }
    return true;
  }, [venue.deposit_config, partySize, selectedDate]);

  useEffect(() => {
    if (!embed || !onHeightChange) return;
    onHeightChange(document.documentElement.scrollHeight);
  }, [embed, onHeightChange, step, selectedDate, slots.length, selectedSlot, guestDetails, createResult, paymentComplete]);

  const goNext = useCallback(() => {
    setError(null);
    if (step === 'details' && !requiresDeposit) {
      setStepIndex(steps.indexOf('confirmation'));
    } else {
      setStepIndex((i) => Math.min(i + 1, steps.length - 1));
    }
  }, [step, requiresDeposit]);

  const goBack = useCallback(() => {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const fetchSlots = useCallback(async (date: string) => {
    const res = await fetch(`/api/booking/availability?venue_id=${encodeURIComponent(venue.id)}&date=${encodeURIComponent(date)}&party_size=${partySize}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Failed to load times');
    }
    const data = await res.json();
    setSlots(data.slots ?? []);
  }, [venue.id, partySize]);

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    fetchSlots(date).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
    goNext();
  }, [fetchSlots, goNext]);

  const handleSlotSelect = useCallback((slot: AvailableSlot) => {
    setSelectedSlot(slot);
    goNext();
  }, [goNext]);

  const handleDetailsSubmit = useCallback(async (details: GuestDetails) => {
    setGuestDetails(details);
    setError(null);
    if (!selectedDate || !selectedSlot) return;
    try {
      const res = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venue.id,
          booking_date: selectedDate,
          booking_time: selectedSlot.start_time,
          party_size: partySize,
          name: details.name,
          email: details.email || undefined,
          phone: details.phone,
          dietary_notes: details.dietary_notes || undefined,
          occasion: details.occasion || undefined,
          source: embed ? 'widget' : 'booking_page',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) { setError(data.error ?? 'This time slot is no longer available'); return; }
        throw new Error(data.error ?? 'Booking failed');
      }
      setCreateResult({ booking_id: data.booking_id, client_secret: data.client_secret, stripe_account_id: data.stripe_account_id, requires_deposit: data.requires_deposit ?? false });
      if (!data.requires_deposit) {
        setStepIndex(steps.indexOf('confirmation'));
      } else {
        goNext();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    }
  }, [venue.id, selectedDate, selectedSlot, partySize, embed, goNext]);

  const handlePaymentComplete = useCallback(async () => {
    if (!createResult?.booking_id) {
      setPaymentComplete(true);
      goNext();
      return;
    }
    // Verify the payment server-side and confirm the booking + send comms.
    // This is the primary confirmation path — the webhook is a backup.
    try {
      const res = await fetch('/api/booking/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: createResult.booking_id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('confirm-payment failed:', data.error);
      }
    } catch (e) {
      console.error('confirm-payment call failed:', e);
    }
    setPaymentComplete(true);
    goNext();
  }, [goNext, createResult?.booking_id]);

  const accentStyle = accentColour
    ? { '--accent-color': `#${accentColour.replace(/^#/, '')}` } as React.CSSProperties
    : undefined;

  const visibleSteps = requiresDeposit ? STEP_LABELS : STEP_LABELS.filter((_, i) => i !== 3);
  const currentVisibleIndex = requiresDeposit ? stepIndex : (stepIndex >= 3 ? stepIndex - 1 : stepIndex);

  return (
    <div className="mx-auto max-w-lg" style={accentStyle}>
      {/* Progress indicator */}
      {step !== 'confirmation' && (
        <div className="mb-8 mt-2">
          <div className="flex items-center justify-between">
            {visibleSteps.map((label, i) => {
              const isActive = i === currentVisibleIndex;
              const isDone = i < currentVisibleIndex;
              return (
                <div key={label} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isActive ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30' :
                      isDone ? 'bg-brand-100 text-brand-700' :
                      'bg-slate-100 text-slate-400'
                    }`}>
                      {isDone ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={`mt-1 text-xs font-medium ${isActive ? 'text-brand-700' : isDone ? 'text-brand-600' : 'text-slate-400'}`}>{label}</span>
                  </div>
                  {i < visibleSteps.length - 1 && (
                    <div className={`mx-1 h-0.5 flex-1 rounded ${isDone ? 'bg-brand-300' : 'bg-slate-100'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {step === 'date' && (
        <DateStep minParty={rules.min_party_size} maxParty={rules.max_party_size} partySize={partySize} onPartySizeChange={setPartySize} onDateSelect={handleDateSelect} />
      )}
      {step === 'slot' && (
        <SlotStep date={selectedDate!} slots={slots} onSelect={handleSlotSelect} onBack={goBack} />
      )}
      {step === 'details' && selectedSlot && (
        <DetailsStep slot={selectedSlot} date={selectedDate!} partySize={partySize} onSubmit={handleDetailsSubmit} onBack={goBack} cancellationPolicy={cancellationPolicy} requiresDeposit={requiresDeposit} />
      )}
      {step === 'payment' && createResult?.client_secret && (
        <PaymentStep clientSecret={createResult.client_secret} stripeAccountId={createResult.stripe_account_id} amountPence={(venue.deposit_config?.amount_per_person_gbp ?? 0) * partySize * 100} partySize={partySize} onComplete={handlePaymentComplete} onBack={goBack} cancellationPolicy={cancellationPolicy} />
      )}
      {step === 'confirmation' && (
        <ConfirmationStep venue={venue} date={selectedDate!} slot={selectedSlot!} partySize={partySize} guest={guestDetails!} bookingId={createResult?.booking_id} requiresDeposit={requiresDeposit} />
      )}
    </div>
  );
}
