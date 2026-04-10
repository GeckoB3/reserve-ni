'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VenuePublic, GuestDetails } from './types';
import type { ClassPaymentRequirement } from '@/types/booking-models';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';
import { DetailsStep } from './DetailsStep';
import { BookingSubmittingPanel } from './BookingSubmittingPanel';
import { PaymentStep } from './PaymentStep';
import { ClassOfferingsCalendar } from './ClassOfferingsCalendar';
import {
  type BookingFlowAudience,
  classOfferingsUrl,
  localTodayISO,
  bookingCreateUrl,
  bookingConfirmPaymentUrl,
  venueBookingsCreateUrl,
} from '@/lib/booking/booking-flow-api';
import { formatOnlinePaidRefundPolicyLine } from '@/lib/booking/public-deposit-refund-policy';

interface ClassOfferingSummary {
  class_type_id: string;
  class_name: string;
  description: string | null;
  colour: string;
  price_pence: number | null;
  payment_requirement: ClassPaymentRequirement;
  deposit_amount_pence: number | null;
  instructor_name: string | null;
  dates: string[];
  session_count: number;
}

interface ClassSlot {
  instance_id: string;
  class_type_id: string;
  class_name: string;
  description: string | null;
  instance_date: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  remaining: number;
  price_pence: number | null;
  payment_requirement: ClassPaymentRequirement;
  deposit_amount_pence: number | null;
  /** Hours before start for refund of online deposit / prepayment. */
  cancellation_notice_hours?: number;
  requires_stripe_checkout: boolean;
  instructor_name: string | null;
  colour: string;
}

type Step = 'pick-class' | 'pick-date' | 'summary' | 'details' | 'payment' | 'confirmation';

function symForCurrency(currency: string): string {
  return currency === 'EUR' ? '€' : '£';
}

function paymentSummaryLines(
  slot: ClassSlot,
  spots: number,
  currency: string,
): { lines: string[]; chargePence: number } {
  const sym = symForCurrency(currency);
  const price = slot.price_pence ?? 0;
  const dep = slot.deposit_amount_pence ?? 0;
  const req = slot.payment_requirement;

  if (price <= 0) {
    return { lines: ['Free - no payment required'], chargePence: 0 };
  }

  if (req === 'none') {
    return {
      lines: [
        `${sym}${(price / 100).toFixed(2)} per person - pay at venue.`,
        `Total for ${spots} spot${spots !== 1 ? 's' : ''}: ${sym}${((price * spots) / 100).toFixed(2)} (informational).`,
      ],
      chargePence: 0,
    };
  }

  if (req === 'full_payment') {
    const total = price * spots;
    return {
      lines: [`${sym}${(price / 100).toFixed(2)} per person`, `Total due now: ${sym}${(total / 100).toFixed(2)}`],
      chargePence: total,
    };
  }

  if (req === 'deposit' && dep > 0) {
    const totalDep = dep * spots;
    const remainingPerPerson = Math.max(0, price - dep);
    return {
      lines: [
        `Deposit: ${sym}${(dep / 100).toFixed(2)} per person (total deposit: ${sym}${(totalDep / 100).toFixed(2)}).`,
        remainingPerPerson > 0
          ? `Remaining ${sym}${(remainingPerPerson / 100).toFixed(2)} per person due at venue.`
          : 'Balance due at venue.',
      ],
      chargePence: totalDep,
    };
  }

  return { lines: [`${sym}${(price / 100).toFixed(2)} per person`], chargePence: 0 };
}

function mapInstanceToSlot(row: Record<string, unknown>): ClassSlot {
  return {
    instance_id: row.instance_id as string,
    class_type_id: row.class_type_id as string,
    class_name: row.class_name as string,
    description: (row.description as string | null) ?? null,
    instance_date: row.instance_date as string,
    start_time: row.start_time as string,
    duration_minutes: row.duration_minutes as number,
    capacity: row.capacity as number,
    remaining: row.remaining as number,
    price_pence: (row.price_pence as number | null) ?? null,
    payment_requirement: row.payment_requirement as ClassPaymentRequirement,
    deposit_amount_pence: (row.deposit_amount_pence as number | null) ?? null,
    cancellation_notice_hours:
      typeof row.cancellation_notice_hours === 'number' && Number.isFinite(row.cancellation_notice_hours)
        ? row.cancellation_notice_hours
        : undefined,
    requires_stripe_checkout: Boolean(row.requires_stripe_checkout),
    instructor_name: (row.instructor_name as string | null) ?? null,
    colour: (row.colour as string) ?? '#6366f1',
  };
}

