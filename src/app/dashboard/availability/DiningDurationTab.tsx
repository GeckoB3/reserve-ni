'use client';

import { useEffect, useState } from 'react';
import { NumericInput } from '@/components/ui/NumericInput';

interface Service { id: string; name: string; }
interface Duration {
  id: string;
  service_id: string;
  min_party_size: number;
  max_party_size: number;
  duration_minutes: number;
  day_of_week: number | null;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  services: Service[];
  showToast: (msg: string) => void;
  selectedAreaId?: string | null;
}

export function DiningDurationTab({ services, showToast, selectedAreaId }: Props) {
  const [durations, setDurations] = useState<Duration[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Duration | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!selectedAreaId) {
        setDurations([]);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/venue/party-size-durations?area_id=${encodeURIComponent(selectedAreaId)}`);
        if (res.ok) {
          const data = await res.json();
          setDurations(data.durations ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedAreaId]);

  async function handleCreate(serviceId: string, minPs: number, maxPs: number, dur: number) {
    setSaving(true);
    try {
      const res = await fetch('/api/venue/party-size-durations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId, min_party_size: minPs, max_party_size: maxPs, duration_minutes: dur }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDurations([...durations, data.duration]);
      setCreating(null);
      showToast('Duration added');
    } catch {
      showToast('Failed to add duration');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editDraft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/venue/party-size-durations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDurations(durations.map((d) => (d.id === editDraft.id ? data.duration : d)));
      setEditingId(null);
      setEditDraft(null);
      showToast('Duration updated');
    } catch {
      showToast('Failed to update duration');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch('/api/venue/party-size-durations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setDurations(durations.filter((d) => d.id !== id));
      showToast('Duration deleted');
    } catch {
      showToast('Failed to delete');
    }
  }

  async function seedDefaults(serviceId: string) {
    const defaults = [
      { min: 1, max: 2, dur: 75 },
      { min: 3, max: 4, dur: 90 },
      { min: 5, max: 6, dur: 120 },
      { min: 7, max: 20, dur: 150 },
    ];
    setSaving(true);
    for (const { min, max, dur } of defaults) {
      await handleCreate(serviceId, min, max, dur);
    }
    setSaving(false);
    showToast('Default durations added');
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      {services.map((service) => {
        const serviceDurations = durations
          .filter((d) => d.service_id === service.id)
          .sort((a, b) => a.min_party_size - b.min_party_size);

        return (
          <div key={service.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{service.name}</h3>
              <div className="flex gap-2">
                {serviceDurations.length === 0 && (
                  <button onClick={() => seedDefaults(service.id)} disabled={saving} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    Add Defaults
                  </button>
                )}
                <button onClick={() => setCreating(service.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  + Add
                </button>
              </div>
            </div>

            {serviceDurations.length === 0 ? (
              <p className="text-sm text-slate-400">No durations configured. Click &quot;Add Defaults&quot; for standard settings.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Party Size</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Duration</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Day</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {serviceDurations.map((dur) => (
                      <tr key={dur.id}>
                        {editingId === dur.id && editDraft ? (
                          <>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <NumericInput min={1} value={editDraft.min_party_size} onChange={(v) => setEditDraft({ ...editDraft, min_party_size: v })} className="w-14 rounded border border-slate-200 px-2 py-1 text-sm" />
                                <span className="text-slate-400">–</span>
                                <NumericInput min={1} value={editDraft.max_party_size} onChange={(v) => setEditDraft({ ...editDraft, max_party_size: v })} className="w-14 rounded border border-slate-200 px-2 py-1 text-sm" />
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <NumericInput min={15} value={editDraft.duration_minutes} onChange={(v) => setEditDraft({ ...editDraft, duration_minutes: v })} className="w-20 rounded border border-slate-200 px-2 py-1 text-sm" />
                            </td>
                            <td className="px-3 py-2">
                              <select value={editDraft.day_of_week ?? ''} onChange={(e) => setEditDraft({ ...editDraft, day_of_week: e.target.value ? parseInt(e.target.value) : null })} className="rounded border border-slate-200 px-2 py-1 text-sm">
                                <option value="">All</option>
                                {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={handleUpdate} disabled={saving} className="mr-1 text-xs font-medium text-brand-600">Save</button>
                              <button onClick={() => { setEditingId(null); setEditDraft(null); }} className="text-xs text-slate-400">Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-slate-700">{dur.min_party_size}–{dur.max_party_size} guests</td>
                            <td className="px-3 py-2 text-slate-700">{dur.duration_minutes} min</td>
                            <td className="px-3 py-2 text-slate-500">{dur.day_of_week != null ? DAY_LABELS[dur.day_of_week] : 'All days'}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => { setEditingId(dur.id); setEditDraft(dur); }} className="mr-2 text-xs text-slate-400 hover:text-slate-700">Edit</button>
                              <button onClick={() => handleDelete(dur.id)} className="text-xs text-slate-400 hover:text-red-600">Delete</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {creating === service.id && (
              <CreateDurationForm
                serviceId={service.id}
                saving={saving}
                onCreate={(min, max, dur) => handleCreate(service.id, min, max, dur)}
                onCancel={() => setCreating(null)}
              />
            )}
          </div>
        );
      })}

      {services.length === 0 && (
        <p className="text-center text-sm text-slate-400">Create a service first to configure dining durations.</p>
      )}
    </div>
  );
}

function CreateDurationForm({ serviceId, saving, onCreate, onCancel }: {
  serviceId: string;
  saving: boolean;
  onCreate: (min: number, max: number, dur: number) => void;
  onCancel: () => void;
}) {
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(4);
  const [dur, setDur] = useState(90);

  void serviceId;

  return (
    <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/30 p-3">
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Min party</label>
          <NumericInput min={1} value={min} onChange={(v) => setMin(v)} className="w-16 rounded border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Max party</label>
          <NumericInput min={1} value={max} onChange={(v) => setMax(v)} className="w-16 rounded border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Duration (min)</label>
          <NumericInput min={15} value={dur} onChange={(v) => setDur(v)} className="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
        <button onClick={() => onCreate(min, max, dur)} disabled={saving} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">Add</button>
        <button onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">Cancel</button>
      </div>
    </div>
  );
}
