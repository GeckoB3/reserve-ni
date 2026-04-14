'use client';

import { useEffect, useState } from 'react';

interface Service {
  id: string;
  name: string;
}

interface RuleDraft {
  service_id: string;
  min_advance_minutes: number;
  max_advance_days: number;
  min_party_size_online: number;
  max_party_size_online: number;
  cancellation_notice_hours: number;
  deposit_required_from_party_size: number | null;
  deposit_amount_per_person_gbp: number | null;
}

const DEFAULT_RULE = (serviceId: string): RuleDraft => ({
  service_id: serviceId,
  min_advance_minutes: 60,
  max_advance_days: 60,
  min_party_size_online: 1,
  max_party_size_online: 10,
  cancellation_notice_hours: 48,
  deposit_required_from_party_size: null,
  deposit_amount_per_person_gbp: null,
});

interface Props {
  onDone: () => Promise<void>;
}

export function BookingRulesStep({ onDone }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [drafts, setDrafts] = useState<RuleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depositsEnabled, setDepositsEnabled] = useState<boolean[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/venue/services');
        if (res.ok) {
          const data = await res.json() as { services?: Service[] };
          const svcs = data.services ?? [];
          setServices(svcs);
          setDrafts(svcs.map((s) => DEFAULT_RULE(s.id)));
          setDepositsEnabled(svcs.map(() => false));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function update(i: number, patch: Partial<RuleDraft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function toggleDeposit(i: number, enabled: boolean) {
    setDepositsEnabled((prev) => prev.map((v, idx) => (idx === i ? enabled : v)));
    if (!enabled) {
      update(i, { deposit_required_from_party_size: null, deposit_amount_per_person_gbp: null });
    } else {
      update(i, { deposit_required_from_party_size: 1, deposit_amount_per_person_gbp: 10 });
    }
  }

  async function handleSave() {
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]!;
      if (depositsEnabled[i] && (!d.deposit_amount_per_person_gbp || d.deposit_amount_per_person_gbp <= 0)) {
        setError(`Please enter a deposit amount greater than £0 for "${services[i]?.name}".`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      for (const d of drafts) {
        const res = await fetch('/api/venue/booking-restrictions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...d, online_requires_deposit: true, large_party_threshold: null, large_party_message: null }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(j.error ?? 'Failed to save booking rules');
        }
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div>
        <h2 className="mb-1 text-lg font-bold text-slate-900">Booking rules</h2>
        <p className="mb-6 text-sm text-slate-500">
          Booking rules control advance windows, party sizes, and deposit requirements for online reservations.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-700">No services set up yet</p>
          <p className="mt-1">
            Set up dining services first, then configure booking rules from{' '}
            <span className="font-medium">Availability → Booking Rules</span>.
          </p>
        </div>
        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Booking rules</h2>
      <p className="mb-4 text-sm text-slate-500">
        Set advance booking windows, party size limits, cancellation policy, and optional deposits per service.
        Fine-tune from <span className="font-medium text-slate-700">Availability → Booking Rules</span> any time.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-5">
        {drafts.map((d, i) => (
          <div key={d.service_id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">{services[i]?.name ?? `Service ${i + 1}`}</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Minimum notice (hours)</label>
                  <select
                    value={d.min_advance_minutes / 60}
                    onChange={(e) => update(i, { min_advance_minutes: parseInt(e.target.value) * 60 })}
                    className={inputCls}
                    disabled={saving}
                  >
                    {[0, 1, 2, 4, 6, 12, 24, 48].map((h) => (
                      <option key={h} value={h}>{h === 0 ? 'No minimum' : `${h}h`}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Max advance booking (days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={d.max_advance_days}
                    onChange={(e) => update(i, { max_advance_days: Math.max(1, parseInt(e.target.value) || 1) })}
                    className={inputCls}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Min party size (online)</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={d.min_party_size_online}
                    onChange={(e) => update(i, { min_party_size_online: Math.max(1, parseInt(e.target.value) || 1) })}
                    className={inputCls}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Max party size (online)</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={d.max_party_size_online}
                    onChange={(e) => update(i, { max_party_size_online: Math.max(1, parseInt(e.target.value) || 1) })}
                    className={inputCls}
                    disabled={saving}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Cancellation notice (hours)</label>
                <select
                  value={d.cancellation_notice_hours}
                  onChange={(e) => update(i, { cancellation_notice_hours: parseInt(e.target.value) })}
                  className={inputCls}
                  disabled={saving}
                >
                  {[0, 2, 4, 12, 24, 48, 72].map((h) => (
                    <option key={h} value={h}>{h === 0 ? 'No notice required' : `${h}h`}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Guests must cancel at least this many hours before the reservation to receive a deposit refund.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={depositsEnabled[i] ?? false}
                    onChange={(e) => toggleDeposit(i, e.target.checked)}
                    disabled={saving}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-slate-700">Require deposit for online bookings</span>
                </label>
                {depositsEnabled[i] && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Require from party size</label>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={d.deposit_required_from_party_size ?? 1}
                        onChange={(e) => update(i, { deposit_required_from_party_size: Math.max(1, parseInt(e.target.value) || 1) })}
                        className={inputCls}
                        disabled={saving}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Amount per person (£)</label>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={d.deposit_amount_per_person_gbp ?? ''}
                        onChange={(e) => update(i, { deposit_amount_per_person_gbp: parseFloat(e.target.value) || null })}
                        placeholder="e.g. 10"
                        className={inputCls}
                        disabled={saving}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={onDone}
          disabled={saving}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & continue'}
        </button>
      </div>
    </div>
  );
}
