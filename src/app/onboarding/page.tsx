'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BookingModel } from '@/types/booking-models';
import { getBusinessConfig } from '@/lib/business-config';
import { buildAddress, parseAddress } from '@/lib/venue/address-format';

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

function minorToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

interface VenueOnboarding {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  booking_model: BookingModel;
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

interface ServiceDraft {
  name: string;
  duration: number;
  price: string;
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
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  price: string;
}

interface ResourceDraft {
  name: string;
  pricePerSlot: string;
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const [services, setServices] = useState<ServiceDraft[]>([]);

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
    { name: '', day_of_week: 1, start_time: '09:00', duration_minutes: 60, capacity: 15, price: '0.00' },
  ]);

  // Model E: Resources
  const [resources, setResources] = useState<ResourceDraft[]>([{ name: '', pricePerSlot: '0.00' }]);

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

        // Pre-fill services from business config defaults (stored in pence, display in pounds)
        if (v.business_type) {
          const config = getBusinessConfig(v.business_type);
          if (config.defaultServices?.length) {
            setServices(
              config.defaultServices.map((ds) => ({
                name: ds.name,
                duration: ds.duration,
                price: minorToPounds(ds.price),
              }))
            );
          }
        }

        // Model B: merge existing practitioners (retry / refresh after partial save).
        // Business / Founding: unlimited calendars — start from one row, add as many as needed.
        // Standard: one row per paid calendar slot (fixed count).
        if (v.booking_model === 'practitioner_appointment') {
          const unlimitedCalendars =
            v.pricing_tier === 'business' || v.pricing_tier === 'founding';
          const slots = Math.max(1, v.calendar_count ?? 1);
          try {
            const prRes = await fetch('/api/venue/practitioners');
            if (prRes.ok) {
              const body = (await prRes.json()) as {
                practitioners?: Array<{ name: string; email: string | null; sort_order: number }>;
              };
              const list = body.practitioners ?? [];
              const sorted = [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
              if (unlimitedCalendars) {
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
                setPractitioners(
                  Array.from({ length: slots }, (_, i) =>
                    sorted[i]
                      ? {
                          name: sorted[i].name ?? '',
                          email: sorted[i].email?.trim() ? sorted[i].email : '',
                        }
                      : { name: '', email: '' },
                  ),
                );
              }
            } else if (unlimitedCalendars) {
              setPractitioners([{ name: '', email: '' }]);
            } else {
              setPractitioners(Array.from({ length: slots }, () => ({ name: '', email: '' })));
            }
          } catch {
            if (unlimitedCalendars) {
              setPractitioners([{ name: '', email: '' }]);
            } else {
              setPractitioners(Array.from({ length: slots }, () => ({ name: '', email: '' })));
            }
          }
        }

        // Model E: pre-fill resources when plan includes more than one slot
        if (v.calendar_count && v.calendar_count > 1 && v.booking_model === 'resource_booking') {
          setResources(
            Array.from({ length: v.calendar_count }, () => ({ name: '', pricePerSlot: '0.00' }))
          );
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

  const modelSteps = useMemo(() => {
    if (!venue) return [];
    const steps: Array<{ key: string; label: string }> = [
      { key: 'profile', label: 'Business Profile' },
    ];

    switch (venue.booking_model) {
      case 'table_reservation':
        steps.push({ key: 'restaurant_setup', label: 'Restaurant Setup' });
        break;
      case 'practitioner_appointment':
        steps.push({ key: 'team', label: `Your ${terms.staff}s` });
        steps.push({ key: 'services', label: 'Services' });
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
  }, [venue, terms]);

  const currentStepKey = modelSteps[step]?.key ?? 'profile';
  const totalSteps = modelSteps.length;

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

    if (currentStepKey === 'team') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      const slots = Math.max(1, venue?.calendar_count ?? 1);
      const unlimitedCalendars =
        venue?.pricing_tier === 'business' || venue?.pricing_tier === 'founding';
      if (!unlimitedCalendars && practitioners.length !== slots) {
        setError(
          'Team size does not match your plan. Refresh the page or continue from Settings if you changed your subscription.',
        );
        return;
      }
      const unnamed = practitioners.find((p) => !p.name.trim());
      if (unnamed) {
        setError(
          unlimitedCalendars
            ? `Enter a name for each ${terms.staff.toLowerCase()}.`
            : `Enter a name for each ${terms.staff.toLowerCase()} — your plan includes ${slots} calendar slot${slots === 1 ? '' : 's'}.`,
        );
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
                  `Your plan includes ${errBody.limit ?? slots} calendar slot${(errBody.limit ?? slots) === 1 ? '' : 's'}. You already have that many team members saved — edit the rows above, or change your plan under Settings → Plan.`,
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

        if (unlimitedCalendars && sortedExisting.length > practitioners.length) {
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
      setSaving(true);
      try {
        for (const s of validServices) {
          const res = await fetch('/api/venue/appointment-services', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: s.name.trim(),
              duration_minutes: s.duration,
              price_pence: poundsToMinor(s.price),
            }),
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

    if (currentStepKey === 'first_event') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      if (!eventDraft.name.trim() || !eventDraft.date) {
        setError('Please enter an event name and date.');
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
            name: eventDraft.name.trim(),
            event_date: eventDraft.date,
            start_time: eventDraft.start_time,
            end_time: eventDraft.end_time,
            capacity: eventDraft.capacity,
            ticket_types: [
              { name: 'General Admission', price_pence: poundsToMinor(eventDraft.ticketPrice), capacity: eventDraft.capacity },
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

    if (currentStepKey === 'classes') {
      if (step < maxCompletedStep) {
        setStep((s) => s + 1);
        return;
      }
      const validClasses = classes.filter((c) => c.name.trim());
      if (validClasses.length === 0) {
        setError('Please add at least one class.');
        return;
      }
      setSaving(true);
      try {
        for (const c of validClasses) {
          const typeRes = await fetch('/api/venue/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: c.name.trim(),
              duration_minutes: c.duration_minutes,
              capacity: c.capacity,
              price_pence: poundsToMinor(c.price),
            }),
          });
          if (!typeRes.ok) throw new Error('Failed to create class type');
          const typeBody = await typeRes.json();
          const classTypeId = typeBody.data?.id;
          if (!classTypeId) throw new Error('Class type ID missing from response');

          const ttRes = await fetch('/api/venue/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              class_type_id: classTypeId,
              day_of_week: c.day_of_week,
              start_time: c.start_time,
            }),
          });
          if (!ttRes.ok) throw new Error('Failed to create timetable entry');
        }
        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch {
        setError('Failed to save classes. Please try again.');
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
      if (validResources.length === 0) {
        setError('Please add at least one resource.');
        return;
      }
      setSaving(true);
      try {
        for (const r of validResources) {
          const res = await fetch('/api/venue/resources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: r.name.trim(),
              price_per_slot_pence: poundsToMinor(r.pricePerSlot),
            }),
          });
          if (!res.ok) throw new Error('Failed to create resource');
        }
        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch {
        setError('Failed to save resources. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (currentStepKey === 'restaurant_setup') {
      setSaving(true);
      try {
        const res = await fetch('/api/venue/onboarding', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            onboarding_completed: true,
            onboarding_step: totalSteps,
          }),
        });
        if (!res.ok) throw new Error('Failed to save');
        router.push('/dashboard/onboarding');
      } catch {
        setError('Failed to save. Please try again.');
        setSaving(false);
      }
      return;
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
      router.push('/dashboard');
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

  return (
    <div className="w-full max-w-xl">
      {/* Progress */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between text-xs font-medium text-slate-400">
          <span>
            Step {step + 1} of {totalSteps} — {modelSteps[step]?.label}
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

        {/* Restaurant setup redirect */}
        {currentStepKey === 'restaurant_setup' && (
          <div className="text-center">
            <h2 className="mb-2 text-lg font-bold text-slate-900">Restaurant setup</h2>
            <p className="mb-4 text-sm text-slate-500">
              We&apos;ll now set up your service periods, capacity, and deposit settings.
            </p>
          </div>
        )}

        {/* Model B: Team */}
        {currentStepKey === 'team' && venue && (
          <div>
            {venue.pricing_tier === 'business' || venue.pricing_tier === 'founding' ? (
              <>
                <h2 className="mb-1 text-lg font-bold text-slate-900">
                  Your {terms.staff.toLowerCase()}
                </h2>
                <p className="mb-4 text-sm text-slate-500">
                  Your Business plan includes <strong>unlimited bookable calendars</strong> and{' '}
                  <strong>unlimited team members</strong> — add everyone you need. Each person below gets their own
                  calendar and staff settings. Set{' '}
                  <strong>working hours, breaks, and days off</strong> under{' '}
                  <Link
                    href="/dashboard/availability"
                    className="font-medium text-brand-600 underline hover:text-brand-700"
                  >
                    Availability
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
                <div className="mb-6 space-y-3">
                  {practitioners.map((p, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-200 p-4 transition-shadow hover:shadow-sm"
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          {terms.staff} {i + 1}
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
                            placeholder={`${terms.staff} name`}
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
                    + Add {terms.staff.toLowerCase()}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-1 text-lg font-bold text-slate-900">
                  Your {terms.staff.toLowerCase()} ({Math.max(1, venue.calendar_count ?? 1)} calendar slot
                  {Math.max(1, venue.calendar_count ?? 1) === 1 ? '' : 's'})
                </h2>
                <p className="mb-6 text-sm text-slate-500">
                  Each person below gets their own bookable calendar — this matches the number of slots on your
                  current plan. After onboarding, change calendar count under{' '}
                  <Link
                    href="/dashboard/settings?tab=plan"
                    className="font-medium text-brand-600 underline hover:text-brand-700"
                  >
                    Settings → Plan
                  </Link>{' '}
                  and manage {terms.staff.toLowerCase()} under{' '}
                  <Link
                    href="/dashboard/settings?tab=staff"
                    className="font-medium text-brand-600 underline hover:text-brand-700"
                  >
                    Settings → Staff
                  </Link>
                  . Set{' '}
                  <strong>working hours, breaks, and days off</strong> under{' '}
                  <Link
                    href="/dashboard/availability"
                    className="font-medium text-brand-600 underline hover:text-brand-700"
                  >
                    Availability
                  </Link>{' '}
                  in the dashboard.
                </p>
                <div className="space-y-3">
                  {practitioners.map((p, i) => (
                    <div key={i} className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => {
                          const updated = [...practitioners];
                          updated[i] = { ...p, name: e.target.value };
                          setPractitioners(updated);
                        }}
                        placeholder={`${terms.staff} name (required)`}
                        className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                      <input
                        type="email"
                        value={p.email}
                        onChange={(e) => {
                          const updated = [...practitioners];
                          updated[i] = { ...p, email: e.target.value };
                          setPractitioners(updated);
                        }}
                        placeholder="Email (optional)"
                        className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Model B: Services */}
        {currentStepKey === 'services' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Your services</h2>
            <p className="mb-6 text-sm text-slate-500">
              Define what {terms.client.toLowerCase()}s can book. To choose <strong>which {terms.staff.toLowerCase()} offers which service</strong>, deposits, and colours, use{' '}
              <Link href="/dashboard/appointment-services" className="font-medium text-brand-600 underline hover:text-brand-700">
                Services
              </Link>{' '}
              after you finish here.
            </p>
            <div className="space-y-3">
              {services.map((s, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) => {
                      const updated = [...services];
                      updated[i] = { ...s, name: e.target.value };
                      setServices(updated);
                    }}
                    placeholder="Service name"
                    className="w-full border-0 bg-transparent p-0 text-sm font-medium text-slate-900 focus:ring-0"
                  />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] font-medium text-slate-500">
                        Duration (min)
                      </label>
                      <input
                        type="number"
                        value={s.duration}
                        onChange={(e) => {
                          const updated = [...services];
                          updated[i] = { ...s, duration: parseInt(e.target.value) || 30 };
                          setServices(updated);
                        }}
                        min={5}
                        step={5}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-medium text-slate-500">
                        Price ({currencySymbol(currency)})
                      </label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                          {currencySymbol(currency)}
                        </span>
                        <input
                          type="number"
                          value={s.price}
                          onChange={(e) => {
                            const updated = [...services];
                            updated[i] = { ...s, price: e.target.value };
                            setServices(updated);
                          }}
                          min={0}
                          step={0.01}
                          placeholder="0.00"
                          className="w-full rounded border border-slate-200 py-1.5 pl-5 pr-2 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => setServices(services.filter((_, j) => j !== i))}
                        className="pb-1.5 text-xs text-slate-400 hover:text-red-500"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setServices([...services, { name: '', duration: 30, price: '0.00' }])
                }
                className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm text-slate-500 hover:border-brand-300 hover:text-brand-600"
              >
                + Add service
              </button>
            </div>
          </div>
        )}

        {/* Model C: First event */}
        {currentStepKey === 'first_event' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Create your first event</h2>
            <p className="mb-6 text-sm text-slate-500">
              Set up an event so {terms.client.toLowerCase()}s can start booking.
            </p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Event name
                </label>
                <input
                  type="text"
                  value={eventDraft.name}
                  onChange={(e) => setEventDraft({ ...eventDraft, name: e.target.value })}
                  placeholder="e.g. Saturday Night Comedy"
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

        {/* Model D: Classes */}
        {currentStepKey === 'classes' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Set up your classes</h2>
            <p className="mb-6 text-sm text-slate-500">
              Define class types and their schedule.
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
                      placeholder="Class name"
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
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500">Day</label>
                      <select
                        value={c.day_of_week}
                        onChange={(e) => {
                          const updated = [...classes];
                          updated[i] = { ...c, day_of_week: parseInt(e.target.value) };
                          setClasses(updated);
                        }}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        {DAY_LABELS.map((label, d) => (
                          <option key={d} value={d}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500">Time</label>
                      <input
                        type="time"
                        value={c.start_time}
                        onChange={(e) => {
                          const updated = [...classes];
                          updated[i] = { ...c, start_time: e.target.value };
                          setClasses(updated);
                        }}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
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
                    { name: '', day_of_week: 1, start_time: '09:00', duration_minutes: 60, capacity: 15, price: '0.00' },
                  ])
                }
                className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm text-slate-500 hover:border-brand-300 hover:text-brand-600"
              >
                + Add another class
              </button>
            </div>
          </div>
        )}

        {/* Model E: Resources */}
        {currentStepKey === 'resources' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Add your resources</h2>
            <p className="mb-6 text-sm text-slate-500">
              Each resource is a bookable unit ({terms.client.toLowerCase()}s select one when booking).
            </p>
            <div className="space-y-3">
              {resources.map((r, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={r.name}
                      onChange={(e) => {
                        const updated = [...resources];
                        updated[i] = { ...r, name: e.target.value };
                        setResources(updated);
                      }}
                      placeholder={`Resource name (e.g. Court 1)`}
                      className="flex-1 border-0 bg-transparent p-0 text-sm font-medium text-slate-900 focus:ring-0"
                    />
                    {resources.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setResources(resources.filter((_, j) => j !== i))}
                        className="text-xs text-slate-400 hover:text-red-500"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="max-w-[200px]">
                    <label className="block text-[10px] font-medium text-slate-500">
                      Price per slot ({currencySymbol(currency)})
                    </label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
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
                        className="w-full rounded border border-slate-200 py-1.5 pl-5 pr-2 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setResources([...resources, { name: '', pricePerSlot: '0.00' }])}
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
              Your booking page is ready. Share the link below with your{' '}
              {terms.client.toLowerCase()}s.
            </p>
            {venue.booking_model === 'practitioner_appointment' && (
              <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900/80">
                  Before you go live
                </p>
                <p className="mb-3 text-sm text-slate-700">
                  Finish calendar and payment setup in the dashboard so slots and charges work as you expect:
                </p>
                <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-600">
                  <li>
                    <Link href="/dashboard/availability" className="font-medium text-brand-600 underline hover:text-brand-700">
                      Availability
                    </Link>{' '}
                    — working hours, breaks, and days off per {terms.staff.toLowerCase()}
                  </li>
                  <li>
                    <Link href="/dashboard/appointment-services" className="font-medium text-brand-600 underline hover:text-brand-700">
                      Services
                    </Link>{' '}
                    — link services to {terms.staff.toLowerCase()}s, deposits, and pricing details
                  </li>
                  <li>
                    <Link href="/dashboard/settings" className="font-medium text-brand-600 underline hover:text-brand-700">
                      Settings
                    </Link>{' '}
                    — Stripe Connect and venue payment options
                  </li>
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
              {saving ? 'Finishing...' : 'Go to Dashboard'}
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
