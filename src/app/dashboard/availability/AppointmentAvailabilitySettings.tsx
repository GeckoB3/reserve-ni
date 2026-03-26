'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Practitioner {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  working_hours: Record<string, Array<{ start: string; end: string }>>;
  break_times: Array<{ start: string; end: string }>;
  days_off: string[];
  is_active: boolean;
  sort_order: number;
}

interface Service {
  id: string;
  name: string;
}

interface PractitionerServiceLink {
  practitioner_id: string;
  service_id: string;
}

type Tab = 'team' | 'hours' | 'breaks' | 'daysoff';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'team', label: 'Team' },
  { key: 'hours', label: 'Working Hours' },
  { key: 'breaks', label: 'Breaks' },
  { key: 'daysoff', label: 'Days Off' },
];

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_KEYS = ['1', '2', '3', '4', '5', '6', '0'];

function defaultWorkingHours(): Record<string, Array<{ start: string; end: string }>> {
  const hours: Record<string, Array<{ start: string; end: string }>> = {};
  for (const key of ['1', '2', '3', '4', '5']) {
    hours[key] = [{ start: '09:00', end: '17:00' }];
  }
  return hours;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function AppointmentAvailabilitySettings({ venueId }: { venueId: string }) {
  const [tab, setTab] = useState<Tab>('team');
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [pLinks, setPLinks] = useState<PractitionerServiceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add/edit practitioner state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formActive, setFormActive] = useState(true);

  // Selected practitioner for hours/breaks/daysoff tabs
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pracRes, svcRes] = await Promise.all([
        fetch('/api/venue/practitioners'),
        fetch('/api/venue/appointment-services'),
      ]);
      if (!pracRes.ok || !svcRes.ok) {
        setError('Failed to load data. Please refresh the page.');
        return;
      }
      const [pracData, svcData] = await Promise.all([pracRes.json(), svcRes.json()]);
      const pracs = pracData.practitioners ?? [];
      setPractitioners(pracs);
      setServices(svcData.services ?? []);
      setPLinks(svcData.practitioner_services ?? []);
      setSelectedPractitionerId((prev) => {
        if (prev && pracs.some((p: Practitioner) => p.id === prev)) return prev;
        return pracs.length > 0 ? pracs[0].id : '';
      });
    } catch {
      setError('Failed to load data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedPrac = useMemo(
    () => practitioners.find((p) => p.id === selectedPractitionerId) ?? null,
    [practitioners, selectedPractitionerId],
  );

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  // ─── Team Tab ───────────────────────────────────────────────────────
  function openAdd() {
    setEditingId(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormActive(true);
    setError(null);
    setShowForm(true);
  }

  function openEdit(p: Practitioner) {
    setEditingId(p.id);
    setFormName(p.name);
    setFormEmail(p.email ?? '');
    setFormPhone(p.phone ?? '');
    setFormActive(p.is_active);
    setError(null);
    setShowForm(true);
  }

  async function savePractitioner() {
    if (!formName.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: formName.trim(),
        is_active: formActive,
        ...(formEmail.trim() ? { email: formEmail.trim() } : {}),
        ...(formPhone.trim() ? { phone: formPhone.trim() } : {}),
      };
      if (editingId) {
        payload.id = editingId;
      } else {
        payload.working_hours = defaultWorkingHours();
        payload.break_times = [];
        payload.days_off = [];
      }

      const res = await fetch('/api/venue/practitioners', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Failed to save');
      }
      setShowForm(false);
      flash(editingId ? 'Team member updated' : 'Team member added');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function deletePractitioner(id: string) {
    if (!confirm('Delete this team member? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/venue/practitioners', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setError('Failed to delete team member. Please try again.');
        return;
      }
      flash('Team member removed');
      if (id === selectedPractitionerId) {
        setSelectedPractitionerId('');
      }
      await fetchData();
    } catch {
      setError('Failed to delete team member. Please try again.');
    }
  }

  // ─── Working Hours Tab ──────────────────────────────────────────────
  async function saveWorkingHours(hours: Record<string, Array<{ start: string; end: string }>>) {
    if (!selectedPrac) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/practitioners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPrac.id, working_hours: hours }),
      });
      if (!res.ok) throw new Error('Failed to save');
      flash('Working hours saved');
      await fetchData();
    } catch {
      setError('Failed to save working hours');
    } finally {
      setSaving(false);
    }
  }

  // ─── Breaks Tab ─────────────────────────────────────────────────────
  async function saveBreaks(breaks: Array<{ start: string; end: string }>) {
    if (!selectedPrac) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/practitioners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPrac.id, break_times: breaks }),
      });
      if (!res.ok) throw new Error('Failed to save');
      flash('Breaks saved');
      await fetchData();
    } catch {
      setError('Failed to save breaks');
    } finally {
      setSaving(false);
    }
  }

  // ─── Days Off Tab ───────────────────────────────────────────────────
  async function saveDaysOff(daysOff: string[]) {
    if (!selectedPrac) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/practitioners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPrac.id, days_off: daysOff }),
      });
      if (!res.ok) throw new Error('Failed to save');
      flash('Days off saved');
      await fetchData();
    } catch {
      setError('Failed to save days off');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Availability Settings</h1>

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ─── Team Tab ─── */}
          {tab === 'team' && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">Manage your team members who take appointments.</p>
                <button
                  onClick={openAdd}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Add Team Member
                </button>
              </div>

              {practitioners.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
                  <p className="text-slate-500">No team members yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {practitioners.map((p) => {
                    const linkedSvcs = pLinks
                      .filter((l) => l.practitioner_id === p.id)
                      .map((l) => ({ linkId: `${l.practitioner_id}_${l.service_id}`, name: services.find((s) => s.id === l.service_id)?.name }))
                      .filter((x): x is { linkId: string; name: string } => Boolean(x.name));
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border bg-white px-5 py-4 shadow-sm ${p.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900">{p.name}</span>
                              {!p.is_active && (
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">Inactive</span>
                              )}
                            </div>
                            {(p.email || p.phone) && (
                              <div className="mt-0.5 text-sm text-slate-500">
                                {[p.email, p.phone].filter(Boolean).join(' | ')}
                              </div>
                            )}
                            {linkedSvcs.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {linkedSvcs.map((ls) => (
                                  <span key={ls.linkId} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{ls.name}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEdit(p)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button
                              onClick={() => deletePractitioner(p.id)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add/Edit modal */}
              {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div role="dialog" aria-modal="true" aria-labelledby="team-modal-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                    <h2 id="team-modal-title" className="mb-4 text-lg font-semibold text-slate-900">
                      {editingId ? 'Edit Team Member' : 'Add Team Member'}
                    </h2>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Name *</label>
                        <input
                          type="text"
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          placeholder="Full name"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                        <input
                          type="email"
                          value={formEmail}
                          onChange={(e) => setFormEmail(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                        <input
                          type="tel"
                          value={formPhone}
                          onChange={(e) => setFormPhone(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setFormActive(!formActive)}
                          className={`relative h-6 w-11 rounded-full transition-colors ${formActive ? 'bg-blue-600' : 'bg-slate-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${formActive ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-sm text-slate-700">Active</span>
                      </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                      <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                      <button onClick={savePractitioner} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Working Hours / Breaks / Days Off ─── */}
          {tab !== 'team' && (
            <div>
              {/* Practitioner selector */}
              {practitioners.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
                  <p className="text-slate-500">Add team members first to configure their schedule.</p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Team member</label>
                    <select
                      value={selectedPractitionerId}
                      onChange={(e) => setSelectedPractitionerId(e.target.value)}
                      className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {practitioners.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedPrac && tab === 'hours' && (
                    <WorkingHoursEditor
                      hours={selectedPrac.working_hours ?? {}}
                      onSave={saveWorkingHours}
                      saving={saving}
                    />
                  )}

                  {selectedPrac && tab === 'breaks' && (
                    <BreaksEditor
                      breaks={selectedPrac.break_times ?? []}
                      onSave={saveBreaks}
                      saving={saving}
                    />
                  )}

                  {selectedPrac && tab === 'daysoff' && (
                    <DaysOffEditor
                      daysOff={selectedPrac.days_off ?? []}
                      onSave={saveDaysOff}
                      saving={saving}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Working Hours Editor ─────────────────────────────────────────────────
function WorkingHoursEditor({
  hours,
  onSave,
  saving,
}: {
  hours: Record<string, Array<{ start: string; end: string }>>;
  onSave: (hours: Record<string, Array<{ start: string; end: string }>>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(hours);

  useEffect(() => {
    setDraft(hours);
  }, [hours]);

  function toggleDay(dayKey: string) {
    setDraft((prev) => {
      const copy = { ...prev };
      if (copy[dayKey] && copy[dayKey].length > 0) {
        delete copy[dayKey];
      } else {
        copy[dayKey] = [{ start: '09:00', end: '17:00' }];
      }
      return copy;
    });
  }

  function updateRange(dayKey: string, index: number, field: 'start' | 'end', value: string) {
    setDraft((prev) => {
      const copy = { ...prev };
      const ranges = [...(copy[dayKey] ?? [])];
      ranges[index] = { ...ranges[index]!, [field]: value };
      copy[dayKey] = ranges;
      return copy;
    });
  }

  function addRange(dayKey: string) {
    setDraft((prev) => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] ?? []), { start: '09:00', end: '17:00' }],
    }));
  }

  function removeRange(dayKey: string, index: number) {
    setDraft((prev) => {
      const copy = { ...prev };
      const ranges = [...(copy[dayKey] ?? [])];
      ranges.splice(index, 1);
      if (ranges.length === 0) delete copy[dayKey];
      else copy[dayKey] = ranges;
      return copy;
    });
  }

  return (
    <div className="space-y-3">
      {DAY_KEYS.map((dayKey, i) => {
        const ranges = draft[dayKey] ?? [];
        const isWorking = ranges.length > 0;
        return (
          <div key={dayKey} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isWorking}
                  onChange={() => toggleDay(dayKey)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span className={`text-sm font-medium ${isWorking ? 'text-slate-900' : 'text-slate-400'}`}>
                  {DAY_LABELS[i]}
                </span>
              </label>
              {isWorking && (
                <button onClick={() => addRange(dayKey)} className="text-xs text-blue-600 hover:underline">
                  + Add split
                </button>
              )}
            </div>
            {isWorking && (
              <div className="mt-2 space-y-2 pl-7">
                {ranges.map((r, ri) => (
                  <div key={ri} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={r.start}
                      onChange={(e) => updateRange(dayKey, ri, 'start', e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                    <span className="text-sm text-slate-400">to</span>
                    <input
                      type="time"
                      value={r.end}
                      onChange={(e) => updateRange(dayKey, ri, 'end', e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                    {ranges.length > 1 && (
                      <button onClick={() => removeRange(dayKey, ri)} className="text-xs text-red-500 hover:underline">Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={() => onSave(draft)}
        disabled={saving}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Working Hours'}
      </button>
    </div>
  );
}

// ─── Breaks Editor ────────────────────────────────────────────────────────
function BreaksEditor({
  breaks,
  onSave,
  saving,
}: {
  breaks: Array<{ start: string; end: string }>;
  onSave: (breaks: Array<{ start: string; end: string }>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(breaks);

  useEffect(() => {
    setDraft(breaks);
  }, [breaks]);

  function addBreak() {
    setDraft((prev) => [...prev, { start: '12:00', end: '13:00' }]);
  }

  function removeBreak(i: number) {
    setDraft((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateBreak(i: number, field: 'start' | 'end', value: string) {
    setDraft((prev) => prev.map((b, idx) => idx === i ? { ...b, [field]: value } : b));
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">Regular break times for this team member (applied every working day).</p>
      {draft.length === 0 ? (
        <p className="text-sm text-slate-400">No breaks configured.</p>
      ) : (
        <div className="space-y-2">
          {draft.map((b, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2">
              <input
                type="time"
                value={b.start}
                onChange={(e) => updateBreak(i, 'start', e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
              <span className="text-sm text-slate-400">to</span>
              <input
                type="time"
                value={b.end}
                onChange={(e) => updateBreak(i, 'end', e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
              <button onClick={() => removeBreak(i)} className="ml-auto text-xs text-red-500 hover:underline">Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-3">
        <button onClick={addBreak} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Add Break
        </button>
        <button
          onClick={() => onSave(draft)}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Breaks'}
        </button>
      </div>
    </div>
  );
}

// ─── Days Off Editor ──────────────────────────────────────────────────────
function DaysOffEditor({
  daysOff,
  onSave,
  saving,
}: {
  daysOff: string[];
  onSave: (daysOff: string[]) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(daysOff);
  const [newDate, setNewDate] = useState('');

  useEffect(() => {
    setDraft(daysOff);
  }, [daysOff]);

  function addDate() {
    if (!newDate || draft.includes(newDate)) return;
    setDraft([...draft, newDate].sort());
    setNewDate('');
  }

  function removeDate(d: string) {
    setDraft((prev) => prev.filter((x) => x !== d));
  }

  const futureDates = draft.filter((d) => d >= new Date().toISOString().slice(0, 10));
  const pastDates = draft.filter((d) => d < new Date().toISOString().slice(0, 10));

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">Individual days off for this team member (holidays, sick days, etc.).</p>

      <div className="mb-4 flex items-center gap-2">
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          min={new Date().toISOString().slice(0, 10)}
        />
        <button
          onClick={addDate}
          disabled={!newDate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add Day Off
        </button>
      </div>

      {futureDates.length === 0 && pastDates.length === 0 ? (
        <p className="text-sm text-slate-400">No days off configured.</p>
      ) : (
        <div className="space-y-2">
          {futureDates.map((d) => (
            <div key={d} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2">
              <span className="text-sm text-slate-900">
                {new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => removeDate(d)} className="text-xs text-red-500 hover:underline">Remove</button>
            </div>
          ))}
          {pastDates.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-400">Past days off ({pastDates.length})</summary>
              <div className="mt-2 space-y-1">
                {pastDates.map((d) => (
                  <div key={d} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-1.5 text-sm text-slate-400">
                    <span>{new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <button onClick={() => removeDate(d)} className="text-xs text-red-400 hover:underline">Remove</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <button
        onClick={() => onSave(draft)}
        disabled={saving}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Days Off'}
      </button>
    </div>
  );
}
