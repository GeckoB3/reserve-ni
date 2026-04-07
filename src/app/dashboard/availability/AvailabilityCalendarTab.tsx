'use client';

import { useCallback, useEffect, useState } from 'react';
import { HelpTooltip } from '@/components/dashboard/HelpTooltip';
import { helpContent } from '@/lib/help-content';
import { NumericInput } from '@/components/ui/NumericInput';

const calHelp = helpContent.availabilityCalendar;

interface Service {
  id: string;
  name: string;
}

interface ScheduleExc {
  id: string;
  service_id: string;
  date_start: string;
  date_end: string;
  is_closed: boolean;
  opens_extra_day: boolean;
  start_time: string | null;
  end_time: string | null;
  last_booking_time: string | null;
  reason: string | null;
}

interface RestrictionExc {
  id: string;
  service_id: string | null;
  date_start: string;
  date_end: string;
  time_start: string | null;
  time_end: string | null;
  min_advance_minutes: number | null;
  max_advance_days: number | null;
  min_party_size_online: number | null;
  max_party_size_online: number | null;
  reason: string | null;
}

interface Props {
  services: Service[];
  showToast: (msg: string) => void;
}

export function AvailabilityCalendarTab({ services, showToast }: Props) {
  const [scheduleExcs, setScheduleExcs] = useState<ScheduleExc[]>([]);
  const [restrictionExcs, setRestrictionExcs] = useState<RestrictionExc[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch('/api/venue/service-schedule-exceptions'),
        fetch('/api/venue/booking-restriction-exceptions'),
      ]);
      if (sRes.ok) {
        const j = await sRes.json();
        setScheduleExcs(j.exceptions ?? []);
      }
      if (rRes.ok) {
        const j = await rRes.json();
        setRestrictionExcs(j.exceptions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 text-sm text-amber-900">
        <p className="font-medium">Service-based availability is not set up yet.</p>
        <p className="mt-1 text-amber-800/90">Add at least one service under the Services tab to manage schedule and booking rule exceptions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <p className="text-sm text-slate-600">
        Manage per-service schedule exceptions and booking rule overrides. Venue-wide closures, amended hours, and capacity blocks are managed in{' '}
        <a href="/dashboard/settings?tab=business-hours" className="font-medium text-brand-600 hover:text-brand-700 underline">
          Settings &rarr; Business Hours
        </a>.
      </p>

      <ScheduleExceptionsPanel services={services} items={scheduleExcs} onChange={() => void reload()} showToast={showToast} />
      <RestrictionExceptionsPanel services={services} items={restrictionExcs} onChange={() => void reload()} showToast={showToast} />
    </div>
  );
}

