'use client';

import { useCallback, useEffect, useState } from 'react';
import { BOOKING_STATUS_TRANSITIONS, BOOKING_REVERT_ACTIONS, canMarkNoShowForSlot, isDestructiveBookingStatus, isRevertTransition, type BookingStatus } from '@/lib/table-management/booking-status';

interface Guest {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  visit_count: number;
}

interface EventRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface CommRow {
  id: string;
  message_type: string;
  channel: string;
  status: string;
  created_at: string;
}

interface BookingDetail {
  id: string;
  created_at?: string;
  created_by?: string | null;
  booking_date: string;
  booking_time: string;
  estimated_end_time: string | null;
  party_size: number;
  status: string;
  source: string;
  service_id?: string | null;
  deposit_status: string;
  deposit_amount_pence: number | null;
  dietary_notes: string | null;
  occasion: string | null;
  special_requests: string | null;
  internal_notes: string | null;
  cancellation_deadline: string | null;
  guest: Guest | null;
  events: EventRow[];
  communications: CommRow[];
  table_assignments?: Array<{ id: string; name: string }>;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.slice(0, 5).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToTime(value: number): string {
  const safe = ((value % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(safe / 60).toString().padStart(2, '0');
  const m = (safe % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

interface AssignmentSuggestion {
  source: 'single' | 'auto' | 'manual';
  table_ids: string[];
  table_names: string[];
  combined_capacity: number;
  spare_covers: number;
}

export function BookingDetailPanel({
  bookingId,
  onClose,
  onUpdated,
}: {
  bookingId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showModify, setShowModify] = useState(false);
  const [modifyDate, setModifyDate] = useState('');
  const [modifyTime, setModifyTime] = useState('');
  const [modifyPartySize, setModifyPartySize] = useState(2);
  const [modifyDurationMinutes, setModifyDurationMinutes] = useState(90);
  const [modifyGuestName, setModifyGuestName] = useState('');
  const [modifyGuestPhone, setModifyGuestPhone] = useState('');
  const [modifyGuestEmail, setModifyGuestEmail] = useState('');
  const [modifyDietary, setModifyDietary] = useState('');
  const [modifyOccasion, setModifyOccasion] = useState('');
  const [modifySpecialRequests, setModifySpecialRequests] = useState('');
  const [modifyInternalNotes, setModifyInternalNotes] = useState('');
  const [modifyTableIds, setModifyTableIds] = useState<string[]>([]);
  const [assignedTables, setAssignedTables] = useState<Array<{ id: string; name: string }>>([]);
  const [allTables, setAllTables] = useState<Array<{ id: string; name: string; max_covers: number }>>([]);
  const [tableManagementEnabled, setTableManagementEnabled] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [recommendedTableIds, setRecommendedTableIds] = useState<string[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [assignmentSuggestions, setAssignmentSuggestions] = useState<AssignmentSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/venue/bookings/${bookingId}`);
    if (!res.ok) { setError('Failed to load'); return; }
    const data = await res.json();
    setDetail(data);
    setModifyDate(data.booking_date);
    setModifyTime(data.booking_time?.slice(0, 5) ?? '12:00');
    setModifyPartySize(data.party_size);
    const startMinutes = timeToMinutes(data.booking_time?.slice(0, 5) ?? '12:00');
    const endMinutes = data.estimated_end_time
      ? timeToMinutes(new Date(data.estimated_end_time).toISOString().slice(11, 16))
      : startMinutes + 90;
    setModifyDurationMinutes(Math.max(15, endMinutes - startMinutes));
    setModifyGuestName(data.guest?.name ?? '');
    setModifyGuestPhone(data.guest?.phone ?? '');
    setModifyGuestEmail(data.guest?.email ?? '');
    setModifyDietary(data.dietary_notes ?? '');
    setModifyOccasion(data.occasion ?? '');
    setModifySpecialRequests(data.special_requests ?? '');
    setModifyInternalNotes(data.internal_notes ?? '');
    setModifyTableIds((data.table_assignments ?? []).map((t: { id: string }) => t.id));
    setInternalNotes(data.internal_notes ?? '');

    try {
      const tablesRes = await fetch('/api/venue/tables');
      if (tablesRes.ok) {
        const tablesData = await tablesRes.json();
        setTableManagementEnabled(tablesData.settings?.table_management_enabled ?? false);
        setAllTables((tablesData.tables ?? []).filter((t: { is_active: boolean }) => t.is_active).map((t: { id: string; name: string; max_covers: number }) => ({ id: t.id, name: t.name, max_covers: t.max_covers })));

        if (data.table_assignments) {
          setAssignedTables(data.table_assignments);
        } else {
          setAssignedTables([]);
        }
      }
    } catch {
      // Table data is supplementary
    }

    try {
      const availabilityRes = await fetch(`/api/venue/tables/availability?date=${data.booking_date}`);
      if (availabilityRes.ok) {
        const availability = await availabilityRes.json();
        const time = (data.booking_time ?? '').slice(0, 5);
        const availableAtTime = new Set<string>(
          (availability.cells ?? [])
            .filter((cell: { time: string; is_available: boolean }) => cell.time === time && cell.is_available)
            .map((cell: { table_id: string }) => cell.table_id),
        );
        const fitting = (availability.tables ?? [])
          .filter((table: { id: string; max_covers: number }) => availableAtTime.has(table.id) && table.max_covers >= data.party_size)
          .map((table: { id: string }) => table.id);
        setRecommendedTableIds(fitting);
      }
    } catch {
      setRecommendedTableIds([]);
    }
  }, [bookingId]);

  const loadAssignmentSuggestions = useCallback(async () => {
    if (!detail) return;
    setSuggestionsLoading(true);
    try {
      const params = new URLSearchParams({
        date: detail.booking_date,
        time: detail.booking_time.slice(0, 5),
        party_size: String(detail.party_size),
        booking_id: detail.id,
      });
      const res = await fetch(`/api/venue/tables/combinations/suggest?${params.toString()}`);
      if (!res.ok) {
        setAssignmentSuggestions([]);
        return;
      }
      const payload = await res.json();
      setAssignmentSuggestions(payload.suggestions ?? []);
    } catch {
      setAssignmentSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [detail]);

  useEffect(() => {
    if (!showAssignModal) return;
    void loadAssignmentSuggestions();
  }, [showAssignModal, loadAssignmentSuggestions]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const updateStatus = useCallback(async (newStatus: string) => {
    if (!detail) return;
    if (newStatus === 'No-Show' && !canMarkNoShowForSlot(detail.booking_date, detail.booking_time?.slice(0, 5) ?? '12:00', 0)) {
      setError('No-show can only be marked after the booking start time');
      return;
    }
    const currentStatus = detail.status as BookingStatus;
    const revert = isRevertTransition(currentStatus, newStatus);
    if (revert) {
      const revertAction = BOOKING_REVERT_ACTIONS[currentStatus];
      setConfirmDialog({
        title: revertAction?.label ?? `Revert to ${newStatus}`,
        message: `${detail.guest?.name ?? 'Guest'} (${detail.party_size}) at ${detail.booking_time?.slice(0, 5) ?? ''} on ${detail.booking_date} will be changed from ${detail.status} back to ${newStatus}.`,
        confirmLabel: revertAction?.label ?? `Revert to ${newStatus}`,
        onConfirm: () => { void executeStatusChange(newStatus); },
      });
      return;
    }
    if (isDestructiveBookingStatus(newStatus)) {
      setConfirmDialog({
        title: `Mark ${newStatus}`,
        message: `${detail.guest?.name ?? 'Guest'} (${detail.party_size}) at ${detail.booking_time?.slice(0, 5) ?? ''} on ${detail.booking_date} will be marked ${newStatus}.`,
        confirmLabel: `Mark ${newStatus}`,
        onConfirm: () => { void executeStatusChange(newStatus); },
      });
      return;
    }
    void executeStatusChange(newStatus);
  }, [detail]);

  const executeStatusChange = useCallback(async (newStatus: string) => {
    if (!detail) return;
    const previous = detail.status;
    setActionLoading(true);
    setDetail((prev) => prev ? { ...prev, status: newStatus } : prev);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed');
        setDetail((prev) => prev ? { ...prev, status: previous } : prev);
        return;
      }
      setError(null);
      await load();
      onUpdated();
    } finally { setActionLoading(false); }
  }, [bookingId, detail, load, onUpdated]);

  const submitModify = useCallback(async () => {
    if (!detail) return;
    setActionLoading(true);
    try {
      const currentTime = detail.booking_time?.slice(0, 5) ?? '12:00';
      const currentDate = detail.booking_date;
      const currentParty = detail.party_size;
      if (modifyDate !== currentDate || modifyTime !== currentTime || modifyPartySize !== currentParty) {
        const bookingRes = await fetch(`/api/venue/bookings/${bookingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_date: modifyDate, booking_time: modifyTime, party_size: modifyPartySize }),
        });
        if (!bookingRes.ok) {
          const j = await bookingRes.json().catch(() => ({}));
          setError(j.error ?? 'Failed');
          return;
        }
      }

      const metadataRes = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: modifyGuestName,
          guest_phone: modifyGuestPhone,
          guest_email: modifyGuestEmail,
          dietary_notes: modifyDietary,
          occasion: modifyOccasion,
          special_requests: modifySpecialRequests,
          internal_notes: modifyInternalNotes,
        }),
      });
      if (!metadataRes.ok) {
        const payload = await metadataRes.json().catch(() => ({}));
        setError(payload.error ?? 'Failed to update booking details');
        return;
      }

      const expectedEnd = minutesToTime(timeToMinutes(modifyTime) + modifyDurationMinutes);
      const currentEnd = detail.estimated_end_time
        ? new Date(detail.estimated_end_time).toISOString().slice(11, 16)
        : minutesToTime(timeToMinutes(currentTime) + 90);
      if (expectedEnd !== currentEnd) {
        const resizeRes = await fetch('/api/venue/tables/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'change_time',
            booking_id: bookingId,
            new_time: modifyTime,
            new_estimated_end_time: `${modifyDate}T${expectedEnd}:00.000Z`,
          }),
        });
        if (!resizeRes.ok) {
          const payload = await resizeRes.json().catch(() => ({}));
          setError(payload.error ?? 'Failed to update booking duration');
          return;
        }
      }

      const oldTableIds = assignedTables.map((table) => table.id).sort();
      const newTableIds = [...modifyTableIds].sort();
      if (oldTableIds.join('|') !== newTableIds.join('|')) {
        const assignBody = newTableIds.length === 0
          ? { action: 'unassign', booking_id: bookingId }
          : oldTableIds.length > 0
          ? {
              action: 'reassign',
              booking_id: bookingId,
              old_table_ids: oldTableIds,
              new_table_ids: newTableIds,
            }
          : {
              booking_id: bookingId,
              table_ids: newTableIds,
            };
        const assignRes = await fetch('/api/venue/tables/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assignBody),
        });
        if (!assignRes.ok) {
          const payload = await assignRes.json().catch(() => ({}));
          setError(payload.error ?? 'Failed to update table assignment');
          return;
        }
      }

      setError(null);
      setShowModify(false);
      await load();
      onUpdated();
    } finally { setActionLoading(false); }
  }, [
    detail,
    bookingId,
    modifyDate,
    modifyTime,
    modifyPartySize,
    modifyDurationMinutes,
    modifyGuestName,
    modifyGuestPhone,
    modifyGuestEmail,
    modifyDietary,
    modifyOccasion,
    modifySpecialRequests,
    modifyInternalNotes,
    modifyTableIds,
    assignedTables,
    load,
    onUpdated,
  ]);

  const runDepositAction = useCallback(async (action: 'send_payment_link' | 'waive' | 'record_cash' | 'refund') => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? 'Deposit action failed');
        return;
      }
      setError(null);
      await load();
      onUpdated();
    } finally {
      setActionLoading(false);
    }
  }, [bookingId, load, onUpdated]);

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
        <div role="dialog" aria-modal="true" aria-label="Booking detail" className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
          <p className="text-slate-500">{loading ? 'Loading...' : 'Booking not found.'}</p>
          <button type="button" onClick={onClose} className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700">Close</button>
        </div>
      </div>
    );
  }

  const depositPaid = detail.deposit_status === 'Paid' && detail.deposit_amount_pence;
  const depositAmountStr = detail.deposit_amount_pence ? `£${(detail.deposit_amount_pence / 100).toFixed(2)}` : null;
  const nextStatuses = BOOKING_STATUS_TRANSITIONS[detail.status as BookingStatus] ?? [];
  const canChangeStatus = nextStatuses.length > 0;
  const confirmationSentAt = detail.communications.find((comm) => comm.message_type === 'booking_confirmation')?.created_at;
  const startTime = detail.booking_time?.slice(0, 5) ?? '00:00';
  const endTime = detail.estimated_end_time
    ? new Date(detail.estimated_end_time).toISOString().slice(11, 16)
    : minutesToTime(timeToMinutes(startTime) + 90);
  const durationMinutes = Math.max(15, timeToMinutes(endTime) - timeToMinutes(startTime));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Booking detail panel"
        className="w-full max-w-md overflow-y-auto bg-white shadow-2xl lg:rounded-l-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{detail.guest?.name ?? 'Booking Details'}</h2>
            <p className="text-xs text-slate-500">
              Ref: {detail.id.slice(0, 8)}
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(detail.id)}
                className="ml-2 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
              >
                Copy
              </button>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                detail.status === 'Pending'
                  ? 'bg-amber-100 text-amber-700'
                  : detail.status === 'Confirmed'
                    ? 'bg-teal-100 text-teal-700'
                    : detail.status === 'Seated'
                      ? 'bg-blue-100 text-blue-700'
                      : detail.status === 'Completed'
                        ? 'bg-slate-100 text-slate-700'
                        : detail.status === 'No-Show'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-600'
              }`}>
                {detail.status}
              </span>
            </p>
          </div>
          <button type="button" aria-label="Close booking detail" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 p-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* Guest info card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                {(detail.guest?.name ?? '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{detail.guest?.name ?? 'Unknown guest'}</p>
                <p className="text-xs text-slate-500">{detail.guest?.visit_count ?? 0} previous visits</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5 text-sm">
              {detail.guest?.email && (
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                  <a href={`mailto:${detail.guest.email}`} className="underline-offset-2 hover:underline">
                    {detail.guest.email}
                  </a>
                </div>
              )}
              {detail.guest?.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>
                  <a href={`tel:${detail.guest.phone}`} className="underline-offset-2 hover:underline">
                    {detail.guest.phone}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Booking details grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoTile label="Date" value={detail.booking_date} />
            <InfoTile label="Start Time" value={startTime} />
            <InfoTile label="End Time" value={endTime} />
            <InfoTile label="Duration" value={`${durationMinutes} min`} />
            <InfoTile label="Covers" value={String(detail.party_size)} />
            <InfoTile label="Source" value={detail.source} />
            <InfoTile label="Status" value={detail.status} />
            <InfoTile label="Deposit" value={depositPaid ? `${depositAmountStr} Paid` : detail.deposit_status} />
            <InfoTile label="Service" value={detail.service_id ? 'Assigned' : '—'} />
            <InfoTile label="Created" value={detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'} />
            <InfoTile label="Created By" value={detail.created_by ?? '—'} />
          </div>
          {confirmationSentAt && (
            <p className="text-xs text-slate-500">Confirmation already sent on {new Date(confirmationSentAt).toLocaleString()}.</p>
          )}
          <button
            type="button"
            disabled={actionLoading}
            onClick={async () => {
              setActionLoading(true);
              try {
                const res = await fetch(`/api/venue/bookings/${bookingId}/resend-confirmation`, { method: 'POST' });
                if (!res.ok) {
                  const payload = await res.json().catch(() => ({}));
                  setError(payload.error ?? 'Failed to resend confirmation');
                  return;
                }
                setError(null);
                await load();
              } finally {
                setActionLoading(false);
              }
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Resend Confirmation
          </button>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Deposit Actions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.deposit_status !== 'Paid' && detail.deposit_status !== 'Refunded' && (
                <>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => runDepositAction('send_payment_link')}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Send Payment Link
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => runDepositAction('waive')}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Mark as Waived
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => runDepositAction('record_cash')}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Record Cash Deposit
                  </button>
                </>
              )}
              {detail.deposit_status === 'Paid' && (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => runDepositAction('refund')}
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Issue Refund
                </button>
              )}
            </div>
          </div>

          {/* Table assignment */}
          {tableManagementEnabled && (
            <div className={`rounded-xl border px-4 py-3 ${assignedTables.length > 0 ? 'border-slate-200 bg-slate-50/50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">Table</p>
                  <p className={`text-sm font-semibold ${assignedTables.length > 0 ? 'text-slate-900' : 'text-amber-700'}`}>
                    {assignedTables.length > 0
                      ? assignedTables.map((t) => t.name).join(' + ')
                      : 'No table assigned'}
                  </p>
                </div>
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  {assignedTables.length > 0 ? 'Reassign' : 'Assign'}
                </button>
              </div>
            </div>
          )}

          {showAssignModal && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-4">
              <p className="mb-2 text-sm font-medium text-slate-900">Table Assignment</p>
              {suggestionsLoading ? (
                <p className="mb-3 text-xs text-slate-500">Finding best table options...</p>
              ) : assignmentSuggestions.length > 0 ? (
                <div className="mb-3 space-y-2">
                  {assignmentSuggestions.slice(0, 6).map((suggestion, idx) => (
                    <button
                      key={`${suggestion.table_ids.join('|')}-${suggestion.source}`}
                      type="button"
                      disabled={actionLoading}
                      onClick={async () => {
                        setActionLoading(true);
                        try {
                          const assignRes = await fetch('/api/venue/tables/assignments', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(assignedTables.length > 0
                              ? {
                                  action: 'reassign',
                                  booking_id: bookingId,
                                  old_table_ids: assignedTables.map((x) => x.id),
                                  new_table_ids: suggestion.table_ids,
                                }
                              : { booking_id: bookingId, table_ids: suggestion.table_ids }
                            ),
                          });
                          if (!assignRes.ok) {
                            const payload = await assignRes.json().catch(() => ({}));
                            setError(payload.error ?? 'Failed to assign tables');
                            return;
                          }
                          setShowAssignModal(false);
                          await load();
                          onUpdated();
                        } finally { setActionLoading(false); }
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        idx === 0
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{suggestion.table_names.join(' + ')}</span>
                        <span className="text-[10px] uppercase">
                          {suggestion.source === 'manual' ? 'Pre-configured' : suggestion.source === 'auto' ? 'Auto-detected' : 'Single'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px]">
                        Capacity {suggestion.combined_capacity} • Spare {suggestion.spare_covers}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mb-3 text-xs text-slate-500">No ranked suggestions available. Choose manually below.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {allTables.map((t) => (
                  <button
                    key={t.id}
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        const assignRes = await fetch('/api/venue/tables/assignments', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(assignedTables.length > 0
                            ? { action: 'reassign', booking_id: bookingId, old_table_ids: assignedTables.map((x) => x.id), new_table_ids: [t.id] }
                            : { booking_id: bookingId, table_ids: [t.id] }
                          ),
                        });
                        if (!assignRes.ok) {
                          const payload = await assignRes.json().catch(() => ({}));
                          setError(payload.error ?? 'Failed to assign table');
                          return;
                        }
                        setShowAssignModal(false);
                        await load();
                        onUpdated();
                      } finally { setActionLoading(false); }
                    }}
                    disabled={actionLoading}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      assignedTables.some((at) => at.id === t.id)
                        ? 'border-brand-300 bg-brand-50 text-brand-700'
                        : recommendedTableIds.includes(t.id)
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t.name} ({t.max_covers}){recommendedTableIds.includes(t.id) ? ' • Recommended' : ''}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAssignModal(false)} className="mt-2 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          )}

          {/* Deposit refund status banner */}
          {detail.status === 'Cancelled' && detail.deposit_amount_pence != null && detail.deposit_amount_pence > 0 && (
            <DepositRefundBanner depositStatus={detail.deposit_status} depositAmount={depositAmountStr!} cancellationDeadline={detail.cancellation_deadline} />
          )}

          {/* Special notes */}
          {(detail.dietary_notes || detail.occasion || detail.special_requests) && (
            <div className="space-y-2">
              {detail.dietary_notes && (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm">
                  <span className="font-medium text-amber-800">Dietary:</span>{' '}
                  <span className="text-amber-700">{detail.dietary_notes}</span>
                </div>
              )}
              {detail.occasion && (
                <div className="rounded-lg bg-violet-50 px-3 py-2 text-sm">
                  <span className="font-medium text-violet-800">Occasion:</span>{' '}
                  <span className="text-violet-700">{detail.occasion}</span>
                </div>
              )}
              {detail.special_requests && (
                <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm">
                  <span className="font-medium text-sky-800">Requests:</span>{' '}
                  <span className="text-sky-700">{detail.special_requests}</span>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Internal Staff Notes</p>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              onBlur={async () => {
                if (internalNotes === (detail.internal_notes ?? '')) return;
                setNotesSaving(true);
                try {
                  const res = await fetch(`/api/venue/bookings/${bookingId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ internal_notes: internalNotes }),
                  });
                  if (res.ok) {
                    await load();
                  } else {
                    setError('Failed to save notes');
                  }
                } finally {
                  setNotesSaving(false);
                }
              }}
              rows={3}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Internal notes visible to staff only..."
            />
            {notesSaving && <p className="mt-1 text-[11px] text-slate-500">Saving...</p>}
          </div>

          {/* Status actions */}
          {canChangeStatus && (() => {
            const currentStatus = detail.status as BookingStatus;
            const forwardStatuses = nextStatuses.filter((s) => !isRevertTransition(currentStatus, s));
            const revertAction = BOOKING_REVERT_ACTIONS[currentStatus];
            return (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</p>
                <div className="flex flex-wrap gap-2">
                  {forwardStatuses.map((status) => (
                    <ActionButton
                      key={status}
                      onClick={() => updateStatus(status)}
                      disabled={actionLoading}
                      variant={status === 'Cancelled' ? 'outline-danger' : status === 'No-Show' ? 'danger' : 'primary'}
                    >
                      {status === 'Seated' ? 'Seat Guest' : status === 'Completed' ? 'Complete' : status === 'Cancelled' ? 'Cancel' : status}
                    </ActionButton>
                  ))}
                </div>
                {revertAction && (
                  <div className="mt-1">
                    <ActionButton
                      onClick={() => updateStatus(revertAction.target)}
                      disabled={actionLoading}
                      variant="secondary"
                    >
                      {revertAction.label}
                    </ActionButton>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Modify section */}
          {!showModify ? (
            <button type="button" onClick={() => setShowModify(true)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Modify Date / Time / Party Size
            </button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Modify Booking</p>
              {depositPaid && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Changing party size won&apos;t adjust the deposit already paid.</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
                  <input type="date" value={modifyDate} onChange={(e) => setModifyDate(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Time</label>
                  <input type="time" value={modifyTime} onChange={(e) => setModifyTime(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Covers</label>
                  <input type="number" min={1} max={50} value={modifyPartySize} onChange={(e) => setModifyPartySize(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Duration (mins)</label>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={modifyDurationMinutes}
                    onChange={(e) => setModifyDurationMinutes(Math.max(15, Math.round((Number(e.target.value) || 15) / 15) * 15))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Guest Name</label>
                  <input type="text" value={modifyGuestName} onChange={(e) => setModifyGuestName(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Guest Phone</label>
                    <input type="text" value={modifyGuestPhone} onChange={(e) => setModifyGuestPhone(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Guest Email</label>
                    <input type="email" value={modifyGuestEmail} onChange={(e) => setModifyGuestEmail(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Dietary Notes</label>
                  <input type="text" value={modifyDietary} onChange={(e) => setModifyDietary(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Occasion</label>
                  <input type="text" value={modifyOccasion} onChange={(e) => setModifyOccasion(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Special Requests</label>
                  <textarea value={modifySpecialRequests} onChange={(e) => setModifySpecialRequests(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Internal Notes</label>
                  <textarea value={modifyInternalNotes} onChange={(e) => setModifyInternalNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                </div>
                {tableManagementEnabled && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-500">Assigned Tables</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allTables.map((table) => {
                        const selected = modifyTableIds.includes(table.id);
                        return (
                          <button
                            key={table.id}
                            type="button"
                            onClick={() => {
                              setModifyTableIds((prev) => selected ? prev.filter((id) => id !== table.id) : [...prev, table.id]);
                            }}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                              selected
                                ? 'border-brand-300 bg-brand-50 text-brand-700'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {table.name} ({table.max_covers})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={submitModify} disabled={actionLoading} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">Save</button>
                <button type="button" onClick={() => setShowModify(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Timeline</p>
            {detail.events.length === 0 ? (
              <p className="text-sm text-slate-400">No events yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-100">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    </span>
                    <div className="flex-1">
                      <span className="font-medium text-slate-700">{ev.event_type.replace(/_/g, ' ')}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {new Date(ev.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Communications */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Communications</p>
            {detail.communications && detail.communications.length > 0 && (
              <div className="space-y-2">
                {detail.communications.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.channel === 'email' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                      {c.channel}
                    </span>
                    <span className="font-medium text-slate-700">{c.message_type.replace(/_/g, ' ')}</span>
                    <span className={`ml-auto text-xs ${c.status === 'sent' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {c.status}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-600">Send custom message</p>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={3}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Write an SMS/email message to the guest..."
              />
              <button
                type="button"
                disabled={actionLoading || customMessage.trim().length === 0}
                onClick={async () => {
                  setActionLoading(true);
                  try {
                    const res = await fetch(`/api/venue/bookings/${bookingId}/message`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ message: customMessage }),
                    });
                    if (!res.ok) {
                      const payload = await res.json().catch(() => ({}));
                      setError(payload.error ?? 'Failed to send message');
                      return;
                    }
                    setCustomMessage('');
                    await load();
                  } finally {
                    setActionLoading(false);
                  }
                }}
                className="mt-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-60"
              >
                Send Custom Message
              </button>
            </div>
          </div>
        </div>
      </div>
      {confirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmDialog(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">{confirmDialog.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{confirmDialog.message}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                {confirmDialog.confirmLabel}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function DepositRefundBanner({ depositStatus, depositAmount, cancellationDeadline }: {
  depositStatus: string;
  depositAmount: string;
  cancellationDeadline: string | null;
}) {
  if (depositStatus === 'Refunded') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          <p className="text-sm font-medium text-emerald-800">Deposit refunded</p>
        </div>
        <p className="mt-1 text-xs text-emerald-700">{depositAmount} has been refunded to the customer&apos;s payment method. Allow 5–10 business days for processing.</p>
      </div>
    );
  }

  if (depositStatus === 'Paid') {
    const wasEligible = cancellationDeadline && new Date() <= new Date(cancellationDeadline);
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" /></svg>
          <p className="text-sm font-medium text-amber-800">Deposit not refunded</p>
        </div>
        <p className="mt-1 text-xs text-amber-700">
          {wasEligible
            ? `${depositAmount} — refund was eligible but failed to process. Please refund manually via Stripe.`
            : `${depositAmount} — cancelled after the 48-hour refund window. Deposit retained per cancellation policy.`
          }
        </p>
      </div>
    );
  }

  return null;
}

function ActionButton({ onClick, disabled, variant, children }: {
  onClick: () => void;
  disabled: boolean;
  variant: 'primary' | 'danger' | 'outline-danger' | 'secondary';
  children: React.ReactNode;
}) {
  const styles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    'outline-danger': 'border border-red-200 text-red-600 hover:bg-red-50',
    secondary: 'border border-slate-300 text-slate-700 hover:bg-slate-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
