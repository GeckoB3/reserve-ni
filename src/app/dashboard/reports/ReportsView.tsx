'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from 'recharts';
import { DataExportSection } from './DataExportSection';
import { ClientsSection, type ClientSummary } from './ClientsSection';
import type { BookingModel, VenueTerminology } from '@/types/booking-models';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { HorizontalScrollHint } from '@/components/ui/HorizontalScrollHint';

interface Report1 {
  total_bookings_created: number;
  by_source: Record<string, number>;
  by_status: Record<string, number>;
  covers_booked: number;
  covers_seated: number;
}

interface Report2Row {
  period_start: string;
  no_show_count: number;
  confirmed_at_time_count: number;
  rate_pct: number;
}

interface Report3 {
  total_bookings_created: number;
  cancelled_guest_initiated: number;
  cancelled_auto: number;
  cancellation_rate_pct: number;
}

interface Report4 {
  total_collected_pence: number;
  total_refunded_pence: number;
  total_forfeited_pence: number;
}

interface AppointmentInsightsPayload {
  by_practitioner: Array<{
    practitioner_id: string;
    practitioner_name: string;
    booking_count: number;
    completed_count: number;
  }>;
  by_service: Array<{
    service_id: string;
    service_name: string;
    booking_count: number;
  }>;
  by_booking_source: Record<string, number>;
}

interface ReportByBookingModelRow {
  booking_model: BookingModel;
  label: string;
  booking_count: number;
  covers: number;
  cancelled_count: number;
  completed_count: number;
  checked_in_count: number;
  deposit_pence_collected: number;
}

interface ReportsData {
  from: string;
  to: string;
  booking_model?: BookingModel;
  table_management_enabled?: boolean;
  report1_booking_summary: Report1 | null;
  report2_no_show_series: Report2Row[];
  report3_cancellation: Report3 | null;
  report4_deposit: Report4 | null;
  report5_table_utilisation?: Array<{
    table_id: string;
    table_name: string;
    utilisation_pct: number;
    occupied_hours: number;
    available_hours: number;
  }>;
  report7_appointment_insights?: AppointmentInsightsPayload | null;
  /** Inferred from booking row FKs - same labels as full export (plan §4.3). */
  report_by_booking_model?: ReportByBookingModelRow[];
  client_summary?: ClientSummary | null;
}

