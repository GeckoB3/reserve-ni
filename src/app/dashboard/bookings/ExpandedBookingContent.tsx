'use client';

import { useEffect, useState } from 'react';
import {
  BOOKING_PRIMARY_ACTIONS,
  BOOKING_REVERT_ACTIONS,
  canTransitionBookingStatus,
  isDestructiveBookingStatus,
  isRevertTransition,
  type BookingStatus,
} from '@/lib/table-management/booking-status';
import { ModifyBookingInline } from '@/components/booking/ModifyBookingInline';
import { BookingNotesEditablePanel } from '@/components/booking/BookingNotesEditablePanel';
import type { BookingNotesVariant } from '@/components/booking/BookingNotesEditablePanel';
import type { BookingModel } from '@/types/booking-models';
import {
  bookingModelShortLabel,
  inferBookingRowModel,
  isTableReservationBooking,
} from '@/lib/booking/infer-booking-row-model';

interface BookingRow {
  id: string;
  booking_date: string;
  booking_time: string;
  estimated_end_time: string | null;
  created_at: string | null;
  party_size: number;
  status: string;
  source: string;
  deposit_status: string;
  deposit_amount_pence: number | null;
  dietary_notes: string | null;
  occasion: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  group_booking_id?: string | null;
  person_label?: string | null;
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  resource_id?: string | null;
  event_session_id?: string | null;
  calendar_id?: string | null;
  service_item_id?: string | null;
}

