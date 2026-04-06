'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VenuePublic, GuestDetails } from './types';
import { DetailsStep } from './DetailsStep';
import { PaymentStep } from './PaymentStep';
import { APPOINTMENT_BOOKING_RESET_EVENT } from './appointment-booking-events';
import {
  cancellationDeadlineHoursBefore,
  classifyGroupDepositRefunds,
  isDepositRefundAvailableAt,
} from '@/lib/booking/cancellation-deadline';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';
import { minutesToTime, timeToMinutes } from '@/lib/availability';
import { MultiServiceSummaryCard } from './MultiServiceSummaryCard';
import { resolveAppointmentServiceOnlineCharge } from '@/lib/appointments/appointment-service-payment';
import type { ClassPaymentRequirement } from '@/types/booking-models';

/** Services + staff from catalog (no date / slots). */
interface CatalogPractitioner {
  id: string;
  name: string;
  services: Array<{
    id: string;
    name: string;
    duration_minutes: number;
    buffer_minutes?: number;
    price_pence: number | null;
    deposit_pence?: number | null;
    payment_requirement?: ClassPaymentRequirement;
    /** From service_items / appointment_services; used for deposit refund copy before booking completes. */
    cancellation_notice_hours?: number;
  }>;
}

/** Per-date availability from /api/booking/availability. */
interface SlotPractitioner extends CatalogPractitioner {
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
  onlineChargeLabel?: 'deposit' | 'full_payment';
}

/** Consecutive services for one practitioner (multi-service booking). */
export interface MultiServiceSegment {
  serviceId: string;
  serviceName: string;
  practitionerId: string;
  practitionerName: string;
  startTime: string;
  durationMinutes: number;
  bufferMinutes: number;
  pricePence: number | null;
  depositPence: number;
  onlineChargeLabel?: 'deposit' | 'full_payment';
}

function recomputeMultiServiceChain(segments: MultiServiceSegment[], firstStart: string): MultiServiceSegment[] {
  let m = timeToMinutes(firstStart);
  return segments.map((seg) => {
    const row = { ...seg, startTime: minutesToTime(m) };
    m += seg.durationMinutes + seg.bufferMinutes;
    return row;
  });
}

type Step =
  | 'mode_choice'
  | 'service' | 'practitioner' | 'slot' | 'multi_service' | 'details' | 'payment' | 'confirmation'
  | 'group_person_label' | 'group_service' | 'group_practitioner' | 'group_slot'
  | 'group_review' | 'group_details' | 'group_payment' | 'group_confirmation';

const SINGLE_STEPS: Step[] = ['service', 'practitioner', 'slot', 'multi_service', 'details'];
const SINGLE_STEPS_LOCKED: Step[] = ['service', 'slot', 'multi_service', 'details'];
const STEP_LABELS: Record<string, string> = {
  service: 'Service', practitioner: 'Staff', slot: 'Time', multi_service: 'Services', details: 'Details',
};

