'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HelpTooltip } from '@/components/dashboard/HelpTooltip';
import { helpContent } from '@/lib/help-content';
import { NumericInput } from '@/components/ui/NumericInput';
import { PageFrame } from '@/components/ui/dashboard/PageFrame';
import { SectionCard } from '@/components/ui/dashboard/SectionCard';
import { detectOverlaps, formatOverlapWarning } from '@/lib/service-overlap';

type VenueType = 'casual_dining' | 'fine_dining' | 'cafe' | 'pub' | 'fast_casual';

interface ServiceDraft {
  name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  last_booking_time: string;
}

interface CapacityDraft {
  max_covers_per_slot: number;
  max_bookings_per_slot: number;
  slot_interval_minutes: number;
  buffer_minutes: number;
}

interface DepositDraft {
  enabled: boolean;
  deposit_from_party_size: number;
}

const VENUE_TYPES: Array<{ key: VenueType; label: string; description: string }> = [
  { key: 'casual_dining', label: 'Casual Dining', description: 'Relaxed atmosphere, moderate turn times' },
  { key: 'fine_dining', label: 'Fine Dining', description: 'Extended dining, premium experience' },
  { key: 'cafe', label: 'Café / Brunch', description: 'Quick turns, high volume' },
  { key: 'pub', label: 'Pub / Gastropub', description: 'Mixed dining and drinks' },
  { key: 'fast_casual', label: 'Fast Casual', description: 'Quick service, fast turns' },
];

