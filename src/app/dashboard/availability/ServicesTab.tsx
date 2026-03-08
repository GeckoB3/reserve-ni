'use client';

import { useState } from 'react';

interface Service {
  id: string;
  name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  last_booking_time: string;
  is_active: boolean;
  sort_order: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  services: Service[];
  setServices: (s: Service[]) => void;
  showToast: (msg: string) => void;
}

const emptyService = (): Omit<Service, 'id'> => ({
  name: '',
  days_of_week: [1, 2, 3, 4, 5, 6],
  start_time: '12:00',
  end_time: '22:00',
  last_booking_time: '21:00',
  is_active: true,
  sort_order: 0,
});

export function ServicesTab({ services, setServices, showToast }: Props) {
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Omit<Service, 'id'>>(emptyService());
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch('/api/venue/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, sort_order: services.length }),
      });
      if (!res.ok) throw new Error('Failed to create service');
      const data = await res.json();
      setServices([...services, data.service]);
      setCreating(false);
      setDraft(emptyService());
      showToast('Service created');
    } catch {
      showToast('Failed to create service');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(service: Service) {
    setSaving(true);
    try {
      const res = await fetch('/api/venue/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(service),
      });
      if (!res.ok) throw new Error('Failed to update');
      const data = await res.json();
      setServices(services.map((s) => (s.id === service.id ? data.service : s)));
      setEditing(null);
      showToast('Service updated');
    } catch {
      showToast('Failed to update service');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this service? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/venue/services', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setServices(services.filter((s) => s.id !== id));
      showToast('Service deleted');
    } catch {
      showToast('Failed to delete service');
    }
  }

  async function handleToggleActive(service: Service) {
    const updated = { ...service, is_active: !service.is_active };
    await handleUpdate(updated);
  }

  function toggleDay(days: number[], day: number): number[] {
    return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
  }

  function renderForm(data: Omit<Service, 'id'>, onChange: (d: Omit<Service, 'id'>) => void) {
    return (
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            placeholder="e.g. Lunch, Dinner, Brunch"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Days of week</label>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange({ ...data, days_of_week: toggleDay(data.days_of_week, i) })}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  data.days_of_week.includes(i)
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Start</label>
            <input type="time" value={data.start_time} onChange={(e) => onChange({ ...data, start_time: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">End</label>
            <input type="time" value={data.end_time} onChange={(e) => onChange({ ...data, end_time: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Last booking</label>
            <input type="time" value={data.last_booking_time} onChange={(e) => onChange({ ...data, last_booking_time: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {services.map((service) => (
        <div key={service.id} className="rounded-xl border border-slate-200 bg-white p-5">
          {editing?.id === service.id ? (
            <div className="space-y-4">
              {renderForm(editing, (d) => setEditing({ ...editing, ...d } as Service))}
              <div className="flex gap-2">
                <button onClick={() => handleUpdate(editing)} disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{service.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${service.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {service.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {service.start_time.slice(0, 5)} – {service.end_time.slice(0, 5)} (last booking {service.last_booking_time.slice(0, 5)})
                </p>
                <div className="mt-2 flex gap-1">
                  {DAY_LABELS.map((label, i) => (
                    <span key={i} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${service.days_of_week.includes(i) ? 'bg-brand-50 text-brand-700' : 'bg-slate-50 text-slate-300'}`}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleToggleActive(service)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700" title={service.is_active ? 'Deactivate' : 'Activate'}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    {service.is_active ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    )}
                  </svg>
                </button>
                <button onClick={() => setEditing(service)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700" title="Edit">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                  </svg>
                </button>
                <button onClick={() => handleDelete(service.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {creating ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">New Service</h3>
          {renderForm(draft, setDraft)}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !draft.name} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Service'}
            </button>
            <button onClick={() => { setCreating(false); setDraft(emptyService()); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
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
          Add Service
        </button>
      )}
    </div>
  );
}
