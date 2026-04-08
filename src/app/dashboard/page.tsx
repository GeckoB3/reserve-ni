'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SetupChecklist } from './SetupChecklist';
import { DashboardStatCard } from '@/components/dashboard/DashboardStatCard';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import {
  activeModelsToLegacyEnabledModels,
  getDefaultBookingModelFromActive,
  resolveActiveBookingModels,
} from '@/lib/booking/active-models';
import { isVenueScheduleCalendarEligible } from '@/lib/booking/schedule-calendar-eligibility';
import { bookingModelShortLabel, bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import type { BookingModel } from '@/types/booking-models';

interface DashboardData {
  booking_model?: string;
  active_booking_models?: unknown;
  enabled_models?: unknown;
  today_by_booking_model?: Record<string, number>;
  today: {
    covers: number;
    bookings: number;
    confirmed: number;
    pending: number;
    seated: number;
    revenue: number;
    next_booking: { time: string; party_size: number } | null;
    peak_in_house_covers: number;
    concurrent_cap: number | null;
    peak_fill_percent: number | null;
    covers_in_house_now: number;
    arriving_within_30_min: number;
  };
  forecast: Array<{ date: string; day: string; covers: number; bookings: number }>;
  heatmap: Array<{
    date: string;
    day: string;
    daily_total_covers: number;
    peak_in_house_covers: number;
    concurrent_cap: number | null;
    fill_percent: number | null;
  }>;
  alerts: Array<{ type: string; message: string }>;
  recent_bookings: Array<{
    id: string;
    time: string;
    party_size: number;
    status: string;
    guest_name: string;
    deposit_status: string;
    kind_label?: string;
    booking_model?: string;
  }>;
}

/** Safely read a numeric value, treating null / undefined / NaN as 0. */
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

function getStatusBadge(status: string) {
  switch (status) {
    case 'Confirmed':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    case 'Seated':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'Pending':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    default:
      return 'bg-slate-50 text-slate-600 ring-slate-500/20';
  }
}

function getDepositBadge(status: string) {
  switch (status) {
    case 'Paid':
      return 'bg-emerald-50 text-emerald-700';
    case 'Pending':
      return 'bg-amber-50 text-amber-700';
    case 'Waived':
      return 'bg-blue-50 text-blue-700';
    case 'Refunded':
      return 'bg-violet-50 text-violet-700';
    case 'Not Required':
      return 'bg-slate-50 text-slate-500';
    default:
      return 'bg-slate-50 text-slate-400';
  }
}

function formatGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatTodayDate(): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export default function DashboardHomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/venue/dashboard-home');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="text-sm text-slate-400">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-700">Unable to load dashboard</p>
        <p className="mt-1 text-xs text-slate-500">Please try refreshing the page.</p>
      </div>
    );
  }

  const t = data.today;
  const activeModels = resolveActiveBookingModels({
    bookingModel: data.booking_model as BookingModel | undefined,
    enabledModels: data.enabled_models,
    activeBookingModels: data.active_booking_models,
  });
  const primaryModel = getDefaultBookingModelFromActive(
    activeModels,
    (data.booking_model as BookingModel) ?? 'table_reservation',
  );
  const enabledNorm = activeModelsToLegacyEnabledModels(activeModels, primaryModel);
  const isAppointment = isUnifiedSchedulingVenue(primaryModel);
  const calendarEligible = isVenueScheduleCalendarEligible(primaryModel, enabledNorm);
  const scheduleHref = calendarEligible ? '/dashboard/calendar' : '/dashboard/day-sheet';
  const hasSecondaryModels = enabledNorm.length > 0;
  const showTypeColumn =
    hasSecondaryModels || Object.keys(data.today_by_booking_model ?? {}).length > 1;
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

  return (
    <div className="p-5 lg:p-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{formatGreeting()}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{formatTodayDate()}</p>
        </div>
        <div className="flex gap-2 mt-2 sm:mt-0">
          <Link
            href={scheduleHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            {calendarEligible ? 'Calendar' : 'Day sheet'}
          </Link>
          <Link
            href="/dashboard/bookings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            {isAppointment ? 'All appointments' : 'All bookings'}
          </Link>
        </div>
      </div>

      <SetupChecklist />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardStatCard
          label={isAppointment ? 'Appointments today' : 'Covers today'}
          value={isAppointment ? bookings : covers}
          color="blue"
          subValue={isAppointment
            ? (bookings > 0 ? `${confirmed} confirmed` : 'no appointments yet')
            : (bookings > 0 ? `across ${bookings} booking${bookings !== 1 ? 's' : ''}` : 'no bookings yet')
          }
        />
        <DashboardStatCard
          label="Confirmed"
          value={confirmed}
          color="emerald"
          subValue={
            (pending > 0 || seated > 0)
              ? [seated > 0 ? `${seated} seated` : '', pending > 0 ? `${pending} pending` : ''].filter(Boolean).join(', ')
              : undefined
          }
        />
        <DashboardStatCard
          label="Deposit revenue"
          value={`£${revenue.toFixed(2)}`}
          color="emerald"
        />
        <DashboardStatCard
          label="Next up"
          value={t.next_booking ? t.next_booking.time : '-'}
          color="amber"
          subValue={t.next_booking ? (isAppointment ? 'next appointment' : `party of ${t.next_booking.party_size}`) : (isAppointment ? 'no upcoming appointments' : 'no upcoming bookings')}
        />
      </div>

      {data.today_by_booking_model && Object.keys(data.today_by_booking_model).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today by booking type</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(data.today_by_booking_model).map(([k, count]) => (
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

      {/* Today's Capacity (hidden for appointments) */}
      {!isAppointment && <div className="rounded-xl border border-slate-200 bg-white p-5">
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
              <p className="mt-2 text-xs text-slate-500">
                Busiest time: {peakCovers} covers expected at once
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                No bookings yet - capacity will appear as bookings come in.
              </p>
            )}

            {/* Progress bar */}
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

          {/* In-house / Arriving soon */}
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
      </div>}

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
              alert.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
            }`}>
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

      {/* 7-Day outlook */}
      <div className={`grid gap-5 ${isAppointment ? 'lg:grid-cols-1' : 'lg:grid-cols-2'}`}>
        {/* Heatmap (hidden for appointments) */}
        {!isAppointment && <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">7-day capacity outlook</h2>
          <p className="mb-4 mt-1 text-xs text-slate-400">
            How full each day gets at its busiest time.
          </p>
          <div className="flex gap-2">
            {data.heatmap.map((h, idx) => {
              const hPeak = n(h.peak_in_house_covers);
              const hTotal = n(h.daily_total_covers);
              const hPct = n(h.fill_percent);
              const isToday = idx === 0;
              const hHasCap = h.concurrent_cap != null;
              return (
                <div key={h.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className={`text-xs font-medium ${isToday ? 'text-brand-600' : 'text-slate-500'}`}>
                    {isToday ? 'Today' : h.day}
                  </span>
                  <div className={`flex h-14 w-full items-center justify-center rounded-lg transition-colors ${getHeatColor(hPct)} ${isToday ? 'ring-2 ring-brand-300 ring-offset-1' : ''}`}>
                    <span className={`text-xs font-bold ${hPct >= 40 ? 'text-white' : 'text-slate-600'}`}>
                      {hHasCap ? `${hPct}%` : (hTotal > 0 ? `${hTotal}` : '-')}
                    </span>
                  </div>
                  <div className="text-center leading-tight">
                    {hHasCap ? (
                      <span className="block text-[10px] tabular-nums text-slate-500">
                        {hPeak}/{h.concurrent_cap}
                      </span>
                    ) : hTotal > 0 ? (
                      <span className="block text-[10px] tabular-nums text-slate-500">
                        {hPeak} at once
                      </span>
                    ) : null}
                    <span className="block text-[10px] tabular-nums text-slate-400">
                      {hTotal} cover{hTotal !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-200" /> Quiet</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-300" /> Steady</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-500" /> Busy</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500" /> Very busy</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" /> Full</span>
          </div>
        </div>}

        {/* Forecast chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">{isAppointment ? '7-day appointments' : '7-day covers'}</h2>
          <p className="mb-4 mt-1 text-xs text-slate-400">{isAppointment ? 'Total appointments booked each day.' : 'Total covers booked each day.'}</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.forecast} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '0.75rem',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                  formatter={(value: number) => [isAppointment ? `${value} appointments` : `${value} covers`, isAppointment ? 'Appointments' : 'Covers']}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey={isAppointment ? 'bookings' : 'covers'} fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Today's Bookings */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-700">{isAppointment ? "Today's appointments" : "Today's bookings"}</h2>
          <Link
            href={isAppointment ? '/dashboard/bookings' : scheduleHref}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            {isAppointment ? 'View all' : calendarEligible ? 'View calendar' : 'View day sheet'} &rarr;
          </Link>
        </div>

        {data.recent_bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">No {isAppointment ? 'appointments' : 'bookings'} today</p>
            <p className="mt-1 text-xs text-slate-400">{isAppointment ? 'Appointments' : 'Bookings'} will appear here as they come in.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="whitespace-nowrap px-5 py-2.5 text-left text-xs font-medium text-slate-500">Time</th>
                  <th className="whitespace-nowrap px-5 py-2.5 text-left text-xs font-medium text-slate-500">{isAppointment ? 'Client' : 'Guest'}</th>
                  {!isAppointment && <th className="whitespace-nowrap px-5 py-2.5 text-left text-xs font-medium text-slate-500">Covers</th>}
                  {showTypeColumn && (
                    <th className="whitespace-nowrap px-5 py-2.5 text-left text-xs font-medium text-slate-500">Type</th>
                  )}
                  <th className="whitespace-nowrap px-5 py-2.5 text-left text-xs font-medium text-slate-500">Status</th>
                  <th className="whitespace-nowrap px-5 py-2.5 text-left text-xs font-medium text-slate-500">Deposit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.recent_bookings.map((b) => (
                  <tr key={b.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-5 py-3 font-medium tabular-nums text-slate-800">{b.time}</td>
                    <td className="max-w-[180px] truncate px-5 py-3 text-slate-700" title={b.guest_name}>{b.guest_name}</td>
                    {!isAppointment && <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-600">{b.party_size}</td>}
                    {showTypeColumn && (
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-600">{b.kind_label ?? '-'}</td>
                    )}
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${getStatusBadge(b.status)}`}>
                        {bookingStatusDisplayLabel(b.status, !isAppointment)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${getDepositBadge(b.deposit_status)}`}>
                        {b.deposit_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.recent_bookings.length > 0 && bookings > 10 && (
          <div className="border-t border-slate-100 px-5 py-3 text-center">
            <Link
              href="/dashboard/bookings"
              className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              {bookings - 10} more {isAppointment ? 'appointment' : 'booking'}{bookings - 10 !== 1 ? 's' : ''} - view all &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
