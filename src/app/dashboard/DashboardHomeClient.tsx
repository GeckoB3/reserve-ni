'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import useSWR from 'swr';
import { SetupChecklist } from './SetupChecklist';
import { DashboardStatCard } from '@/components/dashboard/DashboardStatCard';
import { EmptyState } from '@/components/ui/dashboard/EmptyState';
import { PageFrame } from '@/components/ui/dashboard/PageFrame';
import { PageHeader } from '@/components/ui/dashboard/PageHeader';
import { Pill } from '@/components/ui/dashboard/Pill';
import { ScheduleRow } from '@/components/ui/dashboard/ScheduleRow';
import { SectionCard } from '@/components/ui/dashboard/SectionCard';
import { StackedList } from '@/components/ui/dashboard/StackedList';
import { Skeleton } from '@/components/ui/Skeleton';
import { HorizontalScrollHint } from '@/components/ui/HorizontalScrollHint';
import { isAppointmentDashboardExperience } from '@/lib/booking/unified-scheduling';
import {
  activeModelsToLegacyEnabledModels,
  getDefaultBookingModelFromActive,
  resolveActiveBookingModels,
} from '@/lib/booking/active-models';
import { isVenueScheduleCalendarEligible } from '@/lib/booking/schedule-calendar-eligibility';
import { bookingModelShortLabel, bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import type { BookingModel } from '@/types/booking-models';
import type { DashboardHomePayload } from '@/lib/dashboard/dashboard-home-payload';
import type { SetupStatus } from '@/lib/venue/compute-setup-status';

const DashboardHomeForecastChart = dynamic(
  () => import('./DashboardHomeForecastChart').then((m) => m.DashboardHomeForecastChart),
  {
    loading: () => (
      <div className="h-52">
        <Skeleton.Block className="h-full w-full rounded-xl" />
      </div>
    ),
  },
);

async function fetchDashboardHome(url: string): Promise<DashboardHomePayload> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load dashboard');
  return res.json() as Promise<DashboardHomePayload>;
}

function n(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return value;
}

function getHeatColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  if (pct >= 40) return 'bg-brand-500';
  if (pct >= 10) return 'bg-brand-300';
  return 'bg-slate-200';
}

function getLoadBarColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-brand-500';
}

const WEEKDAYS_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function formatGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Deterministic UK-style label; avoids Node vs browser Intl differences that break hydration. */
function formatTodayDate(d: Date = new Date()): string {
  const weekday = WEEKDAYS_EN[d.getDay()];
  const day = d.getDate();
  const month = MONTHS_EN[d.getMonth()];
  const year = d.getFullYear();
  return `${weekday} ${day} ${month} ${year}`;
}

function formatWeekday(d: Date = new Date()): string {
  return WEEKDAYS_EN[d.getDay()];
}

function stripClassForBookingStatus(status: string): string {
  switch (status) {
    case 'Confirmed':
      return 'bg-emerald-600';
    case 'Booked':
      return 'bg-sky-500';
    case 'Pending':
      return 'bg-amber-500';
    case 'Seated':
      return 'bg-brand-600';
    default:
      return 'bg-slate-300';
  }
}

