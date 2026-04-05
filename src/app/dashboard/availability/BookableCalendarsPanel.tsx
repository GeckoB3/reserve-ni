'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { normalizePublicBaseUrl, publicBaseUrlHost } from '@/lib/public-base-url';
const PUBLIC_BOOK_ORIGIN = normalizePublicBaseUrl(process.env.NEXT_PUBLIC_BASE_URL);
const PUBLIC_BOOK_HOST = publicBaseUrlHost(PUBLIC_BOOK_ORIGIN);

function bookingSlugDraftError(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (t === '') return null;
  if (t.length > 64) return 'Booking link must be 64 characters or fewer.';
  if (!/^[a-z0-9-]+$/.test(t)) {
    return 'Use lowercase letters, numbers, and hyphens only.';
  }
  return null;
}

export interface BookableCalendarRow {
  id: string;
  name: string;
  slug?: string | null;
  is_active: boolean;
}

interface ServiceRow {
  id: string;
  name: string;
}

interface PractitionerServiceLink {
  practitioner_id: string;
  service_id: string;
}

interface ClassTypeRow {
  id: string;
  name: string;
  instructor_id: string | null;
}

interface ResourceRow {
  id: string;
  name: string;
  display_on_calendar_id: string | null;
}

interface EventRow {
  id: string;
  name: string;
}

interface CalendarEntitlementProps {
  pricing_tier: string;
  calendar_count: number | null;
  active_practitioners: number;
  calendar_limit: number | null;
  unlimited: boolean;
  at_calendar_limit: boolean;
  can_add_practitioner: boolean;
}

export interface BookableCalendarsPanelProps {
  practitioners: BookableCalendarRow[];
  services: ServiceRow[];
  pLinks: PractitionerServiceLink[];
  classTypes: ClassTypeRow[];
  resources: ResourceRow[];
  events: EventRow[];
  entitlement: CalendarEntitlementProps | null;
  onCalendarsChanged?: () => void;
  onEditCalendar: (p: BookableCalendarRow) => void;
  onAddCalendar: () => void;
}

