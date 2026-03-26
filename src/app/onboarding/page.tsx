'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingModel } from '@/types/booking-models';
import { getBusinessConfig } from '@/lib/business-config';

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
}

interface PractitionerDraft {
  name: string;
  email: string;
}

interface ServiceDraft {
  name: string;
  duration: number;
  price: number;
}

interface EventDraft {
  name: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
}

interface ClassDraft {
  name: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
}

interface ResourceDraft {
  name: string;
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

  // Step 1: Business profile
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

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
  });

  // Model D: Classes
  const [classes, setClasses] = useState<ClassDraft[]>([
    { name: '', day_of_week: 1, start_time: '09:00', duration_minutes: 60, capacity: 15 },
  ]);

  // Model E: Resources
  const [resources, setResources] = useState<ResourceDraft[]>([{ name: '' }]);

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
        setAddress(v.address ?? '');
        setPhone(v.phone ?? '');

        if (v.onboarding_completed) {
          router.push('/dashboard');
          return;
        }

        // Pre-fill services from business config defaults
        if (v.business_type) {
          const config = getBusinessConfig(v.business_type);
          if (config.defaultServices?.length) {
            setServices(
              config.defaultServices.map((ds) => ({
                name: ds.name,
                duration: ds.duration,
                price: ds.price,
              }))
            );
          }
        }

        // Pre-fill practitioners/resources based on calendar count
        if (v.calendar_count && v.calendar_count > 1) {
          if (v.booking_model === 'practitioner_appointment') {
            setPractitioners(
              Array.from({ length: v.calendar_count }, () => ({ name: '', email: '' }))
            );
          }
          if (v.booking_model === 'resource_booking') {
            setResources(
              Array.from({ length: v.calendar_count }, () => ({ name: '' }))
            );
          }
        }
      } catch {
        setError('Failed to load venue data.');
      } finally {
        setLoading(false);
      }
    }
    loadVenue();
  }, [router]);

  const terms = venue?.terminology ?? { client: 'Client', booking: 'Booking', staff: 'Staff' };

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
            address: address.trim(),
            phone: phone.trim(),
            slug: finalSlug,
            onboarding_step: nextStep,
          }),
        });
        if (!res.ok) throw new Error('Failed to save profile');
        setVenue((prev) =>
          prev
            ? { ...prev, name: name.trim(), address: address.trim(), phone: phone.trim(), slug: finalSlug }
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
      const validPractitioners = practitioners.filter((p) => p.name.trim());
      if (validPractitioners.length === 0) {
        setError(`Please add at least one ${terms.staff.toLowerCase()}.`);
        return;
      }
      setSaving(true);
      try {
        for (const p of validPractitioners) {
          const res = await fetch('/api/venue/practitioners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: p.name.trim(),
              ...(p.email.trim() ? { email: p.email.trim() } : {}),
            }),
          });
          if (!res.ok) throw new Error(`Failed to create ${terms.staff.toLowerCase()}`);
        }
        await saveProgress(step + 1);
        setMaxCompletedStep((prev) => Math.max(prev, step + 1));
      } catch {
        setError('Failed to save team. Please try again.');
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
              price_pence: s.price,
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
              { name: 'General Admission', price_pence: 0, capacity: eventDraft.capacity },
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
            body: JSON.stringify({ name: r.name.trim() }),
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
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main Street, Belfast"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
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
        {currentStepKey === 'team' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">
              Add your {terms.staff.toLowerCase()}s
            </h2>
            <p className="mb-6 text-sm text-slate-500">
              Each {terms.staff.toLowerCase()} gets their own bookable calendar.
            </p>
            <div className="space-y-3">
              {practitioners.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => {
                      const updated = [...practitioners];
                      updated[i] = { ...p, name: e.target.value };
                      setPractitioners(updated);
                    }}
                    placeholder={`${terms.staff} name`}
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
                  {practitioners.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPractitioners(practitioners.filter((_, j) => j !== i))}
                      className="text-sm text-slate-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPractitioners([...practitioners, { name: '', email: '' }])}
                className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm text-slate-500 hover:border-brand-300 hover:text-brand-600"
              >
                + Add another {terms.staff.toLowerCase()}
              </button>
            </div>
          </div>
        )}

        {/* Model B: Services */}
        {currentStepKey === 'services' && (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Your services</h2>
            <p className="mb-6 text-sm text-slate-500">
              Define what {terms.client.toLowerCase()}s can book.
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
                        Price (pence)
                      </label>
                      <input
                        type="number"
                        value={s.price}
                        onChange={(e) => {
                          const updated = [...services];
                          updated[i] = { ...s, price: parseInt(e.target.value) || 0 };
                          setServices(updated);
                        }}
                        min={0}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
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
                  setServices([...services, { name: '', duration: 30, price: 0 }])
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
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setClasses([
                    ...classes,
                    { name: '', day_of_week: 1, start_time: '09:00', duration_minutes: 60, capacity: 15 },
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
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => {
                      const updated = [...resources];
                      updated[i] = { name: e.target.value };
                      setResources(updated);
                    }}
                    placeholder={`Resource name (e.g. Court 1)`}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                  {resources.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setResources(resources.filter((_, j) => j !== i))}
                      className="text-sm text-slate-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setResources([...resources, { name: '' }])}
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
