'use client';

import { useCallback, useEffect, useState } from 'react';

interface Practitioner {
  id: string;
  name: string;
  is_active: boolean;
}

interface Slot {
  practitioner_id: string;
  practitioner_name: string;
  service_id: string;
  service_name: string;
  start_time: string;
  duration_minutes: number;
  price_pence: number | null;
}

interface Booking {
  id: string;
  booking_date: string;
  booking_time: string;
  party_size: number;
  status: string;
  practitioner_id: string | null;
  appointment_service_id: string | null;
  guest_name?: string;
  service_name?: string;
}

export function PractitionerCalendarView({ venueId }: { venueId: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pracRes, bookRes] = await Promise.all([
        fetch('/api/venue/practitioners').then((r) => r.json()),
        fetch(`/api/venue/bookings/list?date=${date}`).then((r) => r.json()),
      ]);
      setPractitioners(pracRes.practitioners ?? []);
      setBookings((bookRes.bookings ?? []).filter((b: Booking) => b.practitioner_id));
    } catch (err) {
      console.error('Failed to load calendar data:', err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00 – 20:00

  const bookingsForPractitioner = (pracId: string) =>
    bookings.filter((b) => b.practitioner_id === pracId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Practitioner Calendar</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-96 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : practitioners.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-500">No practitioners configured yet. You can add them during onboarding or contact support for help.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {practitioners.filter((p) => p.is_active).map((practitioner) => (
            <div key={practitioner.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="font-semibold text-slate-900">{practitioner.name}</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {hours.map((hour) => {
                  const timeStr = `${String(hour).padStart(2, '0')}:00`;
                  const booking = bookingsForPractitioner(practitioner.id).find(
                    (b) => b.booking_time.slice(0, 5) >= timeStr &&
                           b.booking_time.slice(0, 5) < `${String(hour + 1).padStart(2, '0')}:00`
                  );
                  return (
                    <div key={hour} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="w-12 flex-shrink-0 text-xs text-slate-400">{timeStr}</span>
                      {booking ? (
                        <div className="flex-1 rounded-md bg-blue-50 px-3 py-1.5">
                          <span className="font-medium text-blue-900">
                            {booking.guest_name ?? 'Booking'}
                          </span>
                          {booking.service_name && (
                            <span className="ml-2 text-xs text-blue-600">{booking.service_name}</span>
                          )}
                          <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            booking.status === 'Confirmed' ? 'bg-green-100 text-green-700' :
                            booking.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {booking.status}
                          </span>
                        </div>
                      ) : (
                        <div className="flex-1 text-xs text-slate-300">Available</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
