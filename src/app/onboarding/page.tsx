'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BookingModel } from '@/types/booking-models';
import { getBusinessConfig } from '@/lib/business-config';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import { APPOINTMENTS_ACTIVE_MODEL_ORDER } from '@/lib/booking/active-models';
import { buildAddress, parseAddress } from '@/lib/venue/address-format';
import { defaultPractitionerWorkingHours } from '@/lib/availability/practitioner-defaults';
import { DEFAULT_ENTITY_BOOKING_WINDOW } from '@/lib/booking/entity-booking-window';
import type { WorkingHours } from '@/types/booking-models';
import type { OpeningHoursSettings } from '@/app/dashboard/settings/types';
import { OpeningHoursControl, defaultOpeningHoursSettings } from '@/components/scheduling/OpeningHoursControl';
import { WorkingHoursControl } from '@/components/scheduling/WorkingHoursControl';
import { OnboardingStaffInviteStep, type StaffInviteDraft } from '@/components/onboarding/OnboardingStaffInviteStep';
import {
  OnboardingAppointmentServiceList,
  appointmentServiceDraftFromBusinessDefault,
  createEmptyAppointmentServiceDraft,
  serviceDraftToApiPayload,
  type AppointmentServiceFormDraft,
} from '@/components/onboarding/OnboardingAppointmentServiceList';

type Currency = 'GBP' | 'EUR';

const CURRENCY_OPTIONS: { code: Currency; symbol: string; label: string }[] = [
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
];

function currencySymbol(c: Currency): string {
  return c === 'EUR' ? '€' : '£';
}

