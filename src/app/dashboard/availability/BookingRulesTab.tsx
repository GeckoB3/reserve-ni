'use client';

import { useEffect, useState } from 'react';

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

export function BookingRulesTab({ services, showToast }: Props) {
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Restriction | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/venue/booking-restrictions');
        if (res.ok) {
          const data = await res.json();
          setRestrictions(data.restrictions ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
                    <label className="mb-1 block text-xs font-medium text-slate-600">Min advance (minutes)</label>
                    <input type="number" min={0} value={draft.min_advance_minutes} onChange={(e) => setEditDraft({ ...draft, min_advance_minutes: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Max advance (days)</label>
                    <input type="number" min={1} max={365} value={draft.max_advance_days} onChange={(e) => setEditDraft({ ...draft, max_advance_days: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Min party size online</label>
                    <input type="number" min={1} value={draft.min_party_size_online} onChange={(e) => setEditDraft({ ...draft, min_party_size_online: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Max party size online</label>
                    <input type="number" min={1} value={draft.max_party_size_online} onChange={(e) => setEditDraft({ ...draft, max_party_size_online: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Large party threshold</label>
                    <input type="number" min={1} value={draft.large_party_threshold ?? ''} onChange={(e) => setEditDraft({ ...draft, large_party_threshold: e.target.value ? parseInt(e.target.value) : null })} placeholder="e.g. 8" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Deposit from party size</label>
                    <input type="number" min={1} value={draft.deposit_required_from_party_size ?? ''} onChange={(e) => setEditDraft({ ...draft, deposit_required_from_party_size: e.target.value ? parseInt(e.target.value) : null })} placeholder="e.g. 6" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Large party message</label>
                  <input type="text" value={draft.large_party_message ?? ''} onChange={(e) => setEditDraft({ ...draft, large_party_message: e.target.value || null })} placeholder="e.g. Please call us for parties of 8+" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
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
                {restriction.large_party_threshold && (
                  <div><span className="text-slate-500">Large party:</span> <span className="font-medium text-slate-700">{restriction.large_party_threshold}+</span></div>
                )}
                {restriction.deposit_required_from_party_size && (
                  <div><span className="text-slate-500">Deposit from:</span> <span className="font-medium text-slate-700">{restriction.deposit_required_from_party_size}+ guests</span></div>
                )}
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
