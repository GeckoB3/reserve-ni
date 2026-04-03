'use client';

import { useCallback, useEffect, useState } from 'react';

interface ClassType {
  id: string;
  name: string;
  duration_minutes: number;
  capacity: number;
  price_pence: number | null;
  colour: string;
  is_active: boolean;
}

interface TimetableEntry {
  id: string;
  class_type_id: string;
  day_of_week: number;
  start_time: string;
  is_active: boolean;
  interval_weeks?: number;
  created_at?: string;
}

interface ClassInstance {
  id: string;
  class_type_id: string;
  instance_date: string;
  start_time: string;
  is_cancelled: boolean;
  cancel_reason: string | null;
}

interface ClassTypeDetail {
  id: string;
  name: string;
  duration_minutes: number;
  capacity: number;
  price_pence: number | null;
  colour: string;
}

interface InstanceDetail extends ClassInstance {
  class_type: ClassTypeDetail;
}

interface AttendeeRow {
  booking_id: string;
  status: string;
  party_size: number;
  deposit_amount_pence: number | null;
  deposit_status: string | null;
  booking_date: string;
  booking_time: string;
  checked_in_at: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
}

interface ClassTypeFormState {
  name: string;
  duration_minutes: number;
  capacity: number;
  price_pence: string;
  colour: string;
  is_active: boolean;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const BLANK_CT: ClassTypeFormState = {
  name: '',
  duration_minutes: 60,
  capacity: 10,
  price_pence: '',
  colour: '#6366f1',
  is_active: true,
};

function escapeCsvCell(s: string | number | null | undefined): string {
  if (s == null || s === '') return '';
  const str = String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function ClassTimetableView({
  venueId: _venueId,
  isAdmin,
  currency = 'GBP',
}: {
  venueId: string;
  isAdmin: boolean;
  currency?: string;
}) {
  const sym = currency === 'EUR' ? '€' : '£';
  function formatPrice(pence: number): string {
    return `${sym}${(pence / 100).toFixed(2)}`;
  }

  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Class type CRUD state
  const [showClassTypeForm, setShowClassTypeForm] = useState(false);
  const [editingClassTypeId, setEditingClassTypeId] = useState<string | null>(null);
  const [classTypeForm, setClassTypeForm] = useState<ClassTypeFormState>({ ...BLANK_CT });
  const [classTypeSaving, setClassTypeSaving] = useState(false);
  const [classTypeError, setClassTypeError] = useState<string | null>(null);

  // Timetable entry state
  const [showTimetableForm, setShowTimetableForm] = useState<string | null>(null); // class_type_id
  const [timetableForm, setTimetableForm] = useState({ day_of_week: 1, start_time: '09:00', interval_weeks: 1 });
  const [timetableSaving, setTimetableSaving] = useState(false);

  // One-off instance (no weekly timetable)
  const [oneOffClassTypeId, setOneOffClassTypeId] = useState('');
  const [oneOffDate, setOneOffDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [oneOffTime, setOneOffTime] = useState('09:00');
  const [oneOffCapacity, setOneOffCapacity] = useState('');
  const [oneOffSaving, setOneOffSaving] = useState(false);

  // Generate instances state
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/venue/classes');
      const data = await res.json();
      setClassTypes(data.class_types ?? []);
      setTimetable(data.timetable ?? []);
      setInstances(data.instances ?? []);
    } catch {
      console.error('Failed to load class data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [instRes, attRes] = await Promise.all([
        fetch(`/api/venue/class-instances/${id}`),
        fetch(`/api/venue/class-instances/${id}/attendees`),
      ]);
      const instJson = await instRes.json();
      const attJson = await attRes.json();
      if (!instRes.ok) {
        setDetailError(instJson.error ?? 'Failed to load instance');
        setDetail(null);
        setAttendees([]);
        return;
      }
      if (!attRes.ok) {
        setDetailError(attJson.error ?? 'Failed to load roster');
        setDetail(instJson as InstanceDetail);
        setAttendees([]);
        return;
      }
      setDetail(instJson as InstanceDetail);
      setAttendees((attJson.attendees ?? []) as AttendeeRow[]);
    } catch {
      setDetailError('Failed to load instance');
      setDetail(null);
      setAttendees([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setAttendees([]);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const handleSaveClassType = async () => {
    if (!classTypeForm.name.trim()) {
      setClassTypeError('Class name is required.');
      return;
    }
    setClassTypeSaving(true);
    setClassTypeError(null);
    try {
      const payload = {
        name: classTypeForm.name.trim(),
        duration_minutes: classTypeForm.duration_minutes,
        capacity: classTypeForm.capacity,
        colour: classTypeForm.colour,
        is_active: classTypeForm.is_active,
        ...(classTypeForm.price_pence !== '' && { price_pence: Math.round(parseFloat(classTypeForm.price_pence) * 100) }),
      };
      const res = editingClassTypeId
        ? await fetch('/api/venue/classes', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingClassTypeId, entity_type: 'class_type', ...payload }),
          })
        : await fetch('/api/venue/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) {
        setClassTypeError((json as { error?: string }).error ?? 'Save failed');
        return;
      }
      setShowClassTypeForm(false);
      setEditingClassTypeId(null);
      setClassTypeForm({ ...BLANK_CT });
      await fetchData();
    } catch {
      setClassTypeError('Save failed');
    } finally {
      setClassTypeSaving(false);
    }
  };

  const handleEditClassType = (ct: ClassType) => {
    setClassTypeForm({
      name: ct.name,
      duration_minutes: ct.duration_minutes,
      capacity: ct.capacity,
      price_pence: ct.price_pence != null ? (ct.price_pence / 100).toFixed(2) : '',
      colour: ct.colour ?? '#6366f1',
      is_active: ct.is_active,
    });
    setEditingClassTypeId(ct.id);
    setClassTypeError(null);
    setShowClassTypeForm(true);
  };

  const handleDeleteClassType = async (id: string) => {
    if (!window.confirm('Delete this class type? Existing instances will remain but new ones won\'t be generated.')) return;
    try {
      const res = await fetch('/api/venue/classes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, entity_type: 'class_type' }),
      });
      if (!res.ok) {
        const json = await res.json();
        window.alert((json as { error?: string }).error ?? 'Delete failed');
        return;
      }
      await fetchData();
    } catch {
      window.alert('Delete failed');
    }
  };