export function DashboardHomeClient({
  initialData,
  setupStatusFromServer,
  disableClientSetupFetch,
}: {
  initialData: DashboardHomePayload;
  setupStatusFromServer: SetupStatus | null;
  /** When true, checklist uses server payload and does not call /api/venue/setup-status on mount. */
  disableClientSetupFetch: boolean;
}) {
  const { data, error, mutate, isValidating } = useSWR('/api/venue/dashboard-home', fetchDashboardHome, {
    fallbackData: initialData,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    keepPreviousData: true,
  });

  const payload = data ?? initialData;

  if (error && !payload) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <p className="text-sm font-medium text-slate-700">Unable to load dashboard</p>
        <button
          type="button"
          onClick={() => void mutate()}
          className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const t = payload.today;
  const activeModels = resolveActiveBookingModels({
    bookingModel: payload.booking_model as BookingModel | undefined,
    enabledModels: payload.enabled_models,
    activeBookingModels: payload.active_booking_models,
  });
  const primaryModel = getDefaultBookingModelFromActive(
    activeModels,
    (payload.booking_model as BookingModel) ?? 'table_reservation',
  );
  const enabledNorm = activeModelsToLegacyEnabledModels(activeModels, primaryModel);
  const isAppointment = isAppointmentDashboardExperience(
    (payload.pricing_tier as string | null | undefined) ?? null,
    primaryModel,
    enabledNorm,
  );
  const calendarEligible = isVenueScheduleCalendarEligible(primaryModel, enabledNorm);
  const scheduleHref = calendarEligible ? '/dashboard/calendar' : '/dashboard/day-sheet';
  const hasSecondaryModels = enabledNorm.length > 0;
  const showTypeColumn =
    hasSecondaryModels || Object.keys(payload.today_by_booking_model ?? {}).length > 1;
  const covers = n(t.covers);
  const bookings = n(t.bookings);
  const confirmed = n(t.confirmed);
  const pending = n(t.pending);
  const seated = n(t.seated);
  const revenue = n(t.revenue);
  const peakCovers = n(t.peak_in_house_covers);
  const inHouseNow = n(t.covers_in_house_now);
  const arrivingSoon = n(t.arriving_within_30_min);
  const fillPct = n(t.peak_fill_percent);
  const hasCap = t.concurrent_cap != null;
  const cap = t.concurrent_cap;
  const forecastSpark = payload.forecast.map((f) => (isAppointment ? f.bookings : f.covers));

  return (
    <PageFrame>
      <div className="space-y-8">
        {isValidating && !error ? (
          <p className="sr-only" aria-live="polite">
            Refreshing dashboard data
          </p>
        ) : null}
        <PageHeader
          eyebrow={formatWeekday()}
          title={formatGreeting()}
          subtitle={formatTodayDate()}
          actions={
            <>
              <Link
                href={scheduleHref}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50/40"
              >
                <svg className="h-4 w-4 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                {calendarEligible ? 'Calendar' : 'Day sheet'}
              </Link>
              <Link
                href="/dashboard/bookings"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition-colors hover:bg-brand-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                {isAppointment ? 'All appointments' : 'All bookings'}
              </Link>
            </>
          }
        />

        <SetupChecklist
          setupStatusFromServer={setupStatusFromServer}
          disableClientSetupFetch={disableClientSetupFetch}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <DashboardStatCard
            label={isAppointment ? 'Appointments today' : 'Covers today'}
            value={isAppointment ? bookings : covers}
            color="brand"
            sparklineValues={forecastSpark}
            subValue={
              isAppointment
                ? bookings > 0
                  ? `${confirmed} confirmed`
                  : 'no appointments yet'
                : bookings > 0
                  ? `across ${bookings} booking${bookings !== 1 ? 's' : ''}`
                  : 'no bookings yet'
            }
          />
          <DashboardStatCard
            label="Confirmed"
            value={confirmed}
            color="emerald"
            sparklineValues={forecastSpark}
            subValue={
              pending > 0 || seated > 0
                ? [seated > 0 ? `${seated} seated` : '', pending > 0 ? `${pending} pending` : '']
                    .filter(Boolean)
                    .join(', ')
                : undefined
            }
          />
          <DashboardStatCard label="Deposit revenue" value={`£${revenue.toFixed(2)}`} color="emerald" />
          <DashboardStatCard
            label="Next up"
            value={t.next_booking ? t.next_booking.time : '-'}
            color="amber"
            subValue={
              t.next_booking
                ? isAppointment
                  ? 'next appointment'
                  : `party of ${t.next_booking.party_size}`
                : isAppointment
                  ? 'no upcoming appointments'
                  : 'no upcoming bookings'
            }
          />
        </div>

        {payload.today_by_booking_model && Object.keys(payload.today_by_booking_model).length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today by booking type</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(payload.today_by_booking_model).map(([k, count]) => (
                <span
                  key={k}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
                    count === 0
                      ? 'border-dashed border-slate-200 bg-slate-50/80 text-slate-500'
                      : 'border-slate-100 bg-slate-50 text-slate-800'
                  }`}
                >
                  <span className="font-medium">{bookingModelShortLabel(k as BookingModel)}</span>
                  <span className={`tabular-nums ${count === 0 ? 'text-slate-400' : 'text-slate-600'}`}>{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {!isAppointment && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-700">Today&apos;s capacity</h2>
                  {inHouseNow > 0 && (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                  )}
                </div>

                {hasCap ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Busiest time: {peakCovers} of {cap} covers at the same time
                  </p>
                ) : bookings > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">Busiest time: {peakCovers} covers expected at once</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    No bookings yet - capacity will appear as bookings come in.
                  </p>
                )}

                {hasCap && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${getLoadBarColor(fillPct)}`}
                        style={{ width: `${Math.min(fillPct, 100)}%` }}
                      />
                    </div>
                    <span className="min-w-[3rem] text-right text-sm font-bold tabular-nums text-slate-700">
                      {fillPct}%
                    </span>
                  </div>
                )}

                {!hasCap && bookings > 0 && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    Set up your availability capacity to see a percentage bar here.
                  </p>
                )}
              </div>

              <div className="flex gap-3 sm:gap-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-center min-w-[100px]">
                  <p className="text-2xl font-bold tabular-nums text-slate-800">{inHouseNow}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">in house now</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-center min-w-[100px]">
                  <p className="text-2xl font-bold tabular-nums text-slate-800">{arrivingSoon}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">arriving soon</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {payload.alerts.length > 0 && (
          <div className="space-y-2">
            {payload.alerts.map((alert, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                  alert.type === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-blue-200 bg-blue-50 text-blue-800'
                }`}
              >
                {alert.type === 'warning' ? (
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                ) : (
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                  </svg>
                )}
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className={`grid gap-5 ${isAppointment ? 'lg:grid-cols-1' : 'lg:grid-cols-2'}`}>
          {!isAppointment && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">7-day capacity outlook</h2>
              <p className="mb-4 mt-1 text-xs text-slate-400">How full each day gets at its busiest time.</p>
              <HorizontalScrollHint />
              <div className="-mx-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:overflow-visible">
                <div className="flex min-w-min gap-2 sm:min-w-0 sm:w-full">
                  {payload.heatmap.map((h, idx) => {
                    const hPeak = n(h.peak_in_house_covers);
                    const hTotal = n(h.daily_total_covers);
                    const hPct = n(h.fill_percent);
                    const isToday = idx === 0;
                    const hHasCap = h.concurrent_cap != null;
                    return (
                      <div
                        key={h.date}
                        className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 sm:w-0 sm:min-w-0 sm:flex-1 sm:shrink"
                      >
                        <span className={`text-xs font-medium ${isToday ? 'text-brand-600' : 'text-slate-500'}`}>
                          {isToday ? 'Today' : h.day}
                        </span>
                        <div
                          className={`flex h-14 w-full items-center justify-center rounded-lg transition-colors ${getHeatColor(hPct)} ${isToday ? 'ring-2 ring-brand-300 ring-offset-1' : ''}`}
                        >
                          <span className={`text-xs font-bold ${hPct >= 40 ? 'text-white' : 'text-slate-600'}`}>
                            {hHasCap ? `${hPct}%` : hTotal > 0 ? `${hTotal}` : '-'}
                          </span>
                        </div>
                        <div className="text-center leading-tight">
                          {hHasCap ? (
                            <span className="block text-[10px] tabular-nums text-slate-500">
                              {hPeak}/{h.concurrent_cap}
                            </span>
                          ) : hTotal > 0 ? (
                            <span className="block text-[10px] tabular-nums text-slate-500">{hPeak} at once</span>
                          ) : null}
                          <span className="block text-[10px] tabular-nums text-slate-400">
                            {hTotal} cover{hTotal !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-slate-200" /> Quiet
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-brand-300" /> Steady
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-brand-500" /> Busy
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-amber-500" /> Very busy
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-red-500" /> Full
                </span>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">
              {isAppointment ? '7-day appointments' : '7-day covers'}
            </h2>
            <p className="mb-4 mt-1 text-xs text-slate-400">
              {isAppointment ? 'Total appointments booked each day.' : 'Total covers booked each day.'}
            </p>
            <DashboardHomeForecastChart forecast={payload.forecast} isAppointment={isAppointment} />
          </div>
        </div>

        <SectionCard elevated>
          <SectionCard.Header
            eyebrow="Diary"
            title={isAppointment ? "Today's appointments" : "Today's bookings"}
            right={
              <Link
                href={isAppointment ? '/dashboard/bookings' : scheduleHref}
                className="text-xs font-semibold text-brand-600 hover:text-brand-800"
              >
                {isAppointment ? 'View all' : calendarEligible ? 'View calendar' : 'View day sheet'} &rarr;
              </Link>
            }
          />
          <SectionCard.Body className="!px-0 !pb-0 sm:!px-0">
            {payload.recent_bookings.length === 0 ? (
              <div className="px-5 pb-8">
                <EmptyState
                  title={`No ${isAppointment ? 'appointments' : 'bookings'} today`}
                  description={`${isAppointment ? 'Appointments' : 'Bookings'} will appear here as they come in.`}
                />
              </div>
            ) : (
              <StackedList
                items={payload.recent_bookings}
                keyExtractor={(b) => b.id}
                renderDesktopRow={(b) => (
                  <ScheduleRow
                    timeLabel={b.time}
                    title={b.guest_name}
                    subtitle={
                      [!isAppointment ? `${b.party_size} covers` : '', showTypeColumn ? (b.kind_label ?? '') : '']
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                    stripClassName={stripClassForBookingStatus(b.status)}
                    trailing={
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Pill
                          variant={
                            b.status === 'Confirmed'
                              ? 'success'
                              : b.status === 'Booked'
                                ? 'info'
                                : b.status === 'Pending'
                                  ? 'warning'
                                  : b.status === 'Seated'
                                    ? 'brand'
                                    : 'neutral'
                          }
                          size="sm"
                        >
                          {bookingStatusDisplayLabel(b.status, !isAppointment)}
                        </Pill>
                        <Pill variant="neutral" size="sm">
                          {b.deposit_status}
                        </Pill>
                      </div>
                    }
                  />
                )}
                renderMobileCard={(b) => (
                  <ScheduleRow
                    timeLabel={b.time}
                    title={b.guest_name}
                    subtitle={
                      [!isAppointment ? `${b.party_size} covers` : '', showTypeColumn ? (b.kind_label ?? '') : '']
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                    stripClassName={stripClassForBookingStatus(b.status)}
                    trailing={
                      <div className="flex flex-wrap gap-1">
                        <Pill
                          variant={
                            b.status === 'Confirmed'
                              ? 'success'
                              : b.status === 'Booked'
                                ? 'info'
                                : b.status === 'Pending'
                                  ? 'warning'
                                  : b.status === 'Seated'
                                    ? 'brand'
                                    : 'neutral'
                          }
                          size="sm"
                        >
                          {bookingStatusDisplayLabel(b.status, !isAppointment)}
                        </Pill>
                        <Pill variant="neutral" size="sm">
                          {b.deposit_status}
                        </Pill>
                      </div>
                    }
                  />
                )}
              />
            )}
          </SectionCard.Body>
          {payload.recent_bookings.length > 0 && bookings > 10 ? (
            <SectionCard.Footer className="text-center">
              <Link
                href="/dashboard/bookings"
                className="text-xs font-semibold text-brand-600 hover:text-brand-800"
              >
                {bookings - 10} more {isAppointment ? 'appointment' : 'booking'}
                {bookings - 10 !== 1 ? 's' : ''}, view all &rarr;
              </Link>
            </SectionCard.Footer>
          ) : null}
        </SectionCard>
      </div>
    </PageFrame>
  );
}
