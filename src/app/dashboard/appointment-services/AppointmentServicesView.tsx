'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { mergeAppointmentServiceWithPractitionerLink } from '@/lib/appointments/merge-service-with-overrides';
import type { AppointmentService, PractitionerService } from '@/types/booking-models';
import { StaffServiceOverrideModal } from './StaffServiceOverrideModal';

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price_pence: number | null;
  deposit_pence: number | null;
  colour: string;
  is_active: boolean;
  sort_order: number;
  staff_may_customize_name?: boolean;
  staff_may_customize_description?: boolean;
  staff_may_customize_duration?: boolean;
  staff_may_customize_buffer?: boolean;
  staff_may_customize_price?: boolean;
  staff_may_customize_deposit?: boolean;
  staff_may_customize_colour?: boolean;
}

interface Practitioner {
  id: string;
  name: string;
}

interface PractitionerServiceLink {
  practitioner_id: string;
  service_id: string;
  custom_duration_minutes?: number | null;
  custom_price_pence?: number | null;
  custom_name?: string | null;
  custom_description?: string | null;
  custom_buffer_minutes?: number | null;
  custom_deposit_pence?: number | null;
  custom_colour?: string | null;
}

interface ServiceFormData {
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  price: string;
  deposit: string;
  require_deposit: boolean;
  colour: string;
  is_active: boolean;
  practitioner_ids: string[];
  staffMay: {
    name: boolean;
    description: boolean;
    duration: boolean;
    buffer: boolean;
    price: boolean;
    deposit: boolean;
    colour: boolean;
  };
}

const COLOUR_OPTIONS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

const DEFAULT_STAFF_MAY: ServiceFormData['staffMay'] = {
  name: false,
  description: false,
  duration: false,
  buffer: false,
  price: false,
  deposit: false,
  colour: false,
};

const DEFAULT_FORM: ServiceFormData = {
  name: '',
  description: '',
  duration_minutes: 30,
  buffer_minutes: 0,
  price: '',
  deposit: '',
  require_deposit: false,
  colour: '#3B82F6',
  is_active: true,
  practitioner_ids: [],
  staffMay: { ...DEFAULT_STAFF_MAY },
};

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function penceToPounds(pence: number | null): string {
  if (pence == null) return '';
  return (pence / 100).toFixed(2);
}

