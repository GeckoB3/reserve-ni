'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { StripePaymentWarning } from '@/components/dashboard/StripePaymentWarning';
import { useToast } from '@/components/ui/Toast';
import { normalizeTimeToHhMm, validateStartEndTimes } from '@/lib/experience-events/experience-event-validation';
import { formatZodFlattenedError } from '@/lib/experience-events/experience-event-zod';
import { downloadCsvFile, escapeCsvCell } from './event-manager-utils';
import { canAddCalendarColumn, useCalendarEntitlement } from '@/hooks/use-calendar-entitlement';
import { isLightPlanTier } from '@/lib/tier-enforcement';
import { NumericInput } from '@/components/ui/NumericInput';

interface TicketType {
  id: string;
  name: string;
  price_pence: number;
  capacity: number | null;
  sort_order: number;
}

interface ExperienceEvent {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  image_url: string | null;
  is_active: boolean;
  calendar_id: string | null;
  ticket_types: TicketType[];
  max_advance_booking_days?: number;
  min_booking_notice_hours?: number;
  cancellation_notice_hours?: number;
  allow_same_day_booking?: boolean;
  payment_requirement?: 'none' | 'deposit' | 'full_payment';
  deposit_amount_pence?: number | null;
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
  ticket_lines?: Array<{ label: string; quantity: number; unit_price_pence: number }>;
}

interface TicketTypeDraft {
  name: string;
  price_pence: string;
  capacity: string;
}

type ScheduleMode = 'single' | 'weekly' | 'custom';

interface EventFormState {
  name: string;
  description: string;
  event_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  image_url: string;
  ticket_types: TicketTypeDraft[];
  scheduleMode: ScheduleMode;
  recurrenceUntil: string;
  customDatesText: string;
  calendar_id: string;
  max_advance_booking_days: number;
  min_booking_notice_hours: number;
  cancellation_notice_hours: number;
  allow_same_day_booking: boolean;
  payment_requirement: 'none' | 'deposit' | 'full_payment';
  deposit_pounds: string;
}

