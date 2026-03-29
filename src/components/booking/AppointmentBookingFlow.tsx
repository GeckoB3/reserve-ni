'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VenuePublic, GuestDetails } from './types';
import { DetailsStep } from './DetailsStep';
import { PaymentStep } from './PaymentStep';

interface Practitioner {
  id: string;
  name: string;
  services: Array<{
    id: string;
    name: string;
    duration_minutes: number;
    price_pence: number | null;
    deposit_pence: number | null;
  }>;
  slots: Array<{ start_time: string; service_id: string; duration_minutes: number; price_pence: number | null }>;
}

interface PersonSelection {
  label: string;
  serviceId: string;
  serviceName: string;
  practitionerId: string;
  practitionerName: string;
  date: string;
  time: string;
  durationMinutes: number;
  bufferMinutes: number;
  pricePence: number | null;
  depositPence: number;
}

type Step =
  | 'mode_choice'
  | 'service' | 'practitioner' | 'slot' | 'details' | 'payment' | 'confirmation'
  | 'group_person_label' | 'group_service' | 'group_practitioner' | 'group_slot'
  | 'group_review' | 'group_details' | 'group_payment' | 'group_confirmation';

const SINGLE_STEPS: Step[] = ['service', 'practitioner', 'slot', 'details'];
const STEP_LABELS: Record<string, string> = {
  service: 'Service', practitioner: 'Staff', slot: 'Time', details: 'Details',
};

interface AppointmentBookingFlowProps {
  venue: VenuePublic;
  cancellationPolicy?: string;
  embed?: boolean;
  onHeightChange?: (height: number) => void;
  accentColour?: string;
}

