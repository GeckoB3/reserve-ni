'use client';

import { useCallback, useEffect, useState } from 'react';
import { ResourceCalendarGrid } from '@/components/calendar/ResourceCalendarGrid';

interface Resource {
  id: string;
  name: string;
  resource_type: string | null;
  slot_interval_minutes: number | null;
  min_booking_minutes: number | null;
  max_booking_minutes: number | null;
  price_per_slot_pence: number | null;
  is_active: boolean;
  availability_hours: Record<string, Array<{ start: string; end: string }>> | null;
  availability_exceptions?: Record<string, { closed: true } | { periods: Array<{ start: string; end: string }> }> | null;
}

interface ResourceFormState {
  name: string;
  resource_type: string;
  slot_interval_minutes: number;
  min_booking_minutes: number;
  max_booking_minutes: number;
  price_per_slot_pence: string;
  is_active: boolean;
  availability_hours_json: string;
  availability_exceptions_json: string;
}

const DEFAULT_AVAILABILITY_HOURS_JSON =
  '{"1":[{"start":"09:00","end":"17:00"}],"2":[{"start":"09:00","end":"17:00"}],"3":[{"start":"09:00","end":"17:00"}],"4":[{"start":"09:00","end":"17:00"}],"5":[{"start":"09:00","end":"17:00"}]}';

const BLANK_RESOURCE: ResourceFormState = {
  name: '',
  resource_type: '',
  slot_interval_minutes: 60,
  min_booking_minutes: 60,
  max_booking_minutes: 480,
  price_per_slot_pence: '',
  is_active: true,
  availability_hours_json: DEFAULT_AVAILABILITY_HOURS_JSON,
  availability_exceptions_json: '{}',
};