export interface ClassBookingFlowProps {
  venue: VenuePublic;
  cancellationPolicy?: string;
  bookingAudience?: BookingFlowAudience;
  staffBookingSource?: 'phone' | 'walk-in';
  onBookingCreated?: () => void;
}

export function ClassBookingFlow({
  venue,
  cancellationPolicy,
  bookingAudience = 'public',
  staffBookingSource = 'phone',
  onBookingCreated,
}: ClassBookingFlowProps) {
  const isStaff = bookingAudience === 'staff';
  const detailsAudience =
    isStaff && staffBookingSource === 'walk-in' ? ('staff_walk_in' as const) : isStaff ? ('staff' as const) : ('public' as const);
  const currency = venue.currency ?? 'GBP';
  const phoneDefaultCountry = defaultPhoneCountryForVenueCurrency(currency);
  const terms = venue.terminology ?? { client: 'Member', booking: 'Booking', staff: 'Instructor' };
  const sym = symForCurrency(currency);

  const [step, setStep] = useState<Step>('pick-class');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [classSummaries, setClassSummaries] = useState<ClassOfferingSummary[]>([]);
  const [instances, setInstances] = useState<ClassSlot[]>([]);
  const [selectedClassTypeId, setSelectedClassTypeId] = useState<string | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassSlot | null>(null);
  const [spots, setSpots] = useState(1);
  const [createResult, setCreateResult] = useState<{
    booking_id: string;
    client_secret?: string;
    stripe_account_id?: string;
    requires_deposit: boolean;
    payment_url?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchOfferings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = localTodayISO();
      const res = await fetch(classOfferingsUrl(bookingAudience, venue.id));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load classes');
      setRangeFrom(data.from ?? from);
      setRangeTo(data.to ?? '');
      setClassSummaries((data.classes ?? []) as ClassOfferingSummary[]);
      const raw = (data.instances ?? []) as Record<string, unknown>[];
      setInstances(raw.map(mapInstanceToSlot));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load classes');
      setClassSummaries([]);
      setInstances([]);
    } finally {
      setLoading(false);
    }
  }, [venue.id, bookingAudience]);

  useEffect(() => {
    void fetchOfferings();
  }, [fetchOfferings]);

  const selectedSummary = useMemo(
    () => classSummaries.find((c) => c.class_type_id === selectedClassTypeId) ?? null,
    [classSummaries, selectedClassTypeId],
  );

  const instancesForType = useMemo(
    () => instances.filter((i) => i.class_type_id === selectedClassTypeId && i.remaining > 0),
    [instances, selectedClassTypeId],
  );

  const candidatesForCalendarDate = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return instancesForType.filter((i) => i.instance_date === selectedCalendarDate);
  }, [instancesForType, selectedCalendarDate]);

  function handleCalendarSelectDate(iso: string) {
    const candidates = instancesForType.filter((i) => i.instance_date === iso && i.remaining > 0);
    if (candidates.length === 1) {
      setSelectedClass(candidates[0]!);
      setSpots(1);
      setStep('summary');
      setSelectedCalendarDate(null);
      return;
    }
    setSelectedCalendarDate(iso);
  }

  const summary = useMemo(() => {
    if (!selectedClass) return null;
    return paymentSummaryLines(selectedClass, spots, currency);
  }, [selectedClass, spots, currency]);

  const classPaymentRefundPolicy = useMemo(() => {
    if (cancellationPolicy) return cancellationPolicy;
    const h =
      typeof selectedClass?.cancellation_notice_hours === 'number' && Number.isFinite(selectedClass.cancellation_notice_hours)
        ? selectedClass.cancellation_notice_hours
        : venue.booking_rules?.cancellation_notice_hours ?? 48;
    return formatOnlinePaidRefundPolicyLine(h);
  }, [cancellationPolicy, selectedClass?.cancellation_notice_hours, venue.booking_rules?.cancellation_notice_hours]);

  const handleDetailsSubmit = useCallback(
    async (details: GuestDetails) => {
      setError(null);
      if (!selectedClass) return;
      setSubmitting(true);
      try {
        if (isStaff) {
          const res = await fetch(venueBookingsCreateUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_date: selectedClass.instance_date,
              booking_time: selectedClass.start_time,
              party_size: spots,
              name: details.name,
              email: details.email || undefined,
              phone: details.phone,
              class_instance_id: selectedClass.instance_id,
              dietary_notes: details.dietary_notes,
              source: staffBookingSource,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Booking failed');
          setCreateResult({
            booking_id: data.booking_id,
            requires_deposit: Boolean(data.payment_url),
            payment_url: data.payment_url,
          });
          setStep('confirmation');
          onBookingCreated?.();
          return;
        }

        const res = await fetch(bookingCreateUrl(), {
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
            dietary_notes: details.dietary_notes,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Booking failed');
        setCreateResult({
          booking_id: data.booking_id,
          client_secret: data.client_secret,
          stripe_account_id: data.stripe_account_id,
          requires_deposit: data.requires_deposit ?? false,
        });
        const needsStripe = Boolean(data.requires_deposit && data.client_secret);
        setStep(needsStripe ? 'payment' : 'confirmation');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Booking failed');
      } finally {
        setSubmitting(false);
      }
    },
    [venue.id, selectedClass, spots, isStaff, staffBookingSource, onBookingCreated],
  );

  const handlePaymentComplete = useCallback(async () => {
    if (createResult?.booking_id) {
      try {
        await fetch(bookingConfirmPaymentUrl(), {
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

  const depositPenceForDetails = summary?.chargePence ?? 0;

  function pickTimeSlot(slot: ClassSlot) {
    setSelectedClass(slot);
    setSpots(1);
    setStep('summary');
    setSelectedCalendarDate(null);
  }

  return (
    <div className="mx-auto max-w-lg">
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {step === 'pick-class' && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Choose a class</h2>
          <p className="mb-4 text-sm text-slate-500">
            Classes with sessions scheduled in the next 3 months. Pick one, then choose a date on the next step.
          </p>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : classSummaries.length === 0 ? (
            <p className="text-sm text-slate-500">
              No upcoming classes in the next few months. Please check back later or contact the venue.
            </p>
          ) : (
            <div className="space-y-3">
              {classSummaries.map((cls) => {
                const priceLabel =
                  cls.price_pence == null || cls.price_pence <= 0
                    ? 'Free'
                    : cls.payment_requirement === 'deposit' && (cls.deposit_amount_pence ?? 0) > 0
                      ? `From ${sym}${(cls.deposit_amount_pence! / 100).toFixed(2)} (deposit)`
                      : cls.payment_requirement === 'none'
                        ? `${sym}${(cls.price_pence / 100).toFixed(2)} (pay at venue)`
                        : `${sym}${(cls.price_pence / 100).toFixed(2)} per person`;
                return (
                  <button
                    key={cls.class_type_id}
                    type="button"
                    onClick={() => {
                      setSelectedClassTypeId(cls.class_type_id);
                      setSelectedCalendarDate(null);
                      setStep('pick-date');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-brand-300"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cls.colour }} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900">{cls.class_name}</div>
                        <div className="text-sm text-slate-500">
                          {cls.session_count} session{cls.session_count !== 1 ? 's' : ''} available
                          {cls.instructor_name ? ` · ${cls.instructor_name}` : ''}
                        </div>
                        {cls.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{cls.description}</p>
                        ) : null}
                        <div className="mt-2 text-sm font-medium text-slate-700">{priceLabel}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === 'pick-date' && selectedSummary && rangeFrom && rangeTo && (
        <div>
          <button
            type="button"
            onClick={() => {
              setStep('pick-class');
              setSelectedClassTypeId(null);
              setSelectedCalendarDate(null);
            }}
            className="mb-4 text-sm text-brand-600 hover:underline"
          >
            &larr; Back to classes
          </button>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">{selectedSummary.class_name}</h2>
          <p className="mb-4 text-sm text-slate-500">Select a date when this class is running.</p>

          <ClassOfferingsCalendar
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            highlightedDates={selectedSummary.dates}
            selectedDate={selectedCalendarDate}
            onSelectDate={handleCalendarSelectDate}
          />

          {selectedCalendarDate && candidatesForCalendarDate.length > 1 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-800">Choose a time</p>
              <div className="flex flex-wrap gap-2">
                {candidatesForCalendarDate.map((slot) => (
                  <button
                    key={slot.instance_id}
                    type="button"
                    onClick={() => pickTimeSlot(slot)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:border-brand-400 hover:bg-brand-50"
                  >
                    {slot.start_time.slice(0, 5)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'summary' && selectedClass && (
        <div>
          <button
            type="button"
            onClick={() => {
              setSelectedClass(null);
              setStep('pick-date');
            }}
            className="mb-4 text-sm text-brand-600 hover:underline"
          >
            &larr; Back
          </button>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <div className="font-semibold text-slate-900">{selectedClass.class_name}</div>
            <div className="text-slate-500">
              {selectedClass.instance_date} at {selectedClass.start_time.slice(0, 5)}
            </div>
            <div className="mt-2 text-slate-600">
              {selectedClass.duration_minutes} min
              {selectedClass.instructor_name ? ` · ${terms.staff}: ${selectedClass.instructor_name}` : ''}
            </div>
            {selectedClass.description ? (
              <p className="mt-2 text-xs text-slate-600">{selectedClass.description}</p>
            ) : null}
          </div>

          {selectedClass.remaining > 1 && (
            <div className="mb-4">
              <label className="text-sm font-medium text-slate-700" htmlFor="class-spots">
                Spots
              </label>
              <select
                id="class-spots"
                value={spots}
                onChange={(e) => setSpots(Number(e.target.value))}
                className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                {Array.from({ length: Math.min(selectedClass.remaining, 10) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment summary</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-800">
              {(summary?.lines ?? []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => setStep('details')}
            className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            Continue to guest details
          </button>
        </div>
      )}

      {step === 'details' && selectedClass && (
        <div>
          <button type="button" onClick={() => setStep('summary')} className="mb-4 text-sm text-brand-600 hover:underline">
            &larr; Back
          </button>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="font-medium text-slate-900">{selectedClass.class_name}</div>
            <div className="text-slate-500">
              {selectedClass.instance_date} at {selectedClass.start_time.slice(0, 5)} · {spots} spot
              {spots !== 1 ? 's' : ''}
            </div>
          </div>
          {submitting ? (
            <BookingSubmittingPanel variant="class" />
          ) : (
            <DetailsStep
              slot={{
                key: selectedClass.instance_id,
                label: selectedClass.class_name,
                start_time: selectedClass.start_time,
                end_time: '',
                available_covers: selectedClass.remaining,
              }}
              date={selectedClass.instance_date}
              partySize={spots}
              onSubmit={handleDetailsSubmit}
              onBack={() => setStep('summary')}
              requiresDeposit={false}
              variant="class"
              appointmentDepositPence={depositPenceForDetails > 0 ? depositPenceForDetails : null}
              currencySymbol={sym}
              phoneDefaultCountry={phoneDefaultCountry}
              audience={detailsAudience}
            />
          )}
        </div>
      )}

      {step === 'payment' && !isStaff && createResult?.client_secret && selectedClass && summary && (
        <PaymentStep
          clientSecret={createResult.client_secret}
          stripeAccountId={createResult.stripe_account_id}
          amountPence={summary.chargePence}
          partySize={spots}
          onComplete={handlePaymentComplete}
          onBack={() => setStep('details')}
          cancellationPolicy={classPaymentRefundPolicy}
          summaryMode="total"
          chargeKind={selectedClass.payment_requirement === 'full_payment' ? 'full_payment' : 'deposit'}
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
          <p className="mt-2 text-sm text-green-800">
            {selectedClass?.class_name}
            <br />
            {selectedClass?.instance_date} at {selectedClass?.start_time.slice(0, 5)}
            <br />
            {spots} spot{spots !== 1 ? 's' : ''}
          </p>
          {isStaff && createResult?.payment_url ? (
            <p className="mt-4 text-xs text-green-800">Deposit link sent to the guest.</p>
          ) : (
            <p className="mt-4 text-xs text-green-700">You&apos;ll receive a confirmation email shortly.</p>
          )}
        </div>
      )}
    </div>
  );
}