function formatDateHuman(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function todayStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function groupSlotsByPeriod(slots: Array<{ start_time: string }>) {
  const morning: typeof slots = [];
  const afternoon: typeof slots = [];
  const evening: typeof slots = [];
  for (const slot of slots) {
    const [h] = slot.start_time.split(':').map(Number);
    if ((h ?? 0) < 12) morning.push(slot);
    else if ((h ?? 0) < 17) afternoon.push(slot);
    else evening.push(slot);
  }
  return { morning, afternoon, evening };
}

export function AppointmentBookingFlow({ venue, cancellationPolicy, onHeightChange, accentColour }: AppointmentBookingFlowProps) {
  const terms = venue.terminology ?? { client: 'Client', booking: 'Appointment', staff: 'Staff' };

  // Shared state
  const [step, setStep] = useState<Step>('mode_choice');
  const [date, setDate] = useState(todayStr);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single booking state
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [guestDetails, setGuestDetails] = useState<GuestDetails | null>(null);
  const [createResult, setCreateResult] = useState<{
    booking_id: string;
    client_secret?: string;
    stripe_account_id?: string;
    requires_deposit: boolean;
    deposit_amount_pence: number;
    cancellation_notice_hours: number;
  } | null>(null);

  // Group booking state
  const [groupPeople, setGroupPeople] = useState<PersonSelection[]>([]);
  const [currentPersonLabel, setCurrentPersonLabel] = useState('');
  const [groupServiceId, setGroupServiceId] = useState<string | null>(null);
  const [groupPractitionerId, setGroupPractitionerId] = useState<string | null>(null);
  const [groupCreateResult, setGroupCreateResult] = useState<{
    group_booking_id: string;
    booking_ids: string[];
    client_secret?: string;
    stripe_account_id?: string;
    requires_deposit: boolean;
    total_deposit_pence: number;
    cancellation_notice_hours: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onHeightChange || !containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) onHeightChange(Math.ceil(entry.contentRect.height));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [onHeightChange]);

  // Build phantom bookings from already-selected group people
  const phantomBookings = useMemo(() => {
    return groupPeople
      .filter((p) => p.date === date)
      .map((p) => ({
        practitioner_id: p.practitionerId,
        start_time: p.time,
        duration_minutes: p.durationMinutes,
        buffer_minutes: p.bufferMinutes,
      }));
  }, [groupPeople, date]);

  const fetchAvailability = useCallback(async (opts?: { serviceId?: string | null; practitionerId?: string | null }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ venue_id: venue.id, date });
      const svc = opts?.serviceId !== undefined ? opts.serviceId : selectedServiceId;
      const prac = opts?.practitionerId !== undefined ? opts.practitionerId : selectedPractitionerId;
      if (svc) params.set('service_id', svc);
      if (prac) params.set('practitioner_id', prac);
      if (phantomBookings.length > 0) {
        params.set('phantoms', JSON.stringify(phantomBookings));
      }
      const res = await fetch(`/api/booking/availability?${params}`);
      const data = await res.json();
      setPractitioners(data.practitioners ?? []);
    } catch {
      setError('Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [venue.id, date, selectedServiceId, selectedPractitionerId, phantomBookings]);

  useEffect(() => {
    const singleSteps: Step[] = ['service', 'practitioner', 'slot'];
    const groupSteps: Step[] = ['group_service', 'group_practitioner', 'group_slot'];
    if (singleSteps.includes(step) || groupSteps.includes(step)) {
      const isGroup = step.startsWith('group_');
      fetchAvailability({
        serviceId: isGroup ? groupServiceId : selectedServiceId,
        practitionerId: isGroup ? groupPractitionerId : selectedPractitionerId,
      });
    }
  }, [fetchAvailability, step, groupServiceId, groupPractitionerId, selectedServiceId, selectedPractitionerId]);

  const allServices = practitioners.flatMap((p) => p.services);
  const uniqueServices = Array.from(new Map(allServices.map((s) => [s.id, s])).values());

  const sym = venue.currency === 'EUR' ? '€' : '£';
  function formatPrice(pence: number | null): string {
    if (pence == null) return 'POA';
    return `${sym}${(pence / 100).toFixed(2)}`;
  }

  const refundNoticeHours = venue.booking_rules?.cancellation_notice_hours ?? 48;

  // Single flow helpers
  const selectedPrac = practitioners.find((p) => p.id === selectedPractitionerId);
  const availableSlots = selectedPrac?.slots.filter((s) => !selectedServiceId || s.service_id === selectedServiceId) ?? [];
  const selectedService = uniqueServices.find((s) => s.id === selectedServiceId);
  const groupedSlots = groupSlotsByPeriod(availableSlots);

  // Group flow helpers
  const groupSelectedPrac = practitioners.find((p) => p.id === groupPractitionerId);
  const groupAvailableSlots = groupSelectedPrac?.slots.filter((s) => !groupServiceId || s.service_id === groupServiceId) ?? [];
  const groupSelectedService = uniqueServices.find((s) => s.id === groupServiceId);
  const groupGroupedSlots = groupSlotsByPeriod(groupAvailableSlots);

  const currentStepIdx = SINGLE_STEPS.indexOf(step);
  const showSingleProgress = ['service', 'practitioner', 'slot', 'details'].includes(step);

  // ── Single booking handlers ──

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
          dietary_notes: details.dietary_notes,
          occasion: details.occasion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Booking failed');
      setCreateResult({
        booking_id: data.booking_id,
        client_secret: data.client_secret,
        stripe_account_id: data.stripe_account_id,
        requires_deposit: data.requires_deposit ?? false,
        deposit_amount_pence: typeof data.deposit_amount_pence === 'number' ? data.deposit_amount_pence : 0,
        cancellation_notice_hours: typeof data.cancellation_notice_hours === 'number' ? data.cancellation_notice_hours : refundNoticeHours,
      });
      setStep(data.requires_deposit && data.client_secret ? 'payment' : 'confirmation');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    }
  }, [venue.id, date, selectedTime, selectedPractitionerId, selectedServiceId, refundNoticeHours]);

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

  // ── Group booking handlers ──

  function addPersonToGroup(time: string) {
    const svc = uniqueServices.find((s) => s.id === groupServiceId);
    const prac = practitioners.find((p) => p.id === groupPractitionerId);
    if (!svc || !prac) return;

    setGroupPeople((prev) => [
      ...prev,
      {
        label: currentPersonLabel,
        serviceId: svc.id,
        serviceName: svc.name,
        practitionerId: prac.id,
        practitionerName: prac.name,
        date,
        time,
        durationMinutes: svc.duration_minutes,
        bufferMinutes: 0,
        pricePence: svc.price_pence,
        depositPence: svc.deposit_pence ?? 0,
      },
    ]);
    setGroupServiceId(null);
    setGroupPractitionerId(null);
    setCurrentPersonLabel('');
    setStep('group_review');
  }

  function removePersonFromGroup(index: number) {
    setGroupPeople((prev) => prev.filter((_, i) => i !== index));
  }

  const handleGroupDetailsSubmit = useCallback(async (details: GuestDetails) => {
    setGuestDetails(details);
    setError(null);
    try {
      const res = await fetch('/api/booking/create-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venue.id,
          name: details.name,
          email: details.email || undefined,
          phone: details.phone,
          source: 'booking_page',
          dietary_notes: details.dietary_notes,
          people: groupPeople.map((p) => ({
            person_label: p.label,
            practitioner_id: p.practitionerId,
            appointment_service_id: p.serviceId,
            booking_date: p.date,
            booking_time: p.time,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Group booking failed');
      setGroupCreateResult({
        group_booking_id: data.group_booking_id,
        booking_ids: data.booking_ids,
        client_secret: data.client_secret,
        stripe_account_id: data.stripe_account_id,
        requires_deposit: data.requires_deposit ?? false,
        total_deposit_pence: data.total_deposit_pence ?? 0,
        cancellation_notice_hours: typeof data.cancellation_notice_hours === 'number' ? data.cancellation_notice_hours : refundNoticeHours,
      });
      setStep(data.requires_deposit && data.client_secret ? 'group_payment' : 'group_confirmation');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Group booking failed');
    }
  }, [venue.id, groupPeople, refundNoticeHours]);

  const handleGroupPaymentComplete = useCallback(async () => {
    if (groupCreateResult?.booking_ids?.[0]) {
      try {
        await fetch('/api/booking/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: groupCreateResult.booking_ids[0] }),
        });
      } catch { /* webhook fallback */ }
    }
    setStep('group_confirmation');
  }, [groupCreateResult]);

  // ── Shared time slot renderer ──

  function renderTimeSlots(
    grouped: { morning: Array<{ start_time: string }>; afternoon: Array<{ start_time: string }>; evening: Array<{ start_time: string }> },
    onSelect: (time: string) => void,
  ) {
    const sections = [
      { label: 'Morning', slots: grouped.morning },
      { label: 'Afternoon', slots: grouped.afternoon },
      { label: 'Evening', slots: grouped.evening },
    ];
    return (
      <div className="space-y-4">
        {sections.map((section) =>
          section.slots.length > 0 ? (
            <div key={section.label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{section.label}</p>
              <div className="flex flex-wrap gap-2">
                {section.slots.map((slot) => (
                  <button
                    key={slot.start_time}
                    onClick={() => onSelect(slot.start_time)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-brand-300 hover:text-brand-600 hover:shadow active:scale-95"
                  >
                    {slot.start_time}
                  </button>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    );
  }

  const totalGroupPrice = groupPeople.reduce((sum, p) => sum + (p.pricePence ?? 0), 0);
  const totalGroupDepositPence = groupPeople.reduce((sum, p) => sum + (p.depositPence ?? 0), 0);

  const paymentCancellationBlurb = `Cancel at least ${refundNoticeHours} hours before each appointment to receive a full refund of any deposit paid.`;

  return (
    <div ref={containerRef} className="mx-auto max-w-lg" style={accentColour ? { '--accent': accentColour } as React.CSSProperties : undefined}>
      {/* Single flow progress indicator */}
      {showSingleProgress && (
        <div className="mb-6 flex items-center justify-between">
          {SINGLE_STEPS.map((s, i) => {
            const isActive = i === currentStepIdx;
            const isComplete = i < currentStepIdx;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-initial">
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    isActive ? 'bg-brand-600 text-white shadow-md' :
                    isComplete ? 'bg-brand-100 text-brand-700' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {isComplete ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={`hidden sm:inline text-xs font-medium ${isActive ? 'text-brand-700' : isComplete ? 'text-brand-600' : 'text-slate-400'}`}>
                    {s === 'practitioner' ? terms.staff : STEP_LABELS[s]}
                  </span>
                </div>
                {i < SINGLE_STEPS.length - 1 && (
                  <div className={`mx-2 h-0.5 flex-1 rounded ${isComplete ? 'bg-brand-200' : 'bg-slate-100'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ════════════════════════════════════════════════
          MODE CHOICE: Book for myself vs Group
          ════════════════════════════════════════════════ */}
      {step === 'mode_choice' && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">How would you like to book?</h2>
          <p className="mb-5 text-sm text-slate-500">You can book for just yourself, or for multiple people in one go.</p>
          <div className="space-y-3">
            <button
              onClick={() => setStep('service')}
              className="w-full rounded-xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">Book for myself</div>
                  <div className="text-sm text-slate-500">Select a service, staff member, and time</div>
                </div>
                <svg className="h-5 w-5 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </div>
            </button>
            <button
              onClick={() => setStep('group_review')}
              className="w-full rounded-xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-purple-600">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">Book for a group</div>
                  <div className="text-sm text-slate-500">Book different services for multiple people</div>
                </div>
                <svg className="h-5 w-5 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          SINGLE BOOKING FLOW (unchanged from before)
          ════════════════════════════════════════════════ */}

      {step === 'service' && (
        <div>
          <button onClick={() => { setStep('mode_choice'); }} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">What would you like?</h2>
          <p className="mb-4 text-sm text-slate-500">Select a service to get started.</p>
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-slate-500 uppercase tracking-wider">Preferred date</label>
            <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : uniqueServices.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No services available on {formatDateHuman(date)}</p>
              <p className="mt-1 text-xs text-slate-400">Try selecting a different date above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uniqueServices.map((svc) => (
                <button key={svc.id} onClick={() => { setSelectedServiceId(svc.id); setStep('practitioner'); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{svc.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{svc.duration_minutes} min</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-brand-600">{formatPrice(svc.price_pence)}</span>
                      <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'practitioner' && (
        <div>
          <button onClick={() => { setSelectedServiceId(null); setSelectedPractitionerId(null); setStep('service'); }} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          {selectedService && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-2.5">
              <svg className="h-5 w-5 flex-shrink-0 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              <div className="text-sm"><span className="font-medium text-brand-700">{selectedService.name}</span><span className="text-brand-500"> &middot; {selectedService.duration_minutes} min &middot; {formatPrice(selectedService.price_pence)}</span></div>
            </div>
          )}
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Who would you like to see?</h2>
          <p className="mb-4 text-sm text-slate-500">Choose your preferred {terms.staff.toLowerCase()} for {formatDateHuman(date)}.</p>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : practitioners.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No {terms.staff.toLowerCase()} available on {formatDateHuman(date)}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {practitioners.map((prac) => {
                const pracSlots = prac.slots.filter((s) => !selectedServiceId || s.service_id === selectedServiceId);
                return (
                  <button key={prac.id} onClick={() => { setSelectedPractitionerId(prac.id); setStep('slot'); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.99]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{prac.name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="font-medium text-slate-900">{prac.name}</div>
                          <div className="text-xs text-slate-500">{pracSlots.length} {pracSlots.length === 1 ? 'time' : 'times'} available</div>
                        </div>
                      </div>
                      <svg className="h-4 w-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === 'slot' && (
        <div>
          <button onClick={() => { setSelectedPractitionerId(null); setSelectedTime(null); setStep('practitioner'); }} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-brand-700">
              <span className="font-medium">{selectedService?.name}</span>
              <span className="text-brand-400">&middot;</span>
              <span>{selectedPrac?.name}</span>
            </div>
          </div>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Pick a time</h2>
          <p className="mb-4 text-sm text-slate-500">Showing availability for {formatDateHuman(date)}</p>
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-slate-500 uppercase tracking-wider">Change date</label>
            <input type="date" value={date} min={todayStr()} onChange={(e) => { setDate(e.target.value); setSelectedTime(null); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          {loading ? (
            <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
          ) : availableSlots.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No times available on {formatDateHuman(date)}</p>
              <p className="mt-1 text-xs text-slate-400">Try a different date above.</p>
            </div>
          ) : (
            renderTimeSlots(groupedSlots, (time) => { setSelectedTime(time); setStep('details'); })
          )}
        </div>
      )}

      {step === 'details' && selectedTime && (
        <div>
          <button onClick={() => { setSelectedTime(null); setStep('slot'); }} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Your {terms.booking.toLowerCase()}</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Service</span><span className="font-medium text-slate-900">{selectedService?.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{terms.staff}</span><span className="font-medium text-slate-900">{selectedPrac?.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Date</span><span className="font-medium text-slate-900">{formatDateHuman(date)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Time</span><span className="font-medium text-slate-900">{selectedTime}</span></div>
              {selectedService?.duration_minutes && <div className="flex justify-between"><span className="text-slate-500">Duration</span><span className="font-medium text-slate-900">{selectedService.duration_minutes} min</span></div>}
              {selectedService?.price_pence != null && (
                <div className="flex justify-between border-t border-slate-100 pt-1.5 mt-1.5"><span className="font-medium text-slate-700">Price</span><span className="font-semibold text-brand-600">{formatPrice(selectedService.price_pence)}</span></div>
              )}
              {(selectedService?.deposit_pence ?? 0) > 0 && (
                <div className="flex justify-between border-t border-slate-100 pt-1.5 mt-1.5">
                  <span className="font-medium text-slate-700">Deposit</span>
                  <span className="font-semibold text-amber-700">{formatPrice(selectedService!.deposit_pence)}</span>
                </div>
              )}
            </div>
          </div>
          <DetailsStep
            slot={{ key: selectedTime, label: selectedTime, start_time: selectedTime, end_time: '', available_covers: 1 }}
            date={date}
            partySize={1}
            onSubmit={handleDetailsSubmit}
            onBack={() => { setSelectedTime(null); setStep('slot'); }}
            variant="appointment"
            appointmentDepositPence={selectedService?.deposit_pence ?? 0}
            currencySymbol={sym}
            refundNoticeHours={refundNoticeHours}
          />
        </div>
      )}

      {step === 'payment' && createResult?.client_secret && (
        <PaymentStep
          clientSecret={createResult.client_secret}
          stripeAccountId={createResult.stripe_account_id}
          amountPence={createResult.deposit_amount_pence}
          partySize={1}
          onComplete={handlePaymentComplete}
          onBack={() => setStep('details')}
          cancellationPolicy={cancellationPolicy ?? paymentCancellationBlurb}
          summaryMode="total"
        />
      )}

      {step === 'confirmation' && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100"><svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg></div>
          <h2 className="text-xl font-bold text-green-900">{terms.booking} Confirmed</h2>
          <p className="mt-2 text-sm text-green-700">{selectedService?.name} with {selectedPrac?.name}</p>
          <p className="mt-1 text-sm text-green-600">{formatDateHuman(date)} at {selectedTime}</p>
          {guestDetails?.name && <p className="mt-3 text-xs text-green-600">A confirmation will be sent to {guestDetails.email || guestDetails.phone}.</p>}
          {(createResult?.deposit_amount_pence ?? 0) > 0 ? (
            <p className="mt-4 max-w-sm mx-auto text-left text-xs text-green-800/90">
              <span className="font-medium">Refund policy:</span> cancel at least {createResult?.cancellation_notice_hours ?? refundNoticeHours} hours before your appointment starts to receive a full refund of your {sym}
              {((createResult?.deposit_amount_pence ?? 0) / 100).toFixed(2)} deposit.
            </p>
          ) : (
            <p className="mt-4 max-w-sm mx-auto text-left text-xs text-green-800/90">
              No deposit was taken. You can cancel or change this booking at any time before your appointment (subject to the venue&apos;s terms).
            </p>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          GROUP BOOKING FLOW
          ════════════════════════════════════════════════ */}

      {step === 'group_review' && (
        <div>
          <button onClick={() => { if (groupPeople.length === 0) { setStep('mode_choice'); } else { /* stay on review */ } }} className={`mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 ${groupPeople.length > 0 ? 'invisible' : ''}`}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>

          <h2 className="mb-1 text-lg font-semibold text-slate-900">Group Booking</h2>
          <p className="mb-4 text-sm text-slate-500">
            {groupPeople.length === 0
              ? 'Add each person and their service to build your group booking.'
              : `${groupPeople.length} ${groupPeople.length === 1 ? 'person' : 'people'} added. Add more or continue to checkout.`}
          </p>

          {/* Date selector for group */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-slate-500 uppercase tracking-wider">Booking date</label>
            <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>

          {/* People list */}
          {groupPeople.length > 0 && (
            <div className="mb-4 space-y-2">
              {groupPeople.map((person, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{person.label}</div>
                      <div className="mt-0.5 text-sm text-slate-600">{person.serviceName} with {person.practitionerName}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{formatDateHuman(person.date)} at {person.time} &middot; {person.durationMinutes} min</div>
                      {person.pricePence != null && <div className="mt-0.5 text-xs font-medium text-brand-600">{formatPrice(person.pricePence)}</div>}
                    </div>
                    <button onClick={() => removePersonFromGroup(idx)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remove">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
              {totalGroupPrice > 0 && (
                <div className="rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-brand-700">Total (price)</span>
                    <span className="font-semibold text-brand-700">{formatPrice(totalGroupPrice)}</span>
                  </div>
                </div>
              )}
              {totalGroupDepositPence > 0 && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-amber-900">Total deposit due</span>
                    <span className="font-semibold text-amber-900">{formatPrice(totalGroupDepositPence)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add person button */}
          {groupPeople.length < 10 && (
            <button
              onClick={() => {
                setCurrentPersonLabel('');
                setGroupServiceId(null);
                setGroupPractitionerId(null);
                setStep('group_person_label');
              }}
              className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-medium text-slate-600 transition-all hover:border-brand-300 hover:text-brand-600"
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Add a person
              </div>
            </button>
          )}

          {/* Continue to details */}
          {groupPeople.length >= 1 && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => { setGroupPeople([]); setStep('mode_choice'); }}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('group_details')}
                className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 shadow-sm"
              >
                Continue to details
              </button>
            </div>
          )}
          {groupPeople.length === 0 && (
            <button onClick={() => setStep('mode_choice')} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Back
            </button>
          )}
        </div>
      )}

      {/* Group: person label */}
      {step === 'group_person_label' && (
        <div>
          <button onClick={() => setStep('group_review')} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Who is this appointment for?</h2>
          <p className="mb-4 text-sm text-slate-500">Enter a name or label (e.g. &quot;Myself&quot;, &quot;My son&quot;, &quot;Alex&quot;).</p>
          <input
            type="text"
            value={currentPersonLabel}
            onChange={(e) => setCurrentPersonLabel(e.target.value)}
            placeholder="e.g. Myself"
            className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            autoFocus
          />
          <button
            disabled={!currentPersonLabel.trim()}
            onClick={() => setStep('group_service')}
            className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 shadow-sm disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {/* Group: select service */}
      {step === 'group_service' && (
        <div>
          <button onClick={() => setStep('group_person_label')} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          <div className="mb-3 rounded-xl border border-purple-100 bg-purple-50/50 px-4 py-2.5 text-sm text-purple-700 font-medium">
            Booking for: {currentPersonLabel}
          </div>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Select a service</h2>
          <p className="mb-4 text-sm text-slate-500">What would {currentPersonLabel} like?</p>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : uniqueServices.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No services available on {formatDateHuman(date)}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uniqueServices.map((svc) => (
                <button key={svc.id} onClick={() => { setGroupServiceId(svc.id); setStep('group_practitioner'); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{svc.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{svc.duration_minutes} min</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-brand-600">{formatPrice(svc.price_pence)}</span>
                      <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Group: select practitioner */}
      {step === 'group_practitioner' && (
        <div>
          <button onClick={() => { setGroupServiceId(null); setStep('group_service'); }} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          <div className="mb-3 rounded-xl border border-purple-100 bg-purple-50/50 px-4 py-2.5 text-sm">
            <span className="font-medium text-purple-700">{currentPersonLabel}</span>
            <span className="text-purple-500"> &middot; {groupSelectedService?.name}</span>
          </div>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Choose {terms.staff.toLowerCase()}</h2>
          <p className="mb-4 text-sm text-slate-500">Who should see {currentPersonLabel}?</p>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : practitioners.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No {terms.staff.toLowerCase()} available on {formatDateHuman(date)}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {practitioners.map((prac) => {
                const pracSlots = prac.slots.filter((s) => !groupServiceId || s.service_id === groupServiceId);
                return (
                  <button key={prac.id} onClick={() => { setGroupPractitionerId(prac.id); setStep('group_slot'); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.99]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{prac.name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="font-medium text-slate-900">{prac.name}</div>
                          <div className="text-xs text-slate-500">{pracSlots.length} {pracSlots.length === 1 ? 'time' : 'times'} available</div>
                        </div>
                      </div>
                      <svg className="h-4 w-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Group: select time */}
      {step === 'group_slot' && (
        <div>
          <button onClick={() => { setGroupPractitionerId(null); setStep('group_practitioner'); }} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          <div className="mb-3 rounded-xl border border-purple-100 bg-purple-50/50 px-4 py-2.5 text-sm">
            <span className="font-medium text-purple-700">{currentPersonLabel}</span>
            <span className="text-purple-500"> &middot; {groupSelectedService?.name} &middot; {groupSelectedPrac?.name}</span>
          </div>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Pick a time for {currentPersonLabel}</h2>
          <p className="mb-4 text-sm text-slate-500">Showing availability for {formatDateHuman(date)}</p>
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-slate-500 uppercase tracking-wider">Change date</label>
            <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          {loading ? (
            <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
          ) : groupAvailableSlots.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No times available on {formatDateHuman(date)}</p>
              <p className="mt-1 text-xs text-slate-400">Try a different date above.</p>
            </div>
          ) : (
            renderTimeSlots(groupGroupedSlots, (time) => addPersonToGroup(time))
          )}
        </div>
      )}

      {/* Group: details */}
      {step === 'group_details' && (
        <div>
          <button onClick={() => setStep('group_review')} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Group booking summary</h3>
            <div className="space-y-3">
              {groupPeople.map((person, idx) => (
                <div key={idx} className="text-sm">
                  <div className="font-medium text-slate-900">{person.label}</div>
                  <div className="text-slate-600">{person.serviceName} with {person.practitionerName}</div>
                  <div className="text-xs text-slate-500">{formatDateHuman(person.date)} at {person.time}</div>
                </div>
              ))}
              {totalGroupPrice > 0 && (
                <div className="flex justify-between border-t border-slate-100 pt-2">
                  <span className="font-medium text-slate-700">Total (price)</span>
                  <span className="font-semibold text-brand-600">{formatPrice(totalGroupPrice)}</span>
                </div>
              )}
              {totalGroupDepositPence > 0 && (
                <div className="flex justify-between border-t border-amber-100 pt-2">
                  <span className="font-medium text-amber-900">Total deposit</span>
                  <span className="font-semibold text-amber-800">{formatPrice(totalGroupDepositPence)}</span>
                </div>
              )}
            </div>
          </div>
          <DetailsStep
            slot={{ key: 'group', label: 'Group', start_time: groupPeople[0]?.time ?? '', end_time: '', available_covers: 1 }}
            date={groupPeople[0]?.date ?? date}
            partySize={groupPeople.length}
            onSubmit={handleGroupDetailsSubmit}
            onBack={() => setStep('group_review')}
            variant="appointment"
            appointmentDepositPence={totalGroupDepositPence}
            currencySymbol={sym}
            refundNoticeHours={refundNoticeHours}
          />
        </div>
      )}

      {/* Group: payment */}
      {step === 'group_payment' && groupCreateResult?.client_secret && (
        <PaymentStep
          clientSecret={groupCreateResult.client_secret}
          stripeAccountId={groupCreateResult.stripe_account_id}
          amountPence={groupCreateResult.total_deposit_pence}
          partySize={groupPeople.length}
          onComplete={handleGroupPaymentComplete}
          onBack={() => setStep('group_details')}
          cancellationPolicy={cancellationPolicy ?? paymentCancellationBlurb}
          summaryMode="total"
        />
      )}

      {/* Group: confirmation */}
      {step === 'group_confirmation' && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          </div>
          <h2 className="text-xl font-bold text-green-900">Group Booking Confirmed</h2>
          <div className="mt-3 space-y-2">
            {groupPeople.map((person, idx) => (
              <div key={idx} className="text-sm text-green-700">
                <span className="font-medium">{person.label}</span> &mdash; {person.serviceName} with {person.practitionerName} at {person.time}
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-green-600">{formatDateHuman(groupPeople[0]?.date ?? date)}</p>
          {guestDetails?.name && (
            <p className="mt-3 text-xs text-green-600">
              A confirmation will be sent to {guestDetails.email || guestDetails.phone}.
            </p>
          )}
          {(groupCreateResult?.total_deposit_pence ?? 0) > 0 ? (
            <p className="mt-4 max-w-md mx-auto text-left text-xs text-green-800/90">
              <span className="font-medium">Refund policy:</span> cancel at least {groupCreateResult?.cancellation_notice_hours ?? refundNoticeHours} hours before
              each appointment start time to receive a full refund of that appointment&apos;s deposit ({sym}
              {((groupCreateResult?.total_deposit_pence ?? 0) / 100).toFixed(2)} total paid).
            </p>
          ) : (
            <p className="mt-4 max-w-md mx-auto text-left text-xs text-green-800/90">
              No deposit was taken. You can cancel or change these appointments at any time before they start (subject to the venue&apos;s terms).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
