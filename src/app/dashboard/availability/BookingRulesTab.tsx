'use client';

import { useEffect, useState } from 'react';
import { HelpTooltip } from '@/components/dashboard/HelpTooltip';
import { helpContent } from '@/lib/help-content';
import { NumericInput } from '@/components/ui/NumericInput';

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
  deposit_amount_per_person_gbp: number | null;
  /** Persisted as true whenever deposits are enabled; public booking always collects when rule applies. */
  online_requires_deposit?: boolean;
  cancellation_notice_hours?: number;
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
  deposit_amount_per_person_gbp: null,
  cancellation_notice_hours: 48,
});

export function BookingRulesTab({ services, showToast }: Props) {
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Restriction | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const restrictionsRes = await fetch('/api/venue/booking-restrictions');
        if (restrictionsRes.ok) {
          const data = await restrictionsRes.json();
          setRestrictions(data.restrictions ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave(serviceId: string, data: Restriction) {
    if (data.deposit_required_from_party_size != null) {
      const amt = data.deposit_amount_per_person_gbp;
      if (typeof amt !== 'number' || !Number.isFinite(amt) || amt <= 0) {
        showToast('Enter a deposit amount per person greater than £0 when deposits are required.');
        return;
      }
    }
    setSaving(true);
    const existing = restrictions.find((r) => r.service_id === serviceId);
    const { id: _draftId, ...rest } = data;
    const payload = {
      ...rest,
      online_requires_deposit: true as const,
    };
    try {
      if (existing) {
        const res = await fetch('/api/venue/booking-restrictions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: existing.id, ...payload }),
        });
        if (!res.ok) throw new Error();
        const json = await res.json();
        setRestrictions(restrictions.map((r) => (r.id === existing.id ? json.restriction : r)));
      } else {
        const res = await fetch('/api/venue/booking-restrictions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
        <strong>Deposits:</strong> Configure per dining service below (amount per person and which party sizes trigger a
        deposit for <span className="font-medium">guest</span> online bookings). Staff use the &ldquo;Require deposit&rdquo;
        toggle on the New Booking form to request a payment link case by case. Deposit refunds use the cancellation notice
        hours set for each service.
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
                    setEditDraft(
                      restriction
                        ? {
                            ...restriction,
                            deposit_amount_per_person_gbp: restriction.deposit_amount_per_person_gbp ?? null,
                          }
                        : ({ id: '', ...defaultRestriction(service.id) } as Restriction),
                    );
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
                    <NumericInput min={0} value={draft.min_advance_minutes} onChange={(v) => setEditDraft({ ...draft, min_advance_minutes: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      Max advance (days) <HelpTooltip content={helpContent.bookingRules.maxAdvance} />
                    </label>
                    <NumericInput min={1} max={365} value={draft.max_advance_days} onChange={(v) => setEditDraft({ ...draft, max_advance_days: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      Min party size online <HelpTooltip content={helpContent.bookingRules.partySize} />
                    </label>
                    <NumericInput min={1} value={draft.min_party_size_online} onChange={(v) => setEditDraft({ ...draft, min_party_size_online: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Max party size online</label>
                    <NumericInput min={1} value={draft.max_party_size_online} onChange={(v) => setEditDraft({ ...draft, max_party_size_online: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      Cancellation notice (hours) — deposit refund{' '}
                      <HelpTooltip content="Guests who cancel at least this many hours before the reservation start can receive an automatic deposit refund (when deposits apply)." />
                    </label>
                    <NumericInput
                      min={0}
                      max={168}
                      value={draft.cancellation_notice_hours ?? 48}
                      onChange={(v) => setEditDraft({ ...draft, cancellation_notice_hours: v })}
                      className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
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
                        <NumericInput min={2} value={draft.large_party_threshold} onChange={(v) => setEditDraft({ ...draft, large_party_threshold: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-600">Message shown to guests</label>
                        <input type="text" value={draft.large_party_message ?? ''} onChange={(e) => setEditDraft({ ...draft, large_party_message: e.target.value || null })} placeholder="e.g. Please call us for parties of 8+" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Deposits (per service) */}
                <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={draft.deposit_required_from_party_size != null}
                      onChange={(e) => setEditDraft({
                        ...draft,
                        deposit_required_from_party_size: e.target.checked ? 6 : null,
                        deposit_amount_per_person_gbp: e.target.checked
                          ? (draft.deposit_amount_per_person_gbp == null ? 5 : draft.deposit_amount_per_person_gbp)
                          : null,
                      })}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      Require deposits for this service <HelpTooltip content={helpContent.bookingRules.depositThreshold} />
                    </span>
                  </label>
                  {draft.deposit_required_from_party_size != null && (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Deposit from party size</label>
                        <NumericInput min={1} value={draft.deposit_required_from_party_size} onChange={(v) => setEditDraft({ ...draft, deposit_required_from_party_size: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      </div>
                      <div className="max-w-xs">
                        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          Amount per person (£) <HelpTooltip content="Charged per guest when the party size threshold is met. Example: £5 × 4 guests = £20 total." />
                        </label>
                        <NumericInput
                          allowFloat
                          min={0.01}
                          max={100}
                          value={draft.deposit_amount_per_person_gbp ?? 5}
                          onChange={(v) => setEditDraft({ ...draft, deposit_amount_per_person_gbp: v > 0 ? v : null })}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
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
                <div><span className="text-slate-500">Cancellation (refund):</span> <span className="font-medium text-slate-700">{restriction.cancellation_notice_hours ?? 48} h before start</span></div>
                <div>
                  <span className="text-slate-500">Large party redirect:</span>{' '}
                  <span className="font-medium text-slate-700">
                    {restriction.large_party_threshold ? `${restriction.large_party_threshold}+` : 'Off'}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Deposits:</span>{' '}
                  <span className="font-medium text-slate-700">
                    {restriction.deposit_required_from_party_size
                      ? `${restriction.deposit_required_from_party_size}+ guests, £${restriction.deposit_amount_per_person_gbp ?? '—'} pp (guest bookings)`
                      : 'Off'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No booking rules configured. Click Configure to set advance windows, party sizes, and{' '}
                <span className="font-medium text-slate-600">cancellation notice for deposit refunds</span> for this
                service.
              </p>
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