function ScheduleExceptionsPanel({
  services,
  items,
  onChange,
  showToast,
}: {
  services: Service[];
  items: ScheduleExc[];
  onChange: () => void;
  showToast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    service_id: services[0]?.id ?? '',
    date_start: '',
    date_end: '',
    is_closed: false,
    opens_extra_day: false,
    start_time: '',
    end_time: '',
    last_booking_time: '',
    reason: '',
  });

  async function createExc() {
    if (!draft.service_id || !draft.date_start || !draft.date_end) return;
    setSaving(true);
    try {
      const res = await fetch('/api/venue/service-schedule-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: draft.service_id,
          date_start: draft.date_start,
          date_end: draft.date_end,
          is_closed: draft.is_closed,
          opens_extra_day: draft.opens_extra_day,
          start_time: draft.start_time || null,
          end_time: draft.end_time || null,
          last_booking_time: draft.last_booking_time || null,
          reason: draft.reason || null,
        }),
      });
      if (!res.ok) throw new Error();
      showToast('Schedule exception saved');
      setOpen(false);
      onChange();
    } catch {
      showToast('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this schedule exception?')) return;
    try {
      await fetch('/api/venue/service-schedule-exceptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      onChange();
      showToast('Removed');
    } catch {
      showToast('Delete failed');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Service hours exceptions</h3>
        <button type="button" onClick={() => setOpen(!open)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
          {open ? 'Close form' : 'Add exception'}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">{calHelp.scheduleExceptions}</p>
      {open && (
        <div className="mt-4 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Service <HelpTooltip content={calHelp.scheduleWhichService} />
            </label>
            <select
              value={draft.service_id}
              onChange={(e) => setDraft({ ...draft, service_id: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              From <HelpTooltip content={calHelp.dateRange} />
            </label>
            <input
              type="date"
              value={draft.date_start}
              onChange={(e) => setDraft({ ...draft, date_start: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              To <HelpTooltip content={calHelp.dateRange} />
            </label>
            <input
              type="date"
              value={draft.date_end}
              onChange={(e) => setDraft({ ...draft, date_end: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_closed}
              onChange={(e) => setDraft({ ...draft, is_closed: e.target.checked })}
            />
            <span className="flex items-center gap-1.5">
              Closed <HelpTooltip content={calHelp.scheduleClosed} />
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.opens_extra_day}
              onChange={(e) => setDraft({ ...draft, opens_extra_day: e.target.checked })}
            />
            <span className="flex items-center gap-1.5">
              Open extra day <HelpTooltip content={calHelp.scheduleOpensExtraDay} />
            </span>
          </label>
          <p className="sm:col-span-2 text-[11px] text-slate-500">
            If not closed: leave times empty to use this service&apos;s usual hours, or set all three times below to override for this date range.
          </p>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Start time <HelpTooltip content={calHelp.scheduleCustomTimes} />
            </label>
            <input
              type="time"
              value={draft.start_time}
              onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              End time <HelpTooltip content={calHelp.scheduleCustomTimes} />
            </label>
            <input
              type="time"
              value={draft.end_time}
              onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Last booking time <HelpTooltip content={helpContent.services.lastBookingTime} />
            </label>
            <input
              type="time"
              value={draft.last_booking_time}
              onChange={(e) => setDraft({ ...draft, last_booking_time: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Reason (optional) <HelpTooltip content={calHelp.reason} />
            </label>
            <input
              type="text"
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void createExc()}
            className="sm:col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save schedule exception'}
          </button>
        </div>
      )}
      <ul className="mt-3 divide-y divide-slate-100 text-xs">
        {items.length === 0 && <li className="py-2 text-slate-400">None configured</li>}
        {items.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium">{services.find((s) => s.id === x.service_id)?.name ?? 'Service'}</span>
              {' \u00b7 '}
              {x.date_start === x.date_end ? x.date_start : `${x.date_start} \u2013 ${x.date_end}`}
              {x.is_closed && <span className="ml-1 text-red-600">closed</span>}
              {x.opens_extra_day && !x.is_closed && <span className="ml-1 text-emerald-600">+day</span>}
              {x.start_time && x.end_time && (
                <span className="ml-1 text-slate-500">
                  {x.start_time}\u2013{x.end_time}
                </span>
              )}
            </span>
            <button type="button" onClick={() => void remove(x.id)} className="text-red-500 hover:text-red-700">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RestrictionExceptionsPanel({
  services,
  items,
  onChange,
  showToast,
}: {
  services: Service[];
  items: RestrictionExc[];
  onChange: () => void;
  showToast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    service_id: '' as string,
    date_start: '',
    date_end: '',
    time_start: '',
    time_end: '',
    min_advance_minutes: null as number | null,
    max_advance_days: null as number | null,
    min_party_size_online: null as number | null,
    max_party_size_online: null as number | null,
    reason: '',
  });

  async function createExc() {
    if (!draft.date_start || !draft.date_end) return;
    setSaving(true);
    try {
      const res = await fetch('/api/venue/booking-restriction-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: draft.service_id || null,
          date_start: draft.date_start,
          date_end: draft.date_end,
          time_start: draft.time_start || null,
          time_end: draft.time_end || null,
          min_advance_minutes: draft.min_advance_minutes,
          max_advance_days: draft.max_advance_days,
          min_party_size_online: draft.min_party_size_online,
          max_party_size_online: draft.max_party_size_online,
          reason: draft.reason || null,
        }),
      });
      if (!res.ok) throw new Error();
      showToast('Booking rule exception saved');
      setOpen(false);
      onChange();
    } catch {
      showToast('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this exception?')) return;
    try {
      await fetch('/api/venue/booking-restriction-exceptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      onChange();
      showToast('Removed');
    } catch {
      showToast('Delete failed');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Booking rule exceptions</h3>
        <button type="button" onClick={() => setOpen(!open)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
          {open ? 'Close form' : 'Add exception'}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">{calHelp.restrictionExceptions}</p>
      {open && (
        <div className="mt-4 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Service (blank = all) <HelpTooltip content={calHelp.serviceScope} />
            </label>
            <select
              value={draft.service_id}
              onChange={(e) => setDraft({ ...draft, service_id: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
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
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              From <HelpTooltip content={calHelp.dateRange} />
            </label>
            <input
              type="date"
              value={draft.date_start}
              onChange={(e) => setDraft({ ...draft, date_start: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              To <HelpTooltip content={calHelp.dateRange} />
            </label>
            <input
              type="date"
              value={draft.date_end}
              onChange={(e) => setDraft({ ...draft, date_end: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Time start (optional) <HelpTooltip content={calHelp.restrictionTimeWindow} />
            </label>
            <input
              type="time"
              value={draft.time_start}
              onChange={(e) => setDraft({ ...draft, time_start: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Time end (optional) <HelpTooltip content={calHelp.restrictionTimeWindow} />
            </label>
            <input
              type="time"
              value={draft.time_end}
              onChange={(e) => setDraft({ ...draft, time_end: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <p className="sm:col-span-2 text-[11px] text-slate-500">
            Leave numeric fields blank to keep your normal booking rules for that setting; only filled-in values override.
          </p>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Min advance (min) <HelpTooltip content={helpContent.bookingRules.minAdvance} />
            </label>
            <NumericInput
              min={0}
              value={draft.min_advance_minutes}
              onChange={(v) => setDraft({ ...draft, min_advance_minutes: v })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Max advance (days) <HelpTooltip content={helpContent.bookingRules.maxAdvance} />
            </label>
            <NumericInput
              min={0}
              value={draft.max_advance_days}
              onChange={(v) => setDraft({ ...draft, max_advance_days: v })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Min party (online) <HelpTooltip content={helpContent.bookingRules.partySize} />
            </label>
            <NumericInput
              min={1}
              value={draft.min_party_size_online}
              onChange={(v) => setDraft({ ...draft, min_party_size_online: v })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Max party (online) <HelpTooltip content={helpContent.bookingRules.partySize} />
            </label>
            <NumericInput
              min={1}
              value={draft.max_party_size_online}
              onChange={(v) => setDraft({ ...draft, max_party_size_online: v })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              Reason (optional) <HelpTooltip content={calHelp.reason} />
            </label>
            <input
              type="text"
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void createExc()}
            className="sm:col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save booking rule exception'}
          </button>
        </div>
      )}
      <ul className="mt-3 divide-y divide-slate-100 text-xs">
        {items.length === 0 && <li className="py-2 text-slate-400">None configured</li>}
        {items.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              {x.service_id ? services.find((s) => s.id === x.service_id)?.name ?? 'Service' : 'All services'}
              {' \u00b7 '}
              {x.date_start === x.date_end ? x.date_start : `${x.date_start} \u2013 ${x.date_end}`}
              {x.time_start && x.time_end && (
                <span className="ml-1 text-slate-500">
                  {x.time_start}\u2013{x.time_end}
                </span>
              )}
            </span>
            <button type="button" onClick={() => void remove(x.id)} className="text-red-500 hover:text-red-700">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