function poundsToPence(pounds: string): number | null {
  const trimmed = pounds.trim();
  if (!trimmed) return null;
  const num = parseFloat(trimmed);
  if (Number.isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

export function AppointmentServicesView({
  isAdmin,
  linkedPractitionerId = null,
  currency = 'GBP',
}: {
  isAdmin: boolean;
  linkedPractitionerId?: string | null;
  currency?: string;
}) {
  const sym = currency === 'EUR' ? '€' : '£';

  function formatPrice(pence: number | null): string {
    if (pence == null) return 'POA';
    return `${sym}${(pence / 100).toFixed(2)}`;
  }

  const [services, setServices] = useState<Service[]>([]);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [links, setLinks] = useState<PractitionerServiceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showBulkDeposit, setShowBulkDeposit] = useState(false);
  const [bulkDepositAmount, setBulkDepositAmount] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [overrideService, setOverrideService] = useState<Service | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [svcRes, practRes] = await Promise.all([
        fetch('/api/venue/appointment-services'),
        fetch('/api/venue/practitioners?roster=1'),
      ]);
      if (!svcRes.ok || !practRes.ok) {
        setError('Failed to load services. Please refresh the page.');
        return;
      }
      const svcData = await svcRes.json();
      const practData = await practRes.json();
      setServices(svcData.services ?? []);
      setLinks(svcData.practitioner_services ?? []);
      setPractitioners(practData.practitioners ?? []);
    } catch {
      setError('Failed to load services. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** Admins manage definitions for everyone. Staff see the full venue list read-only; they edit what they offer under Availability. */
  const visibleServices = useMemo(() => {
    if (isAdmin) return services;
    if (!linkedPractitionerId) return [];
    return services;
  }, [isAdmin, services, linkedPractitionerId]);

  function staffMayCustomizeAny(svc: Service): boolean {
    return Boolean(
      svc.staff_may_customize_name ||
        svc.staff_may_customize_description ||
        svc.staff_may_customize_duration ||
        svc.staff_may_customize_buffer ||
        svc.staff_may_customize_price ||
        svc.staff_may_customize_deposit ||
        svc.staff_may_customize_colour,
    );
  }

  function staffOffersService(serviceId: string): boolean {
    if (!linkedPractitionerId) return false;
    const mine = links.filter((l) => l.practitioner_id === linkedPractitionerId);
    if (mine.length === 0) return true;
    return mine.some((l) => l.service_id === serviceId);
  }

  function myLinkForService(serviceId: string): PractitionerService | null {
    if (!linkedPractitionerId) return null;
    const row = links.find((l) => l.practitioner_id === linkedPractitionerId && l.service_id === serviceId);
    if (!row) return null;
    return {
      id: '',
      practitioner_id: row.practitioner_id,
      service_id: row.service_id,
      custom_duration_minutes: row.custom_duration_minutes ?? null,
      custom_price_pence: row.custom_price_pence ?? null,
      custom_name: row.custom_name ?? null,
      custom_description: row.custom_description ?? null,
      custom_buffer_minutes: row.custom_buffer_minutes ?? null,
      custom_deposit_pence: row.custom_deposit_pence ?? null,
      custom_colour: row.custom_colour ?? null,
    };
  }

  function openCreate() {
    setForm({ ...DEFAULT_FORM, staffMay: { ...DEFAULT_STAFF_MAY } });
    setEditingId(null);
    setError(null);
    setShowModal(true);
  }

  function openEdit(svc: Service) {
    const svcLinks = links.filter((l) => l.service_id === svc.id).map((l) => l.practitioner_id);
    setForm({
      name: svc.name,
      description: svc.description ?? '',
      duration_minutes: svc.duration_minutes,
      buffer_minutes: svc.buffer_minutes,
      price: penceToPounds(svc.price_pence),
      deposit: penceToPounds(svc.deposit_pence),
      require_deposit: svc.deposit_pence != null && svc.deposit_pence > 0,
      colour: svc.colour || '#3B82F6',
      is_active: svc.is_active,
      practitioner_ids: svcLinks,
      staffMay: {
        name: svc.staff_may_customize_name ?? false,
        description: svc.staff_may_customize_description ?? false,
        duration: svc.staff_may_customize_duration ?? false,
        buffer: svc.staff_may_customize_buffer ?? false,
        price: svc.staff_may_customize_price ?? false,
        deposit: svc.staff_may_customize_deposit ?? false,
        colour: svc.staff_may_customize_colour ?? false,
      },
    });
    setEditingId(svc.id);
    setError(null);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Service name is required');
      return;
    }
    if (form.duration_minutes < 5) {
      setError('Duration must be at least 5 minutes');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const depositPence = form.require_deposit ? (poundsToPence(form.deposit) ?? 0) : 0;
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        duration_minutes: form.duration_minutes,
        buffer_minutes: form.buffer_minutes,
        price_pence: poundsToPence(form.price) ?? undefined,
        deposit_pence: depositPence,
        colour: form.colour,
        is_active: form.is_active,
        practitioner_ids: form.practitioner_ids,
        staff_may_customize_name: form.staffMay.name,
        staff_may_customize_description: form.staffMay.description,
        staff_may_customize_duration: form.staffMay.duration,
        staff_may_customize_buffer: form.staffMay.buffer,
        staff_may_customize_price: form.staffMay.price,
        staff_may_customize_deposit: form.staffMay.deposit,
        staff_may_customize_colour: form.staffMay.colour,
      };

      const res = await fetch('/api/venue/appointment-services', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save service');
      }

      setShowModal(false);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch('/api/venue/appointment-services', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setError('Failed to delete service. Please try again.');
        return;
      }
      setDeleteConfirm(null);
      await fetchAll();
    } catch {
      setError('Failed to delete service. Please try again.');
    }
  }

  function togglePractitioner(pid: string) {
    setForm((prev) => ({
      ...prev,
      practitioner_ids: prev.practitioner_ids.includes(pid)
        ? prev.practitioner_ids.filter((p) => p !== pid)
        : [...prev.practitioner_ids, pid],
    }));
  }

  async function handleBulkDeposit() {
    const pence = poundsToPence(bulkDepositAmount);
    if (pence == null || pence < 0) {
      setError('Please enter a valid deposit amount');
      return;
    }
    setBulkSaving(true);
    setError(null);
    try {
      const activeServices = services.filter((s) => s.is_active);
      for (const svc of activeServices) {
        await fetch('/api/venue/appointment-services', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: svc.id, deposit_pence: pence }),
        });
      }
      setShowBulkDeposit(false);
      setBulkDepositAmount('');
      await fetchAll();
    } catch {
      setError('Failed to update deposits. Please try again.');
    } finally {
      setBulkSaving(false);
    }
  }

  function practitionersForService(serviceId: string): Array<{ id: string; name: string }> {
    return links
      .filter((l) => l.service_id === serviceId)
      .map((l) => {
        const p = practitioners.find((pr) => pr.id === l.practitioner_id);
        return { id: l.practitioner_id, name: p?.name ?? 'Unknown' };
      });
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Services</h1>
          {!isAdmin && (
            <p className="mt-1 text-sm text-slate-500">
              Venue-wide service details and who offers each service are shown for reference. Only an admin can add,
              edit, or remove services. Use <span className="font-medium text-slate-700">Availability → Services</span> to
              choose which services you offer. When your admin allows it, use <span className="font-medium text-slate-700">Edit your settings</span> on a service to customise your own price, duration, and other fields for your calendar only.
            </p>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {services.length > 0 && (
              <button
                onClick={() => setShowBulkDeposit(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                Set Deposits for All
              </button>
            )}
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 5v14m-7-7h14"/></svg>
              Add Service
            </button>
          </div>
        )}
      </div>

      {/* Bulk Deposit Modal */}
      {showBulkDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Set deposit for all services</h2>
            <p className="text-sm text-slate-500 mb-4">
              This will update the deposit amount for all active services. Set to {sym}0 to remove deposits.
            </p>
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Deposit amount ({sym})</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{sym}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={bulkDepositAmount}
                  onChange={(e) => setBulkDepositAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-7 pr-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="5.00"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowBulkDeposit(false); setError(null); }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeposit}
                disabled={bulkSaving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkSaving ? 'Updating...' : 'Apply to All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!showModal && error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="mb-4 text-slate-500">No services configured yet.</p>
          {isAdmin && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 5v14m-7-7h14"/></svg>
              Add your first service
            </button>
          )}
        </div>
      ) : !isAdmin && !linkedPractitionerId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-8 text-center">
          <p className="text-sm text-amber-950">
            Your account is not linked to a calendar profile yet. Ask an admin to connect your staff login to your
            practitioner row in Availability → Team, then return here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleServices.map((svc) => {
            const linkedPractitioners = practitionersForService(svc.id);
            const display = mergeAppointmentServiceWithPractitionerLink(
              svc as unknown as AppointmentService,
              !isAdmin && linkedPractitionerId ? myLinkForService(svc.id) ?? undefined : undefined,
            );
            return (
              <div
                key={svc.id}
                className={`rounded-xl border bg-white px-5 py-4 shadow-sm transition-colors ${
                  svc.is_active ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="mt-1 h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: display.colour }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{display.name}</span>
                        {!svc.is_active && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">
                            Inactive
                          </span>
                        )}
                      </div>
                      {display.description && (
                        <p className="mt-0.5 text-sm text-slate-500 line-clamp-2">{display.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                        <span>{formatDuration(display.duration_minutes)}</span>
                        {display.buffer_minutes > 0 && (
                          <span className="text-slate-400">+{display.buffer_minutes}min buffer</span>
                        )}
                        <span className="font-medium">{formatPrice(display.price_pence)}</span>
                        {display.deposit_pence != null && display.deposit_pence > 0 && (
                          <span className="text-slate-400">
                            {formatPrice(display.deposit_pence)} deposit
                          </span>
                        )}
                      </div>
                      {!isAdmin && linkedPractitionerId && staffOffersService(svc.id) && staffMayCustomizeAny(svc) && (
                        <button
                          type="button"
                          onClick={() => setOverrideService(svc)}
                          className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                        >
                          Edit your settings
                        </button>
                      )}
                      {linkedPractitioners.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {linkedPractitioners.map((lp) => {
                            const isSelf = Boolean(!isAdmin && linkedPractitionerId && lp.id === linkedPractitionerId);
                            const chipClass = isAdmin
                              ? 'inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700'
                              : isSelf
                                ? 'inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200/80'
                                : 'inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600';
                            return (
                              <span key={lp.id} className={chipClass}>
                                {lp.name}
                                {!isAdmin && linkedPractitionerId && (
                                  <span className="ml-1 font-normal text-slate-500">
                                    {lp.id === linkedPractitionerId ? '(you)' : '(view only)'}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        onClick={() => openEdit(svc)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        title="Edit"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      {deleteConfirm === svc.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(svc.id)}
                            className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                            title="Confirm delete"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 13l4 4L19 7"/></svg>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                            title="Cancel"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(svc.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/></svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="service-modal-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="service-modal-title" className="text-lg font-semibold text-slate-900">
                {editingId ? 'Edit Service' : 'Add Service'}
              </h2>
              <button onClick={() => setShowModal(false)} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100">
                <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Men's Haircut"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  rows={2}
                  placeholder="Brief description of the service"
                />
              </div>

              {/* Duration + Buffer */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Duration (mins) *</label>
                  <input
                    type="number"
                    value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    min={5}
                    max={480}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Buffer (mins)</label>
                  <input
                    type="number"
                    value={form.buffer_minutes}
                    onChange={(e) => setForm({ ...form, buffer_minutes: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    min={0}
                    max={120}
                  />
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Price ({sym})</label>
                <div className="relative max-w-[200px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{sym}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 pl-7 pr-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Deposit toggle + amount */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, require_deposit: !form.require_deposit })}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      form.require_deposit ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        form.require_deposit ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-sm font-medium text-slate-700">Require deposit for this service</span>
                </div>
                {form.require_deposit && (
                  <div>
                    <label className="mb-1 block text-sm text-slate-600">Deposit amount ({sym})</label>
                    <div className="relative max-w-[200px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{sym}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.deposit}
                        onChange={(e) => setForm({ ...form, deposit: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 pl-7 pr-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        placeholder="5.00"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Colour */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Colour</label>
                <div className="flex flex-wrap gap-2">
                  {COLOUR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, colour: c })}
                      className={`h-8 w-8 rounded-full border-2 transition-all ${
                        form.colour === c ? 'border-slate-900 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    form.is_active ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      form.is_active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-700">Active (visible to clients)</span>
              </div>

              {/* Per-staff overrides (Model B) */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-4 space-y-3">
                <p className="text-sm font-medium text-slate-800">Staff can customise (their calendar only)</p>
                <p className="text-xs text-slate-500">
                  When ticked, linked staff can set their own value for that field; it does not change the venue default
                  or other team members.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      ['name', 'Display name'],
                      ['description', 'Description'],
                      ['duration', 'Duration'],
                      ['buffer', 'Buffer time'],
                      ['price', 'Price'],
                      ['deposit', 'Deposit'],
                      ['colour', 'Colour'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.staffMay[key]}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            staffMay: { ...prev.staffMay, [key]: e.target.checked },
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Practitioner linking */}
              {practitioners.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Team members who offer this service
                  </label>
                  <div className="space-y-2">
                    {practitioners.map((p) => (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={form.practitioner_ids.includes(p.id)}
                          onChange={() => togglePractitioner(p.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {overrideService && linkedPractitionerId && (
        <StaffServiceOverrideModal
          open={Boolean(overrideService)}
          onClose={() => setOverrideService(null)}
          onSaved={() => void fetchAll()}
          service={overrideService}
          link={myLinkForService(overrideService.id)}
          currency={currency}
        />
      )}
    </div>
  );
}
