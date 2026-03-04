'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
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
  report1_booking_summary: Report1 | null;
  report2_no_show_series: Report2Row[];
  report3_cancellation: Report3 | null;
  report4_deposit: Report4 | null;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

function last7Days(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
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
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

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
      ...data.report2_no_show_series.map((row) => [
        row.period_start,
        String(row.no_show_count),
        String(row.confirmed_at_time_count),
        String(row.rate_pct),
      ]),
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

  if (loading && !data) {
    return <div className="rounded-lg bg-white p-8 text-center text-neutral-500">Loading reports…</div>;
  }
  if (error) {
    return (
      <div className="rounded-lg bg-white p-8 text-center">
        <p className="text-red-600">{error}</p>
        <button type="button" onClick={fetchReports} className="mt-2 text-blue-600 underline">Retry</button>
      </div>
    );
  }

  const r1 = data?.report1_booking_summary;
  const r2 = data?.report2_no_show_series ?? [];
  const r3 = data?.report3_cancellation;
  const r4 = data?.report4_deposit;

  const sourcePieData = r1?.by_source ? Object.entries(r1.by_source).map(([name, value]) => ({ name, value })) : [];
  const statusBarData = r1?.by_status ? Object.entries(r1.by_status).map(([source, count]) => ({ source, count })) : [];

  const noShowRateOverall = r2.length > 0
    ? (r2.reduce((a, d) => a + d.no_show_count, 0) / Math.max(1, r2.reduce((a, d) => a + d.confirmed_at_time_count, 0))) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-700">From</span>
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-700">To</span>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={fetchReports}
          disabled={loading}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Apply'}
        </button>
      </div>

      {/* Report 1 — Booking Summary */}
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Booking summary</h2>
          <button type="button" onClick={exportReport1} className="text-sm text-blue-600 hover:underline">Export CSV</button>
        </div>
        {r1 && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded bg-neutral-50 p-3">
                <div className="text-xs font-medium text-neutral-500">Total bookings created</div>
                <div className="text-2xl font-bold text-neutral-900">{r1.total_bookings_created}</div>
              </div>
              <div className="rounded bg-neutral-50 p-3">
                <div className="text-xs font-medium text-neutral-500">Covers booked</div>
                <div className="text-2xl font-bold text-neutral-900">{r1.covers_booked}</div>
              </div>
              <div className="rounded bg-neutral-50 p-3">
                <div className="text-xs font-medium text-neutral-500">Covers seated</div>
                <div className="text-2xl font-bold text-neutral-900">{r1.covers_seated}</div>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="h-64">
                <p className="mb-2 text-sm font-medium text-neutral-600">By source</p>
                {sourcePieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sourcePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => `${e.name}: ${e.value}`}>
                        {sourcePieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-neutral-400">No data</p>
                )}
              </div>
              <div className="h-64">
                <p className="mb-2 text-sm font-medium text-neutral-600">By status</p>
                {statusBarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-neutral-400">No data</p>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Report 2 — No-Show Rate */}
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">No-show rate</h2>
          <button type="button" onClick={exportReport2} className="text-sm text-blue-600 hover:underline">Export CSV</button>
        </div>
        <p className="mb-2 text-sm text-neutral-600">
          No-shows / (No-shows + Seated + Completed). Walk-ins and cancellations excluded. Overall: <strong>{noShowRateOverall.toFixed(1)}%</strong>
        </p>
        {r2.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={r2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period_start" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value: number) => [`${value}%`, 'Rate']} />
                <Line type="monotone" dataKey="rate_pct" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="No-show %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No data for this period</p>
        )}
      </section>

      {/* Report 3 — Cancellation Rate */}
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Cancellation rate</h2>
          <button type="button" onClick={exportReport3} className="text-sm text-blue-600 hover:underline">Export CSV</button>
        </div>
        {r3 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded bg-neutral-50 p-3">
                <div className="text-xs font-medium text-neutral-500">Total created</div>
                <div className="text-xl font-bold text-neutral-900">{r3.total_bookings_created}</div>
              </div>
              <div className="rounded bg-neutral-50 p-3">
                <div className="text-xs font-medium text-neutral-500">Guest-initiated</div>
                <div className="text-xl font-bold text-neutral-900">{r3.cancelled_guest_initiated}</div>
              </div>
              <div className="rounded bg-neutral-50 p-3">
                <div className="text-xs font-medium text-neutral-500">Auto (unpaid)</div>
                <div className="text-xl font-bold text-neutral-900">{r3.cancelled_auto}</div>
              </div>
              <div className="rounded bg-neutral-50 p-3">
                <div className="text-xs font-medium text-neutral-500">Cancellation rate</div>
                <div className="text-xl font-bold text-neutral-900">{r3.cancellation_rate_pct}%</div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Report 4 — Deposit Summary */}
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Deposit summary</h2>
          <button type="button" onClick={exportReport4} className="text-sm text-blue-600 hover:underline">Export CSV</button>
        </div>
        {r4 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded bg-green-50 p-3">
              <div className="text-xs font-medium text-green-800">Total collected (Paid + Forfeited)</div>
              <div className="text-xl font-bold text-green-900">£{(r4.total_collected_pence / 100).toFixed(2)}</div>
            </div>
            <div className="rounded bg-amber-50 p-3">
              <div className="text-xs font-medium text-amber-800">Total refunded</div>
              <div className="text-xl font-bold text-amber-900">£{(r4.total_refunded_pence / 100).toFixed(2)}</div>
            </div>
            <div className="rounded bg-red-50 p-3">
              <div className="text-xs font-medium text-red-800">Total forfeited</div>
              <div className="text-xl font-bold text-red-900">£{(r4.total_forfeited_pence / 100).toFixed(2)}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
