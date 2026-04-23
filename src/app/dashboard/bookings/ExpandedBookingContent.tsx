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
import { CustomerProfileNotesCard } from '@/components/booking/CustomerProfileNotesCard';
import type { BookingNotesVariant } from '@/components/booking/BookingNotesEditablePanel';
import type { BookingModel } from '@/types/booking-models';
import {
  bookingModelShortLabel,
  inferBookingRowModel,
  isTableReservationBooking,
} from '@/lib/booking/infer-booking-row-model';
import { GuestMessageChannelSelect } from '@/components/booking/GuestMessageChannelSelect';
import type { GuestMessageChannel } from '@/lib/booking/guest-message-channel';
import { SectionCard } from '@/components/ui/dashboard/SectionCard';
import { Pill } from '@/components/ui/dashboard/Pill';

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
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    visit_count: number;
    customer_profile_notes?: string | null;
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
  onSendMessage: (channel: GuestMessageChannel) => void;
  onStatusAction: (status: BookingStatus) => void;
  onOpenPanel: () => void;
  onDetailUpdated: () => void;
  onRequestChangeTable?: () => void;
  isAppointment?: boolean;
}) {
  const [showMessageBox, setShowMessageBox] = useState(false);
  const [guestMessageChannel, setGuestMessageChannel] = useState<GuestMessageChannel>('both');
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
      <div id={`booking-expand-${booking.id}`} className="mt-2 animate-pulse space-y-2.5 px-1 pb-3" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="h-28 rounded-2xl bg-slate-100" />
          <div className="h-28 rounded-2xl bg-slate-100" />
        </div>
        <div className="h-16 rounded-2xl bg-slate-100" />
        <div className="h-10 rounded-2xl bg-slate-100" />
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
      revertAction.target === 'Booked' &&
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
      BOOKING_PRIMARY_ACTIONS.Booked,
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
    <div id={`booking-expand-${booking.id}`} className="mt-2 space-y-2.5 px-1 pb-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {/* Top row: Guest card + Booking meta */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {/* Guest card */}
        <SectionCard>
          <SectionCard.Body className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-base font-bold text-brand-700 ring-1 ring-brand-100">
                {guestName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{guestName}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {visitCount > 0 ? `${visitCount} visit${visitCount !== 1 ? 's' : ''}` : 'First visit'}
                </p>
                <div className="mt-2 space-y-1.5">
                  {guestPhone && (
                    <a href={`tel:${guestPhone}`} className="flex items-center gap-2 text-xs text-slate-600 transition-colors hover:text-brand-600">
                      <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>
                      {guestPhone}
                    </a>
                  )}
                  {guestEmail && (
                    <a href={`mailto:${guestEmail}`} className="flex items-center gap-2 text-xs text-slate-600 transition-colors hover:text-brand-600">
                      <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                      {guestEmail}
                    </a>
                  )}
                  {!guestPhone && !guestEmail && (
                    <p className="text-xs italic text-slate-400">No contact details</p>
                  )}
                </div>
              </div>
            </div>
            {detail?.guest?.id ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <CustomerProfileNotesCard
                  embedded
                  guestId={detail.guest.id}
                  value={detail.guest.customer_profile_notes}
                  disabled={detailLoading}
                  onSaved={onDetailUpdated}
                />
              </div>
            ) : null}
          </SectionCard.Body>
        </SectionCard>

        {/* Booking summary */}
        <SectionCard>
          <SectionCard.Body className="p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Date</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">{formatDateNice(booking.booking_date)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Time</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 tabular-nums">{booking.booking_time.slice(0, 5)}</p>
              </div>
              {!isAppointment && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Covers</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-800">{booking.party_size}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Deposit</p>
                <div className="mt-0.5">
                  {booking.deposit_status === 'Not Required' ? (
                    <span className="text-sm text-slate-400">None</span>
                  ) : booking.deposit_status === 'Paid' ? (
                    <Pill variant="success" size="sm" dot>{depositAmtStr ? `${depositAmtStr} paid` : 'Paid'}</Pill>
                  ) : booking.deposit_status === 'Pending' ? (
                    <Pill variant="warning" size="sm" dot>Pending</Pill>
                  ) : booking.deposit_status === 'Refunded' ? (
                    <Pill variant="brand" size="sm">{depositAmtStr ? `${depositAmtStr} refunded` : 'Refunded'}</Pill>
                  ) : (
                    <span className="text-sm text-slate-600">{booking.deposit_status}</span>
                  )}
                </div>
              </div>
            </div>
            {(tableManagementEnabled || tableNames.length > 0) && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Table</p>
                <p className={`mt-0.5 text-sm font-semibold ${tableNames.length > 0 ? 'text-slate-800' : 'text-amber-600'}`}>
                  {tableNames.length > 0 ? tableNames.join(' + ') : 'Unassigned'}
                </p>
              </div>
            )}
            {detail?.checked_in_at ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Checked in</p>
                <p className="mt-0.5 text-xs text-slate-600">{formatRelative(detail.checked_in_at)}</p>
              </div>
            ) : null}
          </SectionCard.Body>
        </SectionCard>
      </div>

      {/* Notes */}
      <BookingNotesEditablePanel
        bookingId={booking.id}
        dietaryNotes={booking.dietary_notes}
        guestRequests={detail?.special_requests}
        staffNotes={detail?.internal_notes}
        onSaved={onDetailUpdated}
        notesVariant={notesVariant}
      />

      {/* CDE context */}
      {detail?.cde_context && (
        <SectionCard className="border-emerald-200 bg-emerald-50/30">
          <SectionCard.Body className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
              </div>
              <div>
                <Pill variant="success" size="sm">{bookingModelShortLabel(detail.cde_context.inferred_model)}</Pill>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">{detail.cde_context.title}</p>
                {detail.cde_context.subtitle && (
                  <p className="mt-0.5 text-xs text-slate-600">{detail.cde_context.subtitle}</p>
                )}
              </div>
            </div>
          </SectionCard.Body>
        </SectionCard>
      )}

      {/* Group booking */}
      {booking.group_booking_id && (
        <SectionCard className="border-violet-200 bg-violet-50/30">
          <SectionCard.Body className="p-4">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0 text-violet-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
              <span className="text-xs font-semibold text-violet-800">Group booking</span>
              {booking.person_label && <span className="text-xs text-violet-600">· {booking.person_label}</span>}
            </div>
            {displayLinkedBookings.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">Others in this group</p>
                {displayLinkedBookings.map((lb) => (
                  <div key={lb.id} className="flex items-center justify-between">
                    <span className="text-xs font-medium text-violet-800">{lb.person_label ?? 'Unknown'}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-violet-600">{lb.booking_time?.slice(0, 5)}</span>
                      <Pill variant={lb.status === 'Confirmed' ? 'success' : lb.status === 'Booked' ? 'info' : lb.status === 'Pending' ? 'warning' : lb.status === 'Cancelled' ? 'danger' : 'neutral'} size="sm">{lb.status}</Pill>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard.Body>
        </SectionCard>
      )}

      {/* Actions bar */}
      <SectionCard>
        <SectionCard.Body className="p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {forwardActions.map((action) => (
              <button
                key={action.target}
                type="button"
                onClick={() => handleStatusClick(action.target, forwardPrimaryLabel(action.target, action.label))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
              >
                {(action.target === 'Confirmed' || action.target === 'Booked') && (
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                Change table
              </button>
            )}

            {revertAction && (
              <button
                type="button"
                onClick={() => handleStatusClick(revertAction.target, revertButtonLabel())}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
                {revertButtonLabel()}
              </button>
            )}

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => { setShowModify(!showModify); if (!showModify) setShowMessageBox(false); }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${showModify ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" /></svg>
              Modify
            </button>

            <button
              type="button"
              onClick={() => { setShowMessageBox(!showMessageBox); if (!showMessageBox) setShowModify(false); }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${showMessageBox ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg>
              Message
            </button>

            <div className="mx-0.5 h-4 w-px bg-slate-200" />

            {canCancel && (
              <button
                type="button"
                onClick={() => handleStatusClick('Cancelled', 'Cancel Booking')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:border-red-100 hover:bg-red-50"
              >
                Cancel
              </button>
            )}
            {canNoShow && (
              <button
                type="button"
                onClick={() => handleStatusClick('No-Show', 'Mark No-Show')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:border-rose-100 hover:bg-rose-50"
              >
                No-Show
              </button>
            )}

            <div className="mx-0.5 h-4 w-px bg-slate-200" />

            <button
              type="button"
              onClick={onOpenPanel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              Full Details
            </button>
          </div>
        </SectionCard.Body>
      </SectionCard>

      {/* Modify booking (collapsible) */}
      {showModify && (
        <SectionCard className="border-brand-200 bg-brand-50/20">
          <SectionCard.Header eyebrow="Modify booking" />
          <SectionCard.Body className="p-4">
            <ModifyBookingInline
              bookingId={booking.id}
              venueId={venueId}
              currentDate={booking.booking_date}
              currentTime={booking.booking_time}
              currentPartySize={booking.party_size}
              onSaved={() => { setShowModify(false); onDetailUpdated(); }}
              onCancel={() => setShowModify(false)}
            />
          </SectionCard.Body>
        </SectionCard>
      )}

      {/* Message box (collapsible) */}
      {showMessageBox && (
        <SectionCard>
          <SectionCard.Body className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-700">Message {guestName.split(' ')[0]}</p>
              {(detail?.communications ?? []).length > 0 && (
                <span className="text-[10px] text-slate-400">
                  {detail!.communications.length} sent · last via {detail!.communications[0]?.channel}
                </span>
              )}
            </div>
            <textarea
              value={draftMessage}
              onChange={(e) => onMessageDraftChange(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder={`Write a message to ${guestName.split(' ')[0]}…`}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                Send via
                <GuestMessageChannelSelect
                  value={guestMessageChannel}
                  onChange={setGuestMessageChannel}
                  disabled={sendingMessage}
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMessageBox(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sendingMessage || draftMessage.trim().length === 0}
                  onClick={() => onSendMessage(guestMessageChannel)}
                  className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-900 disabled:opacity-50"
                >
                  {sendingMessage ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </SectionCard.Body>
        </SectionCard>
      )}

      {/* Communications activity */}
      {(detail?.communications ?? []).length > 0 && !showMessageBox && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Comms</span>
          {(detail?.communications ?? []).slice(0, 3).map((comm) => (
            <span key={comm.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${comm.status === 'sent' ? 'bg-emerald-400' : comm.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />
              {comm.message_type.replace(/_/g, ' ')} · {comm.channel}
            </span>
          ))}
          {(detail?.communications ?? []).length > 3 && (
            <span className="text-[10px] text-slate-400">+{detail!.communications.length - 3} more</span>
          )}
        </div>
      )}

      {/* Inline confirmation dialog */}
      {confirmAction && (
        <SectionCard className="border-red-200 bg-red-50/40">
          <SectionCard.Body className="p-4">
            <p className="text-sm font-bold text-red-800">{confirmAction.label}</p>
            <p className="mt-1 text-xs text-red-700">
              Confirm {confirmAction.label.toLowerCase()} for {guestName}
              {' '}({booking.party_size} cover{booking.party_size !== 1 ? 's' : ''}) at {booking.booking_time.slice(0, 5)}?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => { onStatusAction(confirmAction.status); setConfirmAction(null); }}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                {confirmAction.label}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Keep as is
              </button>
            </div>
          </SectionCard.Body>
        </SectionCard>
      )}
    </div>
  );
}
