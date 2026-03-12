'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from 'recharts';

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

interface ReportsData {
  from: string;
  to: string;
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

export function ReportsView() {
  const [range, setRange] = useState(last7Days);
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/venue/reports?from=${range.from}&to=${range.to}`);
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const exportReport1 = useCallback(() => {
    if (!data?.report1_booking_summary) return;
    const r = data.report1_booking_summary;
    downloadCsv(`report1-booking-summary-${data.from}-${data.to}.csv`, [
      ['Metric', 'Value'],
      ['Total bookings created', String(r.total_bookings_created)],
      ['Covers booked', String(r.covers_booked)],
      ['Covers seated', String(r.covers_seated)],
      ['By source', ''],
      ...Object.entries(r.by_source).map(([k, v]) => [k, String(v)]),
      ['By status', ''],
      ...Object.entries(r.by_status).map(([k, v]) => [k, String(v)]),
    ]);
  }, [data]);

  const exportReport2 = useCallback(() => {
    if (!data?.report2_no_show_series?.length) return;
    downloadCsv(`report2-no-show-rate-${data.from}-${data.to}.csv`, [
      ['Date', 'No-shows', 'Denominator', 'Rate %'],
      ...data.report2_no_show_series.map((row) => [row.period_start, String(row.no_show_count), String(row.confirmed_at_time_count), String(row.rate_pct)]),
    ]);
  }, [data]);

  const exportReport3 = useCallback(() => {
    if (!data?.report3_cancellation) return;
    const r = data.report3_cancellation;
    downloadCsv(`report3-cancellation-${data.from}-${data.to}.csv`, [
      ['Metric', 'Value'],
      ['Total bookings created', String(r.total_bookings_created)],
      ['Cancelled (guest-initiated)', String(r.cancelled_guest_initiated)],
      ['Cancelled (auto)', String(r.cancelled_auto)],
      ['Cancellation rate %', String(r.cancellation_rate_pct)],
    ]);
  }, [data]);

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

  if (loading && !data) {
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
        <button type="button" onClick={fetchReports} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">Retry</button>
      </div>
    );
  }

  const r1 = data?.report1_booking_summary;
  const r2 = data?.report2_no_show_series ?? [];
  const r3 = data?.report3_cancellation;
  const r4 = data?.report4_deposit;
  const r5 = data?.report5_table_utilisation ?? [];

  const sourcePieData = r1?.by_source ? Object.entries(r1.by_source).map(([name, value]) => ({ name, value })) : [];
  const statusBarData = r1?.by_status ? Object.entries(r1.by_status).map(([source, count]) => ({ source, count })) : [];
  const noShowRateOverall = r2.length > 0
    ? (r2.reduce((a, d) => a + d.no_show_count, 0) / Math.max(1, r2.reduce((a, d) => a + d.confirmed_at_time_count, 0))) * 100
    : 0;

  return (
    <div className="space-y-6">
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
          onClick={fetchReports}
          disabled={loading}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Apply'}
        </button>
      </div>

      {/* Report 1 */}
      <ReportSection title="Booking Summary" onExport={exportReport1}>
        {r1 && (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard label="Total bookings" value={String(r1.total_bookings_created)} accent="teal" />
              <MetricCard label="Covers booked" value={String(r1.covers_booked)} accent="teal" />
              <MetricCard label="Covers seated" value={String(r1.covers_seated)} accent="emerald" />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="h-64">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">By source</p>
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
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">By status</p>
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

      {/* Report 2 */}
      <ReportSection title="No-Show Rate" onExport={exportReport2}>
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
      <ReportSection title="Cancellation Rate" onExport={exportReport3}>
        {r3 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Total created" value={String(r3.total_bookings_created)} />
            <MetricCard label="Guest-initiated" value={String(r3.cancelled_guest_initiated)} />
            <MetricCard label="Auto (unpaid)" value={String(r3.cancelled_auto)} />
            <MetricCard label="Cancellation rate" value={`${r3.cancellation_rate_pct}%`} accent={r3.cancellation_rate_pct > 10 ? 'red' : 'emerald'} />
          </div>
        )}
      </ReportSection>

      {/* Report 4 */}
      <ReportSection title="Deposit Summary" onExport={exportReport4}>
        {r4 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="Total collected" value={`£${(r4.total_collected_pence / 100).toFixed(2)}`} accent="emerald" />
            <MetricCard label="Total refunded" value={`£${(r4.total_refunded_pence / 100).toFixed(2)}`} accent="amber" />
            <MetricCard label="Total forfeited" value={`£${(r4.total_forfeited_pence / 100).toFixed(2)}`} accent="red" />
          </div>
        )}
      </ReportSection>

      {data?.table_management_enabled && (
        <ReportSection title="Table Utilisation" onExport={exportReport5}>
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
    </div>
  );
}

function ReportSection({ title, onExport, children }: { title: string; onExport: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <button type="button" onClick={onExport} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
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