interface AppointmentBookingFlowProps {
  venue: VenuePublic;
  cancellationPolicy?: string;
  embed?: boolean;
  onHeightChange?: (height: number) => void;
  accentColour?: string;
  /** From /book/{venue}/{practitioner-slug}: skip staff step; catalog filtered */
  lockedPractitioner?: { id: string; name: string; bookingSlug: string };
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

export function AppointmentBookingFlow({
  venue,
  cancellationPolicy,
  onHeightChange,
  accentColour,
  lockedPractitioner,
}: AppointmentBookingFlowProps) {
  const terms = venue.terminology ?? { client: 'Client', booking: 'Appointment', staff: 'Staff' };

  const isLockedPractitionerFlow = Boolean(
    lockedPractitioner?.id && lockedPractitioner?.bookingSlug,
  );
  const singleFlowSteps: Step[] = isLockedPractitionerFlow ? SINGLE_STEPS_LOCKED : SINGLE_STEPS;

  // Shared state
  const [step, setStep] = useState<Step>(() =>
    isLockedPractitionerFlow ? 'service' : 'mode_choice',
  );
  const [date, setDate] = useState(todayStr);
  const [catalogStaff, setCatalogStaff] = useState<CatalogPractitioner[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [slotPractitioners, setSlotPractitioners] = useState<SlotPractitioner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single booking state
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string | null>(() =>
    lockedPractitioner?.id && lockedPractitioner?.bookingSlug ? lockedPractitioner.id : null,
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [guestDetails, setGuestDetails] = useState<GuestDetails | null>(null);
  const [createResult, setCreateResult] = useState<{
    booking_id: string;
    booking_ids?: string[];
    client_secret?: string;
    stripe_account_id?: string;
    requires_deposit: boolean;
    deposit_amount_pence: number;
    cancellation_notice_hours: number;
  } | null>(null);

  const [multiServiceSegments, setMultiServiceSegments] = useState<MultiServiceSegment[] | null>(null);
  const [addingExtraService, setAddingExtraService] = useState(false);

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

  useEffect(() => {
    function onReset() {
      setDate(todayStr());
      setSlotPractitioners([]);
      setLoading(false);
      setError(null);
      setSelectedServiceId(null);
      setSelectedTime(null);
      setGuestDetails(null);
      setCreateResult(null);
      setMultiServiceSegments(null);
      setAddingExtraService(false);
      setGroupPeople([]);
      setCurrentPersonLabel('');
      setGroupServiceId(null);
      setGroupPractitionerId(null);
      setGroupCreateResult(null);
      if (lockedPractitioner?.id && lockedPractitioner?.bookingSlug) {
        setStep('service');
        setSelectedPractitionerId(lockedPractitioner.id);
      } else {
        setStep('mode_choice');
        setSelectedPractitionerId(null);
      }
    }
    window.addEventListener(APPOINTMENT_BOOKING_RESET_EVENT, onReset);
    return () => window.removeEventListener(APPOINTMENT_BOOKING_RESET_EVENT, onReset);
  }, [lockedPractitioner?.id, lockedPractitioner?.bookingSlug]);

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

  const fetchCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const qs = new URLSearchParams({ venue_id: venue.id });
      if (lockedPractitioner?.bookingSlug) {
        qs.set('practitioner_slug', lockedPractitioner.bookingSlug);
      }
      const res = await fetch(`/api/booking/appointment-catalog?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load catalog');
      setCatalogStaff(data.practitioners ?? []);
    } catch {
      setError('Failed to load services');
      setCatalogStaff([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [venue.id, lockedPractitioner?.bookingSlug]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const fetchAvailability = useCallback(
    async (opts: { serviceId: string; practitionerId: string }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ venue_id: venue.id, date });
        params.set('service_id', opts.serviceId);
        params.set('practitioner_id', opts.practitionerId);
        if (phantomBookings.length > 0) {
          params.set('phantoms', JSON.stringify(phantomBookings));
        }
        const res = await fetch(`/api/booking/availability?${params}`);
        const data = await res.json();
        setSlotPractitioners(data.practitioners ?? []);
      } catch {
        setError('Failed to load availability');
      } finally {
        setLoading(false);
      }
    },
    [venue.id, date, phantomBookings],
  );

  useEffect(() => {
    if (step !== 'slot' && step !== 'group_slot') return;
    const isGroup = step === 'group_slot';
    const svc = isGroup ? groupServiceId : selectedServiceId;
    const prac = isGroup ? groupPractitionerId : selectedPractitionerId;
    if (!svc || !prac) return;
    fetchAvailability({ serviceId: svc, practitionerId: prac });
  }, [
    step,
    date,
    selectedServiceId,
    selectedPractitionerId,
    groupServiceId,
    groupPractitionerId,
    phantomBookings,
    fetchAvailability,
  ]);

  const allServices = catalogStaff.flatMap((p) => p.services);
  const uniqueServices = Array.from(new Map(allServices.map((s) => [s.id, s])).values());

  const servicesWithFromPrice = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; duration_minutes: number; minPricePence: number | null }
    >();
    for (const p of catalogStaff) {
      for (const s of p.services) {
        const price = s.price_pence;
        const existing = map.get(s.id);
        if (!existing) {
          map.set(s.id, {
            id: s.id,
            name: s.name,
            duration_minutes: s.duration_minutes,
            minPricePence: price,
          });
        } else if (price != null && (existing.minPricePence == null || price < existing.minPricePence)) {
          existing.minPricePence = price;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogStaff]);

  const practitionersForSelectedService = useMemo(() => {
    if (!selectedServiceId) return [];
    return catalogStaff.filter((p) => p.services.some((s) => s.id === selectedServiceId));
  }, [catalogStaff, selectedServiceId]);

  const practitionersForGroupService = useMemo(() => {
    if (!groupServiceId) return [];
    return catalogStaff.filter((p) => p.services.some((s) => s.id === groupServiceId));
  }, [catalogStaff, groupServiceId]);

  const sym = venue.currency === 'EUR' ? '€' : '£';

  function onlineChargeFromCatalogOffer(offer: {
    price_pence: number | null;
    deposit_pence?: number | null;
    payment_requirement?: ClassPaymentRequirement;
  }) {
    return resolveAppointmentServiceOnlineCharge({
      price_pence: offer.price_pence,
      deposit_pence: offer.deposit_pence ?? null,
      payment_requirement: offer.payment_requirement,
    });
  }

  function formatPrice(pence: number | null): string {
    if (pence == null) return 'POA';
    return `${sym}${(pence / 100).toFixed(2)}`;
  }

  function formatFromPrice(pence: number | null): string {
    if (pence == null) return 'POA';
    return `From ${sym}${(pence / 100).toFixed(2)}`;
  }

  const phoneDefaultCountry = defaultPhoneCountryForVenueCurrency(venue.currency);

  // Single flow helpers (names/prices from catalog; slots from availability API)
  const selectedPrac = catalogStaff.find((p) => p.id === selectedPractitionerId);
  const slotPrac = slotPractitioners.find((p) => p.id === selectedPractitionerId);
  const availableSlots = slotPrac?.slots.filter((s) => !selectedServiceId || s.service_id === selectedServiceId) ?? [];
  const selectedService = uniqueServices.find((s) => s.id === selectedServiceId);
  const selectedServiceForPractitioner =
    selectedPrac?.services.find((s) => s.id === selectedServiceId) ?? selectedService;
  const groupedSlots = groupSlotsByPeriod(availableSlots);

  // Group flow helpers
  const groupSelectedPrac = catalogStaff.find((p) => p.id === groupPractitionerId);
  const groupSlotPrac = slotPractitioners.find((p) => p.id === groupPractitionerId);
  const groupAvailableSlots = groupSlotPrac?.slots.filter((s) => !groupServiceId || s.service_id === groupServiceId) ?? [];
  const groupSelectedService = uniqueServices.find((s) => s.id === groupServiceId);
  const groupGroupedSlots = groupSlotsByPeriod(groupAvailableSlots);

  const refundNoticeHours = useMemo(() => {
    const fallback = venue.booking_rules?.cancellation_notice_hours ?? 48;
    if (multiServiceSegments && multiServiceSegments.length > 0) {
      const first = multiServiceSegments[0]!;
      const p = catalogStaff.find((c) => c.id === first.practitionerId);
      const offer = p?.services.find((s) => s.id === first.serviceId);
      return offer?.cancellation_notice_hours ?? fallback;
    }
    const offer = selectedPrac?.services.find((s) => s.id === selectedServiceId);
    if (offer && typeof offer.cancellation_notice_hours === 'number') {
      return offer.cancellation_notice_hours;
    }
    return fallback;
  }, [
    venue.booking_rules,
    multiServiceSegments,
    catalogStaff,
    selectedPrac,
    selectedServiceId,
  ]);

  const currentStepIdx = singleFlowSteps.indexOf(step);
  const showSingleProgress = singleFlowSteps.includes(step);

  // ── Single booking handlers ──

  const validateMultiServiceChain = useCallback(
    async (chain: MultiServiceSegment[]): Promise<string | null> => {
      const phantoms: Array<{
        practitioner_id: string;
        start_time: string;
        duration_minutes: number;
        buffer_minutes: number;
      }> = [];
      for (const seg of chain) {
        const res = await fetch('/api/booking/validate-appointment-slot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venue_id: venue.id,
            booking_date: date,
            practitioner_id: seg.practitionerId,
            service_id: seg.serviceId,
            start_time: seg.startTime,
            phantoms,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!data.ok) {
          return data.error ?? 'One or more times are no longer available';
        }
        phantoms.push({
          practitioner_id: seg.practitionerId,
          start_time: seg.startTime,
          duration_minutes: seg.durationMinutes,
          buffer_minutes: seg.bufferMinutes,
        });
      }
      return null;
    },
    [venue.id, date],
  );

  const handlePickAdditionalService = useCallback(
    async (serviceId: string) => {
      if (!selectedPrac || !multiServiceSegments?.length) return;
      const offer = selectedPrac.services.find((s) => s.id === serviceId);
      if (!offer) return;
      if (multiServiceSegments.length >= 4) {
        setError('You can book up to four services in one visit.');
        return;
      }
      const firstStart = multiServiceSegments[0]!.startTime;
      const nextOnline = onlineChargeFromCatalogOffer(offer);
      const nextSeg: MultiServiceSegment = {
        serviceId: offer.id,
        serviceName: offer.name,
        practitionerId: selectedPrac.id,
        practitionerName: selectedPrac.name,
        startTime: '00:00',
        durationMinutes: offer.duration_minutes,
        bufferMinutes: offer.buffer_minutes ?? 0,
        pricePence: offer.price_pence,
        depositPence: nextOnline?.amountPence ?? 0,
        onlineChargeLabel: nextOnline?.chargeLabel,
      };
      const chain = recomputeMultiServiceChain([...multiServiceSegments, nextSeg], firstStart);
      const err = await validateMultiServiceChain(chain);
      if (err) {
        setError(err);
        return;
      }
      setMultiServiceSegments(chain);
      setError(null);
      setAddingExtraService(false);
    },
    [selectedPrac, multiServiceSegments, validateMultiServiceChain],
  );

  const handleRemoveMultiSegment = useCallback(
    async (index: number) => {
      if (!multiServiceSegments || multiServiceSegments.length <= 1) return;
      const firstStart = multiServiceSegments[0]!.startTime;
      const next = multiServiceSegments.filter((_, i) => i !== index);
      const chain = recomputeMultiServiceChain(next, firstStart);
      const err = await validateMultiServiceChain(chain);
      if (err) {
        setError(err);
        return;
      }
      setMultiServiceSegments(chain);
      setError(null);
    },
    [multiServiceSegments, validateMultiServiceChain],
  );

  const handleDetailsSubmit = useCallback(
    async (details: GuestDetails) => {
      setGuestDetails(details);
      setError(null);
      const chain = multiServiceSegments;
      if (chain && chain.length > 1) {
        const v = await validateMultiServiceChain(chain);
        if (v) {
          setError(v);
          return;
        }
        try {
          const res = await fetch('/api/booking/create-multi-service', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              venue_id: venue.id,
              booking_date: date,
              name: details.name,
              email: details.email || undefined,
              phone: details.phone,
              source: 'booking_page',
              dietary_notes: details.dietary_notes,
              occasion: details.occasion,
              services: chain.map((s) => ({
                service_id: s.serviceId,
                practitioner_id: s.practitionerId,
                start_time: s.startTime,
              })),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Booking failed');
          const ids = data.booking_ids as string[] | undefined;
          const primary = (data.primary_booking_id as string | undefined) ?? ids?.[0];
          if (!primary) throw new Error('Booking failed');
          setCreateResult({
            booking_id: primary,
            booking_ids: ids,
            client_secret: data.client_secret,
            stripe_account_id: data.stripe_account_id,
            requires_deposit: data.requires_deposit ?? false,
            deposit_amount_pence: typeof data.total_deposit_pence === 'number' ? data.total_deposit_pence : 0,
            cancellation_notice_hours:
              typeof data.cancellation_notice_hours === 'number' ? data.cancellation_notice_hours : refundNoticeHours,
          });
          setStep(data.requires_deposit && data.client_secret ? 'payment' : 'confirmation');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Booking failed');
        }
        return;
      }

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
          cancellation_notice_hours:
            typeof data.cancellation_notice_hours === 'number' ? data.cancellation_notice_hours : refundNoticeHours,
        });
        setStep(data.requires_deposit && data.client_secret ? 'payment' : 'confirmation');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Booking failed');
      }
    },
    [
      venue.id,
      date,
      selectedTime,
      selectedPractitionerId,
      selectedServiceId,
      refundNoticeHours,
      multiServiceSegments,
      validateMultiServiceChain,
    ],
  );

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
    const prac = catalogStaff.find((p) => p.id === groupPractitionerId);
    if (!svc || !prac) return;

    const svcOffer = prac.services.find((s) => s.id === groupServiceId);
    const offerForCharge = svcOffer ?? {
      price_pence: svc.price_pence,
      deposit_pence: svc.deposit_pence,
      payment_requirement: svc.payment_requirement,
    };
    const gOnline = onlineChargeFromCatalogOffer(offerForCharge);
    setGroupPeople((prev) => [
      ...prev,
      {
        label: currentPersonLabel,
        serviceId: svc.id,
        serviceName: svcOffer?.name ?? svc.name,
        practitionerId: prac.id,
        practitionerName: prac.name,
        date,
        time,
        durationMinutes: svcOffer?.duration_minutes ?? svc.duration_minutes,
        bufferMinutes: 0,
        pricePence: svcOffer?.price_pence ?? svc.price_pence,
        depositPence: gOnline?.amountPence ?? 0,
        onlineChargeLabel: gOnline?.chargeLabel,
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

  const paymentCancellationBlurb = `Full deposit refund if you cancel ≥${refundNoticeHours}h before each appointment.`;

  const singleAppointmentPaymentPolicy = useMemo(() => {
    if (!selectedTime) return paymentCancellationBlurb;
    const iso = cancellationDeadlineHoursBefore(date, selectedTime, refundNoticeHours);
    if (isDepositRefundAvailableAt(iso)) {
      return cancellationPolicy ?? `Full deposit refund if you cancel ≥${refundNoticeHours}h before start.`;
    }
    return `Refund cut-off has passed - this deposit is not refundable if you cancel.`;
  }, [date, selectedTime, refundNoticeHours, cancellationPolicy]);

  const groupAppointmentPaymentPolicy = useMemo(() => {
    if (groupPeople.length === 0) return paymentCancellationBlurb;
    const slots = groupPeople.map((p) => ({ date: p.date, time: p.time }));
    const cls = classifyGroupDepositRefunds(slots, refundNoticeHours);
    if (cls === 'all_refundable') {
      return cancellationPolicy ?? paymentCancellationBlurb;
    }
    if (cls === 'none_refundable') {
      return `Refund cut-off has passed for at least one appointment - not all of this deposit is refundable if you cancel.`;
    }
    return `Refund is per appointment (≥${refundNoticeHours}h before each start). Some cut-offs have passed - those shares are not refundable.`;
  }, [groupPeople, refundNoticeHours, cancellationPolicy]);

  const singleConfirmationDepositCopy = useMemo(() => {
    if (!selectedTime) return null;
    const iso = cancellationDeadlineHoursBefore(date, selectedTime, refundNoticeHours);
    const hrs = createResult?.cancellation_notice_hours ?? refundNoticeHours;
    const amt = ((createResult?.deposit_amount_pence ?? 0) / 100).toFixed(2);
    if (isDepositRefundAvailableAt(iso)) {
      return `Full refund of ${sym}${amt} if you cancel ≥${hrs}h before start.`;
    }
    return `${sym}${amt} deposit not refundable - the refund cut-off for this appointment has passed.`;
  }, [date, selectedTime, refundNoticeHours, createResult, sym]);

  const groupConfirmationDepositCopy = useMemo(() => {
    const slots = groupPeople.map((p) => ({ date: p.date, time: p.time }));
    const cls = classifyGroupDepositRefunds(slots, refundNoticeHours);
    const hrs = groupCreateResult?.cancellation_notice_hours ?? refundNoticeHours;
    const amt = ((groupCreateResult?.total_deposit_pence ?? 0) / 100).toFixed(2);
    if (cls === 'all_refundable') {
      return `Full refund of each share (${sym}${amt} total) if you cancel ≥${hrs}h before each start.`;
    }
    if (cls === 'none_refundable') {
      return `${sym}${amt} total not fully refundable - refund cut-off has passed for every appointment.`;
    }
    return `${sym}${amt} total: refund per appointment (≥${hrs}h before start); cut-off passed for some - those shares are not refundable.`;
  }, [groupPeople, refundNoticeHours, groupCreateResult, sym]);

  return (
    <div ref={containerRef} className="mx-auto max-w-lg" style={accentColour ? { '--accent': accentColour } as React.CSSProperties : undefined}>
      {/* Single flow progress indicator */}
      {showSingleProgress && (
        <div className="mb-6 flex items-center justify-between">
          {singleFlowSteps.map((s, i) => {
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
                {i < singleFlowSteps.length - 1 && (
                  <div className={`mx-2 h-0.5 flex-1 rounded ${isComplete ? 'bg-brand-200' : 'bg-slate-100'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {isLockedPractitionerFlow && lockedPractitioner && showSingleProgress && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/80 px-4 py-3 text-sm text-brand-900">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
            {lockedPractitioner.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-medium">Booking with {lockedPractitioner.name}</div>
            <div className="text-xs text-brand-700/80">You will only see services and times for this {terms.staff.toLowerCase()}.</div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ════════════════════════════════════════════════
          MODE CHOICE: Book for myself vs Group
          ════════════════════════════════════════════════ */}
      {step === 'mode_choice' && !isLockedPractitionerFlow && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">How would you like to book?</h2>
          <p className="mb-5 text-sm text-slate-500">Choose a single appointment or a group booking for several people.</p>
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
                  <div className="font-medium text-slate-900">Book an appointment</div>
                  <div className="text-sm text-slate-500">Schedule an appointment for yourself</div>
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
                  <div className="font-medium text-slate-900">Group appointment</div>
                  <div className="text-sm text-slate-500">Different services for multiple people</div>
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
          {!isLockedPractitionerFlow && (
            <button type="button" onClick={() => { setStep('mode_choice'); }} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              Back
            </button>
          )}
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Select a service</h2>
          <p className="mb-4 text-sm text-slate-500">Choose the service you want. You will pick a date and time in a later step.</p>
          {catalogLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : servicesWithFromPrice.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No services are available right now</p>
              <p className="mt-1 text-xs text-slate-400">Try again later or contact the venue.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {servicesWithFromPrice.map((svc) => (
                <button key={svc.id} type="button" onClick={() => { setSelectedServiceId(svc.id); setStep(isLockedPractitionerFlow ? 'slot' : 'practitioner'); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{svc.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{svc.duration_minutes} min</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-brand-600">{formatFromPrice(svc.minPricePence)}</span>
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
              <div className="text-sm"><span className="font-medium text-brand-700">{selectedService.name}</span><span className="text-brand-500"> &middot; {selectedService.duration_minutes} min &middot; {formatFromPrice(servicesWithFromPrice.find((s) => s.id === selectedService.id)?.minPricePence ?? selectedService.price_pence)}</span></div>
            </div>
          )}
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Who would you like to see?</h2>
          <p className="mb-4 text-sm text-slate-500">Choose your preferred {terms.staff.toLowerCase()}. Prices shown are what they charge for this service.</p>
          {catalogLoading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : practitionersForSelectedService.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No {terms.staff.toLowerCase()} offer this service</p>
              <p className="mt-1 text-xs text-slate-400">Contact the venue if you need help.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {practitionersForSelectedService.map((prac) => {
                const offer = prac.services.find((s) => s.id === selectedServiceId);
                return (
                  <button key={prac.id} onClick={() => { setSelectedPractitionerId(prac.id); setStep('slot'); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.99]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{prac.name.charAt(0).toUpperCase()}</div>
                        <div className="font-medium text-slate-900">{prac.name}</div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold text-brand-600">{formatPrice(offer?.price_pence ?? null)}</span>
                        <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                      </div>
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
          <button
            type="button"
            onClick={() => {
              setSelectedTime(null);
              setMultiServiceSegments(null);
              if (isLockedPractitionerFlow) {
                setSelectedServiceId(null);
                setStep('service');
              } else {
                setSelectedPractitionerId(null);
                setStep('practitioner');
              }
            }}
            className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
          >
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
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Date and time</h2>
          <p className="mb-4 text-sm text-slate-500">Select a date first. Available times for that day will appear below.</p>
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-slate-500 uppercase tracking-wider">Date</label>
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
            renderTimeSlots(groupedSlots, (time) => {
              const offer = selectedPrac?.services.find((s) => s.id === selectedServiceId);
              const firstOnline = offer ? onlineChargeFromCatalogOffer(offer) : null;
              setSelectedTime(time);
              setMultiServiceSegments([
                {
                  serviceId: selectedServiceId!,
                  serviceName: offer?.name ?? '',
                  practitionerId: selectedPractitionerId!,
                  practitionerName: selectedPrac?.name ?? '',
                  startTime: time,
                  durationMinutes: offer?.duration_minutes ?? 30,
                  bufferMinutes: offer?.buffer_minutes ?? 0,
                  pricePence: offer?.price_pence ?? null,
                  depositPence: firstOnline?.amountPence ?? 0,
                  onlineChargeLabel: firstOnline?.chargeLabel,
                },
              ]);
              setAddingExtraService(false);
              setStep('multi_service');
            })
          )}
        </div>
      )}

      {step === 'multi_service' && multiServiceSegments && multiServiceSegments.length > 0 && selectedPrac && (
        <div>
          <button
            type="button"
            onClick={() => {
              setSelectedTime(null);
              setMultiServiceSegments(null);
              setAddingExtraService(false);
              setStep('slot');
            }}
            className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Review your services</h2>
          <p className="mb-4 text-sm text-slate-500">
            Add more treatments with {selectedPrac.name} (same visit, back-to-back), or continue to your details.
          </p>
          <MultiServiceSummaryCard
            lines={multiServiceSegments.map((s) => ({
              serviceName: s.serviceName,
              practitionerName: s.practitionerName,
              startTime: s.startTime,
              durationMinutes: s.durationMinutes,
              pricePence: s.pricePence,
              depositPence: s.depositPence,
            }))}
            formatDateHuman={formatDateHuman}
            bookingDate={date}
            currencySymbol={sym}
            formatPrice={formatPrice}
            onRemove={multiServiceSegments.length > 1 ? (idx) => void handleRemoveMultiSegment(idx) : undefined}
          />
          <div className="mt-4 space-y-3">
            {multiServiceSegments.length < 4 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAddingExtraService((v) => !v);
                    setError(null);
                  }}
                  className="w-full rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:border-brand-300 hover:text-brand-700"
                >
                  {addingExtraService ? 'Hide service list' : 'Add another service'}
                </button>
                {addingExtraService && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="mb-2 text-xs font-medium text-slate-500">Choose a service - next start time is calculated automatically.</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedPrac.services.map((svc) => (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => void handlePickAdditionalService(svc.id)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-brand-300"
                        >
                          <span className="font-medium text-slate-900">{svc.name}</span>
                          <span className="ml-2 text-xs text-slate-500">{svc.duration_minutes} min</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setStep('details')}
              className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Continue to details
            </button>
          </div>
        </div>
      )}

      {step === 'details' && selectedTime && (
        <div>
          <button
            onClick={() => {
              setStep('multi_service');
            }}
            className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Back
          </button>
          {multiServiceSegments && multiServiceSegments.length > 1 ? (
            <div className="mb-5">
              <MultiServiceSummaryCard
                lines={multiServiceSegments.map((s) => ({
                  serviceName: s.serviceName,
                  practitionerName: s.practitionerName,
                  startTime: s.startTime,
                  durationMinutes: s.durationMinutes,
                  pricePence: s.pricePence,
                  depositPence: s.depositPence,
                  chargeKind: s.onlineChargeLabel,
                }))}
                formatDateHuman={formatDateHuman}
                bookingDate={date}
                currencySymbol={sym}
                formatPrice={formatPrice}
              />
            </div>
          ) : (
            <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Your {terms.booking.toLowerCase()}</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Service</span><span className="font-medium text-slate-900">{selectedService?.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">{terms.staff}</span><span className="font-medium text-slate-900">{selectedPrac?.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Date</span><span className="font-medium text-slate-900">{formatDateHuman(date)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Time</span><span className="font-medium text-slate-900">{selectedTime}</span></div>
                {selectedServiceForPractitioner?.duration_minutes != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Duration</span>
                    <span className="font-medium text-slate-900">{selectedServiceForPractitioner.duration_minutes} min</span>
                  </div>
                )}
                {selectedServiceForPractitioner?.price_pence != null && (
                  <div className="mt-1.5 flex justify-between border-t border-slate-100 pt-1.5">
                    <span className="font-medium text-slate-700">Price</span>
                    <span className="font-semibold text-brand-600">{formatPrice(selectedServiceForPractitioner.price_pence)}</span>
                  </div>
                )}
                {(() => {
                  const o = selectedServiceForPractitioner
                    ? onlineChargeFromCatalogOffer(selectedServiceForPractitioner)
                    : null;
                  if (!o || o.amountPence <= 0) return null;
                  return (
                    <div className="mt-1.5 flex justify-between border-t border-slate-100 pt-1.5">
                      <span className="font-medium text-slate-700">
                        {o.chargeLabel === 'full_payment' ? 'Pay now' : 'Deposit'}
                      </span>
                      <span className="font-semibold text-amber-700">{formatPrice(o.amountPence)}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          <DetailsStep
            slot={{ key: selectedTime, label: selectedTime, start_time: selectedTime, end_time: '', available_covers: 1 }}
            date={date}
            partySize={1}
            onSubmit={handleDetailsSubmit}
            onBack={() => {
              setStep('multi_service');
            }}
            variant="appointment"
            appointmentDepositPence={
              multiServiceSegments && multiServiceSegments.length > 1
                ? multiServiceSegments.reduce((sum, s) => sum + (s.depositPence ?? 0), 0)
                : selectedServiceForPractitioner
                  ? onlineChargeFromCatalogOffer(selectedServiceForPractitioner)?.amountPence ?? 0
                  : 0
            }
            appointmentChargeLabel={
              multiServiceSegments && multiServiceSegments.length > 1
                ? multiServiceSegments.every((s) => s.onlineChargeLabel === 'full_payment')
                  ? 'full_payment'
                  : 'deposit'
                : onlineChargeFromCatalogOffer(selectedServiceForPractitioner ?? { price_pence: null, deposit_pence: null })
                      ?.chargeLabel === 'full_payment'
                  ? 'full_payment'
                  : 'deposit'
            }
            currencySymbol={sym}
            refundNoticeHours={refundNoticeHours}
            phoneDefaultCountry={phoneDefaultCountry}
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
          cancellationPolicy={singleAppointmentPaymentPolicy}
          summaryMode="total"
          chargeKind={
            multiServiceSegments && multiServiceSegments.length > 1
              ? multiServiceSegments.every((s) => s.onlineChargeLabel === 'full_payment')
                ? 'full_payment'
                : 'deposit'
              : onlineChargeFromCatalogOffer(selectedServiceForPractitioner ?? { price_pence: null, deposit_pence: null })
                    ?.chargeLabel === 'full_payment'
                ? 'full_payment'
                : 'deposit'
          }
        />
      )}

      {step === 'confirmation' && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100"><svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg></div>
          <h2 className="text-xl font-bold text-green-900">{terms.booking} Confirmed</h2>
          {multiServiceSegments && multiServiceSegments.length > 1 ? (
            <div className="mt-3 space-y-2 text-left text-sm text-green-800">
              <p className="text-center text-green-700">{formatDateHuman(date)} with {selectedPrac?.name}</p>
              <ul className="mx-auto max-w-sm list-none space-y-1.5 rounded-lg border border-green-200/80 bg-white/60 px-3 py-2">
                {multiServiceSegments.map((s) => (
                  <li key={`${s.serviceId}-${s.startTime}`} className="flex justify-between gap-2 text-xs">
                    <span className="font-medium text-green-900">{s.serviceName}</span>
                    <span className="text-green-700">{s.startTime}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-green-700">{selectedService?.name} with {selectedPrac?.name}</p>
              <p className="mt-1 text-sm text-green-600">{formatDateHuman(date)} at {selectedTime}</p>
            </>
          )}
          {guestDetails?.name && <p className="mt-3 text-xs text-green-600">A confirmation will be sent to {guestDetails.email || guestDetails.phone}.</p>}
          {(createResult?.deposit_amount_pence ?? 0) > 0 ? (
            <p className="mt-4 max-w-sm mx-auto text-left text-xs text-green-800/90">
              <span className="font-medium">Refund policy:</span>{' '}
              {singleConfirmationDepositCopy ??
                `Full refund if you cancel ≥${createResult?.cancellation_notice_hours ?? refundNoticeHours}h before start (see venue terms).`}
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
            placeholder="e.g. Guest name or label"
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
          {catalogLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : servicesWithFromPrice.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No services are available right now</p>
            </div>
          ) : (
            <div className="space-y-2">
              {servicesWithFromPrice.map((svc) => (
                <button key={svc.id} onClick={() => { setGroupServiceId(svc.id); setStep('group_practitioner'); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{svc.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{svc.duration_minutes} min</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-brand-600">{formatFromPrice(svc.minPricePence)}</span>
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
          {catalogLoading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : practitionersForGroupService.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No {terms.staff.toLowerCase()} offer this service</p>
              <p className="mt-1 text-xs text-slate-400">Contact the venue if you need help.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {practitionersForGroupService.map((prac) => {
                const offer = prac.services.find((s) => s.id === groupServiceId);
                return (
                  <button key={prac.id} onClick={() => { setGroupPractitionerId(prac.id); setStep('group_slot'); }} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.99]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{prac.name.charAt(0).toUpperCase()}</div>
                        <div className="font-medium text-slate-900">{prac.name}</div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold text-brand-600">{formatPrice(offer?.price_pence ?? null)}</span>
                        <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                      </div>
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
          <p className="mb-4 text-sm text-slate-500">Select a date, then choose an available time.</p>
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-slate-500 uppercase tracking-wider">Date</label>
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
            appointmentChargeLabel={
              groupPeople.length > 0 && groupPeople.every((p) => p.onlineChargeLabel === 'full_payment')
                ? 'full_payment'
                : 'deposit'
            }
            currencySymbol={sym}
            refundNoticeHours={refundNoticeHours}
            multiAppointmentSlots={groupPeople.map((p) => ({ date: p.date, time: p.time }))}
            phoneDefaultCountry={phoneDefaultCountry}
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
          cancellationPolicy={groupAppointmentPaymentPolicy}
          summaryMode="total"
          chargeKind={
            groupPeople.length > 0 && groupPeople.every((p) => p.onlineChargeLabel === 'full_payment')
              ? 'full_payment'
              : 'deposit'
          }
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
              <span className="font-medium">Refund policy:</span>{' '}
              {groupConfirmationDepositCopy ??
                `Full refund per appointment if you cancel ≥${groupCreateResult?.cancellation_notice_hours ?? refundNoticeHours}h before each start (see venue terms).`}
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
