'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { BookingDetailPanel } from './BookingDetailPanel';
import { WalkInModal } from './WalkInModal';
import { UnifiedBookingForm } from '@/components/booking/UnifiedBookingForm';
import { ExpandedBookingContent } from './ExpandedBookingContent';
import { UndoToast } from '@/app/dashboard/table-grid/UndoToast';
import type { UndoAction } from '@/types/table-management';
import {
  BOOKING_PRIMARY_ACTIONS,
  BOOKING_REVERT_ACTIONS,
  canMarkNoShowForSlot,
  canTransitionBookingStatus,
  isDestructiveBookingStatus,
  isRevertTransition,
  type BookingStatus,
} from '@/lib/table-management/booking-status';
import { useToast } from '@/components/ui/Toast';

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
}

interface BookingDetailLite {
  id: string;
  special_requests: string | null;
  internal_notes: string | null;
  cancellation_deadline: string | null;
  table_assignments?: Array<{ id: string; name: string }>;
  guest: {
    name: string | null;
    email: string | null;
    phone: string | null;
    visit_count: number;
  } | null;
  communications: Array<{ id: string; message_type: string; channel: string; status: string; created_at: string }>;
  events: Array<{ id: string; event_type: string; created_at: string }>;
}

type ViewMode = 'day' | 'week' | 'month' | 'custom';
const STATUS_OPTIONS = ['All', 'Confirmed', 'Pending', 'Seated', 'Completed', 'Cancelled', 'No-Show'];

