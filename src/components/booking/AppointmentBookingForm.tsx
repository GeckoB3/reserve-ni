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

interface GroupPersonEntry {
  label: string;
  practitionerId: string;
  practitionerName: string;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  durationMinutes: number;
  bufferMinutes: number;
  pricePence: number | null;
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

  // Shared data
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<PractitionerServiceLink[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mode toggle
  const [isGroupMode, setIsGroupMode] = useState(false);

  // ── Single booking state ──
  const [step, setStep] = useState(1);
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

  // ── Group booking state ──
  const [groupStep, setGroupStep] = useState<'list' | 'label' | 'practitioner' | 'service' | 'time' | 'details'>('list');
  const [groupPeople, setGroupPeople] = useState<GroupPersonEntry[]>([]);
  const [groupPersonLabel, setGroupPersonLabel] = useState('');
  const [groupPracId, setGroupPracId] = useState('');
  const [groupSvcId, setGroupSvcId] = useState('');
  const [groupDate, setGroupDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [groupSlots, setGroupSlots] = useState<AvailSlot[]>([]);
  const [groupSlotsLoading, setGroupSlotsLoading] = useState(false);
  const [groupClientName, setGroupClientName] = useState('');
  const [groupClientPhone, setGroupClientPhone] = useState('');
  const [groupClientEmail, setGroupClientEmail] = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const slotPrefill =
        Boolean(preselectedPractitionerId && preselectedDate && preselectedTime);
      setStep(slotPrefill ? 2 : 1);
      setIsGroupMode(false);
      setSelectedPractitioner(preselectedPractitionerId ?? '');
      setSelectedService('');
      setSelectedDate(preselectedDate ?? today);
      setSelectedTime(preselectedTime ?? '');
      setClientName(''); setClientPhone(''); setClientEmail(''); setNotes('');
      setRequireDeposit(false); setError(null);
      setGroupStep('list'); setGroupPeople([]); setGroupPersonLabel('');
      setGroupPracId(''); setGroupSvcId(''); setGroupDate(today);
      setGroupSlots([]); setGroupClientName(''); setGroupClientPhone(''); setGroupClientEmail('');
    }
  }, [open, preselectedPractitionerId, preselectedDate, preselectedTime]);

  // Fetch data
  useEffect(() => {
    if (!open) return;
    setDataLoading(true);
    Promise.all([fetch('/api/venue/practitioners'), fetch('/api/venue/appointment-services')])
      .then(async ([pracRes, svcRes]) => {
        if (!pracRes.ok || !svcRes.ok) { setError('Failed to load form data.'); return; }
        const [pracData, svcData] = await Promise.all([pracRes.json(), svcRes.json()]);
        setPractitioners(pracData.practitioners ?? []);
        setServices(svcData.services ?? []);
        setLinks(svcData.practitioner_services ?? []);
      })
      .catch(() => setError('Failed to load form data.'))
      .finally(() => setDataLoading(false));
  }, [open]);

  const activePractitioners = useMemo(() => practitioners.filter((p) => p.is_active), [practitioners]);

  function getServicesForPractitioner(pracId: string) {
    if (!pracId) return services.filter((s) => s.is_active);
    const pracLinks = links.filter((l) => l.practitioner_id === pracId);
    if (pracLinks.length === 0) return services.filter((s) => s.is_active);
    const linkedIds = new Set(pracLinks.map((l) => l.service_id));
    return services.filter((s) => s.is_active && linkedIds.has(s.id));
  }

  const servicesForPractitioner = useMemo(
    () => getServicesForPractitioner(selectedPractitioner),
    [selectedPractitioner, services, links],
  );

  const groupServicesForPrac = useMemo(
    () => getServicesForPractitioner(groupPracId),
    [groupPracId, services, links],
  );

  // ── Single: fetch slots ──
  const fetchSlots = useCallback(async () => {
    if (!selectedPractitioner || !selectedService || !selectedDate) return;
    setSlotsLoading(true);
    try {
      const url = `/api/booking/availability?venue_id=${venueId}&date=${selectedDate}&practitioner_id=${selectedPractitioner}&service_id=${selectedService}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const practSlots = data.practitioners?.find((p: { id: string }) => p.id === selectedPractitioner);
        setAvailableSlots((practSlots?.slots ?? []).filter((s: AvailSlot) => s.service_id === selectedService));
        setError(null);
      } else {
        setAvailableSlots([]);
        setError('Could not load available time slots.');
      }
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedPractitioner, selectedService, selectedDate, venueId]);

  useEffect(() => {
    if (!isGroupMode && step === 3) fetchSlots();
  }, [step, fetchSlots, isGroupMode]);

  // ── Group: fetch slots ──
  const fetchGroupSlots = useCallback(async () => {
    if (!groupPracId || !groupSvcId || !groupDate) return;
    setGroupSlotsLoading(true);
    try {
      const phantoms = groupPeople
        .filter((p) => p.date === groupDate)
        .map((p) => ({
          practitioner_id: p.practitionerId,
          start_time: p.time,
          duration_minutes: p.durationMinutes,
          buffer_minutes: p.bufferMinutes,
        }));
      const params = new URLSearchParams({
        venue_id: venueId,
        date: groupDate,
        practitioner_id: groupPracId,
        service_id: groupSvcId,
      });
      if (phantoms.length > 0) params.set('phantoms', JSON.stringify(phantoms));
      const res = await fetch(`/api/booking/availability?${params}`);
      if (res.ok) {
        const data = await res.json();
        const practSlots = data.practitioners?.find((p: { id: string }) => p.id === groupPracId);
        setGroupSlots((practSlots?.slots ?? []).filter((s: AvailSlot) => s.service_id === groupSvcId));
      } else {
        setGroupSlots([]);
      }
    } catch {
      setGroupSlots([]);
    } finally {
      setGroupSlotsLoading(false);
    }
  }, [groupPracId, groupSvcId, groupDate, venueId, groupPeople]);

  useEffect(() => {
    if (isGroupMode && groupStep === 'time') fetchGroupSlots();
  }, [groupStep, fetchGroupSlots, isGroupMode]);

  const selectedSvc = services.find((s) => s.id === selectedService);

  // ── Single: submit ──
  async function handleSubmit() {
    if (!clientName.trim()) { setError('Client name is required'); return; }
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
          phone: clientPhone.trim() || undefined,
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

  // ── Group: add person ──
  function addGroupPerson(time: string) {
    const prac = activePractitioners.find((p) => p.id === groupPracId);
    const svc = services.find((s) => s.id === groupSvcId);
    if (!prac || !svc) return;
    setGroupPeople((prev) => [
      ...prev,
      {
        label: groupPersonLabel,
        practitionerId: prac.id,
        practitionerName: prac.name,
        serviceId: svc.id,
        serviceName: svc.name,
        date: groupDate,
        time,
        durationMinutes: svc.duration_minutes,
        bufferMinutes: svc.buffer_minutes,
        pricePence: svc.price_pence,
      },
    ]);
    setGroupPersonLabel('');
    setGroupPracId('');
    setGroupSvcId('');
    setGroupStep('list');
  }

  // ── Group: submit ──
  async function handleGroupSubmit() {
    if (!groupClientName.trim()) { setError('Client name is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/booking/create-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          name: groupClientName.trim(),
          phone: groupClientPhone.trim() || undefined,
          email: groupClientEmail.trim() || undefined,
          source: 'phone',
          people: groupPeople.map((p) => ({
            person_label: p.label,
            practitioner_id: p.practitionerId,
            appointment_service_id: p.serviceId,
            booking_date: p.date,
            booking_time: p.time,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create group booking');
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group booking');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const totalGroupPrice = groupPeople.reduce((sum, p) => sum + (p.pricePence ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="appointment-form-title"
        className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="appointment-form-title" className="text-lg font-semibold text-slate-900">
            {isGroupMode ? 'Group Appointment' : 'New Appointment'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100">
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Mode toggle */}
        {((isGroupMode && groupStep === 'list' && groupPeople.length === 0) || (!isGroupMode && step === 1)) && (
          <div className="mb-4 flex rounded-lg border border-slate-200 p-1">
            <button
              onClick={() => { setIsGroupMode(false); setStep(1); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${!isGroupMode ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Single
            </button>
            <button
              onClick={() => { setIsGroupMode(true); setGroupStep('list'); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isGroupMode ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Group
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
        ) : !isGroupMode ? (
          <>
            {/* ── SINGLE BOOKING FLOW: staff → service → date & time → confirm & contact ── */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Select team member</p>
                {activePractitioners.map((p) => (
                  <button key={p.id} onClick={() => { setSelectedPractitioner(p.id); setStep(2); setSelectedService(''); }}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${
                      selectedPractitioner === p.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50 text-slate-900'
                    }`}>
                    {p.name}
                  </button>
                ))}
                {activePractitioners.length === 0 && <p className="text-sm text-slate-500">No team members available.</p>}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Select service</p>
                {servicesForPractitioner.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedService(s.id);
                      setStep(3);
                      if (!preselectedTime) setSelectedTime('');
                    }}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${selectedService === s.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.colour }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900">{s.name}</div>
                        <div className="text-xs text-slate-500">{s.duration_minutes} mins{s.buffer_minutes > 0 ? ` + ${s.buffer_minutes}min buffer` : ''}</div>
                      </div>
                      <div className="text-sm font-medium text-slate-700">{s.price_pence != null ? `${sym}${(s.price_pence / 100).toFixed(2)}` : 'POA'}</div>
                    </div>
                  </button>
                ))}
                {servicesForPractitioner.length === 0 && <p className="text-sm text-slate-500">No services available for this team member.</p>}
                <button onClick={() => setStep(1)} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-700">Select date and time</p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
                  <input type="date" value={selectedDate}
                    min={(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })()}
                    onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(''); }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Available times</p>
                  {slotsLoading ? (
                    <div className="flex items-center justify-center py-6"><div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
                  ) : availableSlots.length === 0 ? (
                    <p className="text-sm text-slate-500">No available times for this date.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                      {availableSlots.map((s) => (
                        <button key={s.start_time} onClick={() => setSelectedTime(s.start_time)}
                          className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                            selectedTime === s.start_time ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 hover:bg-slate-50 text-slate-900'
                          }`}>
                          {s.start_time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-between">
                  <button onClick={() => setStep(2)} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
                  <button onClick={() => { if (selectedTime) setStep(4); }} disabled={!selectedTime} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Next</button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-700">Confirm appointment and contact</p>
                <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">Team member</span><span className="font-medium">{activePractitioners.find((p) => p.id === selectedPractitioner)?.name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Service</span><span className="font-medium">{selectedSvc?.name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Date & time</span><span className="font-medium">{selectedDate} at {selectedTime}</span></div>
                  {selectedSvc?.price_pence != null && <div className="flex justify-between"><span className="text-slate-500">Price</span><span className="font-medium">{sym}{(selectedSvc.price_pence / 100).toFixed(2)}</span></div>}
                </div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Client name *</label><input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="Full name" /></div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Email <span className="text-slate-400 font-normal">(optional)</span></label><input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="client@example.com" /></div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Phone <span className="text-slate-400 font-normal">(optional)</span></label><input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="07123 456789" /></div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" rows={2} placeholder="Special requests or notes" /></div>
                {selectedSvc?.deposit_pence != null && selectedSvc.deposit_pence > 0 && (
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={requireDeposit} onChange={(e) => setRequireDeposit(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-slate-700">Require deposit ({sym}{(selectedSvc.deposit_pence / 100).toFixed(2)})</span>
                  </label>
                )}
                <div className="flex justify-between">
                  <button onClick={() => setStep(3)} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
                  <button onClick={handleSubmit} disabled={submitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create Appointment'}</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* ── GROUP BOOKING FLOW ── */}

            {groupStep === 'list' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  {groupPeople.length === 0 ? 'Add each person and their appointment.' : `${groupPeople.length} ${groupPeople.length === 1 ? 'person' : 'people'} added.`}
                </p>

                {groupPeople.map((p, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-sm">
                        <div className="font-medium text-slate-900">{p.label}</div>
                        <div className="text-slate-600">{p.serviceName} with {p.practitionerName}</div>
                        <div className="text-xs text-slate-500">{p.date} at {p.time} &middot; {p.durationMinutes}min</div>
                        {p.pricePence != null && <div className="text-xs font-medium text-blue-600">{sym}{(p.pricePence / 100).toFixed(2)}</div>}
                      </div>
                      <button onClick={() => setGroupPeople((prev) => prev.filter((_, i) => i !== idx))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}

                {totalGroupPrice > 0 && groupPeople.length > 0 && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm flex justify-between">
                    <span className="font-medium text-blue-700">Total</span>
                    <span className="font-semibold text-blue-700">{sym}{(totalGroupPrice / 100).toFixed(2)}</span>
                  </div>
                )}

                {groupPeople.length < 10 && (
                  <button onClick={() => { setGroupPersonLabel(''); setGroupPracId(''); setGroupSvcId(''); setGroupStep('label'); }}
                    className="w-full rounded-lg border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600">
                    + Add a person
                  </button>
                )}

                {groupPeople.length >= 1 && (
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => { setGroupPeople([]); setIsGroupMode(false); setStep(1); }}
                      className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                    <button onClick={() => setGroupStep('details')}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Continue</button>
                  </div>
                )}
              </div>
            )}

            {groupStep === 'label' && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-700">Who is this appointment for?</p>
                <input type="text" value={groupPersonLabel} onChange={(e) => setGroupPersonLabel(e.target.value)} placeholder="e.g. John, My son" autoFocus
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                <div className="flex justify-between">
                  <button onClick={() => setGroupStep('list')} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
                  <button disabled={!groupPersonLabel.trim()} onClick={() => setGroupStep('practitioner')}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Next</button>
                </div>
              </div>
            )}

            {groupStep === 'practitioner' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-700 font-medium">Booking for: {groupPersonLabel}</div>
                <p className="text-sm font-medium text-slate-700">Select team member</p>
                {activePractitioners.map((p) => (
                  <button key={p.id} onClick={() => { setGroupPracId(p.id); setGroupSvcId(''); setGroupStep('service'); }}
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-medium hover:bg-slate-50 text-slate-900">{p.name}</button>
                ))}
                <button onClick={() => setGroupStep('label')} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
              </div>
            )}

            {groupStep === 'service' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-purple-50 px-3 py-2 text-sm">
                  <span className="font-medium text-purple-700">{groupPersonLabel}</span>
                  <span className="text-purple-500"> &middot; {activePractitioners.find((p) => p.id === groupPracId)?.name}</span>
                </div>
                <p className="text-sm font-medium text-slate-700">Select service</p>
                {groupServicesForPrac.map((s) => (
                  <button key={s.id} onClick={() => { setGroupSvcId(s.id); setGroupStep('time'); }}
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.colour }} />
                      <div className="flex-1 min-w-0"><div className="text-sm font-medium text-slate-900">{s.name}</div><div className="text-xs text-slate-500">{s.duration_minutes} min</div></div>
                      <div className="text-sm font-medium text-slate-700">{s.price_pence != null ? `${sym}${(s.price_pence / 100).toFixed(2)}` : 'POA'}</div>
                    </div>
                  </button>
                ))}
                <button onClick={() => setGroupStep('practitioner')} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
              </div>
            )}

            {groupStep === 'time' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-purple-50 px-3 py-2 text-sm">
                  <span className="font-medium text-purple-700">{groupPersonLabel}</span>
                  <span className="text-purple-500"> &middot; {services.find((s) => s.id === groupSvcId)?.name} &middot; {activePractitioners.find((p) => p.id === groupPracId)?.name}</span>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
                  <input type="date" value={groupDate}
                    min={(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })()}
                    onChange={(e) => setGroupDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Available times</p>
                  {groupSlotsLoading ? (
                    <div className="flex items-center justify-center py-6"><div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
                  ) : groupSlots.length === 0 ? (
                    <p className="text-sm text-slate-500">No available times for this date.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                      {groupSlots.map((s) => (
                        <button key={s.start_time} onClick={() => addGroupPerson(s.start_time)}
                          className="rounded-lg border border-slate-200 px-2 py-2 text-sm font-medium hover:bg-slate-50 text-slate-900">
                          {s.start_time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setGroupStep('service')} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
              </div>
            )}

            {groupStep === 'details' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-2">
                  {groupPeople.map((p, idx) => (
                    <div key={idx}>
                      <div className="font-medium text-slate-900">{p.label}</div>
                      <div className="text-slate-600">{p.serviceName} with {p.practitionerName} &middot; {p.date} at {p.time}</div>
                    </div>
                  ))}
                  {totalGroupPrice > 0 && (
                    <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-medium text-slate-700">Total</span><span className="font-semibold text-blue-600">{sym}{(totalGroupPrice / 100).toFixed(2)}</span></div>
                  )}
                </div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Contact name *</label><input type="text" value={groupClientName} onChange={(e) => setGroupClientName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="Full name" /></div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Email <span className="text-slate-400 font-normal">(optional)</span></label><input type="email" value={groupClientEmail} onChange={(e) => setGroupClientEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="client@example.com" /></div>
                <div><label className="mb-1 block text-sm font-medium text-slate-700">Phone <span className="text-slate-400 font-normal">(optional)</span></label><input type="tel" value={groupClientPhone} onChange={(e) => setGroupClientPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="07123 456789" /></div>
                <div className="flex justify-between">
                  <button onClick={() => setGroupStep('list')} className="text-sm text-blue-600 hover:underline">&larr; Back</button>
                  <button onClick={handleGroupSubmit} disabled={submitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create Group Booking'}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
