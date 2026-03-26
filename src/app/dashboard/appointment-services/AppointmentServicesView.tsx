'use client';

import { useCallback, useEffect, useState } from 'react';

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price_pence: number | null;
  deposit_pence: number | null;
  colour: string;
  is_active: boolean;
  sort_order: number;
}

function formatPrice(pence: number | null): string {
  if (pence == null) return 'POA';
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function AppointmentServicesView({ venueId, isAdmin }: { venueId: string; isAdmin: boolean }) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/venue/appointment-services');
      const data = await res.json();
      setServices(data.services ?? []);
    } catch {
      console.error('Failed to load appointment services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Services</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-500">No services configured yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((svc) => (
            <div
              key={svc.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: svc.colour }}
                />
                <div>
                  <div className="font-medium text-slate-900">{svc.name}</div>
                  {svc.description && (
                    <div className="text-sm text-slate-500">{svc.description}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm text-slate-600">
                <span>{formatDuration(svc.duration_minutes)}</span>
                {svc.buffer_minutes > 0 && (
                  <span className="text-xs text-slate-400">+{svc.buffer_minutes}min buffer</span>
                )}
                <span className="font-medium">{formatPrice(svc.price_pence)}</span>
                {!svc.is_active && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