export function ResourceTimelineView({
  venueId,
  isAdmin = false,
  currency = 'GBP',
}: {
  venueId: string;
  isAdmin?: boolean;
  currency?: string;
}) {
  const sym = currency === 'EUR' ? '€' : '£';
  function formatPrice(pence: number): string {
    return `${sym}${(pence / 100).toFixed(2)}`;
  }

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [resources, setResources] = useState<Resource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [resourceForm, setResourceForm] = useState<ResourceFormState>({ ...BLANK_RESOURCE });
  const [resourceSaving, setResourceSaving] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    setResourcesLoading(true);
    try {
      const res = await fetch('/api/venue/resources');
      const data = await res.json();
      setResources(data.resources ?? []);
    } catch {
      console.error('Failed to load resources');
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  const handleSaveResource = async () => {
    if (!resourceForm.name.trim()) {
      setResourceError('Resource name is required.');
      return;
    }
    let availability_hours: Record<string, Array<{ start: string; end: string }>> | undefined;
    try {
      availability_hours = JSON.parse(resourceForm.availability_hours_json) as Record<string, Array<{ start: string; end: string }>>;
    } catch {
      setResourceError('Availability hours is not valid JSON. Check the format and try again.');
      return;
    }
    let availability_exceptions: Record<string, { closed: true } | { periods: Array<{ start: string; end: string }> }>;
    try {
      availability_exceptions = JSON.parse(
        resourceForm.availability_exceptions_json.trim() || '{}',
      ) as Record<string, { closed: true } | { periods: Array<{ start: string; end: string }> }>;
      if (typeof availability_exceptions !== 'object' || availability_exceptions === null || Array.isArray(availability_exceptions)) {
        setResourceError('Availability exceptions must be a JSON object keyed by YYYY-MM-DD.');
        return;
      }
    } catch {
      setResourceError('Availability exceptions is not valid JSON.');
      return;
    }
    setResourceSaving(true);
    setResourceError(null);
    try {
      const payload = {
        name: resourceForm.name.trim(),
        ...(resourceForm.resource_type.trim() && { resource_type: resourceForm.resource_type.trim() }),
        slot_interval_minutes: resourceForm.slot_interval_minutes,
        min_booking_minutes: resourceForm.min_booking_minutes,
        max_booking_minutes: resourceForm.max_booking_minutes,
        ...(resourceForm.price_per_slot_pence !== '' && {
          price_per_slot_pence: Math.round(parseFloat(resourceForm.price_per_slot_pence) * 100),
        }),
        is_active: resourceForm.is_active,
        availability_hours,
        availability_exceptions,
      };
      const res = editingResourceId
        ? await fetch('/api/venue/resources', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingResourceId, ...payload }),
          })
        : await fetch('/api/venue/resources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) {
        setResourceError((json as { error?: string }).error ?? 'Save failed');
        return;
      }
      setShowResourceForm(false);
      setEditingResourceId(null);
      setResourceForm({ ...BLANK_RESOURCE });
      await fetchResources();
    } catch {
      setResourceError('Save failed');
    } finally {
      setResourceSaving(false);
    }
  };

  const handleEditResource = (r: Resource) => {
    setResourceForm({
      name: r.name,
      resource_type: r.resource_type ?? '',
      slot_interval_minutes: r.slot_interval_minutes ?? 60,
      min_booking_minutes: r.min_booking_minutes ?? 60,
      max_booking_minutes: r.max_booking_minutes ?? 480,
      price_per_slot_pence: r.price_per_slot_pence != null ? (r.price_per_slot_pence / 100).toFixed(2) : '',
      is_active: r.is_active,
      availability_hours_json: r.availability_hours
        ? JSON.stringify(r.availability_hours, null, 2)
        : DEFAULT_AVAILABILITY_HOURS_JSON,
      availability_exceptions_json: r.availability_exceptions
        ? JSON.stringify(r.availability_exceptions, null, 2)
        : '{}',
    });
    setEditingResourceId(r.id);
    setResourceError(null);
    setShowResourceForm(true);
  };

  const handleDeleteResource = async (id: string) => {
    if (!window.confirm('Delete this resource? Existing bookings are not affected.')) return;
    try {
      const res = await fetch('/api/venue/resources', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const json = await res.json();
        window.alert((json as { error?: string }).error ?? 'Delete failed');
        return;
      }
      await fetchResources();
    } catch {
      window.alert('Delete failed');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">

      {/* Resource management panel — admin only */}
      {isAdmin && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-700">Resources</h2>
            <button
              type="button"
              onClick={() => {
                setEditingResourceId(null);
                setResourceForm({ ...BLANK_RESOURCE });
                setResourceError(null);
                setShowResourceForm(true);
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              + Add resource
            </button>
          </div>

          {resourcesLoading ? (
            <div className="m-4 h-12 animate-pulse rounded bg-slate-100" />
          ) : resources.length === 0 && !showResourceForm ? (
            <p className="px-5 py-4 text-sm text-slate-500">
              No resources yet.{' '}
              <button
                type="button"
                className="text-brand-600 underline hover:text-brand-700"
                onClick={() => {
                  setResourceForm({ ...BLANK_RESOURCE });
                  setResourceError(null);
                  setShowResourceForm(true);
                }}
              >
                Add one to appear on the booking widget.
              </button>
            </p>
          ) : (
            resources.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                      <th className="px-5 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Slot</th>
                      <th className="px-3 py-2 text-left">Price/slot</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {resources.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3 font-medium text-slate-900">{r.name}</td>
                        <td className="px-3 py-3 text-slate-500">{r.resource_type ?? '—'}</td>
                        <td className="px-3 py-3 text-slate-500">
                          {r.slot_interval_minutes ? `${r.slot_interval_minutes} min` : '—'}
                        </td>
                        <td className="px-3 py-3 text-slate-500">
                          {r.price_per_slot_pence != null ? `${formatPrice(r.price_per_slot_pence)}/slot` : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {r.is_active ? (
                            <span className="text-emerald-600">Active</span>
                          ) : (
                            <span className="text-slate-400">Inactive</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => handleEditResource(r)}
                              className="text-xs font-medium text-slate-600 hover:text-slate-900"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteResource(r.id)}
                              className="text-xs font-medium text-red-500 hover:text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Add / edit resource form */}
          {showResourceForm && (
            <div className="border-t border-slate-100 px-5 py-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                {editingResourceId ? 'Edit resource' : 'New resource'}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
                  <input
                    type="text"
                    value={resourceForm.name}
                    onChange={(e) => setResourceForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Court 1"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Type <span className="font-normal text-slate-400">optional</span>
                  </label>
                  <input
                    type="text"
                    value={resourceForm.resource_type}
                    onChange={(e) => setResourceForm((f) => ({ ...f, resource_type: e.target.value }))}
                    placeholder="e.g. Tennis Court"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Slot interval (minutes)</label>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={resourceForm.slot_interval_minutes}
                    onChange={(e) => setResourceForm((f) => ({ ...f, slot_interval_minutes: parseInt(e.target.value) || 60 }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Price per slot ({sym}) <span className="font-normal text-slate-400">optional</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={resourceForm.price_per_slot_pence}
                    onChange={(e) => setResourceForm((f) => ({ ...f, price_per_slot_pence: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Min booking (minutes)</label>
                  <input
                    type="number"
                    min={15}
                    value={resourceForm.min_booking_minutes}
                    onChange={(e) => setResourceForm((f) => ({ ...f, min_booking_minutes: parseInt(e.target.value) || 60 }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Max booking (minutes)</label>
                  <input
                    type="number"
                    min={15}
                    value={resourceForm.max_booking_minutes}
                    onChange={(e) => setResourceForm((f) => ({ ...f, max_booking_minutes: parseInt(e.target.value) || 480 }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    id="res-active"
                    type="checkbox"
                    checked={resourceForm.is_active}
                    onChange={(e) => setResourceForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <label htmlFor="res-active" className="text-sm text-slate-700">Active (bookable by guests)</label>
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Availability hours (JSON)
                </label>
                <textarea
                  value={resourceForm.availability_hours_json}
                  onChange={(e) => setResourceForm((f) => ({ ...f, availability_hours_json: e.target.value }))}
                  rows={6}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Keys 0–6 = Sun–Sat. Each entry: {'{'}&#34;start&#34;:&#34;09:00&#34;,&#34;end&#34;:&#34;17:00&#34;{'}'}
                </p>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Date overrides (JSON)
                </label>
                <textarea
                  value={resourceForm.availability_exceptions_json}
                  onChange={(e) => setResourceForm((f) => ({ ...f, availability_exceptions_json: e.target.value }))}
                  rows={5}
                  placeholder={'{\n  "2026-12-25": { "closed": true },\n  "2026-12-31": { "periods": [{ "start": "18:00", "end": "23:00" }] }\n}'}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Per-date overrides on top of weekly hours. Use{' '}
                  <code className="rounded bg-slate-100 px-0.5">{`{ "closed": true }`}</code> or{' '}
                  <code className="rounded bg-slate-100 px-0.5">{`{ "periods": [...] }`}</code> for custom hours.
                </p>
              </div>

              {resourceError && <p className="mt-2 text-sm text-red-600">{resourceError}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveResource()}
                  disabled={resourceSaving}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {resourceSaving ? 'Saving…' : 'Save resource'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResourceForm(false);
                    setEditingResourceId(null);
                    setResourceError(null);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Resource timeline</h1>
        <p className="mt-1 text-sm text-slate-500">
          Day view by resource: bookings and optional free slot starts for staff.
        </p>
      </div>
      <ResourceCalendarGrid venueId={venueId} date={date} currency={currency} onDateChange={setDate} />
    </div>
  );
}