  const handleSaveTimetableEntry = async () => {
    if (!showTimetableForm) return;
    setTimetableSaving(true);
    try {
      const res = await fetch('/api/venue/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_type_id: showTimetableForm,
          day_of_week: timetableForm.day_of_week,
          start_time: timetableForm.start_time,
          ...(timetableForm.interval_weeks > 1 ? { interval_weeks: timetableForm.interval_weeks } : {}),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        window.alert((json as { error?: string }).error ?? 'Failed to add schedule entry');
        return;
      }
      setShowTimetableForm(null);
      setTimetableForm({ day_of_week: 1, start_time: '09:00', interval_weeks: 1 });
      await fetchData();
    } catch {
      window.alert('Failed to add schedule entry');
    } finally {
      setTimetableSaving(false);
    }
  };

  const handleDeleteTimetableEntry = async (id: string) => {
    if (!window.confirm('Remove this schedule entry?')) return;
    try {
      const res = await fetch('/api/venue/classes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, entity_type: 'timetable' }),
      });
      if (!res.ok) {
        window.alert('Failed to remove schedule entry');
        return;
      }
      await fetchData();
    } catch {
      window.alert('Failed to remove schedule entry');
    }
  };

  const handleAddOneOffInstance = async () => {
    if (!oneOffClassTypeId) {
      window.alert('Choose a class type.');
      return;
    }
    setOneOffSaving(true);
    try {
      const res = await fetch('/api/venue/class-instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_type_id: oneOffClassTypeId,
          instance_date: oneOffDate,
          start_time: oneOffTime,
          ...(oneOffCapacity.trim() !== '' && { capacity_override: parseInt(oneOffCapacity, 10) }),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        window.alert((json as { error?: string }).error ?? 'Failed to add session');
        return;
      }
      await fetchData();
      setGenerateMsg('One-off session added.');
    } catch {
      window.alert('Failed to add session');
    } finally {
      setOneOffSaving(false);
    }
  };

  const handleGenerateInstances = async () => {
    setGenerating(true);
    setGenerateMsg(null);
    try {
      const res = await fetch('/api/venue/classes/generate-instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks: 4 }),
      });
      const json = await res.json();
      if (!res.ok) {
        window.alert((json as { error?: string }).error ?? 'Failed to generate instances');
        return;
      }
      setGenerateMsg(`Generated ${(json as { created?: number }).created ?? 0} upcoming instances.`);
      await fetchData();
    } catch {
      window.alert('Failed to generate instances');
    } finally {
      setGenerating(false);
    }
  };

  const handleCancelInstance = async () => {
    if (!selectedId || !detail) return;
    const ok = window.confirm(
      `Cancel this "${detail.class_type.name}" class on ${detail.instance_date}? Enrolled guests will be notified and refunds follow your policy.`,
    );
    if (!ok) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/venue/class-instances/${selectedId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? 'Could not cancel class');
        return;
      }
      setSelectedId(null);
      await fetchData();
    } catch {
      window.alert('Could not cancel class');
    } finally {
      setCancelLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!detail || attendees.length === 0) return;
    const headers = ['Guest name', 'Email', 'Phone', 'Party size', 'Status', 'Deposit (pence)', 'Deposit status', 'Checked in'];
    const lines = [
      headers.join(','),
      ...attendees.map((a) =>
        [
          escapeCsvCell(a.guest_name),
          escapeCsvCell(a.guest_email),
          escapeCsvCell(a.guest_phone),
          escapeCsvCell(a.party_size),
          escapeCsvCell(a.status),
          escapeCsvCell(a.deposit_amount_pence),
          escapeCsvCell(a.deposit_status),
          escapeCsvCell(a.checked_in_at ? new Date(a.checked_in_at).toISOString() : ''),
        ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `class-roster-${detail.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const typeMap = new Map(classTypes.map((ct) => [ct.id, ct]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Class Timetable</h1>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setEditingClassTypeId(null);
              setClassTypeForm({ ...BLANK_CT });
              setClassTypeError(null);
              setShowClassTypeForm(true);
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Add class type
          </button>
        )}
      </div>

      {/* Class types management panel */}
      {isAdmin && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-700">Class types</h2>
          </div>

          {loading ? (
            <div className="m-4 h-12 animate-pulse rounded bg-slate-100" />
          ) : classTypes.length === 0 && !showClassTypeForm ? (
            <p className="px-5 py-4 text-sm text-slate-500">
              No class types yet.{' '}
              <button
                type="button"
                className="text-brand-600 underline hover:text-brand-700"
                onClick={() => {
                  setClassTypeForm({ ...BLANK_CT });
                  setClassTypeError(null);
                  setShowClassTypeForm(true);
                }}
              >
                Add one to get started.
              </button>
            </p>
          ) : (
            <div className="divide-y divide-slate-50">
              {classTypes.map((ct) => {
                const entries = timetable.filter((e) => e.class_type_id === ct.id && e.is_active);
                return (
                  <div key={ct.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: ct.colour ?? '#94a3b8' }} />
                      <span className="font-medium text-slate-900">{ct.name}</span>
                      <span className="text-sm text-slate-500">{ct.duration_minutes} min · capacity {ct.capacity}</span>
                      {ct.price_pence != null && (
                        <span className="text-sm text-slate-500">{formatPrice(ct.price_pence)}</span>
                      )}
                      {!ct.is_active && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>
                      )}
                      <div className="ml-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowTimetableForm(ct.id);
                            setTimetableForm({ day_of_week: 1, start_time: '09:00', interval_weeks: 1 });
                          }}
                          className="text-xs font-medium text-brand-600 hover:text-brand-800"
                        >
                          + Schedule
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditClassType(ct)}
                          className="text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteClassType(ct.id)}
                          className="text-xs font-medium text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {entries.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 pl-6">
                        {entries.map((e) => (
                          <span
                            key={e.id}
                            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600"
                          >
                            {DAY_LABELS_FULL[e.day_of_week]} {e.start_time.slice(0, 5)}
                            {(e.interval_weeks ?? 1) > 1 && (
                              <span className="text-slate-400"> · every {e.interval_weeks} wks</span>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDeleteTimetableEntry(e.id)}
                              className="text-slate-400 hover:text-red-500"
                              aria-label="Remove schedule entry"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {showTimetableForm === ct.id && (
                      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-3 pl-6">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Day</label>
                          <select
                            value={timetableForm.day_of_week}
                            onChange={(e) => setTimetableForm((f) => ({ ...f, day_of_week: parseInt(e.target.value) }))}
                            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          >
                            {DAY_LABELS_FULL.map((label, i) => (
                              <option key={i} value={i}>{label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Start time</label>
                          <input
                            type="time"
                            value={timetableForm.start_time}
                            onChange={(e) => setTimetableForm((f) => ({ ...f, start_time: e.target.value }))}
                            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Every N weeks</label>
                          <select
                            value={timetableForm.interval_weeks}
                            onChange={(e) =>
                              setTimetableForm((f) => ({ ...f, interval_weeks: parseInt(e.target.value, 10) || 1 }))
                            }
                            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          >
                            <option value={1}>Weekly</option>
                            <option value={2}>Every 2 weeks</option>
                            <option value={3}>Every 3 weeks</option>
                            <option value={4}>Every 4 weeks</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSaveTimetableEntry()}
                          disabled={timetableSaving}
                          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          {timetableSaving ? 'Adding…' : 'Add'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowTimetableForm(null)}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add / edit class type form */}
          {showClassTypeForm && (
            <div className="border-t border-slate-100 px-5 py-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                {editingClassTypeId ? 'Edit class type' : 'New class type'}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
                  <input
                    type="text"
                    value={classTypeForm.name}
                    onChange={(e) => setClassTypeForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Yoga Flow"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Duration (minutes)</label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    value={classTypeForm.duration_minutes}
                    onChange={(e) => setClassTypeForm((f) => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Capacity (spots)</label>
                  <input
                    type="number"
                    min={1}
                    value={classTypeForm.capacity}
                    onChange={(e) => setClassTypeForm((f) => ({ ...f, capacity: parseInt(e.target.value) || 1 }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Price ({sym}) <span className="font-normal text-slate-400">optional — leave blank for free</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={classTypeForm.price_pence}
                    onChange={(e) => setClassTypeForm((f) => ({ ...f, price_pence: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Colour</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={classTypeForm.colour}
                      onChange={(e) => setClassTypeForm((f) => ({ ...f, colour: e.target.value }))}
                      className="h-9 w-12 cursor-pointer rounded border border-slate-200 p-0.5"
                    />
                    <span className="text-xs text-slate-500">{classTypeForm.colour}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    id="ct-active"
                    type="checkbox"
                    checked={classTypeForm.is_active}
                    onChange={(e) => setClassTypeForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <label htmlFor="ct-active" className="text-sm text-slate-700">Active (visible to guests)</label>
                </div>
              </div>
              {classTypeError && (
                <p className="mt-2 text-sm text-red-600">{classTypeError}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveClassType()}
                  disabled={classTypeSaving}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {classTypeSaving ? 'Saving…' : 'Save class type'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowClassTypeForm(false);
                    setEditingClassTypeId(null);
                    setClassTypeError(null);
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

      {loading ? (
        <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
      ) : classTypes.length === 0 ? (
        !isAdmin && (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-slate-500">No class types configured yet.</p>
          </div>
        )
      ) : (
        <div className="space-y-6">
          {/* Weekly timetable grid */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {DAY_LABELS.map((day, i) => (
                    <th key={i} className="px-4 py-3 text-left font-medium text-slate-600">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {DAY_LABELS.map((_, dow) => {
                    const entries = timetable
                      .filter((e) => e.day_of_week === dow && e.is_active)
                      .sort((a, b) => a.start_time.localeCompare(b.start_time));
                    return (
                      <td key={dow} className="align-top border-r border-slate-50 px-3 py-3 last:border-r-0">
                        <div className="min-h-[80px] space-y-2">
                          {entries.map((entry) => {
                            const ct = typeMap.get(entry.class_type_id);
                            return (
                              <div
                                key={entry.id}
                                className="rounded-lg px-3 py-2 text-xs"
                                style={{
                                  backgroundColor: ct?.colour ? `${ct.colour}20` : '#f1f5f9',
                                  borderLeft: `3px solid ${ct?.colour ?? '#94a3b8'}`,
                                }}
                              >
                                <div className="font-medium" style={{ color: ct?.colour ?? '#475569' }}>
                                  {ct?.name ?? 'Unknown'}
                                </div>
                                <div className="text-slate-500">{entry.start_time.slice(0, 5)}</div>
                              </div>
                            );
                          })}
                          {entries.length === 0 && <div className="text-xs text-slate-300">—</div>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* One-off session (no weekly slot) */}
          {isAdmin && classTypes.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Add one-off session</h3>
              <p className="mb-3 text-xs text-slate-500">
                Creates a single dated instance without adding a weekly timetable row. Use for extras or one-off classes.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Class</label>
                  <select
                    value={oneOffClassTypeId}
                    onChange={(e) => setOneOffClassTypeId(e.target.value)}
                    className="min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="">Select…</option>
                    {classTypes.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
                  <input
                    type="date"
                    value={oneOffDate}
                    onChange={(e) => setOneOffDate(e.target.value)}
                    className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Start time</label>
                  <input
                    type="time"
                    value={oneOffTime}
                    onChange={(e) => setOneOffTime(e.target.value)}
                    className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Capacity override</label>
                  <input
                    type="number"
                    min={1}
                    placeholder="optional"
                    value={oneOffCapacity}
                    onChange={(e) => setOneOffCapacity(e.target.value)}
                    className="w-24 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleAddOneOffInstance()}
                  disabled={oneOffSaving}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {oneOffSaving ? 'Adding…' : 'Add session'}
                </button>
              </div>
            </div>
          )}

          {/* Generate instances */}
          {isAdmin && timetable.filter((e) => e.is_active).length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleGenerateInstances()}
                disabled={generating}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {generating ? 'Generating…' : 'Generate upcoming instances (4 weeks)'}
              </button>
              {generateMsg && <span className="text-sm text-emerald-600">{generateMsg}</span>}
            </div>
          )}

          {instances.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-slate-700">Upcoming Instances</h2>
              <div className="space-y-2">
                {instances.slice(0, 50).map((inst) => {
                  const ct = typeMap.get(inst.class_type_id);
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => setSelectedId(selectedId === inst.id ? null : inst.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm shadow-sm transition-colors ${
                        selectedId === inst.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ct?.colour ?? '#94a3b8' }} />
                        <span className="font-medium text-slate-900">{ct?.name}</span>
                        <span className="text-slate-500">
                          {inst.instance_date} at {inst.start_time.slice(0, 5)}
                        </span>
                      </div>
                      {inst.is_cancelled && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Cancelled</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {selectedId && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {detailLoading && <p className="text-sm text-slate-500">Loading roster…</p>}
          {detailError && <p className="text-sm text-red-600">{detailError}</p>}
          {!detailLoading && detail && (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{detail.class_type.name}</h3>
                  <p className="text-sm text-slate-500">
                    {detail.instance_date} · {String(detail.start_time).slice(0, 5)} · {detail.class_type.duration_minutes}{' '}
                    min · capacity {detail.class_type.capacity}
                  </p>
                  {detail.is_cancelled && (
                    <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Cancelled
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {attendees.length > 0 && (
                    <button
                      type="button"
                      onClick={downloadCsv}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Download CSV
                    </button>
                  )}
                  {isAdmin && !detail.is_cancelled && (
                    <button
                      type="button"
                      onClick={() => void handleCancelInstance()}
                      disabled={cancelLoading}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                    >
                      {cancelLoading ? 'Cancelling…' : 'Cancel class & notify guests'}
                    </button>
                  )}
                </div>
              </div>

              <h4 className="mb-2 text-sm font-medium text-slate-700">Roster</h4>
              {attendees.length === 0 ? (
                <p className="text-sm text-slate-500">No bookings for this instance.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Guest</th>
                        <th className="py-2 pr-3 font-medium">Contact</th>
                        <th className="py-2 pr-3 font-medium">Qty</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Deposit</th>
                        <th className="py-2 font-medium">Checked in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendees.map((a) => (
                        <tr key={a.booking_id} className="border-b border-slate-100">
                          <td className="py-2 pr-3 text-slate-800">{a.guest_name ?? '—'}</td>
                          <td className="py-2 pr-3 text-slate-600">
                            <div className="max-w-[200px] truncate">{a.guest_email ?? '—'}</div>
                            <div className="text-xs text-slate-500">{a.guest_phone ?? ''}</div>
                          </td>
                          <td className="py-2 pr-3">{a.party_size}</td>
                          <td className="py-2 pr-3">{a.status}</td>
                          <td className="py-2 pr-3">
                            {a.deposit_amount_pence != null ? formatPrice(a.deposit_amount_pence) : '—'}
                            {a.deposit_status ? (
                              <span className="ml-1 text-xs text-slate-500">({a.deposit_status})</span>
                            ) : null}
                          </td>
                          <td className="py-2 text-slate-600">
                            {a.checked_in_at ? new Date(a.checked_in_at).toLocaleString('en-GB') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
