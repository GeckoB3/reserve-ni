'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';

interface Practitioner {
  id: string;
  name: string;
  is_active: boolean;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  price_pence: number | null;
  deposit_pence: number | null;
  colour: string;
  is_active: boolean;
}

interface PractitionerServiceLink {
  practitioner_id: string;
  service_id: string;
}

interface AvailSlot {
  start_time: string;
  practitioner_id: string;
  service_id: string;
  duration_minutes: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  venueId: string;
  currency?: string;
  preselectedPractitionerId?: string;
  preselectedDate?: string;
  preselectedTime?: string;
}

export function AppointmentBookingForm({
  open,
  onClose,
  onCreated,
  venueId,
  currency = 'GBP',
  preselectedPractitionerId,
  preselectedDate,
  preselectedTime,
}: Props) {
  const sym = currency === 'EUR' ? '€' : '£';

  // State
  const [step, setStep] = useState(1);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<PractitionerServiceLink[]>([]);
  const [selectedPractitioner, setSelectedPractitioner] = useState<string>(preselectedPractitionerId ?? '');
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (preselectedDate) return preselectedDate;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [selectedTime, setSelectedTime] = useState<string>(preselectedTime ?? '');
  const [availableSlots, setAvailableSlots] = useState<AvailSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [requireDeposit, setRequireDeposit] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedPractitioner(preselectedPractitionerId ?? '');
      setSelectedService('');
      const now = new Date();
      setSelectedDate(preselectedDate ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
      setSelectedTime(preselectedTime ?? '');
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setNotes('');
      setRequireDeposit(false);
      setError(null);
    }
  }, [open, preselectedPractitionerId, preselectedDate, preselectedTime]);

  useEffect(() => {
    if (!open) return;
    setDataLoading(true);
    Promise.all([
      fetch('/api/venue/practitioners'),
      fetch('/api/venue/appointment-services'),
    ])
      .then(async ([pracRes, svcRes]) => {
        if (!pracRes.ok || !svcRes.ok) {
          setError('Failed to load form data. Please close and try again.');
          return;
        }
        const [pracData, svcData] = await Promise.all([pracRes.json(), svcRes.json()]);
        setPractitioners(pracData.practitioners ?? []);
        setServices(svcData.services ?? []);
        setLinks(svcData.practitioner_services ?? []);
      })
      .catch(() => setError('Failed to load form data. Please check your connection.'))
      .finally(() => setDataLoading(false));
  }, [open]);

  const activePractitioners = useMemo(
    () => practitioners.filter((p) => p.is_active),
    [practitioners],
  );

  const servicesForPractitioner = useMemo(() => {
    if (!selectedPractitioner) return services.filter((s) => s.is_active);
    const linkedServiceIds = new Set(links.filter((l) => l.practitioner_id === selectedPractitioner).map((l) => l.service_id));
    return services.filter((s) => s.is_active && linkedServiceIds.has(s.id));
  }, [selectedPractitioner, services, links]);

  const fetchSlots = useCallback(async () => {
    if (!selectedPractitioner || !selectedService || !selectedDate) return;
    setSlotsLoading(true);
    try {
      const url = `/api/booking/availability?venue_id=${venueId}&date=${selectedDate}&practitioner_id=${selectedPractitioner}&service_id=${selectedService}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const practSlots = data.practitioners?.find((p: { id: string }) => p.id === selectedPractitioner);
        setAvailableSlots(
          (practSlots?.slots ?? []).filter((s: AvailSlot) => s.service_id === selectedService),
        );
        setError(null);
      } else {
        setAvailableSlots([]);
        setError('Could not load available time slots. Please try a different date.');
      }
    } catch {
      setAvailableSlots([]);
      setError('Could not load available time slots.');
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedPractitioner, selectedService, selectedDate]);

  useEffect(() => {
    if (step === 3) fetchSlots();
  }, [step, fetchSlots]);

  const selectedSvc = services.find((s) => s.id === selectedService);

  async function handleSubmit() {
    if (!clientName.trim()) {
      setError('Client name is required');
      return;
    }
    if (!clientPhone.trim()) {
      setError('Phone number is required');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: selectedDate,
          booking_time: selectedTime,
          party_size: 1,
          name: clientName.trim(),
          phone: clientPhone.trim(),
          email: clientEmail.trim() || undefined,
          special_requests: notes.trim() || undefined,
          require_deposit: requireDeposit,
          practitioner_id: selectedPractitioner,
          appointment_service_id: selectedService,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create appointment');
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create appointment');
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
        aria-labelledby="appointment-form-title"
        className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="appointment-form-title" className="text-lg font-semibold text-slate-900">New Appointment</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100">
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Steps indicator */}
        <div className="mb-5 flex items-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                step === s ? 'bg-blue-600 text-white' :
                step > s ? 'bg-blue-100 text-blue-700' :
                'bg-slate-100 text-slate-400'
              }`}>
                {step > s ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 13l4 4L19 7"/></svg>
                ) : s}
              </div>
              {s < 4 && <div className={`h-0.5 w-8 ${step > s ? 'bg-blue-200' : 'bg-slate-100'}`} />}
            </div>
          ))}
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
            {/* Step 1: Select Practitioner */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Select team member</p>
                {activePractitioners.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPractitioner(p.id); setStep(2); setSelectedService(''); }}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${
                      selectedPractitioner === p.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50 text-slate-900'
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

            {/* Step 2: Select Service */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Select service</p>
                {servicesForPractitioner.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedService(s.id); setStep(3); setSelectedTime(''); }}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                      selectedService === s.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.colour }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900">{s.name}</div>
                        <div className="text-xs text-slate-500">{s.duration_minutes} mins{s.buffer_minutes > 0 ? ` + ${s.buffer_minutes}min buffer` : ''}</div>
                      </div>
                      <div className="text-sm font-medium text-slate-700">
                        {s.price_pence != null ? `${sym}${(s.price_pence / 100).toFixed(2)}` : 'POA'}
                      </div>
                    </div>
                  </button>
                ))}
                {servicesForPractitioner.length === 0 && (
                  <p className="text-sm text-slate-500">No services available for this team member.</p>
                )}
                <button onClick={() => setStep(1)} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
              </div>
            )}

            {/* Step 3: Date + Time */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(''); }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Available times</p>
                  {slotsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <p className="text-sm text-slate-500">No available times for this date. Try a different day.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                      {availableSlots.map((s) => (
                        <button
                          key={s.start_time}
                          onClick={() => setSelectedTime(s.start_time)}
                          className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                            selectedTime === s.start_time ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 hover:bg-slate-50 text-slate-900'
                          }`}
                        >
                          {s.start_time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-between">
                  <button onClick={() => setStep(2)} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
                  <button
                    onClick={() => { if (selectedTime) setStep(4); }}
                    disabled={!selectedTime}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Client Details */}
            {step === 4 && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Team member</span>
                    <span className="font-medium">{activePractitioners.find((p) => p.id === selectedPractitioner)?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Service</span>
                    <span className="font-medium">{selectedSvc?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date & time</span>
                    <span className="font-medium">{selectedDate} at {selectedTime}</span>
                  </div>
                  {selectedSvc?.price_pence != null && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Price</span>
                      <span className="font-medium">{sym}{(selectedSvc.price_pence / 100).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Client name *</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Phone *</label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="07123 456789"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="client@example.com"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    rows={2}
                    placeholder="Special requests or notes"
                  />
                </div>

                {selectedSvc?.deposit_pence != null && selectedSvc.deposit_pence > 0 && (
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={requireDeposit}
                      onChange={(e) => setRequireDeposit(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">
                      Require deposit ({sym}{(selectedSvc.deposit_pence / 100).toFixed(2)})
                    </span>
                  </label>
                )}

                <div className="flex justify-between">
                  <button onClick={() => setStep(3)} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Creating...' : 'Create Appointment'}
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