const COLORS = ['#4E6B78', '#059669', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

function last7Days(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

type ExportFlash = { variant: 'success' | 'notice'; message: string };

function formatBookingSourceLabel(source: string): string {
  const map: Record<string, string> = {
    online: 'Online',
    phone: 'Phone',
    'walk-in': 'Walk-in',
    widget: 'Website widget',
    booking_page: 'Booking page',
  };
  return map[source] ?? source;
}

/** Merge raw event source keys onto display labels (matches pie + CSV). */
function aggregateBookingSourcesByLabel(bySource: Record<string, number>): Array<{ name: string; value: number }> {
  const acc = new Map<string, number>();
  for (const [k, v] of Object.entries(bySource)) {
    const label = formatBookingSourceLabel(k);
    acc.set(label, (acc.get(label) ?? 0) + v);
  }
  return [...acc.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

async function fetchReportsJson(url: string): Promise<ReportsData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load');
  return res.json() as Promise<ReportsData>;
}

export interface ReportsViewProps {
  bookingModel: BookingModel;
  terminology: VenueTerminology;
  venueId: string;
}

export function ReportsView({ bookingModel, terminology, venueId }: ReportsViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [range, setRange] = useState(last7Days);
  const [appliedRange, setAppliedRange] = useState(last7Days);
  const reportsUrl = `/api/venue/reports?from=${appliedRange.from}&to=${appliedRange.to}`;
  const {
    data,
    error: swrError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(reportsUrl, fetchReportsJson, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    keepPreviousData: true,
  });
  const error = swrError ? (swrError instanceof Error ? swrError.message : 'Error') : null;
  const [exportFlash, setExportFlash] = useState<ExportFlash | null>(null);
  const activeTab = searchParams.get('tab') === 'clients' ? 'clients' : 'overview';

  const setActiveTab = useCallback(
    (tab: 'overview' | 'clients') => {
      const p = new URLSearchParams(searchParams.toString());
      if (tab === 'clients') p.set('tab', 'clients');
      else p.delete('tab');
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const dismissExportFlashSoon = useCallback(() => {
    window.setTimeout(() => setExportFlash(null), 4500);
  }, []);

  const notifyExport = useCallback(
    (variant: ExportFlash['variant'], message: string) => {
      setExportFlash({ variant, message });
      dismissExportFlashSoon();
    },
    [dismissExportFlashSoon],
  );

  const applyRange = useCallback(() => {
    setAppliedRange(range);
  }, [range]);

  const exportReportByModel = useCallback(() => {
    const rows = data?.report_by_booking_model ?? [];
    if (rows.length === 0) return;
    downloadCsv(`report-by-booking-type-${data!.from}-${data!.to}.csv`, [
      [
        'Booking type',
        'Bookings',
        'Covers',
        'Cancelled',
        'Completed',
        'Checked in',
        'Deposit collected (£)',
      ],
      ...rows.map((row: ReportByBookingModelRow) => [
        row.label,
        String(row.booking_count),
        String(row.covers),
        String(row.cancelled_count),
        String(row.completed_count),
        String(row.checked_in_count),
        (row.deposit_pence_collected / 100).toFixed(2),
      ]),
    ]);
  }, [data]);

  const exportReport1 = useCallback(() => {
    if (!data?.report1_booking_summary) return;
    const r = data.report1_booking_summary;
    const model = (data.booking_model as BookingModel | undefined) ?? bookingModel;
    const appt = isUnifiedSchedulingVenue(model);
    downloadCsv(`report1-booking-summary-${data.from}-${data.to}.csv`, [
      ['Metric', 'Value'],
      [
        appt ? `${terminology.booking}s created in period` : 'Total bookings created',
        String(r.total_bookings_created),
      ],
      [
        appt
          ? `Total ${terminology.client.toLowerCase()} places booked (headcount)`
          : 'Covers booked',
        String(r.covers_booked),
      ],
      [
        appt
          ? `${terminology.client}s arrived, seated, or completed (headcount)`
          : 'Covers seated',
        String(r.covers_seated),
      ],
      ['By source (created)', ''],
      ...aggregateBookingSourcesByLabel(r.by_source).map(({ name, value }) => [name, String(value)]),
      ['By status', ''],
      ...Object.entries(r.by_status).map(([k, v]) => [k, String(v)]),
    ]);
  }, [data, bookingModel, terminology]);

  const exportReport2 = useCallback(() => {
    if (!data?.report2_no_show_series?.length) return;
    const model = (data.booking_model as BookingModel | undefined) ?? bookingModel;
    const appt = isUnifiedSchedulingVenue(model);
    const headerRow = appt
      ? ['Date', 'No-shows', 'Attended or no-show (count)', 'Rate %']
      : ['Date', 'No-shows', 'Denominator', 'Rate %'];
    downloadCsv(`report2-no-show-rate-${data.from}-${data.to}.csv`, [
      headerRow,
      ...data.report2_no_show_series.map((row) => [row.period_start, String(row.no_show_count), String(row.confirmed_at_time_count), String(row.rate_pct)]),
    ]);
  }, [data, bookingModel]);

  const exportReport3 = useCallback(() => {
    if (!data?.report3_cancellation) return;
    const r = data.report3_cancellation;
    const model = (data.booking_model as BookingModel | undefined) ?? bookingModel;
    const appt = isUnifiedSchedulingVenue(model);
    downloadCsv(`report3-cancellation-${data.from}-${data.to}.csv`, [
      ['Metric', 'Value'],
      [
        appt ? `${terminology.booking}s created in period` : 'Total bookings created',
        String(r.total_bookings_created),
      ],
      [
        appt
          ? `Cancelled (${terminology.client.toLowerCase()}-initiated)`
          : 'Cancelled (guest-initiated)',
        String(r.cancelled_guest_initiated),
      ],
      ['Cancelled (auto)', String(r.cancelled_auto)],
      ['Cancellation rate %', String(r.cancellation_rate_pct)],
    ]);
  }, [data, bookingModel, terminology]);

  const exportReport4 = useCallback(() => {
    if (!data?.report4_deposit) return;
    const r = data.report4_deposit;
    downloadCsv(`report4-deposit-${data.from}-${data.to}.csv`, [
      ['Metric', 'Pence', 'GBP'],
      ['Total collected', String(r.total_collected_pence), (r.total_collected_pence / 100).toFixed(2)],
      ['Total refunded', String(r.total_refunded_pence), (r.total_refunded_pence / 100).toFixed(2)],
      ['Total forfeited', String(r.total_forfeited_pence), (r.total_forfeited_pence / 100).toFixed(2)],
    ]);
  }, [data]);

  const exportReport5 = useCallback(() => {
    if (!data?.report5_table_utilisation?.length) return;
    downloadCsv(`report5-table-utilisation-${data.from}-${data.to}.csv`, [
      ['Table', 'Utilisation %', 'Occupied hours', 'Available hours'],
      ...data.report5_table_utilisation.map((row) => [
        row.table_name,
        String(row.utilisation_pct),
        String(row.occupied_hours),
        String(row.available_hours),
      ]),
    ]);
  }, [data]);

  const exportReport7 = useCallback(() => {
    if (!data?.report7_appointment_insights) return;
    const r = data.report7_appointment_insights;
    const bookingPlural = `${terminology.booking}s`;
    downloadCsv(`report7-appointment-insights-${data.from}-${data.to}.csv`, [
      [terminology.staff, bookingPlural, 'Arrived or completed'],
      ...r.by_practitioner.map((row) => [
        row.practitioner_name,
        String(row.booking_count),
        String(row.completed_count),
      ]),
      [],
      ['Service', bookingPlural],
      ...r.by_service.map((row) => [row.service_name, String(row.booking_count)]),
      [],
      ['Channel', `${bookingPlural} in period`],
      ...aggregateBookingSourcesByLabel(r.by_booking_source).map(({ name, value }) => [name, String(value)]),
    ]);
  }, [data, terminology]);

  if (isLoading && !data) {
    return (
      <div className="space-y-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <p className="text-red-600">{error}</p>
        <button type="button" onClick={() => void mutate()} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">Retry</button>
      </div>
    );
  }

  const r1 = data?.report1_booking_summary;
  const r2 = data?.report2_no_show_series ?? [];
  const r3 = data?.report3_cancellation;
  const r4 = data?.report4_deposit;
  const r5 = data?.report5_table_utilisation ?? [];
  const r7 = data?.report7_appointment_insights;
  const rByModel = data?.report_by_booking_model ?? [];
  const byModelBarData = rByModel.map((row) => ({
    name: row.label,
    bookings: row.booking_count,
    covers: row.covers,
  }));

  const resolvedBookingModel =
    (data?.booking_model as BookingModel | undefined) ?? bookingModel;
  const isAppointment = isUnifiedSchedulingVenue(resolvedBookingModel);
  const client = terminology.client;
  const clientLower = client.toLowerCase();
  const bookingWord = terminology.booking;
  const staffWord = terminology.staff;

  const sourcePieData = r1?.by_source ? aggregateBookingSourcesByLabel(r1.by_source) : [];
  const statusBarData = r1?.by_status ? Object.entries(r1.by_status).map(([source, count]) => ({ source, count })) : [];
  const noShowRateOverall = r2.length > 0
    ? (r2.reduce((a, d) => a + d.no_show_count, 0) / Math.max(1, r2.reduce((a, d) => a + d.confirmed_at_time_count, 0))) * 100
    : 0;

  const pracPerformanceData = (r7?.by_practitioner ?? []).map((row) => ({
    key: row.practitioner_id,
    shortName:
      row.practitioner_name.length > 20
        ? `${row.practitioner_name.slice(0, 18)}…`
        : row.practitioner_name,
    fullName: row.practitioner_name,
    bookings: row.booking_count,
    completed: row.completed_count,
  }));

  const svcVolumeData = (r7?.by_service ?? []).map((row) => ({
    key: row.service_id,
    name:
      row.service_name.length > 28
        ? `${row.service_name.slice(0, 26)}…`
        : row.service_name,
    fullName: row.service_name,
    count: row.booking_count,
  }));

  const channelPieData = r7?.by_booking_source ? aggregateBookingSourcesByLabel(r7.by_booking_source) : [];

  const hasAppointmentInsights =
    pracPerformanceData.length > 0 || svcVolumeData.length > 0 || channelPieData.length > 0;

  return (
    <div className="space-y-6">
      {exportFlash && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm ${
            exportFlash.variant === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {exportFlash.message}
        </div>
      )}

      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full max-w-md rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-max">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              activeTab === 'overview'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('clients')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              activeTab === 'clients'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {terminology.client}s
          </button>
        </div>
      </div>

      {/* Date range controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-600">From</span>
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-600">To</span>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={applyRange}
          disabled={isValidating}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isValidating ? 'Loading...' : 'Apply'}
        </button>
      </div>

      {activeTab === 'clients' && data ? (
        <ClientsSection
          venueId={venueId}
          terminology={terminology}
          bookingModel={resolvedBookingModel}
          clientSummary={data.client_summary ?? null}
          rangeLabel={`${data.from} → ${data.to}`}
          onReportsRefresh={() => void mutate()}
        />
      ) : null}

      {activeTab === 'overview' && (
        <>
      {/* Report 1 */}
      <ReportSection
        title={isAppointment ? 'Appointment activity' : 'Booking summary'}
        onExport={exportReport1}
        exportBlocked={!r1}
        exportBlockedMessage={
          isAppointment
            ? 'There is no appointment activity to export for this period.'
            : 'There is no booking summary to export for this period.'
        }
        onExportSuccess={() =>
          notifyExport(
            'success',
            `${isAppointment ? 'Appointment activity' : 'Booking summary'} CSV download started - check your downloads folder.`,
          )
        }
        onExportBlocked={(msg) => notifyExport('notice', msg)}
      >
        {r1 && (
          <>
            {isAppointment && (
              <p className="mb-4 text-sm text-slate-500">
                Headcount comes from party size on each {bookingWord.toLowerCase()}: the middle figure is total{' '}
                <strong>{clientLower} places</strong> booked in range (each person in a group counts once). The
                right-hand figure is how many of those places reached arrived, seated, or completed status.
              </p>
            )}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard
                label={isAppointment ? `${bookingWord}s created` : `Total ${bookingWord.toLowerCase()}s`}
                value={String(r1.total_bookings_created)}
                accent="teal"
              />
              <MetricCard
                label={
                  isAppointment
                    ? `${client} places booked`
                    : 'Covers booked'
                }
                value={String(r1.covers_booked)}
                accent="teal"
              />
              <MetricCard
                label={
                  isAppointment
                    ? `${client}s seen (arrived / completed)`
                    : 'Covers seated'
                }
                value={String(r1.covers_seated)}
                accent="emerald"
              />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="h-64">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {isAppointment ? 'How they booked (when created)' : 'By source (when created)'}
                </p>
                {sourcePieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sourcePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => `${e.name}: ${e.value}`}>
                        {sourcePieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-slate-400">No data</p>}
              </div>
              <div className="h-64">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {isAppointment ? 'Appointment status (latest)' : 'By status (latest)'}
                </p>
                {statusBarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#4E6B78" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-slate-400">No data</p>}
              </div>
            </div>
          </>
        )}
      </ReportSection>

      <ReportSection
        title="By booking type"
        onExport={exportReportByModel}
        exportBlocked={rByModel.length === 0}
        exportBlockedMessage="There are no bookings in this date range to break down by type."
        onExportSuccess={() =>
          notifyExport('success', 'Booking type breakdown CSV download started - check your downloads folder.')
        }
        onExportBlocked={(msg) => notifyExport('notice', msg)}
      >
        <p className="mb-4 text-sm text-slate-500">
          Rows are inferred from each booking (tables, appointments, events, classes, resources). Deposits are
          sums where deposit status is Paid. Checked in uses door check-in when recorded.
        </p>
        {rByModel.length === 0 ? (
          <p className="text-sm text-slate-400">No bookings in this date range.</p>
        ) : (
          <>
            <div className="mb-6 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byModelBarData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="bookings" name="Bookings" fill="#4E6B78" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="covers" name="Covers" fill="#059669" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <HorizontalScrollHint />
            <div className="touch-pan-x overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-3 py-2 font-semibold text-slate-700">Type</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Bookings</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Covers</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Cancelled</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Completed</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Checked in</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Deposits paid</th>
                  </tr>
                </thead>
                <tbody>
                  {rByModel.map((row: ReportByBookingModelRow) => (
                    <tr key={row.booking_model} className="border-b border-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                      <td className="px-3 py-2 text-slate-700">{row.booking_count}</td>
                      <td className="px-3 py-2 text-slate-700">{row.covers}</td>
                      <td className="px-3 py-2 text-slate-700">{row.cancelled_count}</td>
                      <td className="px-3 py-2 text-slate-700">{row.completed_count}</td>
                      <td className="px-3 py-2 text-slate-700">{row.checked_in_count}</td>
                      <td className="px-3 py-2 text-slate-700">
                        £{(row.deposit_pence_collected / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </ReportSection>

      {isAppointment && (
        <ReportSection
          title="Team, services & channels"
          onExport={exportReport7}
          exportBlocked={!hasAppointmentInsights}
          exportBlockedMessage="There is no appointment breakdown to export for this period."
          onExportSuccess={() =>
            notifyExport('success', 'Team & services report CSV download started - check your downloads folder.')
          }
          onExportBlocked={(msg) => notifyExport('notice', msg)}
        >
          <p className="mb-4 text-sm text-slate-500">
            Non-cancelled {bookingWord.toLowerCase()}s in this date range: volume by {staffWord.toLowerCase()},
            by service, and booking source (online, phone, widget, and other channels).
          </p>
          {!r7 || (pracPerformanceData.length === 0 && svcVolumeData.length === 0 && channelPieData.length === 0) ? (
            <p className="text-sm text-slate-400">
              No appointment data in this range yet. After {bookingWord.toLowerCase()}s are created, you will see
              performance by {staffWord.toLowerCase()} and service here.
            </p>
          ) : (
            <div className="space-y-8">
              {pracPerformanceData.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    By {staffWord.toLowerCase()}
                  </p>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pracPerformanceData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="shortName" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip formatter={(value: number, name: string) => [value, name]} />
                        <Legend />
                        <Bar dataKey="bookings" name={`${bookingWord}s`} fill="#4E6B78" radius={[6, 6, 0, 0]} />
                        <Bar
                          dataKey="completed"
                          name="Arrived or completed"
                          fill="#059669"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {svcVolumeData.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Top services by volume
                  </p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={svcVolumeData}
                        margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={120}
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip formatter={(value: number) => [value, `${bookingWord}s`]} />
                        <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} name={`${bookingWord}s`} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {channelPieData.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    How {clientLower}s booked (channel mix)
                  </p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={channelPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={88}
                          label={(e) => `${e.name}: ${e.value}`}
                        >
                          {channelPieData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </ReportSection>
      )}

      {/* Report 2 */}
      <ReportSection
        title="No-show rate"
        onExport={exportReport2}
        exportBlocked={r2.length === 0}
        exportBlockedMessage="There is no no-show rate data to export for this period."
        onExportSuccess={() => notifyExport('success', 'No-show rate CSV download started - check your downloads folder.')}
        onExportBlocked={(msg) => notifyExport('notice', msg)}
      >
        {isAppointment && (
          <p className="mb-3 text-sm text-slate-500">
            {client}s who confirmed an online {bookingWord.toLowerCase()} but did not attend (walk-ins excluded from
            the denominator). Use this to track reliability and follow-up.
          </p>
        )}
        <p className="mb-3 text-sm text-slate-500">
          Overall: <span className="font-semibold text-slate-900">{noShowRateOverall.toFixed(1)}%</span>
        </p>
        {r2.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={r2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="period_start" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value: number) => [`${value}%`, 'Rate']} />
                <Line type="monotone" dataKey="rate_pct" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="No-show %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-slate-400">No data for this period</p>}
      </ReportSection>

      {/* Report 3 */}
      <ReportSection
        title="Cancellation rate"
        onExport={exportReport3}
        exportBlocked={!r3}
        exportBlockedMessage="There is no cancellation data to export for this period."
        onExportSuccess={() => notifyExport('success', 'Cancellation rate CSV download started - check your downloads folder.')}
        onExportBlocked={(msg) => notifyExport('notice', msg)}
      >
        {r3 && (
          <>
            {isAppointment && (
              <p className="mb-3 text-sm text-slate-500">
                Auto (unpaid) counts {bookingWord.toLowerCase()}s that moved from Pending to Cancelled - for example
                when a required deposit was not completed in time.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label={isAppointment ? `${bookingWord}s created` : 'Total created'}
              value={String(r3.total_bookings_created)}
            />
            <MetricCard
              label={isAppointment ? `${client}-initiated` : 'Guest-initiated'}
              value={String(r3.cancelled_guest_initiated)}
            />
            <MetricCard label="Auto (unpaid)" value={String(r3.cancelled_auto)} />
            <MetricCard label="Cancellation rate" value={`${r3.cancellation_rate_pct}%`} accent={r3.cancellation_rate_pct > 10 ? 'red' : 'emerald'} />
            </div>
          </>
        )}
      </ReportSection>

      {/* Report 4 */}
      <ReportSection
        title={isAppointment ? 'Payments & deposits' : 'Deposit summary'}
        onExport={exportReport4}
        exportBlocked={!r4}
        exportBlockedMessage={
          isAppointment ? 'There is no payment summary to export for this period.' : 'There is no deposit summary to export for this period.'
        }
        onExportSuccess={() =>
          notifyExport(
            'success',
            `${isAppointment ? 'Payment' : 'Deposit'} summary CSV download started - check your downloads folder.`,
          )
        }
        onExportBlocked={(msg) => notifyExport('notice', msg)}
      >
        {r4 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="Total collected" value={`£${(r4.total_collected_pence / 100).toFixed(2)}`} accent="emerald" />
            <MetricCard label="Total refunded" value={`£${(r4.total_refunded_pence / 100).toFixed(2)}`} accent="amber" />
            <MetricCard label="Total forfeited" value={`£${(r4.total_forfeited_pence / 100).toFixed(2)}`} accent="red" />
          </div>
        )}
      </ReportSection>

      {!isAppointment && data?.table_management_enabled && (
        <ReportSection
          title="Table utilisation"
          onExport={exportReport5}
          exportBlocked={r5.length === 0}
          exportBlockedMessage="There is no table utilisation data to export for this period."
          onExportSuccess={() => notifyExport('success', 'Table utilisation CSV download started - check your downloads folder.')}
          onExportBlocked={(msg) => notifyExport('notice', msg)}
        >
          {r5.length > 0 ? (
            <div className="space-y-2">
              {r5.map((row) => (
                <div key={row.table_id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-800">{row.table_name}</p>
                    <p className={`text-sm font-semibold ${
                      row.utilisation_pct < 50 ? 'text-amber-700' : row.utilisation_pct > 90 ? 'text-emerald-700' : 'text-slate-700'
                    }`}>
                      {row.utilisation_pct}%
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className={`h-2 rounded-full ${
                        row.utilisation_pct < 50 ? 'bg-amber-500' : row.utilisation_pct > 90 ? 'bg-emerald-500' : 'bg-brand-500'
                      }`}
                      style={{ width: `${Math.min(100, row.utilisation_pct)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {row.occupied_hours}h occupied / {row.available_hours}h available
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No table utilisation data for this range.</p>
          )}
        </ReportSection>
      )}

      <DataExportSection
        onExportFlash={notifyExport}
        isAppointment={isAppointment}
        clientLabel={client}
        bookingWord={bookingWord}
      />
        </>
      )}
    </div>
  );
}

function ReportSection({
  title,
  onExport,
  exportBlocked,
  exportBlockedMessage,
  onExportSuccess,
  onExportBlocked,
  children,
}: {
  title: string;
  onExport: () => void;
  exportBlocked?: boolean;
  exportBlockedMessage?: string;
  onExportSuccess: () => void;
  onExportBlocked: (message: string) => void;
  children: React.ReactNode;
}) {
  const blocked = Boolean(exportBlocked);
  const blockedHint = exportBlockedMessage ?? 'Nothing to export for this report.';

  const handleExportClick = () => {
    if (blocked) {
      onExportBlocked(blockedHint);
      return;
    }
    onExport();
    onExportSuccess();
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={handleExportClick}
          title={blocked ? blockedHint : 'Download this report as a CSV file'}
          aria-label={blocked ? `Export CSV: ${blockedHint}` : 'Export CSV'}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
            blocked
              ? 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              : 'text-brand-600 hover:bg-brand-50 hover:text-brand-700'
          }`}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </button>
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const colorMap: Record<string, string> = {
    teal: 'border-l-brand-500',
    emerald: 'border-l-emerald-500',
    red: 'border-l-red-500',
    amber: 'border-l-amber-500',
  };
  return (
    <div className={`rounded-lg border border-slate-100 bg-slate-50/50 p-3 ${accent ? `border-l-4 ${colorMap[accent] ?? ''}` : ''}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
