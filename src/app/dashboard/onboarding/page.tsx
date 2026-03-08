'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HelpTooltip } from '@/components/dashboard/HelpTooltip';
import { helpContent } from '@/lib/help-content';

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

export default function OnboardingPage() {
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

  const handleVenueTypeChange = useCallback((type: VenueType) => {
    setVenueType(type);
    setCapacity(DEFAULTS[type].capacity);
  }, []);

  function toggleDay(service: ServiceDraft, day: number): ServiceDraft {
    const days = service.days_of_week.includes(day)
      ? service.days_of_week.filter((d) => d !== day)
      : [...service.days_of_week, day].sort();
    return { ...service, days_of_week: days };
  }

  function addService() {
    setServices([...services, { name: '', days_of_week: [1, 2, 3, 4, 5, 6], start_time: '12:00', end_time: '22:00', last_booking_time: '21:00' }]);
  }

  function removeService(index: number) {
    setServices(services.filter((_, i) => i !== index));
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      const defaults = DEFAULTS[venueType];

      for (let i = 0; i < services.length; i++) {
        const s = services[i]!;
        if (!s.name.trim()) continue;

        const sRes = await fetch('/api/venue/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...s, sort_order: i }),
        });
        if (!sRes.ok) throw new Error('Failed to create service');
        const { service } = await sRes.json();

        await fetch('/api/venue/capacity-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service_id: service.id, ...capacity }),
        });

        for (const dur of defaults.durations) {
          await fetch('/api/venue/party-size-durations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: service.id,
              min_party_size: dur.min,
              max_party_size: dur.max,
              duration_minutes: dur.dur,
            }),
          });
        }

        await fetch('/api/venue/booking-restrictions', {
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
      }

      router.push('/dashboard/availability');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-xl">
        {/* Progress */}
        <div className="mb-8">
          <div className="mb-2 flex justify-between text-xs font-medium text-slate-400">
            <span>Step {step + 1} of {totalSteps}</span>
            <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200">
            <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* Step 0: Venue Type */}
          {step === 0 && (
            <div>
              <h2 className="mb-1 text-lg font-bold text-slate-900">What type of venue are you?</h2>
              <p className="mb-6 flex items-center gap-2 text-sm text-slate-500">
                This helps us set smart defaults <HelpTooltip content={helpContent.onboarding.venueType} />
              </p>
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
                  <div key={i} className="rounded-xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => {
                          const updated = [...services];
                          updated[i] = { ...s, name: e.target.value };
                          setServices(updated);
                        }}
                        placeholder="Service name"
                        className="text-sm font-medium text-slate-900 border-0 bg-transparent p-0 focus:ring-0 placeholder:text-slate-300"
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
                          onClick={() => {
                            const updated = [...services];
                            updated[i] = toggleDay(s, d);
                            setServices(updated);
                          }}
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
                        <input type="time" value={s.start_time} onChange={(e) => { const u = [...services]; u[i] = { ...s, start_time: e.target.value }; setServices(u); }} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">End</label>
                        <input type="time" value={s.end_time} onChange={(e) => { const u = [...services]; u[i] = { ...s, end_time: e.target.value }; setServices(u); }} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500">Last booking</label>
                        <input type="time" value={s.last_booking_time} onChange={(e) => { const u = [...services]; u[i] = { ...s, last_booking_time: e.target.value }; setServices(u); }} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs" />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addService} className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm text-slate-500 hover:border-brand-300 hover:text-brand-600">
                  + Add another service
                </button>
              </div>
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
                  <input type="number" min={1} value={capacity.max_covers_per_slot} onChange={(e) => setCapacity({ ...capacity, max_covers_per_slot: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    Max bookings per slot <HelpTooltip content={helpContent.capacityRules.maxBookingsPerSlot} />
                  </label>
                  <input type="number" min={1} value={capacity.max_bookings_per_slot} onChange={(e) => setCapacity({ ...capacity, max_bookings_per_slot: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
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
                  <input type="number" min={0} max={60} value={capacity.buffer_minutes} onChange={(e) => setCapacity({ ...capacity, buffer_minutes: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
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
                  <input type="number" min={1} value={deposit.deposit_from_party_size} onChange={(e) => setDeposit({ ...deposit, deposit_from_party_size: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
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
              <div className="mb-4 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
              </div>
              <h2 className="mb-2 text-lg font-bold text-slate-900">Ready to go!</h2>
              <p className="mb-6 text-sm text-slate-500">Click &quot;Complete Setup&quot; to create your services and start accepting bookings.</p>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex justify-between">
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Back
              </button>
            ) : <div />}
            {step < 5 ? (
              <button onClick={() => setStep(step + 1)} className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700">
                Continue
              </button>
            ) : (
              <button onClick={handleFinish} disabled={saving} className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {saving ? 'Setting up...' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
