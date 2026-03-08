'use client';

import { useEffect, useState } from 'react';
import { HelpTooltip } from '@/components/dashboard/HelpTooltip';
import { helpContent } from '@/lib/help-content';

interface Service { id: string; name: string; }
interface Restriction {
  id: string;
  service_id: string;
  min_advance_minutes: number;
  max_advance_days: number;
  min_party_size_online: number;
  max_party_size_online: number;
  large_party_threshold: number | null;
  large_party_message: string | null;
  deposit_required_from_party_size: number | null;
}

interface DepositConfig {
  enabled: boolean;
  amount_per_person_gbp: number;
  online_requires_deposit: boolean;
  phone_requires_deposit: boolean;
}

interface Props {
  services: Service[];
  showToast: (msg: string) => void;
}

const defaultRestriction = (serviceId: string): Omit<Restriction, 'id'> => ({
  service_id: serviceId,
  min_advance_minutes: 60,
  max_advance_days: 60,
  min_party_size_online: 1,
  max_party_size_online: 10,
  large_party_threshold: null,
  large_party_message: null,
  deposit_required_from_party_size: null,
});

const defaultDeposit: DepositConfig = {
  enabled: false,
  amount_per_person_gbp: 5,
  online_requires_deposit: true,
  phone_requires_deposit: false,
};

