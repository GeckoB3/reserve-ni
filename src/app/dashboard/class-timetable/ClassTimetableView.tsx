'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { defaultNewUnifiedCalendarWorkingHours } from '@/lib/availability/practitioner-defaults';
import { ClassScheduleModal } from './ClassScheduleModal';
import { ClassTimetableReadOnlyCalendar } from './ClassTimetableReadOnlyCalendar';

interface PractitionerOption {
  id: string;
  name: string;
}

type PaymentRequirement = 'none' | 'deposit' | 'full_payment';

interface ClassType {
  id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  capacity: number;
  price_pence: number | null;
  colour: string;
  is_active: boolean;
  instructor_id?: string | null;
  instructor_name?: string | null;
  payment_requirement?: PaymentRequirement;
  deposit_amount_pence?: number | null;
  max_advance_booking_days?: number;
  min_booking_notice_hours?: number;
  cancellation_notice_hours?: number;
  allow_same_day_booking?: boolean;
}

interface TimetableEntry {
  id: string;
  class_type_id: string;
  day_of_week: number;
  start_time: string;
  is_active: boolean;
  interval_weeks?: number;
  created_at?: string;
  recurrence_type?: string;
  recurrence_end_date?: string | null;
  total_occurrences?: number | null;
}

interface ClassInstance {
  id: string;
  class_type_id: string;
  instance_date: string;
  start_time: string;
  is_cancelled: boolean;
  cancel_reason: string | null;
  timetable_entry_id?: string | null;
  capacity_override?: number | null;
  booked_spots?: number;
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

type Notice = { kind: 'success' | 'error'; message: string };

const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const BLANK_CT = {
  name: '',
  description: '',
  duration_minutes: 60,
  capacity: 10,
  price_pence: '',
  colour: '#6366f1',
  is_active: true,
  instructor_staff_id: '' as string,
  instructor_custom_name: '',
  payment_requirement: 'none' as PaymentRequirement,
  deposit_pounds: '',
  max_advance_booking_days: 90,
  min_booking_notice_hours: 1,
  cancellation_notice_hours: 48,
  allow_same_day_booking: true,
};

const INITIAL_TIMETABLE_FORM = {
  day_of_week: 1,
  start_time: '09:00',
  interval_weeks: 1,
  end_condition: 'never' as 'never' | 'until' | 'count',
  recurrence_end_date: '',
  total_occurrences: '',
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
  const [practitioners, setPractitioners] = useState<PractitionerOption[]>([]);
  /** Bookable calendars (USE); names usually match staff for class instructor selection. */
  const [unifiedCalendars, setUnifiedCalendars] = useState<PractitionerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [showClassTypeForm, setShowClassTypeForm] = useState(false);
  const [editingClassTypeId, setEditingClassTypeId] = useState<string | null>(null);
  const [classTypeForm, setClassTypeForm] = useState({ ...BLANK_CT });
  const [classTypeSaving, setClassTypeSaving] = useState(false);
  const [classTypeError, setClassTypeError] = useState<string | null>(null);
  const [timetableForm, setTimetableForm] = useState({ ...INITIAL_TIMETABLE_FORM });

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  const [editingTimetable, setEditingTimetable] = useState<TimetableEntry | null>(null);
  const [editingInstance, setEditingInstance] = useState<ClassInstance | null>(null);
  const [editInstanceForm, setEditInstanceForm] = useState({ date: '', time: '', capacity: '' });
  const [patchSaving, setPatchSaving] = useState(false);
  const [instanceDeletingId, setInstanceDeletingId] = useState<string | null>(null);

  const [showAddCalendarModal, setShowAddCalendarModal] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState('');
  const [addCalendarSubmitting, setAddCalendarSubmitting] = useState(false);
  const [addCalendarModalError, setAddCalendarModalError] = useState<string | null>(null);

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/venue/classes', { cache: 'no-store' });
      const data = await res.json();
      setClassTypes(data.class_types ?? []);
      setTimetable(data.timetable ?? []);
      setInstances(data.instances ?? []);
      setPractitioners(data.practitioners ?? []);
      setUnifiedCalendars(data.unified_calendars ?? []);
    } catch {
      setNotice({ kind: 'error', message: 'Failed to load class data.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /** After mutations, refetch without replacing the whole block with the loading skeleton. */
  const refreshClassData = useCallback(async () => {
    await fetchData({ silent: true });
  }, [fetchData]);

  const submitInlineNewCalendar = useCallback(async () => {
    const name = newCalendarName.trim();
    if (!name) {
      setAddCalendarModalError('Enter a display name for the calendar.');
      return;
    }
    setAddCalendarSubmitting(true);
    setAddCalendarModalError(null);
    try {
      const res = await fetch('/api/venue/practitioners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          is_active: true,
          working_hours: defaultNewUnifiedCalendarWorkingHours(),
          break_times: [],
          days_off: [],
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        id?: string;
        name?: string;
        upgrade_required?: boolean;
      };
      if (!res.ok) {
        if (res.status === 403 && json.upgrade_required) {
          setAddCalendarModalError(json.error ?? 'Calendar limit reached for your plan.');
        } else {
          setAddCalendarModalError(json.error ?? 'Could not create calendar');
        }
        return;
      }
      const newId = json.id;
      const newName = typeof json.name === 'string' ? json.name : name;
      if (!newId) {
        setAddCalendarModalError('Calendar was created but no id was returned. Refresh the page.');
        return;
      }
      setUnifiedCalendars((prev) => {
        if (prev.some((c) => c.id === newId)) return prev;
        return [...prev, { id: newId, name: newName }].sort((a, b) => a.name.localeCompare(b.name));
      });
      setPractitioners((prev) => {
        if (prev.some((p) => p.id === newId)) return prev;
        return [...prev, { id: newId, name: newName }].sort((a, b) => a.name.localeCompare(b.name));
      });
      setClassTypeForm((f) => ({ ...f, instructor_staff_id: newId }));
      setNewCalendarName('');
      setShowAddCalendarModal(false);
      setNotice({ kind: 'success', message: `Calendar "${newName}" created and selected.` });
      void fetchData({ silent: true });
    } catch {
      setAddCalendarModalError('Could not create calendar');
    } finally {
      setAddCalendarSubmitting(false);
    }
  }, [newCalendarName, fetchData]);

  /** If a session row is removed (e.g. deleted elsewhere), drop selection and detail. */
  useEffect(() => {
    if (selectedId && !instances.some((i) => i.id === selectedId)) {
      setSelectedId(null);
    }
  }, [instances, selectedId]);

  useEffect(() => {
    if (detail && !instances.some((i) => i.id === detail.id)) {
      setDetail(null);
      setAttendees([]);
    }
  }, [instances, detail]);

  const removeInstanceFromList = useCallback((id: string) => {
    setInstances((prev) => prev.filter((i) => i.id !== id));
    setSelectedId((sid) => (sid === id ? null : sid));
  }, []);

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

  const typeMap = useMemo(() => new Map(classTypes.map((ct) => [ct.id, ct])), [classTypes]);

  const stats = useMemo(() => {
    const activeClassTypes = classTypes.filter((c) => c.is_active).length;
    const todayLocal = (() => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    })();
    const end7 = new Date();
    end7.setDate(end7.getDate() + 6);
    const weekEndLocal = `${end7.getFullYear()}-${String(end7.getMonth() + 1).padStart(2, '0')}-${String(end7.getDate()).padStart(2, '0')}`;
    const sessionsNext7Days = instances.filter(
      (i) => !i.is_cancelled && i.instance_date >= todayLocal && i.instance_date <= weekEndLocal,
    ).length;
    const upcomingSessions = instances.filter((i) => !i.is_cancelled).length;
    const totalBookedSpots = instances.reduce((sum, i) => sum + (i.booked_spots ?? 0), 0);
    return { activeClassTypes, sessionsNext7Days, upcomingSessions, totalBookedSpots };
  }, [classTypes, instances]);

  /** Instructor id no longer in calendar/practitioner lists (deleted); keep selectable in the dropdown. */
  const orphanInstructorOption = useMemo(() => {
    if (!editingClassTypeId || !showClassTypeForm) return null;
    const ct = classTypes.find((c) => c.id === editingClassTypeId);
    const id = ct?.instructor_id;
    if (!id) return null;
    if (unifiedCalendars.some((c) => c.id === id)) return null;
    if (practitioners.some((p) => p.id === id)) return null;
    return { id, label: ct.instructor_name?.trim() || 'Saved instructor' };
  }, [editingClassTypeId, showClassTypeForm, classTypes, unifiedCalendars, practitioners]);

  /** Legacy rows stored the calendar display name in `instructor_name`; treat that as “no custom label”. */
  const customClassInstructorFromStored = useCallback(
    (ct: ClassType): string => {
      const stored = (ct.instructor_name ?? '').trim();
      if (!stored) return '';
      const cal = unifiedCalendars.find((c) => c.id === ct.instructor_id);
      if (cal && stored === cal.name.trim()) return '';
      const prac = practitioners.find((p) => p.id === ct.instructor_id);
      if (prac && stored === prac.name.trim()) return '';
      return stored;
    },
    [unifiedCalendars, practitioners],
  );

  const buildClassTypePayload = () => {
    const priceRaw = classTypeForm.price_pence.trim();
    const pricePence =
      priceRaw === '' ? null : Math.max(0, Math.round(parseFloat(priceRaw) * 100));
    const calendarId = classTypeForm.instructor_staff_id.trim();
    const custom = classTypeForm.instructor_custom_name.trim();
    const depositRaw = classTypeForm.deposit_pounds.trim();
    const depositPence =
      classTypeForm.payment_requirement === 'deposit' && depositRaw !== ''
        ? Math.max(0, Math.round(parseFloat(depositRaw) * 100))
        : null;

    return {
      name: classTypeForm.name.trim(),
      description: classTypeForm.description.trim() || null,
      duration_minutes: classTypeForm.duration_minutes,
      capacity: classTypeForm.capacity,
      colour: classTypeForm.colour,
      is_active: classTypeForm.is_active,
      payment_requirement: classTypeForm.payment_requirement,
      deposit_amount_pence: depositPence,
      price_pence: pricePence,
      instructor_id: calendarId,
      instructor_name: custom || null,
      max_advance_booking_days: classTypeForm.max_advance_booking_days,
      min_booking_notice_hours: classTypeForm.min_booking_notice_hours,
      cancellation_notice_hours: classTypeForm.cancellation_notice_hours,
      allow_same_day_booking: classTypeForm.allow_same_day_booking,
    };
  };

  const buildTimetableRecurrencePayload = () => {
    let recurrence_end_date: string | null = null;
    let total_occurrences: number | null = null;
    if (timetableForm.end_condition === 'until' && timetableForm.recurrence_end_date.trim() !== '') {
      recurrence_end_date = timetableForm.recurrence_end_date.trim();
    }
    if (timetableForm.end_condition === 'count' && timetableForm.total_occurrences.trim() !== '') {
      const n = parseInt(timetableForm.total_occurrences, 10);
      if (!Number.isNaN(n) && n > 0) total_occurrences = n;
    }
    return {
      day_of_week: timetableForm.day_of_week,
      start_time: timetableForm.start_time,
      interval_weeks: timetableForm.interval_weeks,
      recurrence_type: 'weekly',
      recurrence_end_date,
      total_occurrences,
    };
  };

  const handleSaveClassType = async () => {
    if (!classTypeForm.name.trim()) {
      setClassTypeError('Class name is required.');
      return;
    }
    if (!classTypeForm.instructor_staff_id.trim()) {
      setClassTypeError('Select a calendar for this class.');
      return;
    }
    setClassTypeSaving(true);
    setClassTypeError(null);
    try {
      const payload = buildClassTypePayload();
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
      setNotice({ kind: 'success', message: editingClassTypeId ? 'Class updated.' : 'Class created.' });
      await fetchData({ silent: true });
    } catch {
      setClassTypeError('Save failed');
    } finally {
      setClassTypeSaving(false);
    }
  };

  const handleEditClassType = (ct: ClassType) => {
    const staffId = ct.instructor_id ?? '';
    const payReq = ct.payment_requirement ?? 'none';
    const depositPounds =
      payReq === 'deposit' && ct.deposit_amount_pence != null
        ? (ct.deposit_amount_pence / 100).toFixed(2)
        : '';
    setClassTypeForm({
      name: ct.name,
      description: (ct.description ?? '').trim(),
      duration_minutes: ct.duration_minutes,
      capacity: ct.capacity,
      price_pence: ct.price_pence != null ? (ct.price_pence / 100).toFixed(2) : '',
      colour: ct.colour ?? '#6366f1',
      is_active: ct.is_active,
      instructor_staff_id: staffId,
      instructor_custom_name: customClassInstructorFromStored(ct),
      payment_requirement: payReq,
      deposit_pounds: depositPounds,
      max_advance_booking_days: ct.max_advance_booking_days ?? 90,
      min_booking_notice_hours: ct.min_booking_notice_hours ?? 1,
      cancellation_notice_hours: ct.cancellation_notice_hours ?? 48,
      allow_same_day_booking: ct.allow_same_day_booking ?? true,
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
        setNotice({ kind: 'error', message: (json as { error?: string }).error ?? 'Delete failed' });
        return;
      }
      setNotice({ kind: 'success', message: 'Class type deleted.' });
      await fetchData({ silent: true });
    } catch {
      setNotice({ kind: 'error', message: 'Delete failed' });
    }
  };

  const handleSaveTimetableEdit = async () => {
    if (!editingTimetable) return;
    setPatchSaving(true);
    try {
      const recurrence = buildTimetableRecurrencePayload();
      const res = await fetch('/api/venue/classes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTimetable.id,
          entity_type: 'timetable',
          ...recurrence,
          is_active: true,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        setNotice({ kind: 'error', message: (json as { error?: string }).error ?? 'Update failed' });
        return;
      }
      setEditingTimetable(null);
      setNotice({ kind: 'success', message: 'Schedule updated.' });
      await fetchData({ silent: true });
    } catch {
      setNotice({ kind: 'error', message: 'Update failed' });
    } finally {
      setPatchSaving(false);
    }
  };

  const handleDeleteTimetableEntry = async (id: string) => {
    if (
      !window.confirm(
        'Remove this weekly rule? Existing dated sessions stay on the calendar; only future generation from this rule stops. Delete individual sessions from the list if needed.',
      )
    )
      return;
    try {
      const res = await fetch('/api/venue/classes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, entity_type: 'timetable' }),
      });
      if (!res.ok) {
        setNotice({ kind: 'error', message: 'Failed to remove schedule entry' });
        return;
      }
      setNotice({ kind: 'success', message: 'Schedule entry removed.' });
      await fetchData({ silent: true });
    } catch {
      setNotice({ kind: 'error', message: 'Failed to remove schedule entry' });
    }
  };

  const handleSaveInstanceEdit = async () => {
    if (!editingInstance) return;
    setPatchSaving(true);
    try {
      const t = editInstanceForm.time.length === 5 ? `${editInstanceForm.time}:00` : editInstanceForm.time;
      const res = await fetch('/api/venue/classes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingInstance.id,
          entity_type: 'instance',
          instance_date: editInstanceForm.date,
          start_time: t,
          ...(editInstanceForm.capacity.trim() !== ''
            ? { capacity_override: parseInt(editInstanceForm.capacity, 10) }
            : { capacity_override: null }),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        setNotice({ kind: 'error', message: (json as { error?: string }).error ?? 'Failed to update session' });
        return;
      }
      setEditingInstance(null);
      setNotice({ kind: 'success', message: 'Session updated.' });
      await fetchData({ silent: true });
      if (selectedId === editingInstance.id) void loadDetail(editingInstance.id);
    } catch {
      setNotice({ kind: 'error', message: 'Failed to update session' });
    } finally {
      setPatchSaving(false);
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
        setNotice({ kind: 'error', message: data.error ?? 'Could not cancel class' });
        return;
      }
      setSelectedId(null);
      setNotice({ kind: 'success', message: 'Class cancelled.' });
      await fetchData({ silent: true });
    } catch {
      setNotice({ kind: 'error', message: 'Could not cancel class' });
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

  const openEditTimetable = (e: TimetableEntry) => {
    setEditingTimetable(e);
    const hasEnd = e.recurrence_end_date != null && String(e.recurrence_end_date).trim() !== '';
    const hasCount = e.total_occurrences != null && e.total_occurrences > 0;
    setTimetableForm({
      day_of_week: e.day_of_week,
      start_time: e.start_time.slice(0, 5),
      interval_weeks: e.interval_weeks ?? 1,
      end_condition: hasEnd ? 'until' : hasCount ? 'count' : 'never',
      recurrence_end_date: hasEnd ? String(e.recurrence_end_date).slice(0, 10) : '',
      total_occurrences: hasCount ? String(e.total_occurrences) : '',
    });
  };

  const openEditInstance = (inst: ClassInstance) => {
    setEditingInstance(inst);
    setEditInstanceForm({
      date: inst.instance_date,
      time: inst.start_time.slice(0, 5),
      capacity: inst.capacity_override != null ? String(inst.capacity_override) : '',
    });
  };

  const handleDeleteInstance = async (inst: ClassInstance) => {
    const booked = inst.booked_spots ?? 0;
    const msg =
      booked > 0
        ? `Remove this session from the calendar? ${booked} booking(s) will stay on file but will no longer be linked to this class time.`
        : 'Remove this session from the calendar?';
    if (!window.confirm(msg)) return;
    setInstanceDeletingId(inst.id);
    try {
      const res = await fetch('/api/venue/classes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inst.id, entity_type: 'instance' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ kind: 'error', message: (json as { error?: string }).error ?? 'Could not remove session' });
        return;
      }
      setEditingInstance(null);
      removeInstanceFromList(inst.id);
      setNotice({ kind: 'success', message: 'Session removed from the calendar.' });
      await fetchData({ silent: true });
    } catch {
      setNotice({ kind: 'error', message: 'Could not remove session' });
    } finally {
      setInstanceDeletingId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p>
          Scheduled classes appear on the{' '}
          <Link href="/dashboard/calendar" className="font-medium text-brand-600 underline hover:text-brand-700">
            dashboard calendar
          </Link>{' '}
          with bookings and capacity. Use the Schedule classes button in{' '}
          <span className="font-medium text-slate-700">Scheduled sessions</span> below to add or change sessions.
        </p>
      </div>

      {notice && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            notice.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {notice.message}
          <button
            type="button"
            className="ml-3 text-xs text-slate-500 underline"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

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

      {!loading && classTypes.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Active class types</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.activeClassTypes}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sessions (next 7 days)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.sessionsNext7Days}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Upcoming sessions</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.upcomingSessions}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Booked spots (all upcoming)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.totalBookedSpots}</p>
          </div>
        </div>
      )}

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
                      <span className="text-xs text-slate-500">
                        {ct.payment_requirement === 'deposit' && ct.deposit_amount_pence != null
                          ? ` · Deposit ${formatPrice(ct.deposit_amount_pence)} online`
                          : ct.payment_requirement === 'full_payment'
                            ? ' · Full payment online'
                            : ' · No online payment'}
                      </span>
                      {!ct.is_active && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>
                      )}
                      <div className="ml-auto flex gap-2">
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
                    {ct.description ? (
                      <p className="mt-1 pl-6 text-xs text-slate-500 line-clamp-2">{ct.description}</p>
                    ) : null}

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
                            {e.recurrence_end_date && (
                              <span className="text-slate-400" title="Recurrence end date">
                                {' '}
                                · until {String(e.recurrence_end_date).slice(0, 10)}
                              </span>
                            )}
                            {e.total_occurrences != null && e.total_occurrences > 0 && (
                              <span className="text-slate-400"> · max {e.total_occurrences} sessions</span>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditTimetable(e)}
                              className="text-slate-500 hover:text-brand-600"
                              aria-label="Edit schedule entry"
                            >
                              edit
                            </button>
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

                  </div>
                );
              })}
            </div>
          )}

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
                    placeholder="e.g. Beginner session, Open studio"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                  <textarea
                    value={classTypeForm.description}
                    onChange={(e) => setClassTypeForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    placeholder="Shown to guests on the booking page."
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
                    Price ({sym}) <span className="font-normal text-slate-400">optional</span>
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
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-medium text-slate-600">Online payment (Stripe)</label>
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="payment_requirement"
                        className="mt-0.5"
                        checked={classTypeForm.payment_requirement === 'none'}
                        onChange={() =>
                          setClassTypeForm((f) => ({ ...f, payment_requirement: 'none', deposit_pounds: '' }))
                        }
                      />
                      <span>None - pay at venue or free class</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="payment_requirement"
                        className="mt-0.5"
                        checked={classTypeForm.payment_requirement === 'deposit'}
                        onChange={() => setClassTypeForm((f) => ({ ...f, payment_requirement: 'deposit' }))}
                      />
                      <span>Deposit per person (partial payment online)</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="payment_requirement"
                        className="mt-0.5"
                        checked={classTypeForm.payment_requirement === 'full_payment'}
                        onChange={() =>
                          setClassTypeForm((f) => ({ ...f, payment_requirement: 'full_payment', deposit_pounds: '' }))
                        }
                      />
                      <span>Full payment online (per person)</span>
                    </label>
                  </div>
                  {classTypeForm.payment_requirement === 'deposit' && (
                    <div className="mt-3 max-w-xs">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Deposit amount ({sym}) *</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={classTypeForm.deposit_pounds}
                        onChange={(e) => setClassTypeForm((f) => ({ ...f, deposit_pounds: e.target.value }))}
                        placeholder="e.g. 5.00"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    Deposit and full payment require a price per person and a connected Stripe account.
                  </p>
                </div>
                <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-700">Guest booking rules</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Max advance (days)</label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={classTypeForm.max_advance_booking_days}
                        onChange={(e) =>
                          setClassTypeForm((f) => ({
                            ...f,
                            max_advance_booking_days: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Min notice (hours)</label>
                      <input
                        type="number"
                        min={0}
                        max={168}
                        value={classTypeForm.min_booking_notice_hours}
                        onChange={(e) =>
                          setClassTypeForm((f) => ({
                            ...f,
                            min_booking_notice_hours: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Cancellation notice (hours)</label>
                      <input
                        type="number"
                        min={0}
                        max={168}
                        value={classTypeForm.cancellation_notice_hours}
                        onChange={(e) =>
                          setClassTypeForm((f) => ({
                            ...f,
                            cancellation_notice_hours: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={classTypeForm.allow_same_day_booking}
                          onChange={(e) =>
                            setClassTypeForm((f) => ({ ...f, allow_same_day_booking: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Allow same-day bookings
                      </label>
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Select Calendar *</label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <select
                      value={classTypeForm.instructor_staff_id}
                      onChange={(e) =>
                        setClassTypeForm((f) => ({ ...f, instructor_staff_id: e.target.value }))
                      }
                      className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      required
                    >
                      <option value="" disabled>
                        Choose a calendar…
                      </option>
                      {unifiedCalendars.length > 0 && (
                        <optgroup label="Calendar columns">
                          {unifiedCalendars.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {orphanInstructorOption && (
                        <option value={orphanInstructorOption.id}>{orphanInstructorOption.label}</option>
                      )}
                    </select>
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Class Instructor</label>
                      <input
                        type="text"
                        value={classTypeForm.instructor_custom_name}
                        onChange={(e) =>
                          setClassTypeForm((f) => ({ ...f, instructor_custom_name: e.target.value }))
                        }
                        placeholder="Optional — shown to guests instead of calendar name"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    The class appears on this team calendar in the schedule. If you add a class instructor name, guests
                    see that name instead of the calendar name when booking.
                  </p>
                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/90 p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setAddCalendarModalError(null);
                        setNewCalendarName('');
                        setShowAddCalendarModal(true);
                      }}
                      className="inline-flex w-full items-center justify-center rounded-lg border border-brand-200/90 bg-white px-3.5 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 hover:shadow-md active:scale-[0.98] active:border-brand-500 active:bg-brand-100 active:shadow-inner motion-reduce:transition-colors motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    >
                      Add calendar
                    </button>
                    <p className="mt-2 text-xs text-slate-500">
                      Create a team calendar column here and assign it to this class immediately. For appointment
                      links, services, and staff assignments, use{' '}
                      <Link
                        href="/dashboard/calendar-availability?tab=calendars"
                        className="font-medium text-brand-700 underline hover:text-brand-800"
                      >
                        Calendar availability
                      </Link>
                      .
                    </p>
                  </div>
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
          <ClassTimetableReadOnlyCalendar
            classTypes={classTypes.map((ct) => ({
              id: ct.id,
              name: ct.name,
              colour: ct.colour ?? '#6366f1',
            }))}
            instances={instances}
            isAdmin={isAdmin}
            onEditInstance={
              isAdmin
                ? (ro) => {
                    const full = instances.find((i) => i.id === ro.id);
                    if (full) openEditInstance(full);
                  }
                : undefined
            }
            onOpenSchedule={isAdmin ? () => setScheduleModalOpen(true) : undefined}
          />

          {instances.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-slate-700">All upcoming instances</h2>
              <div className="space-y-2">
                {instances.slice(0, 80).map((inst) => {
                  const ct = typeMap.get(inst.class_type_id);
                  const cap = inst.capacity_override ?? ct?.capacity ?? 0;
                  const booked = inst.booked_spots ?? 0;
                  return (
                    <div
                      key={inst.id}
                      className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-left text-sm shadow-sm transition-colors ${
                        selectedId === inst.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(selectedId === inst.id ? null : inst.id)}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ct?.colour ?? '#94a3b8' }} />
                        <span className="font-medium text-slate-900">{ct?.name}</span>
                        <span className="text-slate-500">
                          {inst.instance_date} at {inst.start_time.slice(0, 5)} · {booked}/{cap} booked
                        </span>
                        {inst.is_cancelled && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Cancelled</span>
                        )}
                      </button>
                      {isAdmin && (
                        <span className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => openEditInstance(inst)}
                            className="text-xs font-medium text-brand-600 hover:text-brand-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteInstance(inst)}
                            disabled={instanceDeletingId === inst.id}
                            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {instanceDeletingId === inst.id ? 'Removing…' : 'Remove'}
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {scheduleModalOpen && classTypes.length > 0 && (
        <ClassScheduleModal
          open={scheduleModalOpen}
          onClose={() => setScheduleModalOpen(false)}
          classTypes={classTypes.map((ct) => ({
            id: ct.id,
            name: ct.name,
            colour: ct.colour ?? '#6366f1',
            capacity: ct.capacity,
          }))}
          instances={instances}
          onRefresh={refreshClassData}
          onInstanceRemoved={removeInstanceFromList}
          setNotice={setNotice}
          openEditInstance={openEditInstance}
        />
      )}

      {showAddCalendarModal && isAdmin && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            if (addCalendarSubmitting) return;
            setShowAddCalendarModal(false);
            setAddCalendarModalError(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-calendar-modal-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-calendar-modal-title" className="mb-1 text-lg font-semibold text-slate-900">
              Add calendar
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Same defaults as Calendar availability: weekly hours are set automatically; you can edit them in
              Availability later.
            </p>
            {addCalendarModalError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {addCalendarModalError}
              </div>
            )}
            <label className="mb-1 block text-xs font-medium text-slate-600">Display name *</label>
            <input
              type="text"
              value={newCalendarName}
              onChange={(e) => setNewCalendarName(e.target.value)}
              placeholder="e.g. Studio A, Main column"
              disabled={addCalendarSubmitting}
              className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitInlineNewCalendar();
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void submitInlineNewCalendar()}
                disabled={addCalendarSubmitting}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {addCalendarSubmitting ? 'Creating…' : 'Create and select'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddCalendarModal(false);
                  setAddCalendarModalError(null);
                }}
                disabled={addCalendarSubmitting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTimetable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Edit weekly rule</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Day</label>
                <select
                  value={timetableForm.day_of_week}
                  onChange={(e) => setTimetableForm((f) => ({ ...f, day_of_week: parseInt(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Every N weeks</label>
                <select
                  value={timetableForm.interval_weeks}
                  onChange={(e) =>
                    setTimetableForm((f) => ({ ...f, interval_weeks: parseInt(e.target.value, 10) || 1 }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value={1}>Weekly</option>
                  <option value={2}>Every 2 weeks</option>
                  <option value={3}>Every 3 weeks</option>
                  <option value={4}>Every 4 weeks</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-600">End recurrence (optional)</label>
                <div className="space-y-2 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="edit-tt-end"
                      checked={timetableForm.end_condition === 'never'}
                      onChange={() =>
                        setTimetableForm((f) => ({
                          ...f,
                          end_condition: 'never',
                          recurrence_end_date: '',
                          total_occurrences: '',
                        }))
                      }
                    />
                    Ongoing (no end)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="edit-tt-end"
                      checked={timetableForm.end_condition === 'until'}
                      onChange={() => setTimetableForm((f) => ({ ...f, end_condition: 'until' }))}
                    />
                    Until a fixed date
                  </label>
                  {timetableForm.end_condition === 'until' && (
                    <input
                      type="date"
                      value={timetableForm.recurrence_end_date}
                      onChange={(e) =>
                        setTimetableForm((f) => ({ ...f, recurrence_end_date: e.target.value }))
                      }
                      className="ml-6 w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  )}
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="edit-tt-end"
                      checked={timetableForm.end_condition === 'count'}
                      onChange={() => setTimetableForm((f) => ({ ...f, end_condition: 'count' }))}
                    />
                    After N generated sessions
                  </label>
                  {timetableForm.end_condition === 'count' && (
                    <input
                      type="number"
                      min={1}
                      placeholder="e.g. 12"
                      value={timetableForm.total_occurrences}
                      onChange={(e) =>
                        setTimetableForm((f) => ({ ...f, total_occurrences: e.target.value }))
                      }
                      className="ml-6 w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTimetable(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveTimetableEdit()}
                disabled={patchSaving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {patchSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingInstance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Edit session</h3>
            {typeMap.get(editingInstance.class_type_id)?.name ? (
              <p className="mt-1 text-base font-medium text-slate-800">
                {typeMap.get(editingInstance.class_type_id)?.name}
              </p>
            ) : null}
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
                <input
                  type="date"
                  value={editInstanceForm.date}
                  onChange={(e) => setEditInstanceForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Start time</label>
                <input
                  type="time"
                  value={editInstanceForm.time}
                  onChange={(e) => setEditInstanceForm((f) => ({ ...f, time: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Capacity override (optional)</label>
                <input
                  type="number"
                  min={1}
                  value={editInstanceForm.capacity}
                  onChange={(e) => setEditInstanceForm((f) => ({ ...f, capacity: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              {isAdmin && editingInstance && (
                <button
                  type="button"
                  onClick={() => void handleDeleteInstance(editingInstance)}
                  disabled={instanceDeletingId === editingInstance.id || patchSaving}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                >
                  {instanceDeletingId === editingInstance.id ? 'Removing…' : 'Remove from calendar'}
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingInstance(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveInstanceEdit()}
                  disabled={patchSaving}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {patchSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
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
                          <td className="py-2 pr-3 text-slate-800">{a.guest_name ?? '-'}</td>
                          <td className="py-2 pr-3 text-slate-600">
                            <div className="max-w-[200px] truncate">{a.guest_email ?? '-'}</div>
                            <div className="text-xs text-slate-500">{a.guest_phone ?? ''}</div>
                          </td>
                          <td className="py-2 pr-3">{a.party_size}</td>
                          <td className="py-2 pr-3">{a.status}</td>
                          <td className="py-2 pr-3">
                            {a.deposit_amount_pence != null ? formatPrice(a.deposit_amount_pence) : '-'}
                            {a.deposit_status ? (
                              <span className="ml-1 text-xs text-slate-500">({a.deposit_status})</span>
                            ) : null}
                          </td>
                          <td className="py-2 text-slate-600">
                            {a.checked_in_at ? new Date(a.checked_in_at).toLocaleString('en-GB') : '-'}
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
