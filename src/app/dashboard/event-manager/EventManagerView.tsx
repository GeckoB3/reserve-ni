'use client';

import { useCallback, useEffect, useState } from 'react';

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
  ticket_types: TicketType[];
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

interface TicketTypeDraft {
  name: string;
  price_pence: string;
  capacity: string;
}

interface EventFormState {
  name: string;
  description: string;
  event_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  image_url: string;
  ticket_types: TicketTypeDraft[];
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
};

export function EventManagerView({
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

  const [events, setEvents] = useState<ExperienceEvent[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/venue/experience-events');
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      console.error('Failed to load events');
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
    if (!eventForm.event_date) {
      setEventError('Event date is required.');
      return;
    }
    if (!eventForm.start_time || !eventForm.end_time) {
      setEventError('Start and end time are required.');
      return;
    }
    const validTickets = eventForm.ticket_types.filter((tt) => tt.name.trim());
    if (validTickets.length === 0) {
      setEventError('At least one ticket type with a name is required.');
      return;
    }
    setEventSaving(true);
    setEventError(null);
    try {
      const payload = {
        name: eventForm.name.trim(),
        description: eventForm.description.trim() || null,
        event_date: eventForm.event_date,
        start_time: eventForm.start_time,
        end_time: eventForm.end_time,
        capacity: eventForm.capacity,
        image_url: eventForm.image_url.trim() || null,
        ticket_types: validTickets.map((tt) => ({
          name: tt.name.trim(),
          price_pence: Math.round(parseFloat(tt.price_pence || '0') * 100),
          ...(tt.capacity !== '' && { capacity: parseInt(tt.capacity) }),
        })),
      };
      const res = editingEventId
        ? await fetch('/api/venue/experience-events', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingEventId, ...payload }),
          })
        : await fetch('/api/venue/experience-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) {
        setEventError((json as { error?: string }).error ?? 'Save failed');
        return;
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
        const json = await res.json();
        window.alert((json as { error?: string }).error ?? 'Delete failed');
        return;
      }
      if (selectedId === id) setSelectedId(null);
      await fetchEvents();
    } catch {
      window.alert('Delete failed');
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
        window.alert(data.error ?? 'Could not cancel event');
        return;
      }
      setSelectedId(null);
      await fetchEvents();
    } catch {
      window.alert('Could not cancel event');
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
  const upcoming = events.filter((e) => e.event_date >= today);
  const past = events.filter((e) => e.event_date < today);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Event Manager</h1>
        {isAdmin && (
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

      {/* Create / edit event form */}
      {showEventForm && isAdmin && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-800">{editingEventId ? 'Edit event' : 'Create event'}</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Event name *</label>
                <input
                  type="text"
                  value={eventForm.name}
                  onChange={(e) => setEventForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Saturday Night Comedy"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Date *</label>
                <input
                  type="date"
                  value={eventForm.event_date}
                  onChange={(e) => setEventForm((f) => ({ ...f, event_date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Capacity *</label>
                <input
                  type="number"
                  min={1}
                  value={eventForm.capacity}
                  onChange={(e) => setEventForm((f) => ({ ...f, capacity: parseInt(e.target.value) || 1 }))}
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
                        type="number"
                        min={0}
                        step={0.01}
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
                        type="number"
                        min={1}
                        value={tt.capacity}
                        onChange={(e) => updateTicketType(i, { capacity: e.target.value })}
                        placeholder="—"
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
            No events created yet.{isAdmin ? ' Use "Create event" above to add your first event.' : ''}
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
                    isAdmin={isAdmin}
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
                    isAdmin={isAdmin}
                    onEdit={() => handleEditEvent(event)}
                    onDelete={() => void handleDeleteEvent(event.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {selectedId && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {detailLoading && <p className="text-sm text-slate-500">Loading details…</p>}
          {detailError && <p className="text-sm text-red-600">{detailError}</p>}
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
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditEvent(detail)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit event
                    </button>
                    {detail.is_active && (
                      <button
                        type="button"
                        onClick={() => void handleCancelEvent()}
                        disabled={cancelLoading}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                      >
                        {cancelLoading ? 'Cancelling…' : 'Cancel event & notify guests'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteEvent(detail.id)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                      Delete event
                    </button>
                  </div>
                )}
              </div>

              <h4 className="mb-2 text-sm font-medium text-slate-700">Attendees</h4>
              {attendees.length === 0 ? (
                <p className="text-sm text-slate-500">No bookings for this event.</p>
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

function EventCard({
  event,
  formatPrice,
  selected,
  onSelect,
  isAdmin,
  onEdit,
  onDelete,
}: {
  event: ExperienceEvent;
  formatPrice: (pence: number) => string;
  selected: boolean;
  onSelect: () => void;
  isAdmin: boolean;
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
      {selected && isAdmin && (
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
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-sm font-medium text-red-500 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
