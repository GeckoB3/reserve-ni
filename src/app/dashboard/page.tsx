'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardData {
  today: {
    covers: number;
    bookings: number;
    revenue: number;
    next_booking: { time: string; party_size: number } | null;
  };
  forecast: Array<{ date: string; day: string; covers: number; bookings: number }>;
  heatmap: Array<{ date: string; day: string; fillPercent: number; covers: number }>;
  alerts: Array<{ type: string; message: string }>;
  recent_bookings: Array<{ id: string; time: string; party_size: number; status: string }>;
}

function getHeatColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  if (pct >= 40) return 'bg-brand-500';
  if (pct >= 10) return 'bg-brand-300';
  return 'bg-slate-200';
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
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return <p className="p-8 text-sm text-slate-500">Failed to load dashboard data.</p>;
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Today&apos;s Covers" value={data.today.covers} icon={
          <svg className="h-5 w-5 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
        } />
        <SummaryCard label="Bookings" value={data.today.bookings} icon={
          <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
        } />
        <SummaryCard label="Deposit Revenue" value={`£${data.today.revenue.toFixed(2)}`} icon={
          <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
        } />
        <SummaryCard
          label="Next Booking"
          value={data.today.next_booking ? `${data.today.next_booking.time} (${data.today.next_booking.party_size})` : '—'}
          icon={
            <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          }
        />
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <div key={i} className={`rounded-xl border px-4 py-3 text-sm ${
              alert.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
            }`}>
              {alert.message}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Capacity Heatmap */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">7-Day Capacity</h2>
          <div className="flex gap-2">
            {data.heatmap.map((h) => (
              <div key={h.date} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">{h.day}</span>
                <div className={`flex h-12 w-full items-center justify-center rounded-lg ${getHeatColor(h.fillPercent)}`}>
                  <span className={`text-xs font-bold ${h.fillPercent >= 40 ? 'text-white' : 'text-slate-600'}`}>{h.fillPercent}%</span>
                </div>
                <span className="text-[10px] text-slate-400">{h.covers} covers</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-200" /> Empty</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-300" /> Light</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-500" /> Moderate</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500" /> Busy</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" /> Full</span>
          </div>
        </div>

        {/* Forecast Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">7-Day Forecast</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.forecast} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '0.75rem', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  formatter={(value: number, name: string) => [value, name === 'covers' ? 'Covers' : 'Bookings']}
                />
                <Bar dataKey="covers" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Bookings */}
      {data.recent_bookings.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Today&apos;s Bookings</h2>
          <div className="overflow-hidden rounded-lg border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Covers</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent_bookings.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{b.time}</td>
                    <td className="px-4 py-2.5 text-slate-600">{b.party_size}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        b.status === 'Confirmed' ? 'bg-green-100 text-green-700' :
                        b.status === 'Seated' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50">{icon}</div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-lg font-bold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
