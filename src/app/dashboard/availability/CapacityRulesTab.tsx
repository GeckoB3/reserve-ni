'use client';

import { useEffect, useState } from 'react';
import { HelpTooltip } from '@/components/dashboard/HelpTooltip';
import { helpContent } from '@/lib/help-content';
import { NumericInput } from '@/components/ui/NumericInput';

interface Service { id: string; name: string; }
interface CapacityRule {
  id: string;
  service_id: string;
  max_covers_per_slot: number;
  max_bookings_per_slot: number;
  slot_interval_minutes: number;
  buffer_minutes: number;
  day_of_week: number | null;
  time_range_start: string | null;
  time_range_end: string | null;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  services: Service[];
  showToast: (msg: string) => void;
  selectedAreaId?: string | null;
}

const defaultRule = (serviceId: string): Omit<CapacityRule, 'id'> => ({
  service_id: serviceId,
  max_covers_per_slot: 20,
  max_bookings_per_slot: 10,
  slot_interval_minutes: 15,
  buffer_minutes: 15,
  day_of_week: null,
  time_range_start: null,
  time_range_end: null,
});

export function CapacityRulesTab({ services, showToast, selectedAreaId }: Props) {
  const [rules, setRules] = useState<CapacityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CapacityRule | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<Omit<CapacityRule, 'id'> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!selectedAreaId) {
        setRules([]);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/venue/capacity-rules?area_id=${encodeURIComponent(selectedAreaId)}`);
        if (res.ok) {
          const data = await res.json();
          setRules(data.rules ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedAreaId]);

  async function handleCreate() {
    if (!createDraft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/venue/capacity-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createDraft),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRules([...rules, data.rule]);
      setCreating(null);
      setCreateDraft(null);
      showToast('Rule created');
    } catch {
      showToast('Failed to create rule');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editDraft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/venue/capacity-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRules(rules.map((r) => (r.id === editDraft.id ? data.rule : r)));
      setEditingId(null);
      setEditDraft(null);
      showToast('Rule updated');
    } catch {
      showToast('Failed to update rule');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this rule?')) return;
    try {
      await fetch('/api/venue/capacity-rules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setRules(rules.filter((r) => r.id !== id));
      showToast('Rule deleted');
    } catch {
      showToast('Failed to delete rule');
    }
  }

  function renderRuleForm(data: Omit<CapacityRule, 'id'>, onChange: (d: Omit<CapacityRule, 'id'>) => void) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            Max covers/slot <HelpTooltip content={helpContent.capacityRules.maxCoversPerSlot} />
          </label>
          <NumericInput min={1} value={data.max_covers_per_slot} onChange={(v) => onChange({ ...data, max_covers_per_slot: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            Max bookings/slot <HelpTooltip content={helpContent.capacityRules.maxBookingsPerSlot} />
          </label>
          <NumericInput min={1} value={data.max_bookings_per_slot} onChange={(v) => onChange({ ...data, max_bookings_per_slot: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            Slot interval (min) <HelpTooltip content={helpContent.capacityRules.slotInterval} />
          </label>
          <select value={data.slot_interval_minutes} onChange={(e) => onChange({ ...data, slot_interval_minutes: parseInt(e.target.value) })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
          </select>
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            Buffer (min) <HelpTooltip content={helpContent.capacityRules.bufferMinutes} />
          </label>
          <NumericInput min={0} max={120} value={data.buffer_minutes} onChange={(v) => onChange({ ...data, buffer_minutes: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            Day override <HelpTooltip content={helpContent.capacityRules.dayOverride} />
          </label>
          <select value={data.day_of_week ?? ''} onChange={(e) => onChange({ ...data, day_of_week: e.target.value ? parseInt(e.target.value) : null })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">All days (default)</option>
            {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            Time range <HelpTooltip content={helpContent.capacityRules.timeOverride} />
          </label>
          <div className="flex items-center gap-1">
            <input type="time" value={data.time_range_start ?? ''} onChange={(e) => onChange({ ...data, time_range_start: e.target.value || null })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" placeholder="Start" />
            <span className="text-xs text-slate-400">–</span>
            <input type="time" value={data.time_range_end ?? ''} onChange={(e) => onChange({ ...data, time_range_end: e.target.value || null })} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" placeholder="End" />
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      {services.map((service) => {
        const serviceRules = rules.filter((r) => r.service_id === service.id);
        return (
          <div key={service.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{service.name}</h3>
              <button
                onClick={() => { setCreating(service.id); setCreateDraft(defaultRule(service.id)); }}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                + Add Override
              </button>
            </div>

            {serviceRules.length === 0 && (
              <p className="text-sm text-slate-400">No rules configured. Click &quot;Add Override&quot; to set capacity limits.</p>
            )}

            <div className="space-y-3">
              {serviceRules.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  {editingId === rule.id && editDraft ? (
                    <div className="space-y-3">
                      {renderRuleForm(editDraft, (d) => setEditDraft({ ...editDraft, ...d } as CapacityRule))}
                      <div className="flex gap-2">
                        <button onClick={handleUpdate} disabled={saving} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">Save</button>
                        <button onClick={() => { setEditingId(null); setEditDraft(null); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="font-medium text-slate-700">{rule.max_covers_per_slot} covers, {rule.max_bookings_per_slot} bookings</span>
                        <span className="text-slate-400"> · {rule.slot_interval_minutes}min slots · {rule.buffer_minutes}min buffer</span>
                        {rule.day_of_week != null && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{DAY_LABELS[rule.day_of_week]}</span>}
                        {rule.time_range_start && <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">{rule.time_range_start}–{rule.time_range_end}</span>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingId(rule.id); setEditDraft(rule); }} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(rule.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {creating === service.id && createDraft && (
              <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/30 p-3 space-y-3">
                {renderRuleForm(createDraft, setCreateDraft)}
                <div className="flex gap-2">
                  <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">Create</button>
                  <button onClick={() => { setCreating(null); setCreateDraft(null); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {services.length === 0 && (
        <p className="text-center text-sm text-slate-400">Create a service first to set capacity rules.</p>
      )}
    </div>
  );
}