interface BookingDetailLite {
  id: string;
  special_requests: string | null;
  internal_notes: string | null;
  cancellation_deadline: string | null;
  checked_in_at?: string | null;
  table_assignments?: Array<{ id: string; name: string }>;
  guest: {
    name: string | null;
    email: string | null;
    phone: string | null;
    visit_count: number;
  } | null;
  communications: Array<{ id: string; message_type: string; channel: string; status: string; created_at: string }>;
  events: Array<{ id: string; event_type: string; created_at: string }>;
  cde_context?: {
    inferred_model: BookingModel;
    title: string;
    subtitle?: string | null;
  } | null;
  inferred_booking_model?: BookingModel;
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDateNice(value: string): string {
  const d = new Date(value + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return value;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function ExpandedBookingContent({
  booking,
  detail,
  detailLoading,
  tableManagementEnabled,
  venueId,
  draftMessage,
  sendingMessage,
  onMessageDraftChange,
  onSendMessage,
  onStatusAction,
  onOpenPanel,
  onDetailUpdated,
  onRequestChangeTable,
  isAppointment = false,
}: {
  booking: BookingRow;
  detail: BookingDetailLite | undefined;
  detailLoading: boolean;
  tableManagementEnabled: boolean;
  venueId: string;
  draftMessage: string;
  sendingMessage: boolean;
  onMessageDraftChange: (value: string) => void;
  onSendMessage: () => void;
  onStatusAction: (status: BookingStatus) => void;
  onOpenPanel: () => void;
  onDetailUpdated: () => void;
  onRequestChangeTable?: () => void;
  isAppointment?: boolean;
}) {
  const [showMessageBox, setShowMessageBox] = useState(false);
  const [showModify, setShowModify] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ status: BookingStatus; label: string } | null>(null);
  const [linkedBookings, setLinkedBookings] = useState<Array<{ id: string; person_label: string | null; booking_time: string; status: string }>>([]);

  useEffect(() => {
    if (!booking.group_booking_id) return;
    let cancelled = false;
    fetch(`/api/venue/bookings/list?group_booking_id=${booking.group_booking_id}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const others = (data.bookings ?? [])
          .filter((b: { id: string }) => b.id !== booking.id)
          .map((b: { id: string; person_label: string | null; booking_time: string; status: string }) => ({
            id: b.id,
            person_label: b.person_label,
            booking_time: b.booking_time,
            status: b.status,
          }));
        setLinkedBookings(others);
      })
      .catch(() => { /* ignore */ });
    return () => {
      cancelled = true;
    };
  }, [booking.group_booking_id, booking.id]);

  const displayLinkedBookings = booking.group_booking_id ? linkedBookings : [];

  const notesVariant: BookingNotesVariant =
    inferBookingRowModel(booking) === 'table_reservation' ? 'table' : 'cde';

  if (detailLoading) {
    return (
      <div id={`booking-expand-${booking.id}`} className="mt-3 animate-pulse space-y-3 px-1" onClick={(e) => e.stopPropagation()}>
        <div className="h-20 rounded-xl bg-slate-100" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 rounded-xl bg-slate-100" />
          <div className="h-16 rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  const guestName = detail?.guest?.name ?? booking.guest_name;
  const guestPhone = detail?.guest?.phone ?? booking.guest_phone;
  const guestEmail = detail?.guest?.email ?? booking.guest_email;
  const visitCount = detail?.guest?.visit_count ?? 0;
  const tableNames = (detail?.table_assignments ?? []).map((t) => t.name);
  const depositAmtStr = booking.deposit_amount_pence ? `£${(booking.deposit_amount_pence / 100).toFixed(2)}` : null;

  const canCancel = canTransitionBookingStatus(booking.status, 'Cancelled');
  const canNoShow = canTransitionBookingStatus(booking.status, 'No-Show');
  const revertAction = BOOKING_REVERT_ACTIONS[booking.status as BookingStatus];
  const tableStyle = isTableReservationBooking(booking);

  const forwardPrimaryLabel = (target: BookingStatus, defaultLabel: string) => {
    if (target === 'Seated' && !tableStyle) return 'Start';
    return defaultLabel;
  };

  const revertButtonLabel = () => {
    if (!revertAction) return '';
    if (
      revertAction.target === 'Confirmed' &&
      booking.status === 'Seated' &&
      !tableStyle
    ) {
      return 'Undo Start';
    }
    return revertAction.label;
  };

  const forwardActions = (
    [
      BOOKING_PRIMARY_ACTIONS.Pending,
      BOOKING_PRIMARY_ACTIONS.Confirmed,
      BOOKING_PRIMARY_ACTIONS.Seated,
    ] as Array<{ label: string; target: BookingStatus } | undefined>
  ).filter((a): a is { label: string; target: BookingStatus } =>
    Boolean(a) && canTransitionBookingStatus(booking.status, a!.target)
  );

  const handleStatusClick = (status: BookingStatus, label: string) => {
    if (isDestructiveBookingStatus(status) || isRevertTransition(booking.status as BookingStatus, status)) {
      setConfirmAction({ status, label });
    } else {
      onStatusAction(status);
    }
  };

  return (
     
    <div id={`booking-expand-${booking.id}`} className="mt-3 space-y-3 px-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {/* Row 1: Guest card + Booking summary */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Guest info */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {guestName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{guestName}</p>
              <p className="text-[11px] text-slate-500">
                {visitCount > 0 ? `${visitCount} visit${visitCount !== 1 ? 's' : ''}` : 'First visit'}
              </p>
            </div>
          </div>
          <div className="mt-2.5 space-y-1">
            {guestPhone && (
              <a href={`tel:${guestPhone}`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-brand-600">
                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>
                {guestPhone}
              </a>
            )}
            {guestEmail && (
              <a href={`mailto:${guestEmail}`} className="flex items-center gap-2 text-xs text-slate-600 hover:text-brand-600">
                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                {guestEmail}
              </a>
            )}
            {!guestPhone && !guestEmail && (
              <p className="text-xs italic text-slate-400">No contact details</p>
            )}
          </div>
        </div>

        {/* Booking summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Date</p>
              <p className="text-sm font-medium text-slate-800">{formatDateNice(booking.booking_date)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Time</p>
              <p className="text-sm font-medium text-slate-800">{booking.booking_time.slice(0, 5)}</p>
            </div>
            {!isAppointment && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Covers</p>
                <p className="text-sm font-medium text-slate-800">{booking.party_size}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Deposit</p>
              <p className={`text-sm font-medium ${booking.deposit_status === 'Paid' ? 'text-emerald-700' : booking.deposit_status === 'Pending' ? 'text-amber-700' : 'text-slate-500'}`}>
                {booking.deposit_status === 'Paid' && depositAmtStr ? `${depositAmtStr} Paid` : booking.deposit_status === 'Not Required' ? 'None' : booking.deposit_status}
              </p>
            </div>
          </div>
          {(tableManagementEnabled || tableNames.length > 0) && (
            <div className="mt-2.5 border-t border-slate-100 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Table</p>
              <p className={`text-sm font-medium ${tableNames.length > 0 ? 'text-slate-800' : 'text-amber-600'}`}>
                {tableNames.length > 0 ? tableNames.join(' + ') : 'Unassigned'}
              </p>
            </div>
          )}
        </div>

        <BookingNotesEditablePanel
          bookingId={booking.id}
          dietaryNotes={booking.dietary_notes}
          guestRequests={detail?.special_requests}
          staffNotes={detail?.internal_notes}
          onSaved={onDetailUpdated}
          notesVariant={notesVariant}
        />
      </div>

      {detail?.cde_context && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80">Booking type</p>
          <p className="text-sm font-semibold text-slate-900">{bookingModelShortLabel(detail.cde_context.inferred_model)}</p>
          <p className="mt-1 text-sm text-slate-800">{detail.cde_context.title}</p>
          {detail.cde_context.subtitle ? (
            <p className="mt-0.5 text-xs text-slate-600">{detail.cde_context.subtitle}</p>
          ) : null}
        </div>
      )}

      {detail?.checked_in_at ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Attendance</p>
          <p className="text-sm font-medium text-slate-800">Checked in {formatRelative(detail.checked_in_at)}</p>
        </div>
      ) : null}

      {/* Group booking info */}
      {booking.group_booking_id && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
            <span className="text-xs font-semibold text-purple-800">Group Booking</span>
            {booking.person_label && <span className="text-xs text-purple-600">&middot; {booking.person_label}</span>}
          </div>
          {displayLinkedBookings.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">Other people in this group</p>
              {displayLinkedBookings.map((lb) => (
                <div key={lb.id} className="flex items-center justify-between text-xs">
                  <span className="text-purple-700 font-medium">{lb.person_label ?? 'Unknown'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-purple-600">{lb.booking_time?.slice(0, 5)}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      lb.status === 'Confirmed' ? 'bg-green-100 text-green-700' :
                      lb.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                      lb.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{lb.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Row 2: Actions bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
        {/* Forward status actions */}
        {forwardActions.map((action) => (
          <button
            key={action.target}
            type="button"
            onClick={() =>
              handleStatusClick(
                action.target,
                forwardPrimaryLabel(action.target, action.label),
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            {action.target === 'Confirmed' && (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            )}
            {action.target === 'Seated' && tableStyle && (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
            )}
            {action.target === 'Seated' && !tableStyle && (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
            )}
            {forwardPrimaryLabel(action.target, action.label)}
          </button>
        ))}

        {onRequestChangeTable && (
          <button
            type="button"
            onClick={onRequestChangeTable}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Change table
          </button>
        )}

        {revertAction && (
          <button
            type="button"
            onClick={() =>
              handleStatusClick(revertAction.target, revertButtonLabel())
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
            {revertButtonLabel()}
          </button>
        )}

        <div className="flex-1" />

        {/* Modify toggle */}
        <button
          type="button"
          onClick={() => { setShowModify(!showModify); if (!showModify) setShowMessageBox(false); }}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${showModify ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
          Modify
        </button>

        {/* Message toggle */}
        <button
          type="button"
          onClick={() => { setShowMessageBox(!showMessageBox); if (!showMessageBox) setShowModify(false); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg>
          Message
        </button>

        {/* Destructive actions */}
        {canCancel && (
          <button
            type="button"
            onClick={() => handleStatusClick('Cancelled', 'Cancel Booking')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Cancel
          </button>
        )}
        {canNoShow && (
          <button
            type="button"
            onClick={() => handleStatusClick('No-Show', 'Mark No-Show')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            No-Show
          </button>
        )}

        {/* Full details */}
        <button
          type="button"
          onClick={onOpenPanel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
          Full Details
        </button>
      </div>

      {/* Modify booking (collapsible) */}
      {showModify && (
        <div className="rounded-xl border border-brand-200 bg-white p-3.5">
          <p className="mb-3 text-xs font-semibold text-slate-700">Modify Date / Time / Party Size</p>
          <ModifyBookingInline
            bookingId={booking.id}
            venueId={venueId}
            currentDate={booking.booking_date}
            currentTime={booking.booking_time}
            currentPartySize={booking.party_size}
            onSaved={() => { setShowModify(false); onDetailUpdated(); }}
            onCancel={() => setShowModify(false)}
          />
        </div>
      )}

      {/* Message box (collapsible) */}
      {showMessageBox && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700">Send message to {guestName.split(' ')[0]}</p>
            {(detail?.communications ?? []).length > 0 && (
              <span className="text-[10px] text-slate-400">{detail!.communications.length} message{detail!.communications.length !== 1 ? 's' : ''} sent</span>
            )}
          </div>
          <textarea
            value={draftMessage}
            onChange={(e) => onMessageDraftChange(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="Write a message to the guest..."
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={sendingMessage || draftMessage.trim().length === 0}
                onClick={onSendMessage}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-900 disabled:opacity-50"
              >
                {sendingMessage ? 'Sending...' : 'Send'}
              </button>
              <button
                type="button"
                onClick={() => setShowMessageBox(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
            {(detail?.communications ?? []).length > 0 && (
              <div className="text-[10px] text-slate-400">
                Last: {formatRelative(detail!.communications[0]?.created_at)} via {detail!.communications[0]?.channel}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity summary (compact) */}
      {(detail?.communications ?? []).length > 0 && !showMessageBox && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          {(detail?.communications ?? []).slice(0, 3).map((comm) => (
            <span key={comm.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${comm.status === 'sent' ? 'bg-emerald-400' : comm.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />
              {comm.message_type.replace(/_/g, ' ')} · {comm.channel}
            </span>
          ))}
          {(detail?.communications ?? []).length > 3 && (
            <span className="text-[10px] text-slate-400">+{detail!.communications.length - 3} more</span>
          )}
        </div>
      )}

      {/* Confirmation dialog overlay */}
      {confirmAction && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">
            {confirmAction.label}
          </p>
          <p className="mt-1 text-xs text-red-700">
            Are you sure you want to {confirmAction.label.toLowerCase()} for {guestName}
            {' '}({booking.party_size} cover{booking.party_size !== 1 ? 's' : ''}) at {booking.booking_time.slice(0, 5)}?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onStatusAction(confirmAction.status);
                setConfirmAction(null);
              }}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              {confirmAction.label}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Keep as is
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
