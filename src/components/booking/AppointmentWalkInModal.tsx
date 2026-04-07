'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppointmentService, PractitionerService } from '@/types/booking-models';
import { effectiveAppointmentServiceForPractitioner } from '@/lib/appointments/effective-service-for-practitioner';
import { formatBookablePricePence, formatFromBookablePricePence } from '@/lib/booking/format-price-display';

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

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  currency?: string;
  /** When true, render only the inner card (no backdrop); parent supplies title and close. */
  embedded?: boolean;
}

type WalkStep = 'mode' | 'group_hint' | 'service' | 'staff' | 'confirm';

/**
 * Walk-in: booking type → service (from price) → staff (their price) → confirm with optional contact.
 * Time is set server-side when the user confirms.
 */
export function AppointmentWalkInModal({
  open,
  onClose,
  onCreated,
  currency = 'GBP',
  embedded = false,
}: Props) {
  const sym = currency === 'EUR' ? '€' : '£';

  const [walkStep, setWalkStep] = useState<WalkStep>('mode');
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<PractitionerService[]>([]);
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
      setWalkStep('mode');
      setSelectedPractitioner('');
      setSelectedService('');
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setError(null);

      setDataLoading(true);
      Promise.all([
        fetch('/api/venue/practitioners?roster=1&active_only=1'),
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

  const getServicesForPractitioner = useMemo(
    () => (pracId: string) => {
      if (!pracId) return services.filter((s) => s.is_active);
      const pracLinks = links.filter((l) => l.practitioner_id === pracId);
      if (pracLinks.length === 0) return [];
      const linkedIds = new Set(pracLinks.map((l) => l.service_id));
      return services.filter((s) => s.is_active && linkedIds.has(s.id));
    },
    [services, links],
  );

  const getMergedServicesForPractitioner = useMemo(
    () => (pracId: string) => {
      return getServicesForPractitioner(pracId).map((s) =>
        effectiveAppointmentServiceForPractitioner(s as AppointmentService, pracId, links),
      );
    },
    [getServicesForPractitioner, links],
  );

  const servicePickerOptions = useMemo(() => {
    const byId = new Map<string, { service: Service; minPricePence: number | null }>();
    for (const p of activePractitioners) {
      for (const s of getMergedServicesForPractitioner(p.id)) {
        const price = s.price_pence;
        const existing = byId.get(s.id);
        if (!existing) {
          byId.set(s.id, { service: s as Service, minPricePence: price });
        } else if (price != null && (existing.minPricePence == null || price < existing.minPricePence)) {
          existing.minPricePence = price;
        }
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.service.name.localeCompare(b.service.name));
  }, [activePractitioners, getMergedServicesForPractitioner]);

  const practitionersForSelectedService = useMemo(() => {
    if (!selectedService) return [];
    return activePractitioners.filter((p) =>
      getMergedServicesForPractitioner(p.id).some((s) => s.id === selectedService),
    );
  }, [activePractitioners, selectedService, getMergedServicesForPractitioner]);

  const selectedSvcMerged = useMemo(() => {
    if (!selectedService || !selectedPractitioner) return null;
    const base = services.find((s) => s.id === selectedService);
    if (!base) return null;
    return effectiveAppointmentServiceForPractitioner(base as AppointmentService, selectedPractitioner, links);
  }, [selectedService, selectedPractitioner, services, links]);

  function formatFromPrice(pence: number | null): string {
    return formatFromBookablePricePence(pence, sym);
  }

  function formatPrice(pence: number | null): string {
    return formatBookablePricePence(pence, sym);
  }

  async function handleSubmit() {
    if (!selectedPractitioner || !selectedService) {
      setError('Select a service and who to book with');
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
          name: clientName.trim() || undefined,
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

  const inner = (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={embedded ? undefined : 'walkin-modal-title'}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!embedded && (
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
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {dataLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <>
            {walkStep === 'mode' && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">What would you like to book?</p>
                <button
                  type="button"
                  onClick={() => setWalkStep('service')}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Book an appointment
                </button>
                <button
                  type="button"
                  onClick={() => setWalkStep('group_hint')}
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Group appointment
                </button>
              </div>
            )}

            {walkStep === 'group_hint' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Walk-in is for one guest at a time. To add a group booking, use <span className="font-medium">New appointment</span>{' '}
                  on the calendar.
                </p>
                <button
                  type="button"
                  onClick={() => setWalkStep('mode')}
                  className="text-sm text-blue-600 hover:underline"
                >
                  &larr; Back
                </button>
              </div>
            )}

            {walkStep === 'service' && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Select service</p>
                {servicePickerOptions.map(({ service: s, minPricePence }) => {
                  const buf = s.buffer_minutes ?? 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedService(s.id);
                        setSelectedPractitioner('');
                        setWalkStep('staff');
                      }}
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                        selectedService === s.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
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
                        <div className="text-sm font-medium text-slate-700">{formatFromPrice(minPricePence)}</div>
                      </div>
                    </button>
                  );
                })}
                {servicePickerOptions.length === 0 && (
                  <p className="text-sm text-slate-500">No services available.</p>
                )}
                <button type="button" onClick={() => setWalkStep('mode')} className="text-sm text-blue-600 hover:underline">
                  &larr; Back
                </button>
              </div>
            )}

            {walkStep === 'staff' && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Book with</p>
                {practitionersForSelectedService.map((p) => {
                  const merged = getMergedServicesForPractitioner(p.id).find((s) => s.id === selectedService);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedPractitioner(p.id);
                        setWalkStep('confirm');
                      }}
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${
                        selectedPractitioner === p.id
                          ? 'border-brand-500 bg-brand-50 text-brand-800'
                          : 'border-slate-200 text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{p.name}</span>
                        <span className="text-slate-600">{formatPrice(merged?.price_pence ?? null)}</span>
                      </div>
                    </button>
                  );
                })}
                {practitionersForSelectedService.length === 0 && (
                  <p className="text-sm text-slate-500">No availability for this service.</p>
                )}
                <button type="button" onClick={() => setWalkStep('service')} className="text-sm text-blue-600 hover:underline">
                  &larr; Back
                </button>
              </div>
            )}

            {walkStep === 'confirm' && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-700">Confirm appointment</p>
                <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Service</span>
                    <span className="max-w-[60%] text-right font-medium">{selectedSvcMerged?.name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Booked with</span>
                    <span className="max-w-[60%] text-right font-medium">
                      {activePractitioners.find((p) => p.id === selectedPractitioner)?.name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Date and time</span>
                    <span className="max-w-[60%] text-right font-medium text-slate-700">Now (when you confirm)</span>
                  </div>
                  {selectedSvcMerged?.price_pence != null && (
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Price</span>
                      <span className="font-medium">{formatPrice(selectedSvcMerged.price_pence)}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="walkin-client-name" className="mb-1 block text-sm font-medium text-slate-700">
                    Client name <span className="font-normal text-slate-400">(optional)</span>
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
                    onClick={() => setWalkStep('staff')}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    &larr; Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {submitting ? 'Creating…' : 'Add Walk-in'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
  );

  if (embedded) return inner;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      {inner}
    </div>
  );
}
