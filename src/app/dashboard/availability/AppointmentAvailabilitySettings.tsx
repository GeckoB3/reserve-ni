'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { defaultPractitionerWorkingHours } from '@/lib/availability/practitioner-defaults';

interface CalendarEntitlement {
  pricing_tier: string;
  calendar_count: number | null;
  active_practitioners: number;
  calendar_limit: number | null;
  unlimited: boolean;
  at_calendar_limit: boolean;
  can_add_practitioner: boolean;
}

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

type Tab = 'team' | 'services' | 'hours' | 'breaks' | 'daysoff';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'team', label: 'Team' },
  { key: 'services', label: 'Services' },
  { key: 'hours', label: 'Working Hours' },
  { key: 'breaks', label: 'Breaks' },
  { key: 'daysoff', label: 'Days Off' },
];

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_KEYS = ['1', '2', '3', '4', '5', '6', '0'];

function defaultWorkingHours(): Record<string, Array<{ start: string; end: string }>> {
  return defaultPractitionerWorkingHours();
}

// ─── Component ──────────────────────────────────────────────────────────────
export function AppointmentAvailabilitySettings({ isAdmin }: { isAdmin: boolean }) {
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
  const [formServiceIds, setFormServiceIds] = useState<string[]>([]);
  const [entitlement, setEntitlement] = useState<CalendarEntitlement | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Selected practitioner for hours/breaks/daysoff tabs
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string>('');

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      if (silent) {
        const svcRes = await fetch('/api/venue/appointment-services');
        if (!svcRes.ok) {
          setError('Failed to refresh service links.');
          return;
        }
        const svcData = await svcRes.json();
        setServices(svcData.services ?? []);
        setPLinks(svcData.practitioner_services ?? []);
        return;
      }

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
      if (!silent) {
        setError('Failed to load data. Please check your connection.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
   
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchEntitlement = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/venue/calendar-entitlement');
      if (!res.ok) return;
      const data = (await res.json()) as CalendarEntitlement;
      setEntitlement(data);
    } catch {
      // non-blocking
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchEntitlement();
  }, [fetchEntitlement]);

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
    if (!isAdmin) return;
    if (entitlement && !entitlement.unlimited && entitlement.at_calendar_limit) {
      setShowUpgradeModal(true);
      return;
    }
    setEditingId(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormActive(true);
    setFormServiceIds([]);
    setError(null);
    setShowForm(true);
  }

  function openEdit(p: Practitioner) {
    if (!isAdmin) return;
    setEditingId(p.id);
    setFormName(p.name);
    setFormEmail(p.email ?? '');
    setFormPhone(p.phone ?? '');
    setFormActive(p.is_active);
    setFormServiceIds(pLinks.filter((l) => l.practitioner_id === p.id).map((l) => l.service_id));
    setError(null);
    setShowForm(true);
  }

  async function savePractitioner() {
    if (!isAdmin) return;
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
        const d = (await res.json().catch(() => ({}))) as {
          error?: string;
          upgrade_required?: boolean;
          current?: number;
          limit?: number;
        };
        if (d.upgrade_required || res.status === 403) {
          void fetchEntitlement();
          setShowUpgradeModal(true);
          throw new Error(
            d.error ??
              'Your plan does not include another calendar. Upgrade your subscription to add more team members.',
          );
        }
        throw new Error(d.error ?? 'Failed to save');
      }

      const practitionerData = await res.json();
      const pracId = editingId ?? practitionerData?.id;

      if (pracId) {
        const linkRes = await fetch('/api/venue/practitioner-services', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ practitioner_id: pracId, service_ids: formServiceIds }),
        });
        if (!linkRes.ok) {
          console.error('Failed to sync practitioner service links');
        }
      }

      setShowForm(false);
      flash(editingId ? 'Team member updated' : 'Team member added');
      await fetchData();
      await fetchEntitlement();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function deletePractitioner(id: string) {
    if (!isAdmin) return;
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
      await fetchEntitlement();
    } catch {
      setError('Failed to delete team member. Please try again.');
    }
  }

  // ─── Working Hours Tab ──────────────────────────────────────────────
  async function saveWorkingHours(hours: Record<string, Array<{ start: string; end: string }>>) {
    if (!isAdmin || !selectedPrac) return;
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
    if (!isAdmin || !selectedPrac) return;
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
    if (!isAdmin || !selectedPrac) return;
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
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">
                  <p>Manage your team members who take appointments.</p>
                  {!isAdmin && (
                    <p className="mt-1 text-slate-600">Only admins can add, edit, or remove team members.</p>
                  )}
                  {isAdmin && entitlement && !entitlement.unlimited && entitlement.calendar_limit != null && (
                    <p className="mt-1 text-slate-600">
                      Calendars in use:{' '}
                      <span className="font-medium text-slate-800">
                        {entitlement.active_practitioners} of {entitlement.calendar_limit}
                      </span>
                      {entitlement.at_calendar_limit ? ' (at plan limit)' : ''}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openAdd}
                    className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Add Team Member
                  </button>
                )}
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
                          {isAdmin && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => deletePractitioner(p.id)}
                                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/></svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add/Edit modal */}
              {showForm && isAdmin && (
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

                      {services.length > 0 && (
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700">Services offered</label>
                          <p className="mb-2 text-xs text-slate-500">Select which services this team member can perform. Leave all unchecked to offer all services.</p>
                          <div className="space-y-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-3">
                            {services.map((svc) => (
                              <label key={svc.id} className="flex items-center gap-2.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formServiceIds.includes(svc.id)}
                                  onChange={(e) => {
                                    setFormServiceIds((prev) =>
                                      e.target.checked
                                        ? [...prev, svc.id]
                                        : prev.filter((id) => id !== svc.id)
                                    );
                                  }}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-slate-700">{svc.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
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

          {/* ─── Services Tab ─── */}
          {tab === 'services' && (
            <ServiceLinkingGrid
              practitioners={practitioners}
              services={services}
              links={pLinks}
              isAdmin={isAdmin}
              onLinksChanged={() => fetchData({ silent: true })}
            />
          )}

          {/* ─── Working Hours / Breaks / Days Off ─── */}
          {(tab === 'hours' || tab === 'breaks' || tab === 'daysoff') && (
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
                      readOnly={!isAdmin}
                    />
                  )}

                  {selectedPrac && tab === 'breaks' && (
                    <BreaksEditor
                      breaks={selectedPrac.break_times ?? []}
                      onSave={saveBreaks}
                      saving={saving}
                      readOnly={!isAdmin}
                    />
                  )}

                  {selectedPrac && tab === 'daysoff' && (
                    <DaysOffEditor
                      daysOff={selectedPrac.days_off ?? []}
                      onSave={saveDaysOff}
                      saving={saving}
                      readOnly={!isAdmin}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {showUpgradeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-modal-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="upgrade-modal-title" className="text-lg font-semibold text-slate-900">
              Upgrade to add more calendars
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Your current subscription includes a limited number of calendars (team members). To add another practitioner,
              increase your calendar count on the Standard plan or upgrade to Business for unlimited calendars.
            </p>
            {entitlement && !entitlement.unlimited && entitlement.calendar_limit != null && (
              <p className="mt-2 text-sm text-slate-700">
                You are using{' '}
                <span className="font-semibold">
                  {entitlement.active_practitioners} of {entitlement.calendar_limit}
                </span>{' '}
                calendar{entitlement.calendar_limit === 1 ? '' : 's'}.
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <Link
                href="/dashboard/settings?tab=plan"
                className="inline-flex justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                View plans &amp; upgrade
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Working Hours Editor ─────────────────────────────────────────────────
function WorkingHoursEditor({
  hours,
  onSave,
  saving,
  readOnly = false,
}: {
  hours: Record<string, Array<{ start: string; end: string }>>;
  onSave: (hours: Record<string, Array<{ start: string; end: string }>>) => void;
  saving: boolean;
  readOnly?: boolean;
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
                  disabled={readOnly}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 disabled:opacity-50"
                />
                <span className={`text-sm font-medium ${isWorking ? 'text-slate-900' : 'text-slate-400'}`}>
                  {DAY_LABELS[i]}
                </span>
              </label>
              {isWorking && !readOnly && (
                <button type="button" onClick={() => addRange(dayKey)} className="text-xs text-blue-600 hover:underline">
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
                      disabled={readOnly}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                    />
                    <span className="text-sm text-slate-400">to</span>
                    <input
                      type="time"
                      value={r.end}
                      onChange={(e) => updateRange(dayKey, ri, 'end', e.target.value)}
                      disabled={readOnly}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                    />
                    {ranges.length > 1 && !readOnly && (
                      <button type="button" onClick={() => removeRange(dayKey, ri)} className="text-xs text-red-500 hover:underline">Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={saving}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Working Hours'}
        </button>
      )}
      {readOnly && (
        <p className="mt-4 text-sm text-slate-500">Only admins can change working hours.</p>
      )}
    </div>
  );
}

// ─── Breaks Editor ────────────────────────────────────────────────────────
function BreaksEditor({
  breaks,
  onSave,
  saving,
  readOnly = false,
}: {
  breaks: Array<{ start: string; end: string }>;
  onSave: (breaks: Array<{ start: string; end: string }>) => void;
  saving: boolean;
  readOnly?: boolean;
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
                disabled={readOnly}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
              />
              <span className="text-sm text-slate-400">to</span>
              <input
                type="time"
                value={b.end}
                onChange={(e) => updateBreak(i, 'end', e.target.value)}
                disabled={readOnly}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
              />
              {!readOnly && (
                <button type="button" onClick={() => removeBreak(i)} className="ml-auto text-xs text-red-500 hover:underline">Remove</button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={addBreak} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Add Break
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Breaks'}
          </button>
        </div>
      )}
      {readOnly && <p className="mt-3 text-sm text-slate-500">Only admins can change breaks.</p>}
    </div>
  );
}

// ─── Days Off Editor ──────────────────────────────────────────────────────
function DaysOffEditor({
  daysOff,
  onSave,
  saving,
  readOnly = false,
}: {
  daysOff: string[];
  onSave: (daysOff: string[]) => void;
  saving: boolean;
  readOnly?: boolean;
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
          disabled={readOnly}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          min={new Date().toISOString().slice(0, 10)}
        />
        {!readOnly && (
          <button
            type="button"
            onClick={addDate}
            disabled={!newDate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add Day Off
          </button>
        )}
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
              {!readOnly ? (
                <button type="button" onClick={() => removeDate(d)} className="text-xs text-red-500 hover:underline">Remove</button>
              ) : null}
            </div>
          ))}
          {pastDates.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-400">Past days off ({pastDates.length})</summary>
              <div className="mt-2 space-y-1">
                {pastDates.map((d) => (
                  <div key={d} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-1.5 text-sm text-slate-400">
                    <span>{new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    {!readOnly && (
                      <button type="button" onClick={() => removeDate(d)} className="text-xs text-red-400 hover:underline">Remove</button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={saving}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Days Off'}
        </button>
      )}
      {readOnly && <p className="mt-4 text-sm text-slate-500">Only admins can change days off.</p>}
    </div>
  );
}

/** Build per-practitioner service id lists from API links (empty = implicit “all services”). */
function buildDraftFromLinks(
  practitioners: Practitioner[],
  links: PractitionerServiceLink[],
): Record<string, string[]> {
  const draft: Record<string, string[]> = {};
  for (const p of practitioners) {
    draft[p.id] = links.filter((l) => l.practitioner_id === p.id).map((l) => l.service_id);
  }
  return draft;
}

function areServiceDraftsEqual(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const sa = [...(a[id] ?? [])].sort().join(',');
    const sb = [...(b[id] ?? [])].sort().join(',');
    if (sa !== sb) return false;
  }
  return true;
}

// ─── Service Linking Grid ─────────────────────────────────────────────────
function ServiceLinkingGrid({
  practitioners,
  services,
  links,
  isAdmin,
  onLinksChanged,
}: {
  practitioners: Practitioner[];
  services: Service[];
  links: PractitionerServiceLink[];
  isAdmin: boolean;
  onLinksChanged: () => void | Promise<void>;
}) {
  const baseline = useMemo(() => buildDraftFromLinks(practitioners, links), [practitioners, links]);
  const [draft, setDraft] = useState<Record<string, string[]>>(baseline);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(baseline);
    setSaveError(null);
  }, [baseline]);

  const dirty = useMemo(() => !areServiceDraftsEqual(draft, baseline), [draft, baseline]);

  function toggleCell(practitionerId: string, serviceId: string) {
    if (!isAdmin) return;
    setDraft((prev) => {
      const cur = [...(prev[practitionerId] ?? [])];
      const idx = cur.indexOf(serviceId);
      if (idx >= 0) {
        cur.splice(idx, 1);
      } else {
        cur.push(serviceId);
      }
      return { ...prev, [practitionerId]: cur };
    });
    setSaveError(null);
  }

  function discard() {
    setDraft(baseline);
    setSaveError(null);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const results = await Promise.all(
        practitioners.map((p) =>
          fetch('/api/venue/practitioner-services', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              practitioner_id: p.id,
              service_ids: draft[p.id] ?? [],
            }),
          }),
        ),
      );
      if (results.some((r) => !r.ok)) {
        const firstBad = results.find((r) => !r.ok);
        const body = firstBad ? await firstBad.json().catch(() => ({})) : {};
        throw new Error(typeof body.error === 'string' ? body.error : 'Save failed');
      }
      await onLinksChanged();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  if (services.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <p className="text-slate-500">No services configured yet. Add services first from the Services page.</p>
      </div>
    );
  }

  if (practitioners.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <p className="text-slate-500">No team members configured yet. Add team members from the Team tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-slate-600">
          Tick the services each team member offers. Leave a row with <strong>no</strong> boxes ticked to offer{' '}
          <strong>all</strong> services for that person. Changes apply when you click Save.
          {!isAdmin && (
            <span className="mt-2 block text-slate-500">Only admins can change which services each person offers.</span>
          )}
        </p>
        {isAdmin && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {dirty && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200/80">
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              onClick={discard}
              disabled={!dirty || saving}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/90">
              <th className="sticky left-0 z-10 min-w-[10rem] border-r border-slate-100 bg-slate-50/95 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">
                Team member
              </th>
              {services.map((svc) => (
                <th
                  key={svc.id}
                  className="min-w-[7rem] px-3 py-3 text-center text-xs font-semibold text-slate-700"
                  title={svc.name}
                >
                  <span className="line-clamp-2">{svc.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {practitioners.map((prac) => {
              const ids = draft[prac.id] ?? [];
              const offersAllImplicit = ids.length === 0;
              return (
                <tr
                  key={prac.id}
                  className="group border-b border-slate-50 bg-white transition-colors hover:bg-slate-50/90"
                >
                  <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-4 py-3 font-medium text-slate-900 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)] group-hover:bg-slate-50/90">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <span>{prac.name}</span>
                      {offersAllImplicit && (
                        <span className="w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          All services
                        </span>
                      )}
                    </div>
                  </td>
                  {services.map((svc) => {
                    const checked = ids.includes(svc.id);
                    return (
                      <td key={svc.id} className="px-2 py-2 text-center align-middle">
                        <label className="inline-flex cursor-pointer items-center justify-center p-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCell(prac.id, svc.id)}
                            disabled={!isAdmin}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50"
                            aria-label={`${prac.name} — ${svc.name}`}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