function poundsToMinor(pounds: string): number {
  const parsed = parseFloat(pounds);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

interface VenueOnboarding {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  booking_model: BookingModel;
  active_booking_models?: BookingModel[] | null;
  /** Secondary C/D/E models; onboarding wizard stays primary-first - full setup for add-ons is on the dashboard checklist. */
  enabled_models?: BookingModel[] | null;
  business_type: string | null;
  terminology: { client: string; booking: string; staff: string };
  pricing_tier: string;
  calendar_count: number | null;
  onboarding_step: number;
  onboarding_completed: boolean;
  currency: Currency;
}

interface PractitionerDraft {
  name: string;
  email: string;
}

interface EventDraft {
  name: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  ticketPrice: string;
}

interface ClassDraft {
  name: string;
  /** Shown to guests; optional like dashboard Add Class Type. */
  description: string;
  /** Team calendar column id (`unified_calendars.id`); required by POST /api/venue/classes. */
  instructor_id: string;
  duration_minutes: number;
  capacity: number;
  price: string;
}

type ResourcePaymentRequirement = 'none' | 'deposit' | 'full_payment';

/** Aligned with dashboard Resource timeline Add Resource (exceptions omitted in onboarding). */
interface ResourceDraft {
  name: string;
  resource_type: string;
  /** Host team calendar (non-resource) — required by POST /api/venue/resources */
  display_on_calendar_id: string;
  slot_interval_minutes: number;
  min_booking_minutes: number;
  max_booking_minutes: number;
  pricePerSlot: string;
  payment_requirement: ResourcePaymentRequirement;
  depositPounds: string;
  availability_hours: WorkingHours;
}

const RESOURCE_TYPE_SUGGESTIONS = [
  'Tennis court',
  'Meeting room',
  'Studio',
  'Pitch',
  'Equipment',
  'Desk',
  'Bay',
  'Lane',
  'Pod',
] as const;

const RES_SLOT_MIN = 5;
const RES_SLOT_MAX = 480;
const RES_MIN_BOOK_MIN = 15;
const RES_MIN_BOOK_MAX = 480;
const RES_MAX_BOOK_MIN = 15;
const RES_MAX_BOOK_MAX = 1440;

function createEmptyResourceDraft(hostCalendarId: string): ResourceDraft {
  return {
    name: '',
    resource_type: '',
    display_on_calendar_id: hostCalendarId,
    slot_interval_minutes: 60,
    min_booking_minutes: 60,
    max_booking_minutes: 480,
    pricePerSlot: '',
    payment_requirement: 'none',
    depositPounds: '',
    availability_hours: defaultPractitionerWorkingHours(),
  };
}

type AppointmentPlanModel = 'unified_scheduling' | 'event_ticket' | 'class_session' | 'resource_booking';
const APPOINTMENTS_MODEL_LABEL: Record<AppointmentPlanModel, string> = {
  unified_scheduling: 'Appointments',
  class_session: 'Classes',
  event_ticket: 'Events',
  resource_booking: 'Bookable resources',
};

function isAppointmentPlanModel(model: BookingModel): model is AppointmentPlanModel {
  return APPOINTMENTS_ACTIVE_MODEL_ORDER.includes(model as AppointmentPlanModel);
}

/** Plan §8.2 Step 2: heading adapts to terminology (team / calendars). */
function unifiedTeamStepLabel(terms: { staff: string }): string {
  const s = terms.staff.trim();
  if (/^staff$/i.test(s)) {
    return 'Your team & calendars';
  }
  return `Your ${s}s`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [venue, setVenue] = useState<VenueOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [maxCompletedStep, setMaxCompletedStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Business profile (address fields match Settings → Venue profile)
  const [name, setName] = useState('');
  const [addressName, setAddressName] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressTown, setAddressTown] = useState('');
  const [addressPostcode, setAddressPostcode] = useState('');
  const [phone, setPhone] = useState('');
  const [currency, setCurrency] = useState<Currency>('GBP');

  // Model B: Practitioners + services
  const [practitioners, setPractitioners] = useState<PractitionerDraft[]>([{ name: '', email: '' }]);
  const [services, setServices] = useState<AppointmentServiceFormDraft[]>([]);
  /** Unified onboarding: calendar roster for service assignment + hours step */
  const [rosterList, setRosterList] = useState<Array<{ id: string; name: string }>>([]);
  const [openingHoursDraft, setOpeningHoursDraft] = useState<OpeningHoursSettings>(() => defaultOpeningHoursSettings());
  const [calendarWorkingDraft, setCalendarWorkingDraft] = useState<Record<string, WorkingHours>>({});

  // Model C: First event
  const [eventDraft, setEventDraft] = useState<EventDraft>({
    name: '',
    date: '',
    start_time: '10:00',
    end_time: '12:00',
    capacity: 20,
    ticketPrice: '0.00',
  });

  // Model D: Classes
  const [classes, setClasses] = useState<ClassDraft[]>([
    {
      name: '',
      description: '',
      instructor_id: '',
      duration_minutes: 60,
      capacity: 15,
      price: '0.00',
    },
  ]);

  // Model E: Resources
  const [resources, setResources] = useState<ResourceDraft[]>(() => [createEmptyResourceDraft('')]);
  const [staffInvites, setStaffInvites] = useState<StaffInviteDraft[]>([{ email: '', role: 'staff' }]);

  useEffect(() => {
    async function loadVenue() {
      try {
        const res = await fetch('/api/venue/onboarding');
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/login?redirectTo=/onboarding');
            return;
          }
          if (res.status === 404) {
            router.push('/signup/business-type');
            return;
          }
          throw new Error('Failed to load venue');
        }
        const data = await res.json();
        const v = data.venue as VenueOnboarding;
        setVenue(v);
        setStep(v.onboarding_step);
        setMaxCompletedStep(v.onboarding_step);
        setName(v.name === 'My Business' ? '' : v.name);
        const parsed = parseAddress(v.address);
        setAddressName(parsed.name);
        setAddressStreet(parsed.street);
        setAddressTown(parsed.town);
        setAddressPostcode(parsed.postcode);
        setPhone(v.phone ?? '');
        setCurrency(v.currency ?? 'GBP');

        if (v.onboarding_completed) {
          router.push('/dashboard');
          return;
        }

        if (v.pricing_tier === 'appointments' && (!v.active_booking_models || v.active_booking_models.length === 0)) {
          router.push('/signup/booking-models');
          return;
        }

        // Pre-fill services from business config defaults (stored in pence, display in pounds)
        if (v.business_type) {
          const config = getBusinessConfig(v.business_type);
          if (config.defaultServices?.length) {
            setServices(
              config.defaultServices.map((ds) =>
                appointmentServiceDraftFromBusinessDefault({
                  name: ds.name,
                  duration: ds.duration,
                  price: ds.price,
                }),
              ),
            );
          } else if (isUnifiedSchedulingVenue(v.booking_model)) {
            setServices([createEmptyAppointmentServiceDraft()]);
          }
        } else if (isUnifiedSchedulingVenue(v.booking_model)) {
          setServices([createEmptyAppointmentServiceDraft()]);
        }

        // Model B: merge existing practitioners (retry / refresh after partial save).
        // All plans now have unlimited calendars; start from one row, add as many as needed.
        if (isUnifiedSchedulingVenue(v.booking_model)) {
          try {
            const prRes = await fetch('/api/venue/practitioners');
            if (prRes.ok) {
              const body = (await prRes.json()) as {
                practitioners?: Array<{ name: string; email: string | null; sort_order: number }>;
              };
              const list = body.practitioners ?? [];
              const sorted = [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
              if (sorted.length === 0) {
                setPractitioners([{ name: '', email: '' }]);
              } else {
                setPractitioners(
                  sorted.map((row) => ({
                    name: row.name ?? '',
                    email: row.email?.trim() ? row.email : '',
                  })),
                );
              }
            } else {
              setPractitioners([{ name: '', email: '' }]);
            }
          } catch {
            setPractitioners([{ name: '', email: '' }]);
          }
        }

        // Model E: start with one empty resource row
        if (v.booking_model === 'resource_booking') {
          setResources([createEmptyResourceDraft('')]);
        }
      } catch {
        setError('Failed to load venue data.');
      } finally {
        setLoading(false);
      }
    }
    loadVenue();
  }, [router]);

  const terms = useMemo(
    () => venue?.terminology ?? { client: 'Client', booking: 'Booking', staff: 'Staff' },
    [venue?.terminology],
  );

  const isAppointmentsPlanVenue = venue?.pricing_tier === 'appointments';
  const activeAppointmentsModels: AppointmentPlanModel[] = useMemo(
    () => (venue?.active_booking_models ?? []).filter(isAppointmentPlanModel),
    [venue?.active_booking_models],
  );

  /** Normalised secondaries (e.g. restaurant + events). Primary flow is unchanged; checklist on dashboard covers catalogue for each enabled add-on. */
  const enabledSecondaryModels = useMemo(
    () =>
      venue
        ? normalizeEnabledModels(venue.enabled_models, venue.booking_model)
        : [],
    [venue],
  );

  const modelSteps = useMemo(() => {
    if (!venue) return [];
    if (venue.pricing_tier === 'appointments') {
      const steps: Array<{ key: string; label: string }> = [
        { key: 'welcome', label: 'Welcome' },
        { key: 'profile', label: 'Business Details' },
        { key: 'opening_hours', label: 'Opening Hours' },
        { key: 'team', label: 'Calendars' },
        { key: 'users', label: 'Other Users' },
      ];

      for (const model of APPOINTMENTS_ACTIVE_MODEL_ORDER.filter(isAppointmentPlanModel)) {
        if (!activeAppointmentsModels.includes(model)) continue;
        if (model === 'unified_scheduling') {
          steps.push({ key: 'services', label: 'Appointments Setup' });
          steps.push({ key: 'hours', label: 'Calendar Availability' });
        }
        if (model === 'class_session') {
          steps.push({ key: 'classes', label: 'Classes Setup' });
        }
        if (model === 'event_ticket') {
          steps.push({ key: 'first_event', label: 'Events Setup' });
        }
        if (model === 'resource_booking') {
          steps.push({ key: 'resources', label: 'Resources Setup' });
        }
      }

      steps.push({ key: 'preview', label: 'Review & Go Live' });
      return steps;
    }

    const steps: Array<{ key: string; label: string }> = [
      { key: 'profile', label: 'Business Profile' },
    ];

    switch (venue.booking_model) {
      case 'table_reservation':
        steps.push({ key: 'restaurant_setup', label: 'Restaurant Setup' });
        break;
      case 'practitioner_appointment':
      case 'unified_scheduling':
        steps.push({ key: 'team', label: unifiedTeamStepLabel(terms) });
        steps.push({ key: 'services', label: 'Services' });
        steps.push({ key: 'hours', label: 'Opening hours & schedules' });
        break;
      case 'event_ticket':
        steps.push({ key: 'first_event', label: 'First Event' });
        break;
      case 'class_session':
        steps.push({ key: 'classes', label: 'Classes & Timetable' });
        break;
      case 'resource_booking':
        steps.push({ key: 'resources', label: 'Your Resources' });
        break;
    }

    steps.push({ key: 'preview', label: 'Preview & Go Live' });
    return steps;
  }, [activeAppointmentsModels, venue, terms]);

  const currentStepKey = modelSteps[step]?.key ?? 'profile';
  const totalSteps = modelSteps.length;

  const rosterIds = useMemo(() => rosterList.map((r) => r.id), [rosterList]);

  /** Default class / resource host calendar when roster loads (matches dashboard forms). */
  useEffect(() => {
    if (rosterList.length === 0) return;
    const firstId = rosterList[0]!.id;
    setClasses((prev) =>
      prev.map((c) => (c.instructor_id.trim() ? c : { ...c, instructor_id: firstId })),
    );
    setResources((prev) =>
      prev.map((r) => (r.display_on_calendar_id.trim() ? r : { ...r, display_on_calendar_id: firstId })),
    );
  }, [rosterList]);

  useEffect(() => {
    if (!venue) return;
    if (!['team', 'services', 'hours', 'classes', 'resources'].includes(currentStepKey)) return;
    const needsTeamRoster =
      currentStepKey === 'resources' ||
      isUnifiedSchedulingVenue(venue.booking_model) ||
      venue.booking_model === 'class_session';
    if (!needsTeamRoster) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const prRes = await fetch('/api/venue/practitioners?roster=1');
        if (!prRes.ok || cancelled) return;
        const body = (await prRes.json()) as {
          practitioners?: Array<{ id: string; name: string; calendar_type?: string | null }>;
        };
        const list = (body.practitioners ?? [])
          .filter((p) => (p.calendar_type ?? 'practitioner') !== 'resource')
          .map((p) => ({ id: p.id, name: p.name }));
        if (!cancelled) setRosterList(list);
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venue, currentStepKey]);

  useEffect(() => {
    if (rosterIds.length === 0) return;
    setServices((prev) =>
      prev.map((s) => (s.practitioner_ids.length === 0 ? { ...s, practitioner_ids: [...rosterIds] } : s)),
    );
  }, [rosterIds]);

  useEffect(() => {
    if (!venue || !isUnifiedSchedulingVenue(venue.booking_model)) return;
    if (currentStepKey !== 'hours' && currentStepKey !== 'opening_hours') return;
    let cancelled = false;
    (async () => {
      try {
        const venueRequest = fetch('/api/venue');
        const practitionerRequest =
          currentStepKey === 'opening_hours'
            ? Promise.resolve(new Response(JSON.stringify({ practitioners: [] }), { status: 200 }))
            : fetch('/api/venue/practitioners?roster=1');
        const [vRes, pRes] = await Promise.all([venueRequest, practitionerRequest]);
        if (!vRes.ok || !pRes.ok || cancelled) return;
        const venueRow = (await vRes.json()) as { opening_hours?: OpeningHoursSettings | null };
        const prBody = (await pRes.json()) as {
          practitioners?: Array<{ id: string; working_hours?: WorkingHours }>;
        };
        const pracs = prBody.practitioners ?? [];
        if (venueRow.opening_hours && typeof venueRow.opening_hours === 'object') {
          const merged = {
            ...defaultOpeningHoursSettings(),
            ...venueRow.opening_hours,
          } as OpeningHoursSettings;
          if (!cancelled) setOpeningHoursDraft(merged);
        } else if (!cancelled) {
          setOpeningHoursDraft(defaultOpeningHoursSettings());
        }
        const byId: Record<string, WorkingHours> = {};
        for (const p of pracs) {
          const wh = p.working_hours;
          if (wh && typeof wh === 'object' && Object.keys(wh).length > 0) {
            byId[p.id] = wh;
          } else {
            byId[p.id] = defaultPractitionerWorkingHours();
          }
        }
        if (!cancelled) setCalendarWorkingDraft(byId);
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venue, currentStepKey]);

  const saveProgress = useCallback(
    async (nextStep: number) => {
      const res = await fetch('/api/venue/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_step: nextStep }),
      });
      if (!res.ok) throw new Error('Failed to save progress');
    },
    []
  );

  async function handleNext() {
    setError(null);

    if (currentStepKey === 'welcome') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      setSaving(true);
      try {
        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch {
        setError('Failed to save your progress. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (currentStepKey === 'profile') {
      if (!name.trim()) {
        setError('Please enter your business name.');
        return;
      }
      const street = addressStreet.trim();
      const town = addressTown.trim();
      const postcode = addressPostcode.trim();
      if (!street || !town || !postcode) {
        setError('Please enter street, town or city, and postcode for your business address.');
        return;
      }
      const combinedAddress = buildAddress({
        name: addressName.trim(),
        street,
        town,
        postcode,
      });
      setSaving(true);
      try {
        const slug = name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+$/, '');
        const finalSlug = slug || `venue-${Date.now()}`;
        const nextStep = Math.max(step + 1, maxCompletedStep);
        const res = await fetch('/api/venue/onboarding', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            address: combinedAddress,
            phone: phone.trim(),
            slug: finalSlug,
            currency,
            onboarding_step: nextStep,
          }),
        });
        if (!res.ok) throw new Error('Failed to save profile');
        setVenue((prev) =>
          prev
            ? {
                ...prev,
                name: name.trim(),
                address: combinedAddress,
                phone: phone.trim(),
                slug: finalSlug,
                currency,
              }
            : prev
        );
      } catch {
        setError('Failed to save. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (currentStepKey === 'opening_hours') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      const hasVenueOpenDay = Object.values(openingHoursDraft).some((d) => {
        if (!d) return false;
        if ('closed' in d && d.closed === true) return false;
        if ('periods' in d && Array.isArray(d.periods) && d.periods.length > 0) return true;
        return false;
      });
      if (!hasVenueOpenDay) {
        setError('Choose at least one day when the business is open.');
        return;
      }
      setSaving(true);
      try {
        const ohRes = await fetch('/api/venue/opening-hours', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(openingHoursDraft),
        });
        if (!ohRes.ok) throw new Error('Failed to save opening hours');
        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch {
        setError('Failed to save opening hours. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (currentStepKey === 'team') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      const unnamed = practitioners.find((p) => !p.name.trim());
      if (unnamed) {
        setError(`Enter a name for each ${terms.staff.toLowerCase()}.`);
        return;
      }
      setSaving(true);
      try {
        const listRes = await fetch('/api/venue/practitioners');
        if (!listRes.ok) {
          const errBody = (await listRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error ?? 'Could not load your team. Please refresh and try again.');
        }
        const listBody = (await listRes.json()) as {
          practitioners?: Array<{ id: string; sort_order: number }>;
        };
        const sortedExisting = [...(listBody.practitioners ?? [])].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        );

        for (let i = 0; i < practitioners.length; i++) {
          const p = practitioners[i];
          const existing = sortedExisting[i];
          if (existing?.id) {
            const res = await fetch('/api/venue/practitioners', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: existing.id,
                name: p.name.trim(),
                sort_order: i,
                ...(p.email.trim() ? { email: p.email.trim() } : {}),
              }),
            });
            if (!res.ok) {
              const errBody = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
              throw new Error(
                typeof errBody.error === 'string'
                  ? errBody.error
                  : `Could not update ${terms.staff.toLowerCase()} ${i + 1}.`,
              );
            }
          } else {
            const res = await fetch('/api/venue/practitioners', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: p.name.trim(),
                sort_order: i,
                ...(p.email.trim() ? { email: p.email.trim() } : {}),
              }),
            });
            if (!res.ok) {
              const errBody = (await res.json().catch(() => ({}))) as {
                error?: string;
                upgrade_required?: boolean;
                limit?: number;
              };
              if (errBody.upgrade_required) {
                throw new Error(
                  'Could not add team member. Please check your plan under Settings \u2192 Plan.',
                );
              }
              throw new Error(
                typeof errBody.error === 'string'
                  ? errBody.error
                  : `Could not add ${terms.staff.toLowerCase()} ${i + 1}.`,
              );
            }
          }
        }

        if (sortedExisting.length > practitioners.length) {
          const toRemove = sortedExisting.slice(practitioners.length);
          for (const row of toRemove) {
            if (!row?.id) continue;
            const delRes = await fetch('/api/venue/practitioners', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: row.id }),
            });
            if (!delRes.ok) {
              const errBody = (await delRes.json().catch(() => ({}))) as { error?: string };
              throw new Error(
                typeof errBody.error === 'string'
                  ? errBody.error
                  : `Could not remove an extra ${terms.staff.toLowerCase()} record. Try again or manage team under Settings.`,
              );
            }
          }
        }

        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save team. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (currentStepKey === 'users') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      const validInvites = staffInvites
        .map((invite) => ({ email: invite.email.trim().toLowerCase(), role: invite.role }))
        .filter((invite) => invite.email.length > 0);
      for (const invite of validInvites) {
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email);
        if (!emailOk) {
          setError(`Enter a valid email address for ${invite.email || 'each user'}.`);
          return;
        }
      }
      setSaving(true);
      try {
        for (const invite of validInvites) {
          const res = await fetch('/api/venue/staff/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invite),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `Failed to invite ${invite.email}`);
          }
        }
        setStaffInvites([{ email: '', role: 'staff' }]);
        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save users. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (currentStepKey === 'services') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      const validServices = services.filter((s) => s.name.trim());
      if (validServices.length === 0) {
        setError('Please add at least one service.');
        return;
      }
      const needsRoster = venue ? isUnifiedSchedulingVenue(venue.booking_model) : false;
      if (needsRoster && rosterIds.length === 0) {
        setError('Your team could not be loaded. Go back one step and save your team again.');
        return;
      }
      for (const s of validServices) {
        if (needsRoster && s.practitioner_ids.length === 0) {
          setError(`Select at least one ${terms.staff.toLowerCase()} for each service, or re-save your team step.`);
          return;
        }
        if (s.duration_minutes < 5) {
          setError('Each service must have a duration of at least 5 minutes.');
          return;
        }
      }
      setSaving(true);
      try {
        for (const s of validServices) {
          const payload = serviceDraftToApiPayload(s);
          const res = await fetch('/api/venue/appointment-services', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error('Failed to create service');
        }
        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch {
        setError('Failed to save services. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (currentStepKey === 'hours') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      if (rosterList.length === 0) {
        setError('No calendars found. Go back and save your team first.');
        return;
      }
      const hasVenueOpenDay = Object.values(openingHoursDraft).some((d) => {
        if (!d) return false;
        if ('closed' in d && d.closed === true) return false;
        if ('periods' in d && Array.isArray(d.periods) && d.periods.length > 0) return true;
        return false;
      });
      if (!hasVenueOpenDay) {
        setError('Choose at least one day when the business is open, or adjust opening hours below.');
        return;
      }

      setSaving(true);
      try {
        if (!isAppointmentsPlanVenue) {
          const ohRes = await fetch('/api/venue/opening-hours', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(openingHoursDraft),
          });
          if (!ohRes.ok) throw new Error('Failed to save opening hours');
        }
        for (const cal of rosterList) {
          const wh = calendarWorkingDraft[cal.id] ?? defaultPractitionerWorkingHours();
          const hasDay = Object.values(wh).some((ranges) => Array.isArray(ranges) && ranges.length > 0);
          if (!hasDay) {
            throw new Error(
              `Set at least one working day for ${cal.name} (or adjust their weekly schedule below).`,
            );
          }
          const patchRes = await fetch('/api/venue/practitioners', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: cal.id, working_hours: wh }),
          });
          if (!patchRes.ok) throw new Error(`Failed to save working hours for ${cal.name}`);
        }
        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save hours.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (currentStepKey === 'first_event') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      const eventName = eventDraft.name.trim();
      const eventDate = eventDraft.date.trim();

      if (isAppointmentsPlanVenue && !eventName && !eventDate) {
        setSaving(true);
        try {
          await saveProgress(step + 1);
          setMaxCompletedStep((prev) => Math.max(prev, step + 1));
        } catch {
          setError('Failed to save progress. Please try again.');
          setSaving(false);
          return;
        }
        setSaving(false);
      } else {
        if (!eventName || !eventDate) {
          setError(
            isAppointmentsPlanVenue
              ? 'Enter both an event name and date, or leave both empty to skip this step.'
              : 'Please enter an event name and date.',
          );
          return;
        }
        if (eventDraft.end_time <= eventDraft.start_time) {
          setError('End time must be after start time.');
          return;
        }
        setSaving(true);
        try {
          const res = await fetch('/api/venue/experience-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: eventName,
              event_date: eventDate,
              start_time: eventDraft.start_time,
              end_time: eventDraft.end_time,
              capacity: eventDraft.capacity,
              ticket_types: [
                {
                  name: 'General Admission',
                  price_pence: poundsToMinor(eventDraft.ticketPrice),
                  capacity: eventDraft.capacity,
                },
              ],
            }),
          });
          if (!res.ok) throw new Error('Failed to create event');
          await saveProgress(step + 1);
          setMaxCompletedStep((prev) => Math.max(prev, step + 1));
        } catch {
          setError('Failed to save event. Please try again.');
          setSaving(false);
          return;
        }
        setSaving(false);
      }
    }

    if (currentStepKey === 'classes') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      if (rosterList.length === 0) {
        setError('No calendars found. Go back and complete the Calendars step first.');
        return;
      }
      const validClasses = classes.filter((c) => c.name.trim());
      if (validClasses.length === 0) {
        setError('Please add at least one class.');
        return;
      }
      for (const c of validClasses) {
        if (!c.instructor_id.trim()) {
          setError('Select a calendar for each class.');
          return;
        }
      }
      setSaving(true);
      try {
        for (const c of validClasses) {
          const typeRes = await fetch('/api/venue/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: c.name.trim(),
              description: c.description.trim() || null,
              duration_minutes: c.duration_minutes,
              capacity: c.capacity,
              price_pence: poundsToMinor(c.price),
              instructor_id: c.instructor_id.trim(),
            }),
          });
          const typeBody = (await typeRes.json()) as { data?: { id?: string }; error?: string };
          if (!typeRes.ok) {
            throw new Error(typeBody.error ?? 'Failed to create class type');
          }
          const classTypeId = typeBody.data?.id;
          if (!classTypeId) throw new Error('Class type ID missing from response');
        }

        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save classes. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (currentStepKey === 'resources') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      const validResources = resources.filter((r) => r.name.trim());
      if (isAppointmentsPlanVenue && validResources.length === 0) {
        setSaving(true);
        try {
          await saveProgress(step + 1);
          setMaxCompletedStep((prev) => Math.max(prev, step + 1));
        } catch {
          setError('Failed to save progress. Please try again.');
          setSaving(false);
          return;
        }
        setSaving(false);
      } else {
        if (validResources.length === 0) {
          setError('Please add at least one resource.');
          return;
        }
        if (rosterList.length === 0) {
          setError('No team calendars found. Go back and complete the Calendars step first.');
          return;
        }
        for (const r of validResources) {
          if (!r.display_on_calendar_id.trim()) {
            setError('Choose which calendar column each resource appears on.');
            return;
          }
          const slot = r.slot_interval_minutes;
          const minB = r.min_booking_minutes;
          const maxB = r.max_booking_minutes;
          if (!Number.isFinite(slot) || slot < RES_SLOT_MIN || slot > RES_SLOT_MAX) {
            setError(`Slot interval must be between ${RES_SLOT_MIN} and ${RES_SLOT_MAX} minutes.`);
            return;
          }
          if (!Number.isFinite(minB) || minB < RES_MIN_BOOK_MIN || minB > RES_MIN_BOOK_MAX) {
            setError(`Min booking must be between ${RES_MIN_BOOK_MIN} and ${RES_MIN_BOOK_MAX} minutes.`);
            return;
          }
          if (!Number.isFinite(maxB) || maxB < RES_MAX_BOOK_MIN || maxB > RES_MAX_BOOK_MAX) {
            setError(`Max booking must be between ${RES_MAX_BOOK_MIN} and ${RES_MAX_BOOK_MAX} minutes.`);
            return;
          }
          if (minB > maxB) {
            setError('Min booking duration cannot exceed max booking duration.');
            return;
          }
          const priceRaw = r.pricePerSlot.trim();
          const pricePence = priceRaw === '' ? 0 : poundsToMinor(priceRaw);
          if (
            (r.payment_requirement === 'deposit' || r.payment_requirement === 'full_payment') &&
            pricePence <= 0
          ) {
            setError('Set a price per slot before choosing deposit or full payment online.');
            return;
          }
          if (r.payment_requirement === 'deposit') {
            const dep = parseFloat(r.depositPounds);
            if (!Number.isFinite(dep) || dep <= 0) {
              setError('Enter a deposit amount greater than zero.');
              return;
            }
            const depPence = Math.round(dep * 100);
            const maxSlots = Math.max(1, Math.ceil(maxB / slot));
            const maxTotal = pricePence * maxSlots;
            if (pricePence > 0 && depPence > maxTotal) {
              setError('Deposit cannot exceed the maximum possible booking total for this resource.');
              return;
            }
          }
        }
        setSaving(true);
        try {
          for (const r of validResources) {
            const priceRaw = r.pricePerSlot.trim();
            const pricePence = priceRaw === '' ? 0 : poundsToMinor(priceRaw);
            const payReq = r.payment_requirement;
            const depPence =
              payReq === 'deposit' && r.depositPounds.trim() !== ''
                ? Math.round(parseFloat(r.depositPounds) * 100)
                : null;
            const res = await fetch('/api/venue/resources', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: r.name.trim(),
                ...(r.resource_type.trim() && { resource_type: r.resource_type.trim() }),
                display_on_calendar_id: r.display_on_calendar_id.trim(),
                slot_interval_minutes: r.slot_interval_minutes,
                min_booking_minutes: r.min_booking_minutes,
                max_booking_minutes: r.max_booking_minutes,
                ...(pricePence > 0 && { price_per_slot_pence: pricePence }),
                payment_requirement: payReq,
                deposit_amount_pence: payReq === 'deposit' ? depPence : null,
                availability_hours: r.availability_hours,
                is_active: true,
                ...DEFAULT_ENTITY_BOOKING_WINDOW,
              }),
            });
            const errBody = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
              throw new Error(errBody.error ?? 'Failed to create resource');
            }
          }
          await saveProgress(step + 1);
          setMaxCompletedStep((prev) => Math.max(prev, step + 1));
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to save resources. Please try again.');
          setSaving(false);
          return;
        }
        setSaving(false);
      }
    }

    if (currentStepKey === 'restaurant_setup') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      setSaving(true);
      try {
        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch {
        setError('Failed to save. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    setStep((s) => s + 1);
  }

  async function handleGoLive() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboarding_completed: true,
          onboarding_step: totalSteps,
        }),
      });
      if (!res.ok) throw new Error('Failed to complete onboarding');
      if (venue?.booking_model === 'table_reservation') {
        router.push('/dashboard/onboarding');
      } else {
        router.push('/dashboard');
      }
    } catch {
      setError('Failed to complete setup. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="text-center text-slate-500">
        <p>Unable to load your venue. Please try refreshing.</p>
      </div>
    );
  }

  const wideOnboardingStep =
    isUnifiedSchedulingVenue(venue.booking_model) &&
    (currentStepKey === 'services' || currentStepKey === 'hours');

  return (
    <div className={`w-full ${wideOnboardingStep ? 'max-w-3xl' : 'max-w-xl'}`}>
      {/* Progress */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between text-xs font-medium text-slate-400">
          <span>
            Step {step + 1} of {totalSteps} · {modelSteps[step]?.label}
          </span>
          <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200">
          <div
            className="h-2 rounded-full bg-brand-600 transition-all"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {currentStepKey === 'welcome' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Welcome to your Appointments plan</h2>
            <p className="mb-6 text-sm text-slate-500">
              Reserve NI supports appointments, classes, events, and bookable resources from one venue. This setup will
              guide you through your business details, opening hours, calendars, users, and the booking models you
              enabled.
            </p>
            <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-800">
                Booking models enabled
              </p>
              <div className="flex flex-wrap gap-2">
                {activeAppointmentsModels.map((model) => (
                  <span
                    key={model}
                    className="rounded-full border border-brand-200 bg-white px-3 py-1 text-sm font-medium text-slate-700"
                  >
                    {APPOINTMENTS_MODEL_LABEL[model as AppointmentPlanModel]}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
              You can enable or disable booking models later from Settings, but this onboarding flow will make sure the
              ones above are ready to use straight away.
            </div>
          </div>
        )}

        {/* Profile step */}
        {currentStepKey === 'profile' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Tell us about your business</h2>
            <p className="mb-6 text-sm text-slate-500">
              This information will appear on your booking page.
            </p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Business name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. The Cutting Room"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              <fieldset className="space-y-3">
                <legend className="mb-1.5 block text-sm font-medium text-slate-700">Business address</legend>
                <p className="text-xs text-slate-500">
                  Same format as Settings → Venue profile. You can add a building name if you like.
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Building / venue name (optional)</label>
                  <input
                    type="text"
                    value={addressName}
                    onChange={(e) => setAddressName(e.target.value)}
                    placeholder="e.g. The Old Mill"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Street *</label>
                  <input
                    type="text"
                    value={addressStreet}
                    onChange={(e) => setAddressStreet(e.target.value)}
                    placeholder="e.g. 12 Main Street"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Town / city *</label>
                    <input
                      type="text"
                      value={addressTown}
                      onChange={(e) => setAddressTown(e.target.value)}
                      placeholder="e.g. Belfast"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Postcode *</label>
                    <input
                      type="text"
                      value={addressPostcode}
                      onChange={(e) => setAddressPostcode(e.target.value)}
                      placeholder="e.g. BT1 1AA"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      autoComplete="postal-code"
                    />
                  </div>
                </div>
              </fieldset>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="028 9012 3456"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                >
                  {CURRENCY_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {currentStepKey === 'opening_hours' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Set your opening hours</h2>
            <p className="mb-6 text-sm text-slate-500">
              These are the broad hours when your business accepts bookings at all.
            </p>
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm font-medium text-slate-800">How booking availability works</p>
              <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-slate-600">
                <li>Business opening hours are the outer limit for online booking.</li>
                <li>Calendar availability narrows that down for each person, room, or resource.</li>
                <li>A time is bookable only when both the business and the relevant calendar are available.</li>
              </ul>
              <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">
                <p>Example: if the business is open `09:00-18:00` but a therapist works `10:00-16:00`, the earliest bookable slot is `10:00`.</p>
                <p>Example: if the business is open all day but a room is blocked at `14:00`, that room is not bookable then.</p>
              </div>
            </div>
            <OpeningHoursControl value={openingHoursDraft} onChange={setOpeningHoursDraft} />
          </div>
        )}

        {currentStepKey === 'restaurant_setup' && (
          <div className="text-center">
            <h2 className="mb-2 text-lg font-bold text-slate-900">Restaurant setup</h2>
            <p className="mb-4 text-sm text-slate-500">
              Next you&apos;ll see a short summary and your booking link. After that, a dedicated step on your
              dashboard will set up service periods, table capacity, party sizes, and deposit rules for your
              reservations.
            </p>
          </div>
        )}

        {/* Model B: Team / calendars (all appointment-style plans: unlimited calendars — same add/remove UI) */}
        {currentStepKey === 'team' && venue && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">
              {isAppointmentsPlanVenue ? 'Set up your calendars' : unifiedTeamStepLabel(terms)}
            </h2>
            {venue.pricing_tier === 'founding' ? (
              <p className="mb-4 text-sm text-slate-500">
                Your Founding Partner plan includes <strong>unlimited bookable calendars</strong> and{' '}
                <strong>unlimited team members</strong>: add everyone you need. Each person below gets their own
                calendar and staff settings. Set{' '}
                <strong>working hours, breaks, and days off</strong> under{' '}
                <Link
                  href="/dashboard/calendar-availability"
                  className="font-medium text-brand-600 underline hover:text-brand-700"
                >
                  Calendar availability
                </Link>{' '}
                after onboarding. You can also manage {terms.staff.toLowerCase()} under{' '}
                <Link
                  href="/dashboard/settings?tab=staff"
                  className="font-medium text-brand-600 underline hover:text-brand-700"
                >
                  Settings → Staff
                </Link>
                .
              </p>
            ) : (
              <p className="mb-4 text-sm text-slate-500">
                Your plan includes <strong>unlimited bookable calendars</strong>. Add a row for each calendar you need
                (each can represent a person or a room). Use <strong>Add</strong> to add more and{' '}
                <strong>Remove</strong> to delete a row you don&apos;t need—you need at least one. Set{' '}
                <strong>working hours, breaks, and days off</strong> under{' '}
                <Link
                  href="/dashboard/calendar-availability"
                  className="font-medium text-brand-600 underline hover:text-brand-700"
                >
                  Calendar availability
                </Link>{' '}
                after onboarding. Manage {terms.staff.toLowerCase()} under{' '}
                <Link
                  href="/dashboard/settings?tab=staff"
                  className="font-medium text-brand-600 underline hover:text-brand-700"
                >
                  Settings → Staff
                </Link>
                .
              </p>
            )}
            <div className="mb-6 space-y-3">
              {practitioners.map((p, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-200 p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Calendar {i + 1}
                    </span>
                    {practitioners.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPractitioners(practitioners.filter((_, j) => j !== i))}
                        className="shrink-0 text-xs font-medium text-slate-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => {
                          const updated = [...practitioners];
                          updated[i] = { ...p, name: e.target.value };
                          setPractitioners(updated);
                        }}
                        placeholder="e.g. Staff name or room label"
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Email <span className="font-normal text-slate-400">(optional)</span>
                      </label>
                      <input
                        type="email"
                        value={p.email}
                        onChange={(e) => {
                          const updated = [...practitioners];
                          updated[i] = { ...p, email: e.target.value };
                          setPractitioners(updated);
                        }}
                        placeholder="name@example.com"
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPractitioners([...practitioners, { name: '', email: '' }])}
                className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-brand-300 hover:text-brand-600"
              >
                + Add calendar
              </button>
            </div>
          </div>
        )}

        {currentStepKey === 'users' && (
          <OnboardingStaffInviteStep invites={staffInvites} setInvites={setStaffInvites} />
        )}

        {currentStepKey === 'services' && isUnifiedSchedulingVenue(venue.booking_model) && (
            <div>
              <h2 className="mb-1 text-lg font-bold text-slate-900">
                {isAppointmentsPlanVenue ? 'Set up appointments' : 'Your services'}
              </h2>
              <p className="mb-6 text-sm text-slate-500">
                Add each service with the same detail as in the dashboard: duration, buffer, price, deposits, which{' '}
                {terms.staff.toLowerCase()} offers it, and optional staff customisation rules. You can refine services
                later under{' '}
                <Link
                  href="/dashboard/appointment-services"
                  className="font-medium text-brand-600 underline hover:text-brand-700"
                >
                  Services
                </Link>
                .
              </p>
              <OnboardingAppointmentServiceList
                currencySymbol={currencySymbol(currency)}
                terms={terms}
                services={services}
                setServices={setServices}
                roster={rosterList}
                rosterIds={rosterIds}
              />
            </div>
          )}

        {currentStepKey === 'hours' && isUnifiedSchedulingVenue(venue.booking_model) && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">
              {isAppointmentsPlanVenue ? 'Set calendar availability' : 'Opening hours & schedules'}
            </h2>
            <p className="mb-6 text-sm text-slate-500">
              {isAppointmentsPlanVenue
                ? `Set when each ${terms.staff.toLowerCase()} or calendar can take bookings. A booking is available only where these hours overlap with your business opening hours.`
                : `Set when the business accepts appointments and when each ${terms.staff.toLowerCase()} is available to take bookings. You can adjust breaks and time off later under Availability.`
              }
            </p>
            {!isAppointmentsPlanVenue && (
              <div className="mb-8">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Business opening hours</h3>
                <p className="mb-4 text-xs text-slate-500">
                  Guest booking slots are limited to times when you are open and when staff are working.
                </p>
                <OpeningHoursControl value={openingHoursDraft} onChange={setOpeningHoursDraft} />
              </div>
            )}
            <div className="space-y-10">
              {rosterList.map((cal) => (
                <div key={cal.id}>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">
                    {cal.name}: working hours
                  </h3>
                  <WorkingHoursControl
                    value={calendarWorkingDraft[cal.id] ?? defaultPractitionerWorkingHours()}
                    onChange={(wh) =>
                      setCalendarWorkingDraft((prev) => ({
                        ...prev,
                        [cal.id]: wh,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Model C: First event */}
        {currentStepKey === 'first_event' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">
              {isAppointmentsPlanVenue ? 'Events (optional)' : 'Set up your first event'}
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              {isAppointmentsPlanVenue ? (
                <>
                  You can skip this step and add events later. Events are ticketed experiences with a date and time;
                  you create and manage them in the dashboard under{' '}
                  <Link href="/dashboard/event-manager" className="font-medium text-brand-600 underline hover:text-brand-700">
                    Event manager
                  </Link>
                  , where you set capacity, ticket types, and pricing. Guests book from your public Events tab when you
                  publish an event.
                </>
              ) : (
                <>Create one event now so guests can start booking from your Events tab straight away.</>
              )}
            </p>
            {isAppointmentsPlanVenue && (
              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800">Optional step</p>
                <p className="mt-1">
                  Leave the fields below empty and click Continue to go on — or fill them in to create a first event now.
                </p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Event name
                </label>
                <input
                  type="text"
                  value={eventDraft.name}
                  onChange={(e) => setEventDraft({ ...eventDraft, name: e.target.value })}
                  placeholder="e.g. Seasonal tasting, Open day"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    value={eventDraft.date}
                    onChange={(e) => setEventDraft({ ...eventDraft, date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Start time
                  </label>
                  <input
                    type="time"
                    value={eventDraft.start_time}
                    onChange={(e) => setEventDraft({ ...eventDraft, start_time: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  End time
                </label>
                <input
                  type="time"
                  value={eventDraft.end_time}
                  onChange={(e) => setEventDraft({ ...eventDraft, end_time: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Capacity
                  </label>
                  <input
                    type="number"
                    value={eventDraft.capacity}
                    onChange={(e) =>
                      setEventDraft({ ...eventDraft, capacity: parseInt(e.target.value) || 20 })
                    }
                    min={1}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Ticket price ({currencySymbol(currency)})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      {currencySymbol(currency)}
                    </span>
                    <input
                      type="number"
                      value={eventDraft.ticketPrice}
                      onChange={(e) =>
                        setEventDraft({ ...eventDraft, ticketPrice: e.target.value })
                      }
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 py-2.5 pl-7 pr-4 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Model D: Classes — class types only (timetable & sessions: dashboard → Class timetable) */}
        {currentStepKey === 'classes' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Class types</h2>
            <p className="mb-2 text-sm text-slate-500">
              You are adding <strong>class types</strong> — the template for a class (name, description, duration,
              price, which calendar it runs on). This matches <strong>Add class type</strong> on{' '}
              <Link href="/dashboard/class-timetable" className="font-medium text-brand-600 underline hover:text-brand-700">
                Class timetable
              </Link>{' '}
              in the dashboard.
            </p>
            <p className="mb-6 text-sm text-slate-500">
              <strong>Scheduling:</strong> day, time, and recurring sessions are set in the dashboard under the{' '}
              <strong>Classes</strong> tab (class timetable). There you can add timetable rules and generate bookable
              sessions for guests.
            </p>
            <div className="space-y-3">
              {classes.map((c, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) => {
                        const updated = [...classes];
                        updated[i] = { ...c, name: e.target.value };
                        setClasses(updated);
                      }}
                      placeholder="Class name (e.g. Beginners yoga, Open studio)"
                      className="border-0 bg-transparent p-0 text-sm font-medium text-slate-900 focus:ring-0"
                    />
                    {classes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setClasses(classes.filter((_, j) => j !== i))}
                        className="text-xs text-slate-400 hover:text-red-500"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Description (optional)</label>
                    <textarea
                      value={c.description}
                      onChange={(e) => {
                        const updated = [...classes];
                        updated[i] = { ...c, description: e.target.value };
                        setClasses(updated);
                      }}
                      placeholder="Short description for guests (shown on your booking page when you publish sessions)."
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-medium text-slate-500">Calendar</label>
                      <select
                        value={c.instructor_id}
                        onChange={(e) => {
                          const updated = [...classes];
                          updated[i] = { ...c, instructor_id: e.target.value };
                          setClasses(updated);
                        }}
                        className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        {rosterList.length === 0 ? (
                          <option value="">Loading calendars…</option>
                        ) : (
                          rosterList.map((cal) => (
                            <option key={cal.id} value={cal.id}>
                              {cal.name}
                            </option>
                          ))
                        )}
                      </select>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Default calendar for this class type (same field as “calendar” in Add class type).
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500">
                        Duration (min)
                      </label>
                      <input
                        type="number"
                        value={c.duration_minutes}
                        onChange={(e) => {
                          const updated = [...classes];
                          updated[i] = {
                            ...c,
                            duration_minutes: parseInt(e.target.value) || 60,
                          };
                          setClasses(updated);
                        }}
                        min={15}
                        step={15}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500">
                        Capacity
                      </label>
                      <input
                        type="number"
                        value={c.capacity}
                        onChange={(e) => {
                          const updated = [...classes];
                          updated[i] = { ...c, capacity: parseInt(e.target.value) || 15 };
                          setClasses(updated);
                        }}
                        min={1}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-[10px] font-medium text-slate-500">
                        Price ({currencySymbol(currency)})
                      </label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                          {currencySymbol(currency)}
                        </span>
                        <input
                          type="number"
                          value={c.price}
                          onChange={(e) => {
                            const updated = [...classes];
                            updated[i] = { ...c, price: e.target.value };
                            setClasses(updated);
                          }}
                          min={0}
                          step={0.01}
                          placeholder="0.00"
                          className="w-full rounded border border-slate-200 py-1.5 pl-5 pr-2 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setClasses([
                    ...classes,
                    {
                      name: '',
                      description: '',
                      instructor_id: rosterList[0]?.id ?? '',
                      duration_minutes: 60,
                      capacity: 15,
                      price: '0.00',
                    },
                  ])
                }
                className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm text-slate-500 hover:border-brand-300 hover:text-brand-600"
              >
                + Add another class type
              </button>
            </div>
          </div>
        )}

        {/* Model E: Resources — aligned with dashboard Resource timeline (no date-exception calendar) */}
        {currentStepKey === 'resources' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">
              {isAppointmentsPlanVenue ? 'Bookable resources (optional)' : 'Set up your resources'}
            </h2>
            <p className="mb-3 text-sm text-slate-600">
              A <strong>resource</strong> is something guests book by the slot — for example a court, room, lane, desk, or
              piece of equipment. Each resource has its own weekly availability, slot length, and pricing. Resources appear
              on a <strong>team calendar column</strong> you choose so staff see them alongside appointments; guests book
              from your public <strong>Resources</strong> tab.
            </p>
            <p className="mb-4 text-sm text-slate-500">
              This step matches the fields in{' '}
              <Link href="/dashboard/resource-timeline" className="font-medium text-brand-600 underline hover:text-brand-700">
                Dashboard → Resource timeline
              </Link>{' '}
              → Add resource. Date-specific exceptions (closures or custom hours) can be added there later — they are not
              required here.
            </p>
            {isAppointmentsPlanVenue && (
              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800">Optional step</p>
                <p className="mt-1">
                  Leave the form below empty and click Continue to skip — or add one or more resources now.
                </p>
              </div>
            )}
            <div className="space-y-4">
              {resources.map((r, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={r.name}
                      onChange={(e) => {
                        const updated = [...resources];
                        updated[i] = { ...r, name: e.target.value };
                        setResources(updated);
                      }}
                      placeholder="Resource name (e.g. Court 1, Studio A)"
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-slate-900 focus:ring-0"
                    />
                    {resources.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setResources(resources.filter((_, j) => j !== i))}
                        className="shrink-0 text-xs text-slate-400 hover:text-red-500"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Type (optional)</label>
                    <input
                      type="text"
                      value={r.resource_type}
                      onChange={(e) => {
                        const updated = [...resources];
                        updated[i] = { ...r, resource_type: e.target.value };
                        setResources(updated);
                      }}
                      placeholder="e.g. Tennis court, Meeting room"
                      list={`resource-type-suggestions-${i}`}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <datalist id={`resource-type-suggestions-${i}`}>
                      {RESOURCE_TYPE_SUGGESTIONS.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Show on calendar</label>
                    <select
                      value={r.display_on_calendar_id}
                      onChange={(e) => {
                        const updated = [...resources];
                        updated[i] = { ...r, display_on_calendar_id: e.target.value };
                        setResources(updated);
                      }}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      {rosterList.length === 0 ? (
                        <option value="">Loading team calendars…</option>
                      ) : (
                        rosterList.map((cal) => (
                          <option key={cal.id} value={cal.id}>
                            {cal.name}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      The resource appears on this staff calendar column (same as Resource timeline).
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-slate-500">Slot interval (min)</label>
                      <input
                        type="number"
                        value={r.slot_interval_minutes}
                        onChange={(e) => {
                          const updated = [...resources];
                          updated[i] = {
                            ...r,
                            slot_interval_minutes: parseInt(e.target.value, 10) || RES_SLOT_MIN,
                          };
                          setResources(updated);
                        }}
                        min={RES_SLOT_MIN}
                        max={RES_SLOT_MAX}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-slate-500">Min booking (min)</label>
                      <input
                        type="number"
                        value={r.min_booking_minutes}
                        onChange={(e) => {
                          const updated = [...resources];
                          updated[i] = {
                            ...r,
                            min_booking_minutes: parseInt(e.target.value, 10) || RES_MIN_BOOK_MIN,
                          };
                          setResources(updated);
                        }}
                        min={RES_MIN_BOOK_MIN}
                        max={RES_MIN_BOOK_MAX}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-slate-500">Max booking (min)</label>
                      <input
                        type="number"
                        value={r.max_booking_minutes}
                        onChange={(e) => {
                          const updated = [...resources];
                          updated[i] = {
                            ...r,
                            max_booking_minutes: parseInt(e.target.value, 10) || RES_MAX_BOOK_MIN,
                          };
                          setResources(updated);
                        }}
                        min={RES_MAX_BOOK_MIN}
                        max={RES_MAX_BOOK_MAX}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Price per slot ({currencySymbol(currency)})
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                          {currencySymbol(currency)}
                        </span>
                        <input
                          type="number"
                          value={r.pricePerSlot}
                          onChange={(e) => {
                            const updated = [...resources];
                            updated[i] = { ...r, pricePerSlot: e.target.value };
                            setResources(updated);
                          }}
                          min={0}
                          step={0.01}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-slate-200 py-2 pl-7 pr-3 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Payment</label>
                      <select
                        value={r.payment_requirement}
                        onChange={(e) => {
                          const updated = [...resources];
                          updated[i] = {
                            ...r,
                            payment_requirement: e.target.value as ResourcePaymentRequirement,
                          };
                          setResources(updated);
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="none">Pay at venue</option>
                        <option value="deposit">Deposit online</option>
                        <option value="full_payment">Full payment online</option>
                      </select>
                    </div>
                  </div>
                  {r.payment_requirement === 'deposit' && (
                    <div className="max-w-xs">
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Deposit ({currencySymbol(currency)})
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                          {currencySymbol(currency)}
                        </span>
                        <input
                          type="number"
                          value={r.depositPounds}
                          onChange={(e) => {
                            const updated = [...resources];
                            updated[i] = { ...r, depositPounds: e.target.value };
                            setResources(updated);
                          }}
                          min={0}
                          step={0.01}
                          className="w-full rounded-lg border border-slate-200 py-2 pl-7 pr-3 text-sm"
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="mb-2 text-xs font-semibold text-slate-800">Weekly availability</h3>
                    <p className="mb-2 text-xs text-slate-500">
                      When this resource can be booked (must overlap your team calendar hours — adjust in Availability if
                      needed).
                    </p>
                    <WorkingHoursControl
                      value={r.availability_hours}
                      onChange={(wh) => {
                        const updated = [...resources];
                        updated[i] = { ...r, availability_hours: wh };
                        setResources(updated);
                      }}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setResources([...resources, createEmptyResourceDraft(rosterList[0]?.id ?? '')])
                }
                className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm text-slate-500 hover:border-brand-300 hover:text-brand-600"
              >
                + Add another resource
              </button>
            </div>
          </div>
        )}

        {/* Preview & Go Live */}
        {currentStepKey === 'preview' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
                <svg
                  className="h-8 w-8 text-brand-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
            </div>
            <h2 className="mb-2 text-lg font-bold text-slate-900">You&apos;re all set!</h2>
            <p className="mb-4 text-sm text-slate-500">
              {venue.booking_model === 'table_reservation' ? (
                <>
                  Your public booking link is below. Next, finish table and sitting setup on your dashboard so guests
                  can reserve covers and pay deposits as you configure.
                </>
              ) : isAppointmentsPlanVenue ? (
                <>
                  Your business is configured and your selected booking models are ready to review in the dashboard.
                  Share the booking link below once you&apos;re happy with how each model looks.
                </>
              ) : (
                <>
                  Your booking page is ready. Share the link below with your {terms.client.toLowerCase()}s.
                </>
              )}
            </p>
            {isAppointmentsPlanVenue && (
              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/90 p-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Ready in this venue
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeAppointmentsModels.map((model) => (
                    <span
                      key={model}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700"
                    >
                      {APPOINTMENTS_MODEL_LABEL[model as AppointmentPlanModel]}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  You can add or remove booking models later from Settings if your business needs change.
                </p>
              </div>
            )}
            {venue.booking_model === 'table_reservation' && (
              <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900/80">
                  Next step
                </p>
                <p className="text-sm text-slate-700">
                  You&apos;ll set service periods, capacity, party-size durations, and optional deposits in the hosted
                  restaurant setup wizard.
                </p>
              </div>
            )}
            {isUnifiedSchedulingVenue(venue.booking_model) && (
              <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900/80">
                  Before you go live
                </p>
                <p className="mb-3 text-sm text-slate-700">
                  You have already set services, opening hours, and working hours. Before taking paid bookings, finish
                  Stripe Connect and any advanced availability rules in the dashboard:
                </p>
                <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-600">
                  <li>
                    <Link href="/dashboard/settings" className="font-medium text-brand-600 underline hover:text-brand-700">
                      Settings
                    </Link>
                    : Stripe Connect and venue payment options
                  </li>
                  <li>
                    <Link href="/dashboard/calendar-availability" className="font-medium text-brand-600 underline hover:text-brand-700">
                      Calendar availability
                    </Link>
                    : breaks, time off, and fine-tune schedules anytime
                  </li>
                </ul>
              </div>
            )}
            {!isAppointmentsPlanVenue && enabledSecondaryModels.length > 0 && (
              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/90 p-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Additional booking types enabled
                </p>
                <p className="mb-3 text-sm text-slate-700">
                  You have extra bookable types on this venue. Finish their catalogues from the dashboard - the setup
                  checklist will link to Events, Classes, or Resources as needed.
                </p>
                <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-600">
                  {enabledSecondaryModels.includes('event_ticket') && (
                    <li>
                      <Link href="/dashboard/event-manager" className="font-medium text-brand-600 underline hover:text-brand-700">
                        Events
                      </Link>
                    </li>
                  )}
                  {enabledSecondaryModels.includes('class_session') && (
                    <li>
                      <Link href="/dashboard/class-timetable" className="font-medium text-brand-600 underline hover:text-brand-700">
                        Classes & timetable
                      </Link>
                    </li>
                  )}
                  {enabledSecondaryModels.includes('resource_booking') && (
                    <li>
                      <Link href="/dashboard/resource-timeline" className="font-medium text-brand-600 underline hover:text-brand-700">
                        Resources
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            )}
            {venue.slug && (
              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-400 mb-1">Your booking page</p>
                <p className="text-sm font-medium text-brand-600 break-all">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/book/
                  {venue.slug}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex justify-between">
          {step > 0 && !saving ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Back
            </button>
          ) : (
            <div />
          )}
          {currentStepKey === 'preview' ? (
            <button
              type="button"
              onClick={handleGoLive}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving
                ? 'Finishing...'
                : venue.booking_model === 'table_reservation'
                  ? 'Continue to restaurant setup'
                  : 'Go to Dashboard'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Continue'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