function parseOptionalTicketCapacity(raw: string): number | undefined {
  const cap = raw.trim();
  if (cap === '') return undefined;
  const n = parseInt(cap, 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return n;
}

function parseCustomDatesFromText(text: string): string[] {
  const parts = text
    .split(/[\s,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set<string>();
  for (const p of parts) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) set.add(p);
  }
  return [...set].sort();
}

const BLANK_EVENT: EventFormState = {
  name: '',
  description: '',
  event_date: '',
  start_time: '10:00',
  end_time: '12:00',
  capacity: 20,
  image_url: '',
  ticket_types: [{ name: 'General Admission', price_pence: '0.00', capacity: '' }],
  scheduleMode: 'single',
  recurrenceUntil: '',
  customDatesText: '',
  calendar_id: '',
  max_advance_booking_days: 90,
  min_booking_notice_hours: 1,
  cancellation_notice_hours: 48,
  allow_same_day_booking: true,
  payment_requirement: 'none',
  deposit_pounds: '',
};

export function EventManagerView({
  venueId: _venueId,
  isAdmin,
  linkedPractitionerIds = [],
  currency = 'GBP',
  publicBookingUrl,
  stripeConnected = false,
}: {
  venueId: string;
  isAdmin: boolean;
  linkedPractitionerIds?: string[];
  currency?: string;
  publicBookingUrl: string;
  stripeConnected?: boolean;
}) {
  const { addToast } = useToast();
  const sym = currency === 'EUR' ? '€' : '£';

  function formatPrice(pence: number): string {
    return `${sym}${(pence / 100).toFixed(2)}`;
  }

  const [events, setEvents] = useState<ExperienceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [checkInBusy, setCheckInBusy] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExperienceEvent | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Event CRUD state
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState>({ ...BLANK_EVENT });
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [teamCalendars, setTeamCalendars] = useState<Array<{ id: string; name: string; calendar_type?: string }>>(
    [],
  );
  useEffect(() => {
    if (!showEventForm) return;
    let cancelled = false;
    void fetch('/api/venue/practitioners?roster=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.practitioners) return;
        setTeamCalendars(
          (d.practitioners as Array<{ id: string; name: string; calendar_type?: string }>)
            .filter((p) => p.calendar_type !== 'resource')
            .filter((p) => isAdmin || linkedPractitionerIds.includes(p.id)),
        );
      })
      .catch(() => setTeamCalendars([]));
    return () => {
      cancelled = true;
    };
  }, [showEventForm, isAdmin, linkedPractitionerIds]);

  const [showAddCalendarModal, setShowAddCalendarModal] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState('');
  const [addCalendarSubmitting, setAddCalendarSubmitting] = useState(false);
  const [addCalendarModalError, setAddCalendarModalError] = useState<string | null>(null);

  const {
    entitlement: calendarEntitlement,
    entitlementLoaded,
    refresh: refreshCalendarEntitlement,
  } = useCalendarEntitlement(isAdmin);
  const canAddCalendar = canAddCalendarColumn(calendarEntitlement, entitlementLoaded);

  useEffect(() => {
    if (entitlementLoaded && !canAddCalendar) {
      setShowAddCalendarModal(false);
    }
  }, [entitlementLoaded, canAddCalendar]);

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
          calendar_type: 'practitioner',
          is_active: true,
        }),
      });
      const json = (await res.json()) as {
        id?: string;
        name?: string;
        error?: string;
        upgrade_required?: boolean;
      };
      if (!res.ok) {
        if (res.status === 403 && json.upgrade_required) {
          void refreshCalendarEntitlement();
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
      setTeamCalendars((prev) => {
        if (prev.some((c) => c.id === newId)) return prev;
        return [...prev, { id: newId, name: newName }].sort((a, b) => a.name.localeCompare(b.name));
      });
      setEventForm((f) => ({ ...f, calendar_id: newId }));
      setNewCalendarName('');
      setShowAddCalendarModal(false);
      addToast(`Calendar "${newName}" created and selected.`, 'success');
      void refreshCalendarEntitlement();
    } catch {
      setAddCalendarModalError('Could not create calendar');
    } finally {
      setAddCalendarSubmitting(false);
    }
  }, [newCalendarName, addToast, refreshCalendarEntitlement]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch('/api/venue/experience-events');
      const data = (await res.json()) as { events?: ExperienceEvent[]; error?: string };
      if (!res.ok) {
        setListError(data.error ?? `Could not load events (${res.status})`);
        setEvents([]);
        return;
      }
      setEvents(data.events ?? []);
    } catch {
      setListError('Network error while loading events.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [evRes, attRes] = await Promise.all([
        fetch(`/api/venue/experience-events/${id}`),
        fetch(`/api/venue/experience-events/${id}/attendees`),
      ]);
      const evJson = await evRes.json();
      const attJson = await attRes.json();
      if (!evRes.ok) {
        setDetailError(evJson.error ?? 'Failed to load event');
        setDetail(null);
        setAttendees([]);
        return;
      }
      if (!attRes.ok) {
        setDetailError(attJson.error ?? 'Failed to load attendees');
        setDetail(evJson as ExperienceEvent);
        setAttendees([]);
        return;
      }
      setDetail(evJson as ExperienceEvent);
      setAttendees((attJson.attendees ?? []) as AttendeeRow[]);
    } catch {
      setDetailError('Failed to load event');
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

  const handleSaveEvent = async () => {
    if (!eventForm.name.trim()) {
      setEventError('Event name is required.');
      return;
    }
    const validTickets = eventForm.ticket_types.filter((tt) => tt.name.trim());
    if (validTickets.length === 0) {
      setEventError('At least one ticket type with a name is required.');
      return;
    }

    let eventDateForPayload = eventForm.event_date;
    if (!editingEventId && eventForm.scheduleMode === 'custom') {
      const customDates = parseCustomDatesFromText(eventForm.customDatesText);
      if (customDates.length === 0) {
        setEventError('Add at least one date (YYYY-MM-DD), separated by commas or new lines.');
        return;
      }
      eventDateForPayload = customDates[0];
    } else if (!eventForm.event_date) {
      setEventError('Event date is required.');
      return;
    }

    if (!eventForm.start_time || !eventForm.end_time) {
      setEventError('Start and end time are required.');
      return;
    }

    const timeErr = validateStartEndTimes(eventForm.start_time, eventForm.end_time);
    if (timeErr) {
      setEventError(timeErr);
      return;
    }

    if (!editingEventId && eventForm.scheduleMode === 'weekly') {
      if (!eventForm.recurrenceUntil) {
        setEventError('End date is required for weekly recurrence.');
        return;
      }
      if (eventForm.recurrenceUntil < eventForm.event_date) {
        setEventError('End date must be on or after the first occurrence date.');
        return;
      }
    }

    if (!editingEventId && !isAdmin && !String(eventForm.calendar_id ?? '').trim()) {
      setEventError('Choose a calendar column for this event.');
      return;
    }

    setEventSaving(true);
    setEventError(null);
    try {
      const depositPence =
        eventForm.payment_requirement === 'deposit' && eventForm.deposit_pounds.trim() !== ''
          ? Math.max(0, Math.round(parseFloat(eventForm.deposit_pounds) * 100))
          : null;

      const basePayload = {
        name: eventForm.name.trim(),
        description: eventForm.description.trim() || null,
        event_date: eventDateForPayload,
        start_time: normalizeTimeToHhMm(eventForm.start_time),
        end_time: normalizeTimeToHhMm(eventForm.end_time),
        capacity: eventForm.capacity,
        image_url: eventForm.image_url.trim() || null,
        ticket_types: validTickets.map((tt) => {
          const cap = parseOptionalTicketCapacity(tt.capacity);
          return {
            name: tt.name.trim(),
            price_pence: Math.round(parseFloat(tt.price_pence || '0') * 100),
            ...(cap !== undefined ? { capacity: cap } : {}),
          };
        }),
        calendar_id: eventForm.calendar_id || null,
        max_advance_booking_days: eventForm.max_advance_booking_days,
        min_booking_notice_hours: eventForm.min_booking_notice_hours,
        cancellation_notice_hours: eventForm.cancellation_notice_hours,
        allow_same_day_booking: eventForm.allow_same_day_booking,
        payment_requirement: eventForm.payment_requirement,
        deposit_amount_pence: depositPence,
      };

      let postBody: Record<string, unknown> = { ...basePayload };
      if (!editingEventId) {
        if (eventForm.scheduleMode === 'weekly') {
          postBody = {
            ...basePayload,
            event_date: eventForm.event_date,
            schedule: { type: 'weekly' as const, until_date: eventForm.recurrenceUntil },
          };
        } else if (eventForm.scheduleMode === 'custom') {
          const dates = parseCustomDatesFromText(eventForm.customDatesText);
          postBody = {
            ...basePayload,
            event_date: dates[0],
            schedule: { type: 'custom' as const, dates },
          };
        }
      }

      const res = editingEventId
        ? await fetch('/api/venue/experience-events', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingEventId, ...basePayload }),
          })
        : await fetch('/api/venue/experience-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postBody),
          });
      const json = (await res.json()) as {
        error?: string;
        details?: unknown;
        created?: number;
        upgrade_required?: boolean;
        current?: number;
        limit?: number;
      };
      if (!res.ok) {
        if (res.status === 403 && json.upgrade_required) {
          setEventError(
            `Plan limit reached: ${json.current ?? '?'} of ${json.limit ?? '?'} active events. Upgrade your plan or deactivate old events.`,
          );
          return;
        }
        if (res.status === 409) {
          setEventError(json.error ?? 'This time conflicts with another booking or block on that calendar.');
          return;
        }
        const hint = formatZodFlattenedError(json.details);
        const baseErr = json.error ?? 'Save failed';
        setEventError(hint ? `${baseErr}: ${hint}` : baseErr);
        return;
      }
      if (!editingEventId && typeof json.created === 'number' && json.created > 1) {
        addToast(`Created ${json.created} separate event rows (one per date).`, 'success');
      } else {
        addToast(editingEventId ? 'Event updated.' : 'Event created.', 'success');
      }
      setShowEventForm(false);
      setEditingEventId(null);
      setEventForm({ ...BLANK_EVENT });
      await fetchEvents();
    } catch {
      setEventError('Save failed');
    } finally {
      setEventSaving(false);
    }
  };

  const handleEditEvent = (event: ExperienceEvent) => {
    setEventForm({
      name: event.name,
      description: event.description ?? '',
      event_date: event.event_date,
      start_time: event.start_time.slice(0, 5),
      end_time: event.end_time.slice(0, 5),
      capacity: event.capacity,
      image_url: event.image_url ?? '',
      ticket_types:
        event.ticket_types.length > 0
          ? event.ticket_types.map((tt) => ({
              name: tt.name,
              price_pence: (tt.price_pence / 100).toFixed(2),
              capacity: tt.capacity != null ? String(tt.capacity) : '',
            }))
          : [{ name: 'General Admission', price_pence: '0.00', capacity: '' }],
      scheduleMode: 'single',
      recurrenceUntil: '',
      customDatesText: '',
      calendar_id: event.calendar_id ?? '',
      max_advance_booking_days: event.max_advance_booking_days ?? 90,
      min_booking_notice_hours: event.min_booking_notice_hours ?? 1,
      cancellation_notice_hours: event.cancellation_notice_hours ?? 48,
      allow_same_day_booking: event.allow_same_day_booking ?? true,
      payment_requirement: event.payment_requirement ?? 'none',
      deposit_pounds:
        event.deposit_amount_pence != null && event.deposit_amount_pence > 0
          ? (event.deposit_amount_pence / 100).toFixed(2)
          : '',
    });
    setEditingEventId(event.id);
    setEventError(null);
    setShowEventForm(true);
    setSelectedId(null);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Permanently delete this event? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/venue/experience-events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string; booking_count?: number };
        if (res.status === 409) {
          addToast(
            json.booking_count
              ? `${json.error} (${json.booking_count} booking(s))`
              : (json.error ?? 'Cannot delete this event'),
            'error',
          );
        } else {
          addToast(json.error ?? 'Delete failed', 'error');
        }
        return;
      }
      addToast('Event deleted.', 'success');
      if (selectedId === id) setSelectedId(null);
      await fetchEvents();
    } catch {
      addToast('Delete failed', 'error');
    }
  };

  const handleCancelEvent = async () => {
    if (!selectedId || !detail) return;
    const ok = window.confirm(
      `Cancel "${detail.name}"? All active bookings will be cancelled and guests notified according to your refund policy.`,
    );
    if (!ok) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/venue/experience-events/${selectedId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error ?? 'Could not cancel event', 'error');
        return;
      }
      addToast('Event cancelled and guests notified per your policy.', 'success');
      setSelectedId(null);
      await fetchEvents();
    } catch {
      addToast('Could not cancel event', 'error');
    } finally {
      setCancelLoading(false);
    }
  };

  const addTicketType = () => {
    setEventForm((f) => ({
      ...f,
      ticket_types: [...f.ticket_types, { name: '', price_pence: '0.00', capacity: '' }],
    }));
  };

  const removeTicketType = (i: number) => {
    setEventForm((f) => ({ ...f, ticket_types: f.ticket_types.filter((_, j) => j !== i) }));
  };

  const updateTicketType = (i: number, patch: Partial<TicketTypeDraft>) => {
    setEventForm((f) => {
      const updated = [...f.ticket_types];
      updated[i] = { ...updated[i], ...patch };
      return { ...f, ticket_types: updated };
    });
  };

  const today = new Date().toISOString().slice(0, 10);
  const q = searchQuery.trim().toLowerCase();
  const visibleEvents =
    q.length === 0
      ? events
      : events.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.event_date.includes(q) ||
            (e.description ?? '').toLowerCase().includes(q),
        );
  const upcoming = visibleEvents.filter((e) => e.event_date >= today);
  const past = visibleEvents.filter((e) => e.event_date < today);

  const handleToggleCheckIn = async (bookingId: string, checkedIn: boolean) => {
    setCheckInBusy((s) => ({ ...s, [bookingId]: true }));
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked_in: checkedIn }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        addToast(data.error ?? 'Check-in update failed', 'error');
        return;
      }
      if (selectedId) await loadDetail(selectedId);
      addToast(checkedIn ? 'Guest checked in.' : 'Check-in cleared.', 'success');
    } finally {
      setCheckInBusy((s) => ({ ...s, [bookingId]: false }));
    }
  };

  const exportAttendeesCsv = () => {
    if (!detail) return;
    const header = [
      'Guest',
      'Email',
      'Phone',
      'Qty',
      'Status',
      'Deposit_pence',
      'Ticket_lines',
      'Checked_in_utc',
    ].join(',');
    const lines = attendees.map((a) =>
      [
        escapeCsvCell(a.guest_name),
        escapeCsvCell(a.guest_email),
        escapeCsvCell(a.guest_phone),
        escapeCsvCell(a.party_size),
        escapeCsvCell(a.status),
        escapeCsvCell(a.deposit_amount_pence),
        escapeCsvCell(
          (a.ticket_lines ?? []).map((l) => `${l.label} x${l.quantity}`).join('; '),
        ),
        escapeCsvCell(a.checked_in_at ? new Date(a.checked_in_at).toISOString() : ''),
      ].join(','),
    );
    downloadCsvFile(
      `event-attendees-${detail.event_date}-${detail.name.slice(0, 40).replace(/[^\w-]+/g, '_')}.csv`,
      [header, ...lines].join('\n'),
    );
    addToast('CSV downloaded.', 'success');
  };

  const copyPublicBookingLink = async () => {
    try {
      await navigator.clipboard.writeText(publicBookingUrl);
      addToast('Public booking link copied.', 'success');
    } catch {
      addToast('Could not copy link', 'error');
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Event Manager</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events…"
            className="min-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            aria-label="Search events"
          />
          {publicBookingUrl.includes('/book/') && (
            <button
              type="button"
              onClick={() => void copyPublicBookingLink()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Copy booking link
            </button>
          )}
          {(isAdmin || linkedPractitionerIds.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setEditingEventId(null);
                setEventForm({ ...BLANK_EVENT });
                setEventError(null);
                setShowEventForm(true);
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              + Create event
            </button>
          )}
        </div>
      </div>

      {!isAdmin && (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {linkedPractitionerIds.length === 0
            ? 'Your account is not linked to a calendar yet. Ask an admin to assign at least one calendar before you can create, edit, or delete events.'
            : 'You can create, edit, or delete events when you assign them to a calendar column you control below. Only admins can add new calendar columns or cancel an event with guest notifications.'}
        </p>
      )}

      {publicBookingUrl.includes('/book/') && (
        <p className="mb-4 text-sm text-slate-500">
          Guests book ticketed events on your public page:{' '}
          <Link
            href={publicBookingUrl}
            className="font-medium text-brand-600 underline hover:text-brand-700"
            target="_blank"
            rel="noreferrer"
          >
            Open booking page
          </Link>
        </p>
      )}

      {listError && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{listError}</span>
          <button
            type="button"
            onClick={() => void fetchEvents()}
            className="rounded-md border border-red-300 bg-white px-3 py-1 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Create / edit event form */}
      {showEventForm && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-800">{editingEventId ? 'Edit event' : 'Create event'}</h2>
            {isAdmin && !editingEventId && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/90 px-3 py-2.5 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">Who can manage this event later</p>
                <p className="mt-1.5 leading-relaxed text-slate-600">
                  If you assign this event to a <strong>calendar column</strong> below, staff linked to that column can{' '}
                  <strong>create</strong>, <strong>edit</strong>, or <strong>delete</strong> it later. If you leave it
                  unassigned, only admins can change or remove it.
                </p>
              </div>
            )}
            {!isAdmin && !editingEventId && linkedPractitionerIds.length > 0 && (
              <p className="text-xs leading-relaxed text-slate-600">
                Choose a <strong>calendar column</strong> you control below. You cannot create new team columns here.
              </p>
            )}
            {isAdmin && editingEventId && (
              <p className="text-xs leading-relaxed text-slate-600">
                The calendar below controls which staff can edit or delete this event: only staff assigned to that
                column see those actions.
              </p>
            )}
            {!isAdmin && editingEventId && (
              <p className="text-xs leading-relaxed text-slate-600">
                You can change this event because it is assigned to a calendar you control. You cannot add new calendar
                columns here.
              </p>
            )}
          </div>
          <div className="px-5 py-4 space-y-4">
            {!editingEventId && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <p className="mb-2 text-xs font-medium text-slate-700">Schedule</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="sched"
                      checked={eventForm.scheduleMode === 'single'}
                      onChange={() => setEventForm((f) => ({ ...f, scheduleMode: 'single' }))}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-slate-700">One date</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="sched"
                      checked={eventForm.scheduleMode === 'weekly'}
                      onChange={() => setEventForm((f) => ({ ...f, scheduleMode: 'weekly' }))}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-slate-700">Weekly (same weekday)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="sched"
                      checked={eventForm.scheduleMode === 'custom'}
                      onChange={() => setEventForm((f) => ({ ...f, scheduleMode: 'custom' }))}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-slate-700">Custom dates</span>
                  </label>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Weekly and custom create one event row per date (same ticket setup on each).
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Event name *</label>
                <input
                  type="text"
                  value={eventForm.name}
                  onChange={(e) => setEventForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Seasonal tasting, Workshop"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              {editingEventId || eventForm.scheduleMode !== 'custom' ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {eventForm.scheduleMode === 'weekly' && !editingEventId ? 'First occurrence *' : 'Date *'}
                    </label>
                    <input
                      type="date"
                      value={eventForm.event_date}
                      onChange={(e) => setEventForm((f) => ({ ...f, event_date: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  {!editingEventId && eventForm.scheduleMode === 'weekly' && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Repeat until *</label>
                      <input
                        type="date"
                        value={eventForm.recurrenceUntil}
                        onChange={(e) => setEventForm((f) => ({ ...f, recurrenceUntil: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Dates * (YYYY-MM-DD)</label>
                  <textarea
                    rows={4}
                    value={eventForm.customDatesText}
                    onChange={(e) => setEventForm((f) => ({ ...f, customDatesText: e.target.value }))}
                    placeholder={'2026-06-01\n2026-06-15\n2026-07-01'}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Capacity *</label>
                <NumericInput
                  min={1}
                  value={eventForm.capacity}
                  onChange={(v) => setEventForm((f) => ({ ...f, capacity: v }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Start time *</label>
                <input
                  type="time"
                  value={eventForm.start_time}
                  onChange={(e) => setEventForm((f) => ({ ...f, start_time: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">End time *</label>
                <input
                  type="time"
                  value={eventForm.end_time}
                  onChange={(e) => setEventForm((f) => ({ ...f, end_time: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="mb-2 text-xs font-medium text-slate-700">Guest booking rules</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Max advance (days)</label>
                    <NumericInput
                      min={1}
                      max={365}
                      value={eventForm.max_advance_booking_days}
                      onChange={(v) =>
                        setEventForm((f) => ({
                          ...f,
                          max_advance_booking_days: v,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Min notice (hours)</label>
                    <NumericInput
                      min={0}
                      max={168}
                      value={eventForm.min_booking_notice_hours}
                      onChange={(v) =>
                        setEventForm((f) => ({
                          ...f,
                          min_booking_notice_hours: v,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Cancellation notice (hours)</label>
                    <NumericInput
                      min={0}
                      max={168}
                      value={eventForm.cancellation_notice_hours}
                      onChange={(v) =>
                        setEventForm((f) => ({
                          ...f,
                          cancellation_notice_hours: v,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={eventForm.allow_same_day_booking}
                        onChange={(e) =>
                          setEventForm((f) => ({ ...f, allow_same_day_booking: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Allow same-day bookings
                    </label>
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2 space-y-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-xs font-medium text-slate-700">Calendar column</p>
                <p className="text-xs text-slate-500">
                  Show this event on a team calendar column in the dashboard. The time must not overlap other
                  appointments, classes, resources on that column, or blocked time.
                  {isAdmin && (
                    <span className="mt-1 block text-slate-600">
                      Choosing a column here also decides which staff can edit or delete this event later (see note
                      above).
                    </span>
                  )}
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Calendar</label>
                  <select
                    value={eventForm.calendar_id}
                    onChange={(e) => setEventForm((f) => ({ ...f, calendar_id: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  >
                    <option value="">Not assigned to a calendar</option>
                    {teamCalendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {isAdmin && (
                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/90 p-3">
                    {!entitlementLoaded ? (
                      <p className="text-xs text-slate-500">Loading plan limits…</p>
                    ) : canAddCalendar ? (
                      <>
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
                          Create a calendar column here and assign it to this event immediately.
                        </p>
                      </>
                    ) : calendarEntitlement && isLightPlanTier(calendarEntitlement.pricing_tier) ? (
                      <p className="text-xs text-amber-950">
                        Appointments Light includes <strong className="font-semibold">one bookable calendar</strong>. To
                        add more columns, upgrade to the full Appointments plan under{' '}
                        <a
                          href="/dashboard/settings?tab=plan"
                          className="font-medium text-brand-700 underline hover:text-brand-800"
                        >
                          Settings → Plan
                        </a>
                        .
                      </p>
                    ) : (
                      <p className="text-xs text-amber-950">
                        You&apos;ve reached your plan&apos;s calendar limit. Visit{' '}
                        <a
                          href="/dashboard/settings?tab=plan"
                          className="font-medium text-brand-700 underline hover:text-brand-800"
                        >
                          Settings → Plan
                        </a>
                        .
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Description <span className="font-normal text-slate-400">optional</span>
                </label>
                <textarea
                  rows={2}
                  value={eventForm.description}
                  onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Briefly describe the event for guests…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Image URL <span className="font-normal text-slate-400">optional</span>
                </label>
                <input
                  type="url"
                  value={eventForm.image_url}
                  onChange={(e) => setEventForm((f) => ({ ...f, image_url: e.target.value }))}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
                {/^https?:\/\//i.test(eventForm.image_url.trim()) && (
                  <div className="mt-2">
                    <p className="mb-1 text-xs text-slate-500">Preview</p>
                    <img
                      src={eventForm.image_url.trim()}
                      alt=""
                      className="max-h-40 max-w-full rounded-lg border border-slate-200 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Ticket types */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Ticket types</h3>
              <div className="space-y-2">
                {eventForm.ticket_types.map((tt, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <div className="flex-1 min-w-[140px]">
                      <label className="mb-1 block text-xs font-medium text-slate-500">Ticket name</label>
                      <input
                        type="text"
                        value={tt.name}
                        onChange={(e) => updateTicketType(i, { name: e.target.value })}
                        placeholder="e.g. General Admission"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-xs font-medium text-slate-500">Price ({sym})</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={tt.price_pence}
                        onChange={(e) => updateTicketType(i, { price_pence: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>
                    <div className="w-24">
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Cap <span className="font-normal text-slate-400">opt.</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={tt.capacity}
                        onChange={(e) => updateTicketType(i, { capacity: e.target.value })}
                        placeholder="-"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>
                    {eventForm.ticket_types.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTicketType(i)}
                        className="self-end pb-1.5 text-xs text-red-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addTicketType}
                className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-800"
              >
                + Add ticket type
              </button>
            </div>

            {/* Online payment */}
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Online payment (Stripe)</label>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="event_payment_requirement"
                    className="mt-0.5"
                    checked={eventForm.payment_requirement === 'none'}
                    onChange={() =>
                      setEventForm((f) => ({ ...f, payment_requirement: 'none', deposit_pounds: '' }))
                    }
                  />
                  <span>None - pay at venue or free event</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="event_payment_requirement"
                    className="mt-0.5"
                    checked={eventForm.payment_requirement === 'deposit'}
                    onChange={() => setEventForm((f) => ({ ...f, payment_requirement: 'deposit' }))}
                  />
                  <span>Deposit per person (partial payment online)</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="event_payment_requirement"
                    className="mt-0.5"
                    checked={eventForm.payment_requirement === 'full_payment'}
                    onChange={() =>
                      setEventForm((f) => ({ ...f, payment_requirement: 'full_payment', deposit_pounds: '' }))
                    }
                  />
                  <span>Full payment online (per ticket)</span>
                </label>
              </div>
              {eventForm.payment_requirement === 'deposit' && (
                <div className="mt-3 max-w-xs">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Deposit amount ({sym}) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={eventForm.deposit_pounds}
                    onChange={(e) => setEventForm((f) => ({ ...f, deposit_pounds: e.target.value }))}
                    placeholder="e.g. 5.00"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Deposit and full payment require ticket prices &gt; 0 and a connected Stripe account.
              </p>
              <StripePaymentWarning
                stripeConnected={stripeConnected}
                requiresOnlinePayment={
                  eventForm.payment_requirement === 'deposit' || eventForm.payment_requirement === 'full_payment'
                }
              />
            </div>

            {eventError && <p className="text-sm text-red-600">{eventError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleSaveEvent()}
                disabled={eventSaving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {eventSaving ? 'Saving…' : 'Save event'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEventForm(false);
                  setEditingEventId(null);
                  setEventError(null);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-500">
            No events created yet.
            {(isAdmin || linkedPractitionerIds.length > 0) ? ' Use "Create event" above to add your first event.' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-slate-700">Upcoming</h2>
              <div className="space-y-3">
                {upcoming.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    formatPrice={formatPrice}
                    selected={selectedId === event.id}
                    onSelect={() => setSelectedId(selectedId === event.id ? null : event.id)}
                    canEdit={
                      isAdmin ||
                      (event.calendar_id !== null && linkedPractitionerIds.includes(event.calendar_id))
                    }
                    onEdit={() => handleEditEvent(event)}
                    onDelete={() => void handleDeleteEvent(event.id)}
                  />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-slate-400">Past</h2>
              <div className="space-y-3 opacity-60">
                {past.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    formatPrice={formatPrice}
                    selected={selectedId === event.id}
                    onSelect={() => setSelectedId(selectedId === event.id ? null : event.id)}
                    canEdit={
                      isAdmin ||
                      (event.calendar_id !== null && linkedPractitionerIds.includes(event.calendar_id))
                    }
                    onEdit={() => handleEditEvent(event)}
                    onDelete={() => void handleDeleteEvent(event.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
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
              placeholder="e.g. Studio A, Front desk"
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
                {addCalendarSubmitting ? 'Creating\u2026' : 'Create and select'}
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

      {selectedId && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {detailLoading && <p className="text-sm text-slate-500">Loading details…</p>}
          {detailError && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-sm text-red-600">{detailError}</p>
              <button
                type="button"
                onClick={() => selectedId && void loadDetail(selectedId)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Retry
              </button>
            </div>
          )}
          {!detailLoading && detail && (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{detail.name}</h3>
                  <p className="text-sm text-slate-500">
                    {detail.event_date} · {detail.start_time.slice(0, 5)} – {detail.end_time.slice(0, 5)} ·{' '}
                    {detail.capacity} capacity
                  </p>
                  {!detail.is_active && (
                    <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Cancelled / inactive
                    </span>
                  )}
                  {!isAdmin &&
                    detail.is_active &&
                    detail.calendar_id !== null &&
                    linkedPractitionerIds.includes(detail.calendar_id) && (
                    <p className="mt-2 max-w-md text-xs text-slate-500">
                      Cancelling an event and notifying guests is limited to venue admins. You can still edit or
                      delete this event when allowed.
                    </p>
                  )}
                </div>
                {(isAdmin ||
                  (detail.calendar_id !== null && linkedPractitionerIds.includes(detail.calendar_id))) && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditEvent(detail)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit event
                    </button>
                    {isAdmin && detail.is_active && (
                      <button
                        type="button"
                        onClick={() => void handleCancelEvent()}
                        disabled={cancelLoading}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                      >
                        {cancelLoading ? 'Cancelling…' : 'Cancel event & notify guests'}
                      </button>
                    )}
                    {(isAdmin ||
                      (detail.calendar_id !== null &&
                        linkedPractitionerIds.includes(detail.calendar_id))) && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteEvent(detail.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                      >
                        Delete event
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-slate-700">Attendees</h4>
                {attendees.length > 0 && (
                  <button
                    type="button"
                    onClick={() => exportAttendeesCsv()}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Export CSV
                  </button>
                )}
              </div>
              {attendees.length === 0 ? (
                <p className="text-sm text-slate-500">No bookings for this event.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Guest</th>
                        <th className="py-2 pr-3 font-medium">Contact</th>
                        <th className="py-2 pr-3 font-medium">Tickets</th>
                        <th className="py-2 pr-3 font-medium">Qty</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Deposit</th>
                        <th className="py-2 pr-3 font-medium">Checked in</th>
                        <th className="py-2 font-medium">Actions</th>
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
                          <td className="py-2 pr-3 text-xs text-slate-600">
                            {(a.ticket_lines ?? []).length > 0
                              ? (a.ticket_lines ?? []).map((l) => `${l.label} ×${l.quantity}`).join(', ')
                              : '-'}
                          </td>
                          <td className="py-2 pr-3">{a.party_size}</td>
                          <td className="py-2 pr-3">{a.status}</td>
                          <td className="py-2 pr-3">
                            {a.deposit_amount_pence != null ? formatPrice(a.deposit_amount_pence) : '-'}
                            {a.deposit_status ? (
                              <span className="ml-1 text-xs text-slate-500">({a.deposit_status})</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-slate-600">
                            {a.checked_in_at ? new Date(a.checked_in_at).toLocaleString('en-GB') : '-'}
                          </td>
                          <td className="py-2">
                            {a.status !== 'Cancelled' && (
                              <button
                                type="button"
                                disabled={checkInBusy[a.booking_id]}
                                onClick={() =>
                                  void handleToggleCheckIn(a.booking_id, !a.checked_in_at)
                                }
                                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                {checkInBusy[a.booking_id]
                                  ? '…'
                                  : a.checked_in_at
                                    ? 'Clear check-in'
                                    : 'Check in'}
                              </button>
                            )}
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

function EventCard({
  event,
  formatPrice,
  selected,
  onSelect,
  canEdit,
  onEdit,
  onDelete,
}: {
  event: ExperienceEvent;
  formatPrice: (pence: number) => string;
  selected: boolean;
  onSelect: () => void;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`rounded-xl border shadow-sm transition-colors ${
        selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full px-5 py-4 text-left"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{event.name}</h3>
            <p className="text-sm text-slate-500">
              {event.event_date} &middot; {event.start_time.slice(0, 5)} – {event.end_time.slice(0, 5)}
            </p>
            {event.description && (
              <p className="mt-1 text-sm text-slate-600 line-clamp-2">{event.description}</p>
            )}
          </div>
          <div className="text-right text-sm">
            <div className="font-medium text-slate-700">{event.capacity} capacity</div>
            {!event.is_active && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>
            )}
          </div>
        </div>
        {event.ticket_types.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {event.ticket_types.map((tt) => (
              <span key={tt.id} className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600">
                {tt.name}: {formatPrice(tt.price_pence)}
                {tt.capacity && ` (${tt.capacity} max)`}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">{selected ? 'Hide details' : 'View attendees & actions'}</p>
      </button>
      {selected && canEdit && (
        <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="text-sm font-medium text-brand-600 hover:text-brand-800"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-sm font-medium text-red-500 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