interface FetchBookingsOptions {
  silent?: boolean;
  ids?: string[];
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(date: string): string {
  return date.slice(0, 7) + '-01';
}

function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateLabel(date: string, mode: ViewMode): string {
  const d = new Date(date + 'T12:00:00');
  if (mode === 'day') {
    return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (mode === 'week') {
    const end = new Date(addDays(date, 6) + 'T12:00:00');
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  }
  if (mode === 'month') return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  return '';
}

function formatDayHeader(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function BookingsDashboard({ venueId }: { venueId: string }) {
  const { addToast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [anchorDate, setAnchorDate] = useState(todayISO);
  const [customFrom, setCustomFrom] = useState(todayISO);
  const [customTo, setCustomTo] = useState(todayISO);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [detailById, setDetailById] = useState<Record<string, BookingDetailLite>>({});
  const [detailLoadingIds, setDetailLoadingIds] = useState<string[]>([]);
  const [messageDraftById, setMessageDraftById] = useState<Record<string, string>>({});
  const [sendingMessageIds, setSendingMessageIds] = useState<string[]>([]);
  const [tableManagementEnabled, setTableManagementEnabled] = useState(false);
  const [noShowGraceMinutes, setNoShowGraceMinutes] = useState(15);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);

  const { from, to } = useMemo(() => {
    if (viewMode === 'day') return { from: anchorDate, to: anchorDate };
    if (viewMode === 'week') return { from: anchorDate, to: addDays(anchorDate, 6) };
    if (viewMode === 'month') return { from: startOfMonth(anchorDate), to: endOfMonth(anchorDate) };
    return { from: customFrom, to: customTo };
  }, [viewMode, anchorDate, customFrom, customTo]);
  const invalidCustomRange = viewMode === 'custom' && customFrom > customTo;

  const fetchModeData = useCallback(async () => {
    try {
      const res = await fetch('/api/venue/tables');
      if (!res.ok) return;
      const data = await res.json();
      setTableManagementEnabled(Boolean(data.settings?.table_management_enabled));
      setNoShowGraceMinutes(data.settings?.no_show_grace_minutes ?? 15);
    } catch {
      setTableManagementEnabled(false);
    }
  }, []);

  const fetchBookings = useCallback(async (options?: FetchBookingsOptions) => {
    const silent = options?.silent ?? false;
    const ids = options?.ids;
    if (invalidCustomRange) {
      setError('Custom date range is invalid. "From" must be before or equal to "To".');
      setLoading(false);
      return;
    }

    if (silent) setIsRefreshing(true);
    else setLoading(true);

    if (!silent) setError(null);
    try {
      const params = ids && ids.length > 0
        ? new URLSearchParams({ ids: ids.join(',') })
        : (viewMode === 'day' ? new URLSearchParams({ date: from }) : new URLSearchParams({ from, to }));
      if (!ids && statusFilter !== 'All') params.set('status', statusFilter);
      const res = await fetch(`/api/venue/bookings/list?${params}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? 'Failed to load reservations');
        return;
      }
      const data = await res.json();
      const next: BookingRow[] = data.bookings ?? [];
      setBookings((prev) => {
        if (!ids || ids.length === 0) return next;
        const map = new Map(prev.map((b) => [b.id, b]));
        for (const row of next) map.set(row.id, row);
        return Array.from(map.values())
          .filter((b) => !ids.includes(b.id) || next.some((n) => n.id === b.id))
          .sort((a, b) => `${a.booking_date}${a.booking_time}`.localeCompare(`${b.booking_date}${b.booking_time}`));
      });
      setSelectedIds((prev) => prev.filter((id) => next.some((b: BookingRow) => b.id === id) || !ids));
    } catch {
      setError('Network error loading reservations');
    } finally {
      if (silent) setIsRefreshing(false);
      else setLoading(false);
    }
  }, [from, invalidCustomRange, statusFilter, to, viewMode]);

  useEffect(() => {
    void fetchModeData();
  }, [fetchModeData]);
  useEffect(() => { void fetchBookings(); }, [fetchBookings]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `venue_id=eq.${venueId}` },
        () => { void fetchBookings({ silent: true }); }
      )
      .subscribe((status) => { setRealtimeConnected(status === 'SUBSCRIBED'); });
    return () => { void supabase.removeChannel(channel); };
  }, [venueId, fetchBookings]);

  const loadBookingDetail = useCallback(async (bookingId: string, force = false) => {
    if (!force && detailById[bookingId]) return;
    if (detailLoadingIds.includes(bookingId)) return;
    setDetailLoadingIds((prev) => [...prev, bookingId]);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`);
      if (!res.ok) return;
      const data = await res.json();
      setDetailById((prev) => ({ ...prev, [bookingId]: data as BookingDetailLite }));
    } finally {
      setDetailLoadingIds((prev) => prev.filter((id) => id !== bookingId));
    }
  }, [detailById, detailLoadingIds]);

  const toggleExpand = useCallback((bookingId: string) => {
    setExpandedIds((prev) => {
      if (prev.includes(bookingId)) return [];
      return [bookingId];
    });
    void loadBookingDetail(bookingId);
  }, [loadBookingDetail]);

  const handleWalkInCreated = useCallback(() => {
    setWalkInOpen(false);
    void fetchBookings({ silent: true });
  }, [fetchBookings]);

  const handleNewBookingCreated = useCallback(() => {
    setNewBookingOpen(false);
    void fetchBookings({ silent: true });
  }, [fetchBookings]);

  const handleDetailUpdated = useCallback((bookingId: string) => {
    setDetailById((prev) => { const next = { ...prev }; delete next[bookingId]; return next; });
    void loadBookingDetail(bookingId, true);
    void fetchBookings({ silent: true, ids: [bookingId] });
  }, [loadBookingDetail, fetchBookings]);

  const updateBookingStatus = useCallback(async (bookingId: string, newStatus: BookingStatus) => {
    const previous = bookings.find((b) => b.id === bookingId)?.status;
    if (!previous || previous === newStatus || !canTransitionBookingStatus(previous, newStatus)) return;
    setBookings((prev) => prev.map((booking) => booking.id === bookingId ? { ...booking, status: newStatus } : booking));
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        throw new Error('Failed to update booking status');
      }
      setUndoAction({
        id: crypto.randomUUID(),
        type: 'change_status',
        description: `Status changed to ${newStatus}`,
        timestamp: Date.now(),
        previous_state: { bookingId, status: previous },
        current_state: { bookingId, status: newStatus },
      });
      addToast('Booking status updated', 'success');
      void fetchBookings({ silent: true, ids: [bookingId] });
    } catch {
      setBookings((prev) => prev.map((booking) => booking.id === bookingId ? { ...booking, status: previous } : booking));
      setError(`Could not update booking status for ${bookingId.slice(0, 8).toUpperCase()}.`);
    }
  }, [bookings, fetchBookings, addToast]);

  const sendMessageToBooking = useCallback(async (bookingId: string, message: string) => {
    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) return;
    setSendingMessageIds((prev) => [...prev, bookingId]);
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmedMessage }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? 'Failed to send message.');
      } else {
        setMessageDraftById((prev) => ({ ...prev, [bookingId]: '' }));
        setDetailById((prev) => {
          const next = { ...prev };
          delete next[bookingId];
          return next;
        });
        void loadBookingDetail(bookingId, true);
      }
    } catch {
      setError('Failed to send message.');
    } finally {
      setSendingMessageIds((prev) => prev.filter((id) => id !== bookingId));
    }
  }, [loadBookingDetail]);

  const exportCsv = useCallback(() => {
    const esc = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = bookings.map((b) => [
      b.booking_date,
      b.booking_time?.slice(0, 5) ?? '',
      b.guest_name,
      String(b.party_size),
      b.status,
      b.source,
      b.deposit_status,
      b.deposit_amount_pence != null ? (b.deposit_amount_pence / 100).toFixed(2) : '',
      b.dietary_notes ?? '',
      b.occasion ?? '',
      b.guest_phone ?? '',
      b.guest_email ?? '',
    ]);
    const header = ['Date', 'Time', 'Guest', 'Party Size', 'Status', 'Source', 'Deposit Status', 'Deposit Amount GBP', 'Dietary Notes', 'Occasion', 'Phone', 'Email'];
    const csv = [header, ...rows].map((row) => row.map((cell) => esc(String(cell))).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reservations_${from}_to_${to}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [bookings, from, to]);

  const executeBulkNoShow = useCallback(async () => {
    const previousMap = new Map(bookings.map((b) => [b.id, b.status]));
    setBulkLoading(true);
    setError(null);
    setBookings((prev) => prev.map((booking) => selectedIds.includes(booking.id) ? { ...booking, status: 'No-Show' } : booking));
    try {
      const outcomes = await Promise.all(selectedIds.map(async (bookingId) => {
        const res = await fetch(`/api/venue/bookings/${bookingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'No-Show' }),
        });
        return res.ok;
      }));
      const okCount = outcomes.filter(Boolean).length;
      if (okCount !== selectedIds.length) {
        setError(`Updated ${okCount}/${selectedIds.length} bookings as no-show.`);
        setBookings((prev) => prev.map((booking) => ({
          ...booking,
          status: outcomes[selectedIds.indexOf(booking.id)] ? booking.status : (previousMap.get(booking.id) ?? booking.status),
        })));
      }
      if (okCount > 0) {
        setUndoAction({
          id: crypto.randomUUID(),
          type: 'change_status',
          description: `${okCount} booking(s) marked no-show`,
          timestamp: Date.now(),
          previous_state: {
            items: selectedIds
              .filter((bookingId, index) => outcomes[index])
              .map((bookingId) => ({ bookingId, status: previousMap.get(bookingId) ?? 'Confirmed' })),
          },
          current_state: { status: 'No-Show' },
        });
      }
      setSelectedIds([]);
      void fetchBookings({ silent: true });
    } finally {
      setBulkLoading(false);
    }
  }, [bookings, fetchBookings, selectedIds]);

  const runBulkNoShow = useCallback(() => {
    if (selectedIds.length === 0) return;
    const affected = bookings.filter((b) => selectedIds.includes(b.id));
    const preview = affected.slice(0, 3).map((b) => `${b.guest_name} at ${b.booking_time.slice(0, 5)}`).join(', ');
    const suffix = affected.length > 3 ? ` and ${affected.length - 3} more` : '';
    setConfirmDialog({
      title: 'Bulk No-Show',
      message: `Mark ${selectedIds.length} booking(s) as no-show? ${preview}${suffix}`,
      confirmLabel: `Mark ${selectedIds.length} No-Show`,
      onConfirm: () => { void executeBulkNoShow(); },
    });
  }, [bookings, selectedIds, executeBulkNoShow]);

  const undoLastStatusChange = useCallback(async () => {
    if (!undoAction || undoAction.type !== 'change_status') return;
    setUndoAction(null);
    const items = undoAction.previous_state.items as Array<{ bookingId: string; status: BookingStatus }> | undefined;
    if (items && items.length > 0) {
      await Promise.all(items.map((item) => updateBookingStatus(item.bookingId, item.status)));
      return;
    }
    const bookingId = String(undoAction.previous_state.bookingId ?? '');
    const previousStatus = String(undoAction.previous_state.status ?? '') as BookingStatus;
    if (!bookingId || !previousStatus) return;
    await updateBookingStatus(bookingId, previousStatus);
  }, [undoAction, updateBookingStatus]);

  const requestStatusChange = useCallback((booking: BookingRow, nextStatus: BookingStatus) => {
    if (!canTransitionBookingStatus(booking.status, nextStatus)) return;
    if (nextStatus === 'No-Show' && !canMarkNoShowForSlot(booking.booking_date, booking.booking_time, noShowGraceMinutes)) {
      setError(`No-show can only be marked ${noShowGraceMinutes} minutes after the booking start time.`);
      return;
    }
    if (isRevertTransition(booking.status, nextStatus)) {
      const revertAction = BOOKING_REVERT_ACTIONS[booking.status as BookingStatus];
      setConfirmDialog({
        title: revertAction?.label ?? `Revert to ${nextStatus}`,
        message: `${booking.guest_name} (${booking.party_size}) at ${booking.booking_time.slice(0, 5)} will be changed from ${booking.status} back to ${nextStatus}.`,
        confirmLabel: revertAction?.label ?? `Revert to ${nextStatus}`,
        onConfirm: () => { void updateBookingStatus(booking.id, nextStatus); },
      });
      return;
    }
    if (isDestructiveBookingStatus(nextStatus)) {
      setConfirmDialog({
        title: `Mark ${nextStatus}`,
        message: `${booking.guest_name} (${booking.party_size}) at ${booking.booking_time.slice(0, 5)} will be marked ${nextStatus}.`,
        confirmLabel: `Mark ${nextStatus}`,
        onConfirm: () => { void updateBookingStatus(booking.id, nextStatus); },
      });
      return;
    }
    void updateBookingStatus(booking.id, nextStatus);
  }, [updateBookingStatus, noShowGraceMinutes]);

  const runBulkMessage = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const message = window.prompt('Message to send to selected guests:');
    if (!message || message.trim().length === 0) return;
    setBulkLoading(true);
    setError(null);
    try {
      const outcomes = await Promise.all(selectedIds.map(async (bookingId) => {
        const res = await fetch(`/api/venue/bookings/${bookingId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message.trim() }),
        });
        return res.ok;
      }));
      const okCount = outcomes.filter(Boolean).length;
      if (okCount !== selectedIds.length) {
        setError(`Sent messages to ${okCount}/${selectedIds.length} bookings.`);
      }
      setSelectedIds([]);
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds]);

  const navigate = (direction: -1 | 1) => {
    if (viewMode === 'day') setAnchorDate(addDays(anchorDate, direction));
    else if (viewMode === 'week') setAnchorDate(addDays(anchorDate, direction * 7));
    else if (viewMode === 'month') {
      const d = new Date(anchorDate + 'T12:00:00');
      d.setMonth(d.getMonth() + direction);
      setAnchorDate(d.toISOString().slice(0, 10));
    }
  };

  const goToToday = () => setAnchorDate(todayISO());

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((booking) =>
      booking.guest_name.toLowerCase().includes(q)
      || (booking.guest_phone ?? '').toLowerCase().includes(q)
      || (booking.guest_email ?? '').toLowerCase().includes(q)
      || booking.id.toLowerCase().includes(q)
      || booking.source.toLowerCase().includes(q)
    );
  }, [bookings, searchQuery]);

  const groupedByDate = useMemo(() => {
    if (viewMode === 'day') return null;
    const groups: Record<string, BookingRow[]> = {};
    for (const b of filteredBookings) {
      (groups[b.booking_date] ??= []).push(b);
    }
    return groups;
  }, [filteredBookings, viewMode]);

  const stats = useMemo(() => {
    const total = filteredBookings.length;
    const totalCovers = filteredBookings.reduce((sum, b) => sum + b.party_size, 0);
    const confirmed = filteredBookings.filter((b) => b.status === 'Confirmed' || b.status === 'Seated').length;
    const pending = filteredBookings.filter((b) => b.status === 'Pending').length;
    return { total, totalCovers, confirmed, pending };
  }, [filteredBookings]);

  return (
    <div className="space-y-5">
      {realtimeConnected === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Updates may be delayed. Reconnecting&hellip;
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-x-auto">
          <div className="flex w-max rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(['day', 'week', 'month', 'custom'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => { setViewMode(mode); if (mode !== 'custom') setAnchorDate(todayISO()); }}
                className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition-all sm:px-4 ${
                  viewMode === mode
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={goToToday} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm">
            Today
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            Export CSV
          </button>
          <button type="button" onClick={() => setNewBookingOpen(true)} className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Booking
          </button>
          <button type="button" onClick={() => setWalkInOpen(true)} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Walk-in
          </button>
        </div>
      </div>

      {viewMode !== 'custom' ? (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4">
          <button type="button" onClick={() => navigate(-1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <div className="min-w-0 flex-1 px-2 text-center">
            <h2 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{formatDateLabel(anchorDate, viewMode)}</h2>
            {anchorDate === todayISO() && <span className="text-xs font-medium text-brand-600">Today</span>}
          </div>
          <button type="button" onClick={() => navigate(1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">From</label>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">To</label>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
          </div>
          {invalidCustomRange && (
            <p className="text-sm font-medium text-red-600">From date must be before or equal to To date.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Bookings" value={stats.total} color="brand" />
        <StatCard label="Total covers" value={stats.totalCovers} color="violet" />
        <StatCard label="Confirmed" value={stats.confirmed} color="emerald" />
        <StatCard label="Pending" value={stats.pending} color="amber" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search guest, phone, email, or booking ref"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-72"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <span className="text-xs font-medium text-slate-600">{selectedIds.length} selected</span>
        <button
          type="button"
          disabled={bulkLoading || selectedIds.length === 0}
          onClick={() => void runBulkNoShow()}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Mark No-Show
        </button>
        <button
          type="button"
          disabled={bulkLoading || selectedIds.length === 0}
          onClick={() => void runBulkMessage()}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Send Batch Message
        </button>
        {isRefreshing && (
          <span className="text-xs text-slate-500">Syncing latest updates...</span>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : filteredBookings.length === 0 ? (
        <EmptyState />
      ) : viewMode === 'day' ? (
        <BookingsAccordionList
          bookings={filteredBookings}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          expandedIds={expandedIds}
          detailById={detailById}
          detailLoadingIds={detailLoadingIds}
          messageDraftById={messageDraftById}
          setMessageDraftById={setMessageDraftById}
          sendingMessageIds={sendingMessageIds}
          tableManagementEnabled={tableManagementEnabled}
          venueId={venueId}
          onToggleExpand={toggleExpand}
          onOpenPanel={setSelectedId}
          onSendMessage={sendMessageToBooking}
          onStatusAction={requestStatusChange}
          onDetailUpdated={handleDetailUpdated}
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByDate ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayBookings]) => (
            <div key={date} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-700">{formatDayHeader(date)}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{dayBookings.length} booking{dayBookings.length !== 1 ? 's' : ''}</span>
                  <span>{dayBookings.reduce((s, b) => s + b.party_size, 0)} covers</span>
                </div>
              </div>
              <BookingsAccordionList
                bookings={dayBookings}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                expandedIds={expandedIds}
                detailById={detailById}
                detailLoadingIds={detailLoadingIds}
                messageDraftById={messageDraftById}
                setMessageDraftById={setMessageDraftById}
                sendingMessageIds={sendingMessageIds}
                tableManagementEnabled={tableManagementEnabled}
                venueId={venueId}
                onToggleExpand={toggleExpand}
                onOpenPanel={setSelectedId}
                onSendMessage={sendMessageToBooking}
                onStatusAction={requestStatusChange}
                onDetailUpdated={handleDetailUpdated}
              />
            </div>
          ))}
        </div>
      )}

      {selectedId && (
        <BookingDetailPanel
          bookingId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={() => {
            if (!selectedId) return;
            setDetailById((prev) => {
              const next = { ...prev };
              delete next[selectedId];
              return next;
            });
            void fetchBookings({ silent: true, ids: [selectedId] });
          }}
        />
      )}
      {walkInOpen && (
        <WalkInModal
          advancedMode={tableManagementEnabled}
          onClose={() => setWalkInOpen(false)}
          onCreated={handleWalkInCreated}
        />
      )}
      {newBookingOpen && (
        <UnifiedBookingForm
          asModal
          venueId={venueId}
          advancedMode={tableManagementEnabled}
          onClose={() => setNewBookingOpen(false)}
          onCreated={handleNewBookingCreated}
        />
      )}
      {undoAction && (
        <UndoToast
          action={undoAction}
          onUndo={() => { void undoLastStatusChange(); }}
          onDismiss={() => setUndoAction(null)}
        />
      )}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmDialog(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
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

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color] ?? 'bg-slate-50 text-slate-700 border-slate-200'}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium opacity-75">{label}</p>
    </div>
  );
}

function statusBadge(s: string) {
  const map: Record<string, { dot: string; bg: string; text: string }> = {
    Confirmed: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Pending: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
    Seated: { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
    Completed: { dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-600' },
    Cancelled: { dot: 'bg-red-400', bg: 'bg-red-50', text: 'text-red-600' },
    'No-Show': { dot: 'bg-red-600', bg: 'bg-red-50', text: 'text-red-700' },
  };
  const style = map[s] ?? { dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {s}
    </span>
  );
}

function sourceBadge(s: string) {
  const map: Record<string, string> = {
    online: 'bg-violet-50 text-violet-700',
    phone: 'bg-sky-50 text-sky-700',
    'walk-in': 'bg-amber-50 text-amber-700',
    booking_page: 'bg-violet-50 text-violet-700',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${map[s] ?? 'bg-slate-50 text-slate-600'}`}>
      {s === 'booking_page' ? 'online' : s}
    </span>
  );
}

function depositBadge(status: string, amountPence: number | null) {
  const amt = amountPence ? `£${(amountPence / 100).toFixed(2)}` : null;
  const map: Record<string, { bg: string; text: string; label: string }> = {
    Paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: amt ? `${amt} Paid` : 'Paid' },
    Refunded: { bg: 'bg-blue-50', text: 'text-blue-700', label: amt ? `${amt} Refunded` : 'Refunded' },
    Pending: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Pending' },
    'Not Required': { bg: 'bg-slate-50', text: 'text-slate-500', label: '—' },
  };
  const style = map[status] ?? { bg: 'bg-slate-50', text: 'text-slate-500', label: status };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function BookingsAccordionList({
  bookings,
  selectedIds,
  setSelectedIds,
  expandedIds,
  detailById,
  detailLoadingIds,
  messageDraftById,
  setMessageDraftById,
  sendingMessageIds,
  tableManagementEnabled,
  venueId,
  onToggleExpand,
  onOpenPanel,
  onSendMessage,
  onStatusAction,
  onDetailUpdated,
}: {
  bookings: BookingRow[];
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  expandedIds: string[];
  detailById: Record<string, BookingDetailLite>;
  detailLoadingIds: string[];
  messageDraftById: Record<string, string>;
  setMessageDraftById: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  sendingMessageIds: string[];
  tableManagementEnabled: boolean;
  venueId: string;
  onToggleExpand: (id: string) => void;
  onOpenPanel: (id: string) => void;
  onSendMessage: (id: string, message: string) => void;
  onStatusAction: (booking: BookingRow, status: BookingStatus) => void;
  onDetailUpdated: (bookingId: string) => void;
}) {
  const allSelected = bookings.length > 0 && bookings.every((b) => selectedIds.includes(b.id));
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-2.5 sm:px-4">
        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => {
                if (event.target.checked) setSelectedIds((prev) => Array.from(new Set([...prev, ...bookings.map((b) => b.id)])));
                else setSelectedIds((prev) => prev.filter((id) => !bookings.some((b) => b.id === id)));
              }}
              aria-label="Select all bookings in list"
            />
            Select all
          </label>
          <span className="text-xs text-slate-500">{bookings.length} bookings</span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {bookings.map((booking) => {
          const expanded = expandedIds.includes(booking.id);
          const detail = detailById[booking.id];
          const detailLoading = detailLoadingIds.includes(booking.id);
          const draftMessage = messageDraftById[booking.id] ?? '';
          const sendingMessage = sendingMessageIds.includes(booking.id);
          return (
            <div
              key={booking.id}
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              aria-controls={`booking-expand-${booking.id}`}
              onClick={() => onToggleExpand(booking.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpand(booking.id); } }}
              className={`cursor-pointer px-3 py-3 transition-colors sm:px-4 ${expanded ? 'bg-slate-50/60' : 'hover:bg-slate-50/40'}`}
            >
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(booking.id)}
                    onChange={(event) => {
                      setSelectedIds((prev) => event.target.checked ? [...prev, booking.id] : prev.filter((id) => id !== booking.id));
                    }}
                    aria-label={`Select booking for ${booking.guest_name}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{booking.guest_name}</span>
                    {statusBadge(booking.status)}
                    {booking.dietary_notes && (
                      <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 sm:inline-block" title={booking.dietary_notes}>
                        Dietary
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span className="font-medium tabular-nums">{booking.booking_time.slice(0, 5)}</span>
                    <span>{booking.party_size} {booking.party_size === 1 ? 'cover' : 'covers'}</span>
                    {sourceBadge(booking.source)}
                    {depositBadge(booking.deposit_status, booking.deposit_amount_pence)}
                  </div>
                </div>
                {(() => {
                  const action = BOOKING_PRIMARY_ACTIONS[booking.status as BookingStatus];
                  if (!action) return null;
                  return (
                    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
                    <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => onStatusAction(booking, action.target)}
                        className="inline-flex items-center rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                        aria-label={`${action.label} booking for ${booking.guest_name}`}
                      >
                        {action.label}
                      </button>
                    </div>
                  );
                })()}
                <svg className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
              {expanded && (
                <ExpandedBookingContent
                  booking={booking}
                  detail={detail}
                  detailLoading={detailLoading}
                  tableManagementEnabled={tableManagementEnabled}
                  venueId={venueId}
                  draftMessage={draftMessage}
                  sendingMessage={sendingMessage}
                  onMessageDraftChange={(value) => setMessageDraftById((prev) => ({ ...prev, [booking.id]: value }))}
                  onSendMessage={() => { void onSendMessage(booking.id, draftMessage); }}
                  onStatusAction={(status) => { onStatusAction(booking, status); }}
                  onOpenPanel={() => onOpenPanel(booking.id)}
                  onDetailUpdated={() => onDetailUpdated(booking.id)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-100">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="h-4 w-12 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-8 animate-pulse rounded bg-slate-100" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <svg className="mb-3 h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
        <p className="text-sm font-medium">No reservations for this period</p>
      </div>
    </div>
  );
}