const DEFAULTS: Record<VenueType, { capacity: CapacityDraft; durations: Array<{ min: number; max: number; dur: number }> }> = {
  casual_dining: {
    capacity: { max_covers_per_slot: 30, max_bookings_per_slot: 12, slot_interval_minutes: 15, buffer_minutes: 15 },
    durations: [{ min: 1, max: 2, dur: 75 }, { min: 3, max: 4, dur: 90 }, { min: 5, max: 6, dur: 105 }, { min: 7, max: 20, dur: 120 }],
  },
  fine_dining: {
    capacity: { max_covers_per_slot: 20, max_bookings_per_slot: 8, slot_interval_minutes: 30, buffer_minutes: 30 },
    durations: [{ min: 1, max: 2, dur: 120 }, { min: 3, max: 4, dur: 135 }, { min: 5, max: 6, dur: 150 }, { min: 7, max: 20, dur: 180 }],
  },
  cafe: {
    capacity: { max_covers_per_slot: 40, max_bookings_per_slot: 15, slot_interval_minutes: 15, buffer_minutes: 10 },
    durations: [{ min: 1, max: 2, dur: 60 }, { min: 3, max: 4, dur: 75 }, { min: 5, max: 6, dur: 90 }, { min: 7, max: 20, dur: 105 }],
  },
  pub: {
    capacity: { max_covers_per_slot: 35, max_bookings_per_slot: 12, slot_interval_minutes: 15, buffer_minutes: 15 },
    durations: [{ min: 1, max: 2, dur: 75 }, { min: 3, max: 4, dur: 90 }, { min: 5, max: 6, dur: 120 }, { min: 7, max: 20, dur: 150 }],
  },
  fast_casual: {
    capacity: { max_covers_per_slot: 50, max_bookings_per_slot: 20, slot_interval_minutes: 15, buffer_minutes: 10 },
    durations: [{ min: 1, max: 2, dur: 45 }, { min: 3, max: 4, dur: 60 }, { min: 5, max: 6, dur: 75 }, { min: 7, max: 20, dur: 90 }],
  },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RestaurantSetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [venueType, setVenueType] = useState<VenueType>('casual_dining');
  const [services, setServices] = useState<ServiceDraft[]>([
    { name: 'Lunch', days_of_week: [1, 2, 3, 4, 5, 6], start_time: '12:00', end_time: '15:00', last_booking_time: '14:00' },
    { name: 'Dinner', days_of_week: [1, 2, 3, 4, 5, 6], start_time: '17:00', end_time: '22:00', last_booking_time: '21:00' },
  ]);
  const [capacity, setCapacity] = useState<CapacityDraft>(DEFAULTS.casual_dining.capacity);
  const [deposit, setDeposit] = useState<DepositDraft>({ enabled: false, deposit_from_party_size: 6 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 6;

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [step]);

  const handleVenueTypeChange = useCallback((type: VenueType) => {
    setVenueType(type);
    setCapacity(DEFAULTS[type].capacity);
  }, []);

  function updateService(index: number, patch: Partial<ServiceDraft>) {
    setServices(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  }

  function toggleDay(index: number, day: number) {
    setServices(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const days = s.days_of_week.includes(day)
        ? s.days_of_week.filter((d) => d !== day)
        : [...s.days_of_week, day].sort();
      return { ...s, days_of_week: days };
    }));
  }

  function addService() {
    setServices(prev => [...prev, { name: '', days_of_week: [1, 2, 3, 4, 5, 6], start_time: '12:00', end_time: '22:00', last_booking_time: '21:00' }]);
  }

  function removeService(index: number) {
    setServices(prev => prev.filter((_, i) => i !== index));
  }

  const overlapWarnings = useMemo(() => detectOverlaps(services), [services]);

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      const defaults = DEFAULTS[venueType];
      const validServices = services.filter((s) => s.name.trim());
      if (validServices.length === 0) {
        setError('Please add at least one service with a name.');
        setSaving(false);
        return;
      }

      for (let i = 0; i < validServices.length; i++) {
        const s = validServices[i]!;

        const sRes = await fetch('/api/venue/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...s, sort_order: i }),
        });
        if (!sRes.ok) throw new Error(`Failed to create service "${s.name}"`);
        const { service } = await sRes.json();

        const capRes = await fetch('/api/venue/capacity-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service_id: service.id, ...capacity }),
        });
        if (!capRes.ok) throw new Error(`Failed to create capacity rule for "${s.name}"`);

        for (const dur of defaults.durations) {
          const durRes = await fetch('/api/venue/party-size-durations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: service.id,
              min_party_size: dur.min,
              max_party_size: dur.max,
              duration_minutes: dur.dur,
            }),
          });
          if (!durRes.ok) throw new Error(`Failed to create dining duration for "${s.name}"`);
        }

        const resRes = await fetch('/api/venue/booking-restrictions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: service.id,
            min_advance_minutes: 60,
            max_advance_days: 60,
            min_party_size_online: 1,
            max_party_size_online: 10,
            large_party_threshold: 8,
            large_party_message: 'For parties of 8 or more, please call us directly.',
            deposit_required_from_party_size: deposit.enabled ? deposit.deposit_from_party_size : null,
          }),
        });
        if (!resRes.ok) throw new Error(`Failed to create booking rules for "${s.name}"`);
      }

      if (deposit.enabled) {
        const depRes = await fetch('/api/venue/deposit-config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: true,
            amount_per_person_gbp: 5,
            online_requires_deposit: true,
            phone_requires_deposit: false,
          }),
        });
        if (!depRes.ok) throw new Error('Failed to save deposit settings');
      }

      router.push('/dashboard/availability');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame maxWidthClass="max-w-xl">
      <div className="mx-auto space-y-8">
        {/* Progress */}
        <div>
          <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Step {step + 1} of {totalSteps}
          </p>
          <div className="mb-2 flex justify-between text-xs font-medium text-slate-400">
            <span>Progress</span>
            <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200">
            <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
          </div>
        </div>

        <SectionCard elevated>
          <SectionCard.Body className="space-y-6 sm:px-8 sm:py-8">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* Step 0: Venue Type */}
          {step === 0 && (
            <div>
              <h2 className="mb-1 text-lg font-bold text-slate-900">What type of venue are you?</h2>
              <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
                This helps us set smart defaults <HelpTooltip content={helpContent.onboarding.venueType} />
              </div>
              <div className="space-y-2">
                {VENUE_TYPES.map((vt) => (
                  <button
                    key={vt.key}
                    onClick={() => handleVenueTypeChange(vt.key)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                      venueType === vt.key
                        ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 ${venueType === vt.key ? 'border-brand-600 bg-brand-600' : 'border-slate-300'}`}>
                      {venueType === vt.key && <div className="m-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{vt.label}</p>
                      <p className="text-xs text-slate-500">{vt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Services */}
          {step === 1 && (
            <div>
              <h2 className="mb-1 text-lg font-bold text-slate-900">Your service periods</h2>
              <p className="mb-6 text-sm text-slate-500">Define when guests can book (e.g. Lunch, Dinner, Brunch).</p>
              <div className="space-y-4">
                {services.map((s, i) => (
                  <div key={i} className={`rounded-xl border p-4 space-y-3 ${!s.name.trim() ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => updateService(i, { name: e.target.value })}
                        placeholder="Service name (required)"
                        className={`text-sm font-medium border-0 bg-transparent p-0 focus:ring-0 ${s.name.trim() ? 'text-slate-900 placeholder:text-slate-300' : 'text-slate-900 placeholder:text-amber-400'}`}
                      />
                      {services.length > 1 && (
                        <button onClick={() => removeService(i)} className="text-xs text-slate-400 hover:text-red-500">Remove</button>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {DAY_LABELS.map((label, d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDay(i, d)}
                          className={`rounded-lg px-2 py-1 text-[10px] font-medium ${
                            s.days_of_week.includes(d) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">Start</label>
                        <input type="time" value={s.start_time} onChange={(e) => updateService(i, { start_time: e.target.value })} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">End</label>
                        <input type="time" value={s.end_time} onChange={(e) => updateService(i, { end_time: e.target.value })} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">Last booking</label>
                        <input type="time" value={s.last_booking_time} onChange={(e) => updateService(i, { last_booking_time: e.target.value })} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs" />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addService} className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm text-slate-500 hover:border-brand-300 hover:text-brand-600">
                  + Add another service
                </button>
              </div>
              {overlapWarnings.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <p className="mb-2 text-sm font-semibold text-amber-800">⚠ Overlapping services detected</p>
                  <ul className="space-y-1 text-xs text-amber-700">
                    {overlapWarnings.map((w, i) => (
                      <li key={i}>{formatOverlapWarning(w)}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-amber-600">
                    Overlapping services can cause duplicate time slots and capacity issues. Consider adjusting times or active days unless this is intentional.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Capacity */}
          {step === 2 && (
            <div>
              <h2 className="mb-1 text-lg font-bold text-slate-900">Capacity settings</h2>
              <p className="mb-6 text-sm text-slate-500">These defaults apply to all services. You can fine-tune per-service later.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    Max covers per slot <HelpTooltip content={helpContent.capacityRules.maxCoversPerSlot} />
                  </label>
                  <NumericInput min={1} value={capacity.max_covers_per_slot} onChange={(v) => setCapacity({ ...capacity, max_covers_per_slot: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    Max bookings per slot <HelpTooltip content={helpContent.capacityRules.maxBookingsPerSlot} />
                  </label>
                  <NumericInput min={1} value={capacity.max_bookings_per_slot} onChange={(v) => setCapacity({ ...capacity, max_bookings_per_slot: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    Slot interval <HelpTooltip content={helpContent.capacityRules.slotInterval} />
                  </label>
                  <select value={capacity.slot_interval_minutes} onChange={(e) => setCapacity({ ...capacity, slot_interval_minutes: parseInt(e.target.value) })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    Buffer time <HelpTooltip content={helpContent.capacityRules.bufferMinutes} />
                  </label>
                  <NumericInput min={0} max={60} value={capacity.buffer_minutes} onChange={(v) => setCapacity({ ...capacity, buffer_minutes: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Deposits */}
          {step === 3 && (
            <div>
              <h2 className="mb-1 text-lg font-bold text-slate-900">Deposit settings</h2>
              <p className="mb-6 text-sm text-slate-500">Require deposits for larger parties to reduce no-shows.</p>
              <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4">
                <input type="checkbox" checked={deposit.enabled} onChange={(e) => setDeposit({ ...deposit, enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                <span className="text-sm font-medium text-slate-700">Require deposits for large parties</span>
              </label>
              {deposit.enabled && (
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    Deposit required from party size <HelpTooltip content={helpContent.bookingRules.depositThreshold} />
                  </label>
                  <NumericInput min={1} value={deposit.deposit_from_party_size} onChange={(v) => setDeposit({ ...deposit, deposit_from_party_size: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
              )}
            </div>
          )}

          {/* Step 4: Preview */}
          {step === 4 && (
            <div>
              <h2 className="mb-1 text-lg font-bold text-slate-900">Review your setup</h2>
              <p className="mb-6 text-sm text-slate-500">Here&apos;s a summary of what we&apos;ll configure. You can change everything later.</p>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-xs font-semibold uppercase text-slate-400">Venue Type</h3>
                  <p className="text-sm font-medium text-slate-700">{VENUE_TYPES.find((v) => v.key === venueType)?.label}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-xs font-semibold uppercase text-slate-400">Services</h3>
                  {services.filter((s) => s.name.trim()).map((s, i) => (
                    <p key={i} className="text-sm text-slate-700">{s.name}: {s.start_time}–{s.end_time} ({s.days_of_week.length} days)</p>
                  ))}
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-xs font-semibold uppercase text-slate-400">Capacity</h3>
                  <p className="text-sm text-slate-700">{capacity.max_covers_per_slot} covers, {capacity.max_bookings_per_slot} bookings/slot, {capacity.slot_interval_minutes}min intervals</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <h3 className="text-xs font-semibold uppercase text-slate-400">Deposits</h3>
                  <p className="text-sm text-slate-700">{deposit.enabled ? `Required from parties of ${deposit.deposit_from_party_size}+` : 'Not required'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 5 && (
            <div className="text-center">
              {saving ? (
                <>
                  <div className="mb-4 flex justify-center">
                    <div className="h-16 w-16 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
                  </div>
                  <h2 className="mb-2 text-lg font-bold text-slate-900">Setting up your venue&hellip;</h2>
                  <p className="mb-6 text-sm text-slate-500">Creating services, capacity rules, and booking settings. This will only take a moment.</p>
                </>
              ) : (
                <>
                  <div className="mb-4 flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                      <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                  </div>
                  <h2 className="mb-2 text-lg font-bold text-slate-900">Ready to go!</h2>
                  <p className="mb-6 text-sm text-slate-500">Click &quot;Complete Setup&quot; to create your services and start accepting bookings.</p>
                </>
              )}
            </div>
          )}

          <SectionCard.Divider />

          {/* Navigation */}
          <div className="flex justify-between gap-3 pt-2">
            {step > 0 && !saving ? (
              <button type="button" onClick={() => setStep(step - 1)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                Back
              </button>
            ) : <div />}
            {step < 5 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1) {
                    const unnamed = services.filter(s => !s.name.trim());
                    if (unnamed.length > 0) {
                      setError(`${unnamed.length} service${unnamed.length > 1 ? 's have' : ' has'} no name. Please name all services or remove unused ones.`);
                      return;
                    }
                    if (services.some(s => s.days_of_week.length === 0)) {
                      setError('Each service must have at least one active day.');
                      return;
                    }
                    setError(null);
                  }
                  setStep(step + 1);
                }}
                className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                Continue
              </button>
            ) : (
              <button type="button" onClick={handleFinish} disabled={saving} className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
                {saving ? 'Setting up...' : 'Complete Setup'}
              </button>
            )}
          </div>
          </SectionCard.Body>
        </SectionCard>
      </div>
    </PageFrame>
  );
}
