'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VenueSettings } from '../types';
import type { BookingModel } from '@/types/booking-models';
import { normalizeEnabledModels } from '@/lib/booking/enabled-models';
import {
  appointmentPlanDefaultModels,
  resolveActiveBookingModels,
} from '@/lib/booking/active-models';
import { isAppointmentPlanTier } from '@/lib/tier-enforcement';
import { SectionCard } from '@/components/ui/dashboard/SectionCard';

const APPOINTMENTS_PLAN_MODELS: Array<{
  model: Extract<BookingModel, 'unified_scheduling' | 'event_ticket' | 'class_session' | 'resource_booking'>;
  title: string;
  description: string;
  href: string;
}> = [
  {
    model: 'unified_scheduling',
    title: 'Appointments & services',
    description: 'Take bookings against calendars, people, or rooms with services and durations.',
    href: '/dashboard/calendar',
  },
  {
    model: 'event_ticket',
    title: 'Ticketed events',
    description: 'Sell tickets for dated events from your public page.',
    href: '/dashboard/event-manager',
  },
  {
    model: 'class_session',
    title: 'Classes & sessions',
    description: 'Recurring or one-off classes with timetables and rosters.',
    href: '/dashboard/class-timetable',
  },
  {
    model: 'resource_booking',
    title: 'Resources & facilities',
    description: 'Bookable rooms, courts, or equipment by time window.',
    href: '/dashboard/resource-timeline',
  },
];

interface Props {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
  isAdmin: boolean;
}

export function BookingTypesSection({ venue, onUpdate, isAdmin }: Props) {
  const router = useRouter();
  const primary = (venue.booking_model as BookingModel) ?? 'table_reservation';
  const appointmentsPlan = isAppointmentPlanTier(venue.pricing_tier ?? null);
  const deriveDraft = useCallback(
    () =>
      appointmentsPlan
        ? resolveActiveBookingModels({
            pricingTier: venue.pricing_tier,
            bookingModel: primary,
            enabledModels: venue.enabled_models,
            activeBookingModels: venue.active_booking_models,
          })
        : normalizeEnabledModels(venue.enabled_models, primary),
    [appointmentsPlan, primary, venue.active_booking_models, venue.enabled_models, venue.pricing_tier],
  );
  const [draft, setDraft] = useState<BookingModel[]>(deriveDraft);
  const [saving, setSaving] = useState(false);
  const [setupNavigating, setSetupNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setDraft(deriveDraft());
  }, [deriveDraft]);

  useEffect(() => {
    if (!saveSuccess) return;
    const t = setTimeout(() => setSaveSuccess(false), 2500);
    return () => clearTimeout(t);
  }, [saveSuccess]);

  const toggle = useCallback((m: (typeof APPOINTMENTS_PLAN_MODELS)[number]['model']) => {
    setDraft((prev) => {
      if (appointmentsPlan) {
        const next = prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m];
        return next.length > 0 ? next : appointmentPlanDefaultModels();
      }
      return prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m];
    });
  }, [appointmentsPlan]);

  const dirty =
    JSON.stringify([...draft].sort()) !==
    JSON.stringify([...deriveDraft()].sort());

  const persistDraft = useCallback(async (): Promise<boolean> => {
    if (!isAdmin) return false;
    const normalizedEnabled = normalizeEnabledModels(draft, primary);
    const payload = appointmentsPlan
      ? { active_booking_models: draft }
      : { enabled_models: normalizedEnabled };
    try {
      const res = await fetch('/api/venue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? 'Save failed');
        return false;
      }
      onUpdate({
        active_booking_models: (json as { active_booking_models?: BookingModel[] }).active_booking_models,
        enabled_models: (json as { enabled_models?: BookingModel[] }).enabled_models ?? normalizedEnabled,
      });
      setDraft(
        appointmentsPlan
          ? resolveActiveBookingModels({
              pricingTier: venue.pricing_tier,
              bookingModel: primary,
              enabledModels: (json as { enabled_models?: unknown }).enabled_models,
              activeBookingModels: (json as { active_booking_models?: unknown }).active_booking_models,
            })
          : normalizeEnabledModels((json as { enabled_models?: unknown }).enabled_models, primary),
      );
      return true;
    } catch {
      setError('Save failed');
      return false;
    }
  }, [appointmentsPlan, draft, isAdmin, onUpdate, primary, venue.pricing_tier]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const ok = await persistDraft();
      if (ok) {
        await router.refresh();
        setSaveSuccess(true);
      }
    } catch {
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  }, [persistDraft, router]);

  const handleSetUp = useCallback(
    async (href: string) => {
      setError(null);
      setSetupNavigating(true);
      try {
        if (dirty) {
          const ok = await persistDraft();
          if (!ok) return;
        }
        await router.refresh();
        router.push(href);
      } finally {
        setSetupNavigating(false);
      }
    },
    [dirty, persistDraft, router],
  );

  if (!isAdmin) return null;

  const visible = appointmentsPlan
    ? APPOINTMENTS_PLAN_MODELS
    : APPOINTMENTS_PLAN_MODELS.filter((o) => o.model !== primary);

  if (visible.length === 0) return null;

  const busy = saving || setupNavigating;

  const bookingTypesDescription = appointmentsPlan ? (
    <>
      Your Appointments plan includes appointments, classes, events, and resources. Choose which models are active on
      your booking page and in the dashboard.
    </>
  ) : (
    <>
      Your main booking type is set at signup. Enable extra types to show them on your public booking page and in the
      dashboard. Guests use the <span className="font-medium text-slate-700">?tab=</span> links on your booking URL.
    </>
  );

  return (
    <div id="additional-booking-types" className="scroll-mt-24">
      <SectionCard elevated>
        <SectionCard.Header
          eyebrow="Models"
          title={appointmentsPlan ? 'Booking models' : 'Additional booking types'}
          description={bookingTypesDescription}
        />
        <SectionCard.Body>
      <ul className="space-y-3">
        {visible.map((opt) => {
          const checked = draft.includes(opt.model);
          return (
            <li
              key={opt.model}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3"
            >
              <label className="flex min-w-0 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={checked}
                  onChange={() => toggle(opt.model)}
                />
                <span>
                  <span className="font-medium text-slate-900">{opt.title}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{opt.description}</span>
                </span>
              </label>
              {checked && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSetUp(opt.href)}
                  className="shrink-0 text-sm font-medium text-brand-600 hover:text-brand-800 disabled:opacity-50"
                >
                  {setupNavigating ? 'Opening…' : 'Set up →'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => void save()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : appointmentsPlan ? 'Save booking models' : 'Save booking types'}
        </button>
        {saveSuccess && (
          <span className="text-sm font-medium text-green-700" role="status">
            Saved
          </span>
        )}
        {!dirty && !saveSuccess && <span className="text-xs text-slate-400">No unsaved changes</span>}
      </div>
        </SectionCard.Body>
      </SectionCard>
    </div>
  );
}
