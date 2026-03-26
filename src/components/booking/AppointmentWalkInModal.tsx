'use client';

import { useEffect, useMemo, useState } from 'react';

interface Practitioner {
  id: string;
  name: string;
  is_active: boolean;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  price_pence: number | null;
  colour: string;
  is_active: boolean;
}

interface PractitionerServiceLink {
  practitioner_id: string;
  service_id: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  currency?: string;
}

export function AppointmentWalkInModal({ open, onClose, onCreated, currency = 'GBP' }: Props) {
  const sym = currency === 'EUR' ? '€' : '£';

  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<PractitionerServiceLink[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [selectedPractitioner, setSelectedPractitioner] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedPractitioner('');
      setSelectedService('');
      setClientName('');
      setClientPhone('');
      setError(null);

      setDataLoading(true);
      Promise.all([
        fetch('/api/venue/practitioners'),
        fetch('/api/venue/appointment-services'),
      ])
        .then(async ([pracRes, svcRes]) => {
          if (!pracRes.ok || !svcRes.ok) {
            setError('Failed to load data. Please close and try again.');
            return;
          }
          const [pracData, svcData] = await Promise.all([pracRes.json(), svcRes.json()]);
          setPractitioners(pracData.practitioners ?? []);
          setServices(svcData.services ?? []);
          setLinks(svcData.practitioner_services ?? []);
        })
        .catch(() => setError('Failed to load data. Please check your connection.'))
        .finally(() => setDataLoading(false));
    }
  }, [open]);

  const activePractitioners = useMemo(
    () => practitioners.filter((p) => p.is_active),
    [practitioners],
  );

  const servicesForPractitioner = useMemo(() => {
    if (!selectedPractitioner) return services.filter((s) => s.is_active);
    const linkedIds = new Set(links.filter((l) => l.practitioner_id === selectedPractitioner).map((l) => l.service_id));
    return services.filter((s) => s.is_active && linkedIds.has(s.id));
  }, [selectedPractitioner, services, links]);

  async function handleSubmit() {
    if (!selectedPractitioner) { setError('Select a team member'); return; }
    if (!selectedService) { setError('Select a service'); return; }
    if (!clientName.trim() && !clientPhone.trim()) { setError('Provide a name or phone number'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/bookings/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          party_size: 1,
          name: clientName.trim() || undefined,
          phone: clientPhone.trim() || undefined,
          practitioner_id: selectedPractitioner,
          appointment_service_id: selectedService,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create walk-in');
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create walk-in');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkin-modal-title"
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="walkin-modal-title" className="text-lg font-semibold text-slate-900">Walk-in Appointment</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100">
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {dataLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Practitioner */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Team member *</label>
              <select
                value={selectedPractitioner}
                onChange={(e) => { setSelectedPractitioner(e.target.value); setSelectedService(''); }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                {activePractitioners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Service */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Service *</label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                {servicesForPractitioner.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes}min{s.price_pence != null ? ` / ${sym}${(s.price_pence / 100).toFixed(2)}` : ''})
                  </option>
                ))}
              </select>
            </div>

            {/* Client details */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Client name</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Walk-in client name"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
              <input
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="07123 456789"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Add Walk-in'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
