'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VenuePublic, GuestDetails } from './types';
import type { ClassPaymentRequirement } from '@/types/booking-models';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';
import { DetailsStep } from './DetailsStep';
import { PaymentStep } from './PaymentStep';
import { ResourceCalendarMonth, todayYmdLocal } from './ResourceCalendarMonth';
import { slotIntervalDurationLabel } from '@/lib/booking/slot-interval-label';
import { formatResourcePricePerSlotLine } from '@/lib/booking/format-price-display';

interface ResourceSlot {
  resource_id: string;
  resource_name: string;
  start_time: string;
  price_per_slot_pence: number | null;
}

interface ResourceOption {
  id: string;
  name: string;
  resource_type: string | null;
  min_booking_minutes: number;
  max_booking_minutes: number;
  slot_interval_minutes: number;
  price_per_slot_pence: number | null;
  payment_requirement: ClassPaymentRequirement;
  deposit_amount_pence: number | null;
}

interface ResourceAvail extends ResourceOption {
  slots: ResourceSlot[];
}

type Step =
  | 'pick_resource'
  | 'pick_date'
  | 'pick_slot'
  | 'summary'
  | 'details'
  | 'payment'
  | 'confirmation';

export function ResourceBookingFlow({ venue, cancellationPolicy }: { venue: VenuePublic; cancellationPolicy?: string }) {
  const phoneDefaultCountry = defaultPhoneCountryForVenueCurrency(venue.currency);
  const terms = venue.terminology ?? { client: 'Booker', booking: 'Booking', staff: 'Manager' };

  const [step, setStep] = useState<Step>('pick_resource');
  const [duration, setDuration] = useState(60);
  const [resourceOptions, setResourceOptions] = useState<ResourceOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [selectedMeta, setSelectedMeta] = useState<ResourceOption | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  const [date, setDate] = useState('');
  const [selectedResource, setSelectedResource] = useState<ResourceAvail | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [createResult, setCreateResult] = useState<{
    booking_id: string;
    client_secret?: string;
    stripe_account_id?: string;
    requires_deposit: boolean;
    amount_pence_charged?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingOptions(true);
      try {
        const res = await fetch(`/api/booking/resource-options?venue_id=${encodeURIComponent(venue.id)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Failed to load resources');
        setResourceOptions(data.resources ?? []);
      } catch {
        if (!cancelled) setError('Failed to load resources');
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venue.id]);

  useEffect(() => {
    if (step !== 'pick_date' || !selectedMeta) return;
    let cancelled = false;
    (async () => {
      setLoadingCalendar(true);
      try {
        const params = new URLSearchParams({
          venue_id: venue.id,
          resource_id: selectedMeta.id,
          year: String(calendarMonth.year),
          month: String(calendarMonth.month),
          duration: String(duration),
        });
        const res = await fetch(`/api/booking/resource-calendar?${params}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Failed to load calendar');
        const list = (data.available_dates ?? []) as string[];
        setAvailableDates(new Set(list));
      } catch {
        if (!cancelled) {
          setAvailableDates(new Set());
          setError('Could not load availability for this month.');
        }
      } finally {
        if (!cancelled) setLoadingCalendar(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, venue.id, selectedMeta, calendarMonth.year, calendarMonth.month, duration]);

  useEffect(() => {
    if (step !== 'pick_date' || !date) return;
    const [y, m] = date.split('-').map(Number);
    if (y !== calendarMonth.year || m !== calendarMonth.month) {
      setDate('');
    }
  }, [step, calendarMonth.year, calendarMonth.month, date]);

  useEffect(() => {
    if (step !== 'pick_slot' && step !== 'summary' && step !== 'details' && step !== 'payment') return;
    if (!selectedMeta || !date) return;
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const params = new URLSearchParams({
          venue_id: venue.id,
          date,
          duration: String(duration),
          booking_model: 'resource_booking',
          resource_id: selectedMeta.id,
        });
        const res = await fetch(`/api/booking/availability?${params}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Failed to load times');
        const r = (data.resources ?? [])[0] as ResourceAvail | undefined;
        setSelectedResource(r ?? null);
      } catch {
        if (!cancelled) {
          setSelectedResource(null);
          setError('Failed to load available times.');
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, venue.id, date, duration, selectedMeta]);

  function computeEndTime(start: string, mins: number): string {
    const [h, m] = start.split(':').map(Number);
    const totalMins = h! * 60 + m! + mins;
    const eh = Math.floor(totalMins / 60) % 24;
    const em = totalMins % 60;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  }

  const priceBasis = selectedResource ?? selectedMeta;
  const numSlotsCalc = priceBasis ? Math.ceil(duration / priceBasis.slot_interval_minutes) : 1;
  const totalPricePence = (priceBasis?.price_per_slot_pence ?? 0) * numSlotsCalc;
  const payReq = priceBasis?.payment_requirement ?? 'none';
  const onlineChargePence = useMemo(() => {
    if (!priceBasis) return 0;
    const req = priceBasis.payment_requirement ?? 'none';
    const n = Math.ceil(duration / priceBasis.slot_interval_minutes);
    const total = (priceBasis.price_per_slot_pence ?? 0) * n;
    if (req === 'full_payment' && total > 0) return total;
    if (req === 'deposit' && (priceBasis.deposit_amount_pence ?? 0) > 0) return priceBasis.deposit_amount_pence ?? 0;
    return 0;
  }, [priceBasis, duration]);

  const handleDetailsSubmit = useCallback(
    async (details: GuestDetails) => {
      setError(null);
      const resourceId = selectedResource?.id ?? selectedMeta?.id;
      if (!resourceId || !selectedTime) return;
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
            resource_id: resourceId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Booking failed');
        const charged = typeof data.deposit_amount_pence === 'number' ? data.deposit_amount_pence : onlineChargePence;
        setCreateResult({
          booking_id: data.booking_id,
          client_secret: data.client_secret,
          stripe_account_id: data.stripe_account_id,
          requires_deposit: data.requires_deposit ?? false,
          amount_pence_charged: charged,
        });
        setStep(data.requires_deposit && data.client_secret ? 'payment' : 'confirmation');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Booking failed');
      }
    },
    [venue.id, date, selectedTime, selectedResource?.id, selectedMeta?.id, duration, onlineChargePence],
  );

  const handlePaymentComplete = useCallback(async () => {
    if (createResult?.booking_id) {
      try {
        await fetch('/api/booking/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: createResult.booking_id }),
        });
      } catch {
        /* webhook fallback */
      }
    }
    setStep('confirmation');
  }, [createResult?.booking_id]);

  function selectResource(r: ResourceOption) {
    setError(null);
    setSelectedMeta(r);
    setDuration((d) => Math.min(Math.max(d, r.min_booking_minutes), r.max_booking_minutes));
    const n = new Date();
    setCalendarMonth({ year: n.getFullYear(), month: n.getMonth() + 1 });
    setDate('');
    setSelectedTime(null);
    setSelectedResource(null);
    setStep('pick_date');
  }

  function onCalendarSelectDay(ymd: string) {
    setError(null);
    setDate(ymd);
    setSelectedTime(null);
    setStep('pick_slot');
  }

  function goPrevMonth() {
    setCalendarMonth((cm) => {
      if (cm.month <= 1) return { year: cm.year - 1, month: 12 };
      return { year: cm.year, month: cm.month - 1 };
    });
  }

  function goNextMonth() {
    setCalendarMonth((cm) => {
      if (cm.month >= 12) return { year: cm.year + 1, month: 1 };
      return { year: cm.year, month: cm.month + 1 };
    });
  }

  const minYmd = todayYmdLocal();

  return (
    <div className="mx-auto max-w-lg">
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {step === 'pick_resource' && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Book a resource</h2>
          <p className="mb-4 text-sm text-slate-600">Choose how long you need, then pick a resource. You will choose a date and time next.</p>
          <div className="mb-4">
            <label className="text-sm text-slate-500">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
              <option value={240}>4 hours</option>
            </select>
          </div>
          {loadingOptions ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : resourceOptions.length === 0 ? (
            <p className="text-sm text-slate-500">No resources are available to book. Please contact the venue.</p>
          ) : (
            <div className="space-y-3">
              {resourceOptions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectResource(r)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-brand-300"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{r.name}</div>
                      {r.resource_type && <div className="text-xs text-slate-500">{r.resource_type}</div>}
                    </div>
                    <div className="text-right text-sm">
                      <span className="font-medium text-brand-600">
                        {formatResourcePricePerSlotLine(
                          r.price_per_slot_pence,
                          venue.currency === 'EUR' ? '€' : '£',
                          slotIntervalDurationLabel(r.slot_interval_minutes),
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'pick_date' && selectedMeta && (
        <div>
          <button
            type="button"
            onClick={() => {
              setSelectedMeta(null);
              setStep('pick_resource');
            }}
            className="mb-4 text-sm text-brand-600 hover:underline"
          >
            &larr; Back to resources
          </button>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">{selectedMeta.name}</h2>
          <p className="mb-4 text-sm text-slate-600">
            Green days have availability for {duration} minutes. Select a day to choose a start time.
          </p>
          <ResourceCalendarMonth
            year={calendarMonth.year}
            month={calendarMonth.month}
            availableDates={availableDates}
            selectedDate={date || null}
            onSelectDate={onCalendarSelectDay}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
            minSelectableDate={minYmd}
            loading={loadingCalendar}
          />
        </div>
      )}

      {step === 'pick_slot' && selectedMeta && (
        <div>
          <button
            type="button"
            onClick={() => {
              setSelectedTime(null);
              setStep('pick_date');
            }}
            className="mb-4 text-sm text-brand-600 hover:underline"
          >
            &larr; Back to calendar
          </button>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Choose a start time</h2>
          <p className="mb-4 text-sm text-slate-500">
            {selectedMeta.name} &middot; {date}
          </p>
          {loadingSlots ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : !selectedResource || selectedResource.slots.length === 0 ? (
            <p className="text-sm text-slate-500">
              No available times for this duration on this date. Go back and pick another day or contact the venue.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedResource.slots.map((slot) => (
                <button
                  key={slot.start_time}
                  type="button"
                  onClick={() => {
                    setSelectedTime(slot.start_time);
                    setStep('summary');
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-brand-300 hover:text-brand-600"
                >
                  {slot.start_time}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'summary' && selectedTime && selectedMeta && (
        <div>
          <button type="button" onClick={() => setStep('pick_slot')} className="mb-4 text-sm text-brand-600 hover:underline">
            &larr; Back to times
          </button>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Your selection</h2>
          <div className="mb-6 space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="font-medium text-slate-900">{selectedMeta.name}</div>
            <div className="text-slate-600">
              {date} &middot; {selectedTime} – {computeEndTime(selectedTime, duration)} ({duration} min)
            </div>
            {totalPricePence <= 0 ? (
              <div className="font-medium text-brand-600">Free</div>
            ) : (
              <div className="font-medium text-brand-600">
                {venue.currency === 'EUR' ? '€' : '£'}
                {(totalPricePence / 100).toFixed(2)}
                {payReq === 'none' ? ' (pay at venue)' : payReq === 'deposit' ? ' (total; deposit charged online)' : ' (paid online in full)'}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStep('details')}
            className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            Continue to guest details
          </button>
        </div>
      )}

      {step === 'details' && selectedTime && (
        <div>
          <button type="button" onClick={() => setStep('summary')} className="mb-4 text-sm text-brand-600 hover:underline">
            &larr; Back to summary
          </button>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="font-medium text-slate-900">{selectedResource?.name ?? selectedMeta?.name}</div>
            <div className="text-slate-500">
              {date} &middot; {selectedTime} – {computeEndTime(selectedTime, duration)}
            </div>
            {totalPricePence <= 0 ? (
              <div className="mt-1 font-medium text-brand-600">Free</div>
            ) : (
              <div className="mt-1 space-y-0.5">
                <div className="font-medium text-brand-600">
                  {venue.currency === 'EUR' ? '€' : '£'}
                  {(totalPricePence / 100).toFixed(2)}
                  {payReq === 'none' ? ' (pay at venue)' : payReq === 'deposit' ? ' (total; deposit charged online)' : ' (paid online in full)'}
                </div>
              </div>
            )}
          </div>
          <DetailsStep
            slot={{
              key: selectedTime,
              label: selectedTime,
              start_time: selectedTime,
              end_time: computeEndTime(selectedTime, duration),
              available_covers: 1,
            }}
            date={date}
            partySize={1}
            onSubmit={handleDetailsSubmit}
            onBack={() => setStep('summary')}
            requiresDeposit={false}
            variant="appointment"
            appointmentDepositPence={onlineChargePence > 0 ? onlineChargePence : null}
            appointmentChargeLabel={payReq === 'full_payment' ? 'full_payment' : 'deposit'}
            payAtVenueBalancePence={payReq === 'none' && totalPricePence > 0 ? totalPricePence : null}
            payAtVenuePaymentRequirement={payReq === 'none' ? 'none' : undefined}
            currencySymbol={venue.currency === 'EUR' ? '€' : '£'}
            phoneDefaultCountry={phoneDefaultCountry}
          />
        </div>
      )}

      {step === 'payment' && createResult?.client_secret && (
        <PaymentStep
          clientSecret={createResult.client_secret}
          stripeAccountId={createResult.stripe_account_id}
          amountPence={createResult.amount_pence_charged ?? onlineChargePence}
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
          <h2 className="text-xl font-bold text-green-900">{terms.booking} confirmed</h2>
          <p className="mt-2 text-sm text-green-700">
            {selectedResource?.name ?? selectedMeta?.name}
            <br />
            {date} &middot; {selectedTime} – {selectedTime ? computeEndTime(selectedTime, duration) : ''}
          </p>
        </div>
      )}
    </div>
  );
}
