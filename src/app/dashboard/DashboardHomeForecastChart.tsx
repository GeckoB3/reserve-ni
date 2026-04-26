'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ForecastRow {
  date: string;
  day: string;
  covers: number;
  bookings: number;
}

export function DashboardHomeForecastChart({
  forecast,
  isAppointment,
}: {
  forecast: ForecastRow[];
  isAppointment: boolean;
}) {
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={forecast} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
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
            formatter={(value: number) => [
              isAppointment ? `${value} appointments` : `${value} covers`,
              isAppointment ? 'Appointments' : 'Covers',
            ]}
            cursor={{ fill: '#f8fafc' }}
          />
          <Bar
            dataKey={isAppointment ? 'bookings' : 'covers'}
            fill="#4E6B78"
            radius={[8, 8, 0, 0]}
            maxBarSize={44}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
