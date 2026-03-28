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
  buffer_minutes?: number;
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

/**
 * Walk-in appointments: same stepped UI as New Appointment (staff → service → confirm & contact).
 * Booking time is set server-side when the user confirms (no date/time step).
 */
export function AppointmentWalkInModal({ open, onClose, onCreated, currency = 'GBP' }: Props) {
  const sym = currency === 'EUR' ? '€' : '£';

  const [step, setStep] = useState(1);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<PractitionerServiceLink[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [selectedPractitioner, setSelectedPractitioner] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedPractitioner('');
      setSelectedService('');
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setError(null);

      setDataLoading(true);
      Promise.all([fetch('/api/venue/practitioners'), fetch('/api/venue/appointment-services')])
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
    const linkedIds = new Set(
      links.filter((l) => l.practitioner_id === selectedPractitioner).map((l) => l.service_id),
    );
    return services.filter((s) => s.is_active && linkedIds.has(s.id));
  }, [selectedPractitioner, services, links]);

  const selectedSvc = services.find((s) => s.id === selectedService);

  async function handleSubmit() {
    if (!selectedPractitioner || !selectedService) {
      setError('Select a team member and a service');
      return;
    }
    if (!clientName.trim()) {
      setError('Client name is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/bookings/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          party_size: 1,
          name: clientName.trim(),
          email: clientEmail.trim() || undefined,
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkin-modal-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="walkin-modal-title" className="text-lg font-semibold text-slate-900">
            Walk-in Appointment
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100">
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
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
          <>
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Select team member</p>
                {activePractitioners.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPractitioner(p.id);
                      setSelectedService('');
                      setStep(2);
                    }}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${
                      selectedPractitioner === p.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
                {activePractitioners.length === 0 && (
                  <p className="text-sm text-slate-500">No team members available.</p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Select service</p>
                {servicesForPractitioner.map((s) => {
                  const buf = s.buffer_minutes ?? 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedService(s.id);
                        setStep(3);
                      }}
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                        selectedService === s.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: s.colour }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900">{s.name}</div>
                          <div className="text-xs text-slate-500">
                            {s.duration_minutes} mins{buf > 0 ? ` + ${buf}min buffer` : ''}
                          </div>
                        </div>
                        <div className="text-sm font-medium text-slate-700">
                          {s.price_pence != null ? `${sym}${(s.price_pence / 100).toFixed(2)}` : 'POA'}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {servicesForPractitioner.length === 0 && (
                  <p className="text-sm text-slate-500">No services available for this team member.</p>
                )}
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  &larr; Back
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-700">Confirm appointment and contact</p>
                <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Team member</span>
                    <span className="max-w-[60%] text-right font-medium">
                      {activePractitioners.find((p) => p.id === selectedPractitioner)?.name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Service</span>
                    <span className="max-w-[60%] text-right font-medium">{selectedSvc?.name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Date and time</span>
                    <span className="max-w-[60%] text-right font-medium text-slate-700">
                      Now (when you confirm)
                    </span>
                  </div>
                  {selectedSvc?.price_pence != null && (
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Price</span>
                      <span className="font-medium">{sym}{(selectedSvc.price_pence / 100).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="walkin-client-name" className="mb-1 block text-sm font-medium text-slate-700">
                    Client name *
                  </label>
                  <input
                    id="walkin-client-name"
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Full name"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label htmlFor="walkin-client-email" className="mb-1 block text-sm font-medium text-slate-700">
                    Email <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="walkin-client-email"
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="client@example.com"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label htmlFor="walkin-client-phone" className="mb-1 block text-sm font-medium text-slate-700">
                    Phone <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="walkin-client-phone"
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="07123 456789"
                    autoComplete="tel"
                  />
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    &larr; Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Creating…' : 'Add Walk-in'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