export function BookingRulesTab({ services, showToast }: Props) {
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [depositConfig, setDepositConfig] = useState<DepositConfig>(defaultDeposit);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Restriction | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingDeposit, setSavingDeposit] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [restrictionsRes, venueRes] = await Promise.all([
          fetch('/api/venue/booking-restrictions'),
          fetch('/api/venue'),
        ]);
        if (restrictionsRes.ok) {
          const data = await restrictionsRes.json();
          setRestrictions(data.restrictions ?? []);
        }
        if (venueRes.ok) {
          const venue = await venueRes.json();
          if (venue.deposit_config) {
            setDepositConfig({
              enabled: venue.deposit_config.enabled ?? false,
              amount_per_person_gbp: venue.deposit_config.amount_per_person_gbp ?? 5,
              online_requires_deposit: venue.deposit_config.online_requires_deposit !== false,
              phone_requires_deposit: venue.deposit_config.phone_requires_deposit ?? false,
            });
          }
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSaveDeposit() {
    setSavingDeposit(true);
    try {
      const res = await fetch('/api/venue/deposit-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(depositConfig),
      });
      if (!res.ok) throw new Error();
      showToast('Deposit settings saved');
    } catch {
      showToast('Failed to save deposit settings');
    } finally {
      setSavingDeposit(false);
    }
  }

  async function handleSave(serviceId: string, data: Omit<Restriction, 'id'>) {
    setSaving(true);
    const existing = restrictions.find((r) => r.service_id === serviceId);
    try {
      if (existing) {
        const res = await fetch('/api/venue/booking-restrictions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: existing.id, ...data }),
        });
        if (!res.ok) throw new Error();
        const json = await res.json();
        setRestrictions(restrictions.map((r) => (r.id === existing.id ? json.restriction : r)));
      } else {
        const res = await fetch('/api/venue/booking-restrictions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error();
        const json = await res.json();
        setRestrictions([...restrictions, json.restriction]);
      }
      setEditingId(null);
      setEditDraft(null);
      showToast('Booking rules saved');
    } catch {
      showToast('Failed to save booking rules');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Venue-wide deposit settings */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 font-semibold text-slate-900">Deposit Settings</h3>
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          <strong>Cancellation policy (MVP):</strong> Deposits are refundable if the guest cancels at least 48 hours before the booking time. Otherwise the deposit is forfeited.
        </div>
        <div className="space-y-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={depositConfig.enabled}
              onChange={(e) => setDepositConfig({ ...depositConfig, enabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            <span className="text-sm font-medium text-slate-700">Enable deposits</span>
          </label>

          {depositConfig.enabled && (
            <div className="space-y-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
              <div className="max-w-xs">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  Amount per person (£) <HelpTooltip content="The deposit amount charged per guest. For example, £5 per person for a party of 4 = £20 total deposit." />
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={depositConfig.amount_per_person_gbp}
                  onChange={(e) => setDepositConfig({ ...depositConfig, amount_per_person_gbp: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={depositConfig.online_requires_deposit}
                    onChange={(e) => setDepositConfig({ ...depositConfig, online_requires_deposit: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  <span className="text-xs font-medium text-slate-600">Online bookings require deposit</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={depositConfig.phone_requires_deposit}
                    onChange={(e) => setDepositConfig({ ...depositConfig, phone_requires_deposit: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  <span className="text-xs font-medium text-slate-600">Phone bookings require deposit</span>
                </label>
              </div>
              <p className="text-[11px] text-slate-400">
                Use the per-service &ldquo;Require deposits&rdquo; toggle below to control which party sizes need a deposit for each service.
              </p>
            </div>
          )}

          <button
            onClick={handleSaveDeposit}
            disabled={savingDeposit}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {savingDeposit ? 'Saving...' : 'Save deposit settings'}
          </button>
        </div>
      </div>

      {/* Per-service booking rules */}
      {services.map((service) => {
        const restriction = restrictions.find((r) => r.service_id === service.id);
        const isEditing = editingId === service.id;
        const draft = isEditing ? editDraft : null;

        return (
          <div key={service.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{service.name}</h3>
              {!isEditing && (
                <button
                  onClick={() => {
                    setEditingId(service.id);
                    setEditDraft(restriction ? { ...restriction } : { id: '', ...defaultRestriction(service.id) } as Restriction);
                  }}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  {restriction ? 'Edit' : 'Configure'}
                </button>
              )}
            </div>

            {isEditing && draft ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      Min advance (minutes) <HelpTooltip content={helpContent.bookingRules.minAdvance} />
                    </label>
                    <input type="number" min={0} value={draft.min_advance_minutes} onChange={(e) => setEditDraft({ ...draft, min_advance_minutes: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      Max advance (days) <HelpTooltip content={helpContent.bookingRules.maxAdvance} />
                    </label>
                    <input type="number" min={1} max={365} value={draft.max_advance_days} onChange={(e) => setEditDraft({ ...draft, max_advance_days: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      Min party size online <HelpTooltip content={helpContent.bookingRules.partySize} />
                    </label>
                    <input type="number" min={1} value={draft.min_party_size_online} onChange={(e) => setEditDraft({ ...draft, min_party_size_online: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Max party size online</label>
                    <input type="number" min={1} value={draft.max_party_size_online} onChange={(e) => setEditDraft({ ...draft, max_party_size_online: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                </div>

                {/* Large party redirect */}
                <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={draft.large_party_threshold != null}
                      onChange={(e) => setEditDraft({
                        ...draft,
                        large_party_threshold: e.target.checked ? 8 : null,
                        large_party_message: e.target.checked ? (draft.large_party_message || 'For parties of 8 or more, please call us directly.') : null,
                      })}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      Enable large party redirect <HelpTooltip content={helpContent.bookingRules.largePartyThreshold} />
                    </span>
                  </label>
                  {draft.large_party_threshold != null && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Redirect from party size</label>
                        <input type="number" min={2} value={draft.large_party_threshold} onChange={(e) => setEditDraft({ ...draft, large_party_threshold: parseInt(e.target.value) || 8 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-600">Message shown to guests</label>
                        <input type="text" value={draft.large_party_message ?? ''} onChange={(e) => setEditDraft({ ...draft, large_party_message: e.target.value || null })} placeholder="e.g. Please call us for parties of 8+" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Deposit threshold */}
                <div className={`rounded-lg border p-3 space-y-3 ${depositConfig.enabled ? 'border-slate-200' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={draft.deposit_required_from_party_size != null}
                      onChange={(e) => setEditDraft({
                        ...draft,
                        deposit_required_from_party_size: e.target.checked ? 6 : null,
                      })}
                      disabled={!depositConfig.enabled}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      Require deposits for this service <HelpTooltip content={helpContent.bookingRules.depositThreshold} />
                    </span>
                  </label>
                  {!depositConfig.enabled && (
                    <p className="text-[11px] text-slate-400">Enable deposits in the Deposit Settings section above first.</p>
                  )}
                  {draft.deposit_required_from_party_size != null && depositConfig.enabled && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Deposit from party size</label>
                      <input type="number" min={1} value={draft.deposit_required_from_party_size} onChange={(e) => setEditDraft({ ...draft, deposit_required_from_party_size: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      <p className="mt-1 text-[11px] text-slate-400">
                        £{depositConfig.amount_per_person_gbp} per person for parties of {draft.deposit_required_from_party_size}+
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handleSave(service.id, draft)} disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setEditingId(null); setEditDraft(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            ) : restriction ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-slate-500">Min advance:</span> <span className="font-medium text-slate-700">{restriction.min_advance_minutes} min</span></div>
                <div><span className="text-slate-500">Max advance:</span> <span className="font-medium text-slate-700">{restriction.max_advance_days} days</span></div>
                <div><span className="text-slate-500">Party size:</span> <span className="font-medium text-slate-700">{restriction.min_party_size_online}–{restriction.max_party_size_online}</span></div>
                <div>
                  <span className="text-slate-500">Large party redirect:</span>{' '}
                  <span className="font-medium text-slate-700">
                    {restriction.large_party_threshold ? `${restriction.large_party_threshold}+` : 'Off'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Deposit required:</span>{' '}
                  <span className="font-medium text-slate-700">
                    {restriction.deposit_required_from_party_size ? `${restriction.deposit_required_from_party_size}+ guests` : 'Off'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No booking rules configured. Default rules will apply.</p>
            )}
          </div>
        );
      })}

      {services.length === 0 && (
        <p className="text-center text-sm text-slate-400">Create a service first to configure booking rules.</p>
      )}
    </div>
  );
}
