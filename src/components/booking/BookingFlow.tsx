'use client';

import { useCallback, useEffect, useState } from 'react';
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
}

const steps: Array<'date' | 'slot' | 'details' | 'payment' | 'confirmation'> = ['date', 'slot', 'details', 'payment', 'confirmation'];

export function BookingFlow({ venue, embed, onHeightChange }: BookingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [partySize, setPartySize] = useState(venue.booking_rules?.min_party_size ?? 2);
  const [guestDetails, setGuestDetails] = useState<GuestDetails | null>(null);
  const [createResult, setCreateResult] = useState<{ booking_id: string; client_secret?: string; requires_deposit: boolean } | null>(null);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = steps[stepIndex];
  const rules: BookingRulesPublic = venue.booking_rules ?? { min_party_size: 1, max_party_size: 20 };
  const requiresDeposit = Boolean(
    venue.deposit_config?.enabled &&
    venue.deposit_config?.online_requires_deposit !== false
  );

  useEffect(() => {
    if (!embed || !onHeightChange) return;
    onHeightChange(document.documentElement.scrollHeight);
  }, [embed, onHeightChange, step, selectedDate, slots.length, selectedSlot, guestDetails, createResult, paymentComplete]);

  const goNext = useCallback(() => {
    setError(null);
    if (step === 'details' && requiresDeposit) {
      setStepIndex((i) => i + 1);
    } else if (step === 'details' && !requiresDeposit) {
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
    const res = await fetch(
      `/api/booking/availability?venue_id=${encodeURIComponent(venue.id)}&date=${encodeURIComponent(date)}&party_size=${partySize}`
    );
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
          source: 'online',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Booking failed');
      setCreateResult({
        booking_id: data.booking_id,
        client_secret: data.client_secret,
        requires_deposit: data.requires_deposit ?? false,
      });
      if (!data.requires_deposit) {
        setStepIndex(steps.indexOf('confirmation'));
      } else {
        goNext();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    }
  }, [venue.id, selectedDate, selectedSlot, partySize, goNext]);

  const handlePaymentComplete = useCallback(() => {
    setPaymentComplete(true);
    goNext();
  }, [goNext]);

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {venue.cover_photo_url && (
        <div className="mb-6 overflow-hidden rounded-lg">
          <img src={venue.cover_photo_url} alt="" className="h-40 w-full object-cover" />
        </div>
      )}
      <h1 className="text-xl font-semibold text-neutral-900">{venue.name}</h1>
      <p className="mt-1 text-sm text-neutral-600">Reservation</p>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {step === 'date' && (
        <DateStep
          minParty={rules.min_party_size}
          maxParty={rules.max_party_size}
          partySize={partySize}
          onPartySizeChange={setPartySize}
          onDateSelect={handleDateSelect}
        />
      )}

      {step === 'slot' && (
        <SlotStep
          date={selectedDate!}
          slots={slots}
          onSelect={handleSlotSelect}
          onBack={goBack}
        />
      )}

      {step === 'details' && selectedSlot && (
        <DetailsStep
          slot={selectedSlot}
          date={selectedDate!}
          partySize={partySize}
          onSubmit={handleDetailsSubmit}
          onBack={goBack}
        />
      )}

      {step === 'payment' && createResult?.client_secret && (
        <PaymentStep
          clientSecret={createResult.client_secret}
          amountPence={(venue.deposit_config?.amount_per_person_gbp ?? 0) * partySize * 100}
          partySize={partySize}
          onComplete={handlePaymentComplete}
          onBack={goBack}
        />
      )}

      {step === 'confirmation' && (
        <ConfirmationStep
          venue={venue}
          date={selectedDate!}
          slot={selectedSlot!}
          partySize={partySize}
          guest={guestDetails!}
          bookingId={createResult?.booking_id}
        />
      )}
    </div>
  );
}
