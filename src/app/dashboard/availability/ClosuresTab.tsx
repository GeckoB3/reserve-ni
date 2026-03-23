'use client';

import { useEffect, useState } from 'react';
import { NumericInput } from '@/components/ui/NumericInput';

interface Block {
  id: string;
  venue_id: string;
  service_id: string | null;
  block_type: 'closed' | 'reduced_capacity' | 'special_event';
  date_start: string;
  date_end: string;
  time_start: string | null;
  time_end: string | null;
  override_max_covers: number | null;
  reason: string | null;
  yield_overrides?: Record<string, number> | null;
}

interface ServiceLite {
  id: string;
  name: string;
}

interface Props {
  services: ServiceLite[];
  showToast: (msg: string) => void;
}

const BLOCK_TYPE_LABELS: Record<Block['block_type'], string> = {
  closed: 'Closed',
  reduced_capacity: 'Reduced Capacity',
  special_event: 'Special Event',
};

const BLOCK_TYPE_COLORS: Record<Block['block_type'], string> = {
  closed: 'bg-red-100 text-red-700',
  reduced_capacity: 'bg-amber-100 text-amber-700',
  special_event: 'bg-blue-100 text-blue-700',
};

export function ClosuresTab({ services, showToast }: Props) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    block_type: 'closed' as Block['block_type'],
    service_id: '' as string,
    date_start: '',
    date_end: '',
    time_start: null as string | null,
    time_end: null as string | null,
    override_max_covers: null as number | null,
    reason: '',
    yield_max_bookings: null as number | null,
    yield_interval: null as number | null,
    yield_buffer: null as number | null,
    yield_duration: null as number | null,
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/venue/availability-blocks');
        if (res.ok) {
          const data = await res.json();
          setBlocks(data.blocks ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleCreate() {
    if (!draft.date_start || !draft.date_end) return;
    setSaving(true);
    try {
      const res = await fetch('/api/venue/availability-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_type: draft.block_type,
          service_id: draft.service_id || null,
          date_start: draft.date_start,
          date_end: draft.date_end,
          time_start: draft.time_start || null,
          time_end: draft.time_end || null,
          reason: draft.reason || null,
          override_max_covers: draft.block_type === 'reduced_capacity' ? draft.override_max_covers : null,
          yield_overrides:
            draft.block_type === 'reduced_capacity'
              ? (() => {
                  const o: Record<string, number> = {};
                  if (draft.yield_max_bookings != null) o.max_bookings_per_slot = draft.yield_max_bookings;
                  if (draft.yield_interval != null) o.slot_interval_minutes = draft.yield_interval;
                  if (draft.yield_buffer != null) o.buffer_minutes = draft.yield_buffer;
                  if (draft.yield_duration != null) o.duration_minutes = draft.yield_duration;
                  return Object.keys(o).length > 0 ? o : null;
                })()
              : null,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBlocks([...blocks, data.block]);
      setCreating(false);
      setDraft({
        block_type: 'closed',
        service_id: '',
        date_start: '',
        date_end: '',
        time_start: null,
        time_end: null,
        override_max_covers: null,
        reason: '',
        yield_max_bookings: null,
        yield_interval: null,
        yield_buffer: null,
        yield_duration: null,
      });
      showToast('Block created');
    } catch {
      showToast('Failed to create block');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this closure/block?')) return;
    try {
      await fetch('/api/venue/availability-blocks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setBlocks(blocks.filter((b) => b.id !== id));
      showToast('Block removed');
    } catch {
      showToast('Failed to remove block');
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>;
  }

  const futureBlocks = blocks.filter((b) => b.date_end >= new Date().toISOString().slice(0, 10));
  const pastBlocks = blocks.filter((b) => b.date_end < new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-6">
      {/* Upcoming blocks */}
      {futureBlocks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Upcoming</h3>
          {futureBlocks.map((block) => (
            <div key={block.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${BLOCK_TYPE_COLORS[block.block_type]}`}>
                    {BLOCK_TYPE_LABELS[block.block_type]}
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {block.date_start === block.date_end ? block.date_start : `${block.date_start} – ${block.date_end}`}
                  </span>
                  {block.time_start && block.time_end && (
                    <span className="text-xs text-slate-400">{block.time_start}–{block.time_end}</span>
                  )}
                </div>
                {block.reason && <p className="mt-1 text-xs text-slate-500">{block.reason}</p>}
                {block.override_max_covers != null && (
                  <p className="mt-1 text-xs text-amber-600">Reduced to {block.override_max_covers} covers</p>
                )}
                {block.service_id && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Service: {services.find((s) => s.id === block.service_id)?.name ?? block.service_id.slice(0, 8)}
                  </p>
                )}
              </div>
              <button onClick={() => handleDelete(block.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {pastBlocks.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-slate-500">Past blocks ({pastBlocks.length})</summary>
          <div className="mt-2 space-y-2">
            {pastBlocks.map((block) => (
              <div key={block.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-400">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${BLOCK_TYPE_COLORS[block.block_type]}`}>{BLOCK_TYPE_LABELS[block.block_type]}</span>
                {block.date_start === block.date_end ? block.date_start : `${block.date_start} – ${block.date_end}`}
                {block.reason && ` — ${block.reason}`}
              </div>
            ))}
          </div>
        </details>
      )}

      {blocks.length === 0 && !creating && (
        <p className="text-center text-sm text-slate-400">No closures or blocks configured.</p>
      )}

      {creating ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">New Closure / Block</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
              <select value={draft.block_type} onChange={(e) => setDraft({ ...draft, block_type: e.target.value as Block['block_type'] })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="closed">Closed</option>
                <option value="reduced_capacity">Reduced Capacity</option>
                <option value="special_event">Special Event</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Service scope</label>
              <select
                value={draft.service_id}
                onChange={(e) => setDraft({ ...draft, service_id: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Start date</label>
              <input type="date" value={draft.date_start} onChange={(e) => setDraft({ ...draft, date_start: e.target.value, date_end: draft.date_end || e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">End date</label>
              <input type="date" value={draft.date_end} onChange={(e) => setDraft({ ...draft, date_end: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Start time (optional)</label>
              <input type="time" value={draft.time_start ?? ''} onChange={(e) => setDraft({ ...draft, time_start: e.target.value || null })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">End time (optional)</label>
              <input type="time" value={draft.time_end ?? ''} onChange={(e) => setDraft({ ...draft, time_end: e.target.value || null })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            {draft.block_type === 'reduced_capacity' && (
              <>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Override max covers</label>
                  <NumericInput min={0} value={draft.override_max_covers} onChange={(v) => setDraft({ ...draft, override_max_covers: v })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2 rounded-lg border border-amber-100 bg-amber-50/30 p-2">
                  <p className="col-span-2 text-[10px] font-medium text-amber-900">Optional yield overrides</p>
                  <div>
                    <label className="text-[10px] text-slate-600">Max bookings / slot</label>
                    <NumericInput min={1} value={draft.yield_max_bookings} onChange={(v) => setDraft({ ...draft, yield_max_bookings: v })} className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-600">Slot interval (min)</label>
                    <NumericInput min={5} value={draft.yield_interval} onChange={(v) => setDraft({ ...draft, yield_interval: v })} className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-600">Buffer (min)</label>
                    <NumericInput min={0} value={draft.yield_buffer} onChange={(v) => setDraft({ ...draft, yield_buffer: v })} className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-600">Duration (min)</label>
                    <NumericInput min={15} value={draft.yield_duration} onChange={(v) => setDraft({ ...draft, yield_duration: v })} className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
                  </div>
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Reason (optional)</label>
              <input type="text" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="e.g. Private function, Staff holiday" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !draft.date_start || !draft.date_end} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Block'}
            </button>
            <button onClick={() => setCreating(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-4 text-sm font-medium text-slate-500 transition-colors hover:border-brand-300 hover:text-brand-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Closure / Block
        </button>
      )}
    </div>
  );
}