export function BookableCalendarsPanel({
  practitioners,
  services,
  pLinks,
  classTypes,
  resources,
  events,
  entitlement,
  onCalendarsChanged,
  onEditCalendar,
  onAddCalendar,
}: BookableCalendarsPanelProps) {
  const [calendarRenameSuccess, setCalendarRenameSuccess] = useState<string | null>(null);
  const [venueSlug, setVenueSlug] = useState<string | null>(null);
  const [calendarSlugDrafts, setCalendarSlugDrafts] = useState<Record<string, string>>({});
  const [calendarSlugFieldError, setCalendarSlugFieldError] = useState<Record<string, string | null>>({});
  const [savingSlugId, setSavingSlugId] = useState<string | null>(null);
  const [slugCopySuccessId, setSlugCopySuccessId] = useState<string | null>(null);
  const [deleteCalendarTarget, setDeleteCalendarTarget] = useState<BookableCalendarRow | null>(null);
  const [deletingCalendar, setDeletingCalendar] = useState(false);
  const [deleteCalendarError, setDeleteCalendarError] = useState<string | null>(null);
  const [venueLoading, setVenueLoading] = useState(true);

  const loadVenueSlug = useCallback(async () => {
    try {
      const res = await fetch('/api/venue');
      if (!res.ok) return;
      const data = (await res.json()) as { slug?: string | null };
      setVenueSlug(typeof data.slug === 'string' && data.slug ? data.slug : null);
    } catch {
      /* ignore */
    } finally {
      setVenueLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVenueSlug();
  }, [loadVenueSlug]);

  useEffect(() => {
    setCalendarSlugDrafts(Object.fromEntries(practitioners.map((p) => [p.id, (p.slug ?? '').trim()])));
  }, [practitioners]);

  const onSaveBookingSlug = useCallback(
    async (practitionerId: string) => {
      const raw = calendarSlugDrafts[practitionerId] ?? '';
      const fieldErr = bookingSlugDraftError(raw);
      setCalendarSlugFieldError((prev) => ({ ...prev, [practitionerId]: fieldErr }));
      if (fieldErr) return;
      const normalized = raw.trim().toLowerCase();
      setSavingSlugId(practitionerId);
      try {
        const res = await fetch('/api/venue/practitioners', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: practitionerId,
            slug: normalized === '' ? null : normalized,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.error === 'string' ? j.error : 'Could not update booking link');
        }
        setCalendarSlugFieldError((prev) => ({ ...prev, [practitionerId]: null }));
        setCalendarRenameSuccess('Booking link saved.');
        setTimeout(() => setCalendarRenameSuccess(null), 4000);
        onCalendarsChanged?.();
      } catch (e) {
        setCalendarSlugFieldError((prev) => ({
          ...prev,
          [practitionerId]: e instanceof Error ? e.message : 'Save failed',
        }));
      } finally {
        setSavingSlugId(null);
      }
    },
    [calendarSlugDrafts, onCalendarsChanged],
  );

  const copyPractitionerBookUrl = useCallback(
    async (practitionerId: string) => {
      if (!venueSlug) return;
      const raw = calendarSlugDrafts[practitionerId] ?? '';
      if (bookingSlugDraftError(raw)) return;
      const seg = raw.trim().toLowerCase();
      if (!seg) return;
      const url = `${PUBLIC_BOOK_ORIGIN}/book/${encodeURIComponent(venueSlug)}/${encodeURIComponent(seg)}`;
      try {
        await navigator.clipboard.writeText(url);
        setSlugCopySuccessId(practitionerId);
        setTimeout(() => {
          setSlugCopySuccessId((id) => (id === practitionerId ? null : id));
        }, 2500);
      } catch {
        setCalendarSlugFieldError((prev) => ({
          ...prev,
          [practitionerId]: 'Could not copy to clipboard.',
        }));
      }
    },
    [venueSlug, calendarSlugDrafts],
  );

  const onDeleteCalendar = useCallback(async () => {
    if (!deleteCalendarTarget) return;
    setDeleteCalendarError(null);
    setDeletingCalendar(true);
    try {
      const res = await fetch('/api/venue/practitioners', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteCalendarTarget.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : 'Could not remove calendar');
      }
      setDeleteCalendarTarget(null);
      setCalendarRenameSuccess('Calendar removed.');
      setTimeout(() => setCalendarRenameSuccess(null), 4000);
      onCalendarsChanged?.();
    } catch (err) {
      setDeleteCalendarError(err instanceof Error ? err.message : 'Could not remove calendar');
    } finally {
      setDeletingCalendar(false);
    }
  }, [deleteCalendarTarget, onCalendarsChanged]);

  return (
    <>
      <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.04]">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-brand-50/30 px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex gap-4">
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 sm:flex">
                <CalendarColumnIcon className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">Calendars</h2>
                  {entitlement && !entitlement.unlimited && entitlement.calendar_limit != null && (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        entitlement.at_calendar_limit
                          ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-200/80'
                          : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80'
                      }`}
                    >
                      {entitlement.active_practitioners} / {entitlement.calendar_limit} on plan
                    </span>
                  )}
                  {entitlement?.unlimited && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/60">
                      Unlimited calendars
                    </span>
                  )}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                  Each column is a bookable schedule on your public page and in the dashboard. Edit a calendar to set
                  name, services, classes, and linked resources. Set{' '}
                  <strong className="font-medium text-slate-800">weekly hours</strong> under the{' '}
                  <Link
                    href="/dashboard/availability?tab=availability"
                    className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
                  >
                    Availability
                  </Link>{' '}
                  tab.
                </p>
              </div>
            </div>
            {entitlement && (
              <button
                type="button"
                onClick={onAddCalendar}
                className="inline-flex shrink-0 items-center justify-center gap-2 self-stretch rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 hover:shadow-md sm:self-start"
              >
                <PlusIcon className="h-4 w-4" />
                Add calendar
              </button>
            )}
          </div>
        </div>
        <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
          {entitlement && !entitlement.can_add_practitioner && !entitlement.unlimited && (
            <div className="flex gap-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm ring-1 ring-amber-100">
              <span className="mt-0.5 shrink-0 text-amber-600" aria-hidden>
                <AlertIcon className="h-5 w-5" />
              </span>
              <p>
                You&apos;ve reached your plan&apos;s calendar limit
                {entitlement.calendar_limit != null ? ` (${entitlement.calendar_limit})` : ''}. Increase your allowance
                on Standard or upgrade to Business for unlimited calendars — see{' '}
                <a href="/dashboard/settings?tab=plan" className="font-semibold text-amber-950 underline underline-offset-2">
                  Settings → Plan
                </a>
                .
              </p>
            </div>
          )}
          {calendarRenameSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-100">
              <CheckIcon className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              {calendarRenameSuccess}
            </div>
          )}
          {practitioners.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
                <CalendarColumnIcon className="h-7 w-7 text-slate-400" />
              </div>
              <p className="text-base font-medium text-slate-800">No calendars yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                {entitlement?.can_add_practitioner ? (
                  <>
                    Create your first column with <span className="font-medium text-slate-800">Add calendar</span>, or
                    finish setup in <span className="font-medium text-slate-800">onboarding</span>.
                  </>
                ) : (
                  <>
                    Add calendars during onboarding, or raise your limit under{' '}
                    <a href="/dashboard/settings?tab=plan" className="font-medium text-brand-700 underline">
                      Plan
                    </a>
                    .
                  </>
                )}
              </p>
            </div>
          ) : (
            <ul className="space-y-5">
              {practitioners.map((p) => {
                const linkedSvcs = pLinks
                  .filter((l) => l.practitioner_id === p.id)
                  .map((l) => services.find((s) => s.id === l.service_id)?.name)
                  .filter((n): n is string => Boolean(n));
                const classNames = classTypes.filter((ct) => ct.instructor_id === p.id).map((ct) => ct.name);
                const resourceNames = resources.filter((r) => r.display_on_calendar_id === p.id).map((r) => r.name);
                const slugDraft = calendarSlugDrafts[p.id] ?? '';
                const slugFieldErr = calendarSlugFieldError[p.id] ?? null;
                const savedSlug = (p.slug ?? '').trim().toLowerCase();
                const draftNorm = slugDraft.trim().toLowerCase();
                const slugDirty = draftNorm !== savedSlug;
                const slugLiveErr = bookingSlugDraftError(slugDraft);
                const canCopyBookUrl = Boolean(venueSlug && savedSlug && draftNorm === savedSlug && !slugLiveErr);
                const previewUrl =
                  venueSlug && draftNorm && !slugLiveErr
                    ? `${PUBLIC_BOOK_ORIGIN}/book/${encodeURIComponent(venueSlug)}/${encodeURIComponent(draftNorm)}`
                    : null;
                return (
                  <li
                    key={p.id}
                    className={`group overflow-hidden rounded-2xl border bg-white shadow-sm ring-1 transition-shadow hover:shadow-md ${
                      p.is_active
                        ? 'border-slate-200/90 ring-slate-900/[0.04]'
                        : 'border-slate-200/80 opacity-[0.97] ring-slate-900/[0.03]'
                    }`}
                  >
                    <div
                      className={`flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-4 ${
                        p.is_active ? 'border-l-4 border-l-brand-500 pl-4' : 'border-l-4 border-l-slate-300 pl-4'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold tracking-tight text-slate-900">{p.name}</h3>
                          {p.is_active ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200/70">
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          On this calendar
                        </p>
                        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                          <div>
                            <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              <ServicesIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                              Services
                            </dt>
                            <dd className="mt-1.5">
                              {linkedSvcs.length > 0 ? (
                                <ul className="flex flex-wrap gap-1.5">
                                  {linkedSvcs.map((name) => (
                                    <li
                                      key={name}
                                      className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 ring-1 ring-slate-200/80"
                                    >
                                      {name}
                                    </li>
                                  ))}
                                </ul>
                              ) : services.length > 0 ? (
                                <span className="text-sm text-slate-500">None selected</span>
                              ) : (
                                <span className="text-sm text-slate-400">—</span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              <ClassIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                              Classes
                            </dt>
                            <dd className="mt-1.5">
                              {classNames.length > 0 ? (
                                <ul className="flex flex-wrap gap-1.5">
                                  {classNames.map((name) => (
                                    <li
                                      key={name}
                                      className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-900 ring-1 ring-violet-200/80"
                                    >
                                      {name}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-sm text-slate-400">—</span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              <ResourceIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                              Resources
                            </dt>
                            <dd className="mt-1.5">
                              {resourceNames.length > 0 ? (
                                <ul className="flex flex-wrap gap-1.5">
                                  {resourceNames.map((name) => (
                                    <li
                                      key={name}
                                      className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950 ring-1 ring-amber-200/80"
                                    >
                                      {name}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-sm text-slate-400">—</span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              <EventsIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                              Events
                            </dt>
                            <dd className="mt-1.5 text-sm text-slate-600">
                              {events.length > 0
                                ? `Venue-wide (${events.length} active) — not per column`
                                : 'None configured'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div className="flex shrink-0 gap-2 self-end sm:self-start">
                        <button
                          type="button"
                          onClick={() => onEditCalendar(p)}
                          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        {practitioners.length > 1 && (
                          <button
                            type="button"
                            title="Delete calendar"
                            onClick={() => {
                              setDeleteCalendarTarget(p);
                              setDeleteCalendarError(null);
                            }}
                            className="rounded-xl border border-slate-200 p-2 text-slate-400 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50/60 px-4 py-4 sm:px-5">
                      {venueLoading ? (
                        <p className="text-sm text-slate-500">Loading booking links…</p>
                      ) : venueSlug ? (
                        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.03]">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                              <LinkIcon className="h-4 w-4" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Guest booking link
                                </p>
                                {!savedSlug ? (
                                  <p className="mt-1 text-sm text-slate-600">
                                    Add a URL segment so guests can open a page that books only with {p.name}.
                                  </p>
                                ) : (
                                  <p className="mt-1 text-sm text-slate-600">
                                    Share this URL so guests book only on {p.name}&apos;s column.
                                  </p>
                                )}
                              </div>
                              <div className="flex min-w-0 flex-wrap items-center gap-x-0.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 font-mono text-sm text-slate-800">
                                <span className="shrink-0 text-slate-500">
                                  {PUBLIC_BOOK_HOST}/book/{venueSlug}/
                                </span>
                                <input
                                  id={`calendar-slug-${p.id}`}
                                  type="text"
                                  value={slugDraft}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCalendarSlugDrafts((prev) => ({ ...prev, [p.id]: v }));
                                    setCalendarSlugFieldError((prev) => ({
                                      ...prev,
                                      [p.id]: bookingSlugDraftError(v),
                                    }));
                                  }}
                                  maxLength={64}
                                  autoComplete="off"
                                  spellCheck={false}
                                  className="min-w-[6rem] flex-1 border-0 bg-transparent p-0.5 text-slate-900 outline-none focus:ring-0"
                                  placeholder="e.g. sarah"
                                  aria-invalid={Boolean(slugLiveErr || slugFieldErr)}
                                />
                              </div>
                              {(slugLiveErr || slugFieldErr) && (
                                <p className="text-xs text-red-600">{slugLiveErr ?? slugFieldErr}</p>
                              )}
                              {previewUrl && (
                                <p className="text-xs">
                                  <a
                                    href={previewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="break-all font-medium text-brand-600 underline decoration-brand-200 underline-offset-2 hover:text-brand-700"
                                  >
                                    {previewUrl}
                                  </a>
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  disabled={!slugDirty || Boolean(slugLiveErr) || savingSlugId === p.id}
                                  onClick={() => void onSaveBookingSlug(p.id)}
                                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                                >
                                  {savingSlugId === p.id ? 'Saving…' : 'Save link'}
                                </button>
                                <button
                                  type="button"
                                  disabled={!canCopyBookUrl}
                                  onClick={() => void copyPractitionerBookUrl(p.id)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  {slugCopySuccessId === p.id ? 'Copied!' : 'Copy link'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 text-sm text-amber-950">
                          <AlertIcon className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                          <p>Set your venue slug under Venue details to build personal booking links.</p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {deleteCalendarTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          onClick={() => setDeleteCalendarTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl ring-1 ring-slate-900/5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="delete-calendar-title"
            aria-modal="true"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <TrashIcon className="h-5 w-5" />
            </div>
            <h3 id="delete-calendar-title" className="mt-4 text-lg font-semibold text-slate-900">
              Remove calendar?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              <span className="font-medium text-slate-800">{deleteCalendarTarget.name}</span> will be removed. Staff
              linked to this column are unassigned. Existing bookings stay on the diary; the practitioner on each
              booking may be cleared.
            </p>
            {deleteCalendarError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                {deleteCalendarError}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteCalendarTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onDeleteCalendar()}
                disabled={deletingCalendar}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deletingCalendar ? 'Removing…' : 'Remove calendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CalendarColumnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
      />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ServicesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function ClassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5z"
      />
    </svg>
  );
}

function ResourceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  );
}

function EventsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5m-9-6h.008v.008H12V15zm-3 3h.008v.008H9V18zm0-3h.008v.008H9V15zm0 3h.008v.008H9V18zm3-3h.008v.008H12V15zm0 3h.008v.008H12V18zm3-6h.008v.008H15V15zm0 3h.008v.008H15V18z"
      />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}
