'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { AppointmentBookingForm } from '@/components/booking/AppointmentBookingForm';
import { AppointmentWalkInModal } from '@/components/booking/AppointmentWalkInModal';
import {
  AppointmentDetailSheet,
  type AppointmentDetailPrefetch,
} from '@/components/booking/AppointmentDetailSheet';
import type { RegistryAppointment } from '@/components/booking/AppointmentRegistryCard';
import { DashboardStatCard } from '@/components/dashboard/DashboardStatCard';
import { useToast } from '@/components/ui/Toast';
import { buildCsvFromRows, downloadCsvString, formatMoneyPence } from '@/lib/appointments-csv';
import { BOOKING_MUTABLE_STATUSES } from '@/lib/table-management/constants';

type ViewMode = 'day' | 'week' | 'month' | 'custom';

interface Practitioner {
  id: string;
  name: string;
  is_active: boolean;
}

interface AppointmentService {
  id: string;
  name: string;
  duration_minutes: number;
  price_pence: number | null;
  colour?: string;
}

interface PractitionerServiceLink {
  practitioner_id: string;
  service_id: string;
  custom_price_pence: number | null;
  custom_duration_minutes: number | null;
}

const STATUS_FILTERS: Array<{ label: string; apiValue: string | null }> = [
  { label: 'All', apiValue: null },
  { label: 'Pending', apiValue: 'Pending' },
  { label: 'Confirmed', apiValue: 'Confirmed' },
  { label: 'In progress', apiValue: 'Seated' },
  { label: 'Completed', apiValue: 'Completed' },
  { label: 'Cancelled', apiValue: 'Cancelled' },
  { label: 'No show', apiValue: 'No-Show' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateLabel(date: string, mode: ViewMode): string {
  const d = new Date(`${date}T12:00:00`);
  if (mode === 'day') {
    return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (mode === 'week') {
    const end = new Date(`${addDays(date, 6)}T12:00:00`);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  }
  if (mode === 'month') return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  return '';
}

function formatDayHeader(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function statusLabelForCsv(status: string): string {
  if (status === 'Seated') return 'In progress';
  if (status === 'No-Show') return 'No show';
  return status;
}

function sourceLabelForCsv(source: string): string {
  if (source === 'booking_page' || source === 'online') return 'Online';
  if (source === 'walk-in') return 'Walk-in';
  if (source === 'phone') return 'Phone';
  return source;
}

function filterRegistryAppointments(
  list: RegistryAppointment[],
  practitionerFilter: 'all' | string,
  serviceFilter: 'all' | string,
  searchQuery: string,
): RegistryAppointment[] {
  let result = list;
  if (practitionerFilter !== 'all') {
    result = result.filter((b) => b.practitioner_id === practitionerFilter);
  }
  if (serviceFilter !== 'all') {
    result = result.filter((b) => b.appointment_service_id === serviceFilter);
  }
  const q = searchQuery.trim().toLowerCase();
  if (!q) return result;
  return result.filter(
    (b) =>
      b.guest_name.toLowerCase().includes(q) ||
      (b.guest_phone ?? '').toLowerCase().includes(q) ||
      (b.guest_email ?? '').toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      b.id.replace(/-/g, '').toLowerCase().includes(q.replace(/-/g, '')),
  );
}

function registryToPrefetch(b: RegistryAppointment): AppointmentDetailPrefetch {
  return {
    id: b.id,
    booking_date: b.booking_date,
    booking_time: b.booking_time,
    booking_end_time: b.booking_end_time,
    status: b.status,
    practitioner_id: b.practitioner_id,
    appointment_service_id: b.appointment_service_id,
    special_requests: b.special_requests,
    internal_notes: b.internal_notes,
    client_arrived_at: b.client_arrived_at,
    deposit_amount_pence: b.deposit_amount_pence,
    deposit_status: b.deposit_status,
    party_size: b.party_size,
    guest_name: b.guest_name,
    guest_email: b.guest_email,
    guest_phone: b.guest_phone,
    guest_visit_count: b.guest_visit_count,
  };
}

type SortKey = 'date' | 'time' | 'client' | 'service' | 'practitioner' | 'status' | 'deposit';

export function AppointmentBookingsDashboard({
  venueId,
  currency = 'GBP',
}: {
  venueId: string;
  currency?: string;
}) {
  const { addToast } = useToast();
  const sym = currency === 'EUR' ? '€' : '£';
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [anchorDate, setAnchorDate] = useState(todayISO);
  const [customFrom, setCustomFrom] = useState(todayISO);
  const [customTo, setCustomTo] = useState(addDays(todayISO(), 7));
  const [statusKey, setStatusKey] = useState<string>('All');
  const [practitionerFilter, setPractitionerFilter] = useState<'all' | string>('all');
  const [serviceFilter, setServiceFilter] = useState<'all' | string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookings, setBookings] = useState<RegistryAppointment[]>([]);
  /** All statuses in range — used for summary tiles (list may be status-filtered). */
  const [allStatusBookings, setAllStatusBookings] = useState<RegistryAppointment[]>([]);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [practitionerServiceLinks, setPractitionerServiceLinks] = useState<PractitionerServiceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvFrom, setCsvFrom] = useState(todayISO);
  const [csvTo, setCsvTo] = useState(addDays(todayISO(), 30));
  const [csvExporting, setCsvExporting] = useState(false);

  const selectedStatusApi = STATUS_FILTERS.find((f) => f.label === statusKey)?.apiValue ?? null;

  const { from, to } = useMemo(() => {
    if (viewMode === 'day') return { from: anchorDate, to: anchorDate };
    if (viewMode === 'week') return { from: anchorDate, to: addDays(anchorDate, 6) };
    if (viewMode === 'month') return { from: startOfMonth(anchorDate), to: endOfMonth(anchorDate) };
    return { from: customFrom, to: customTo };
  }, [viewMode, anchorDate, customFrom, customTo]);

  const invalidCustomRange = viewMode === 'custom' && customFrom > customTo;
  const invalidCsvRange = csvFrom > csvTo;

  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const practitionerMap = useMemo(
    () => new Map(practitioners.filter((p) => p.is_active).map((p) => [p.id, p])),
    [practitioners],
  );

  const linkPriceKey = useMemo(() => {
    const m = new Map<string, PractitionerServiceLink>();
    for (const l of practitionerServiceLinks) {
      m.set(`${l.practitioner_id}:${l.service_id}`, l);
    }
    return m;
  }, [practitionerServiceLinks]);

  const effectivePricePence = useCallback(
    (b: RegistryAppointment): number | null => {
      if (!b.appointment_service_id) return null;
      const link = b.practitioner_id
        ? linkPriceKey.get(`${b.practitioner_id}:${b.appointment_service_id}`)
        : undefined;
      const svc = serviceMap.get(b.appointment_service_id);
      if (link?.custom_price_pence != null) return link.custom_price_pence;
      return svc?.price_pence ?? null;
    },
    [linkPriceKey, serviceMap],
  );

  const fetchBookings = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (invalidCustomRange) {
        setError('Custom date range is invalid. “From” must be before or equal to “To”.');
        setLoading(false);
        return;
      }
      if (silent) setIsRefreshing(true);
      else setLoading(true);
      if (!silent) setError(null);
      try {
        const params = new URLSearchParams(
          viewMode === 'day' ? { date: from } : { from, to },
        );
        if (selectedStatusApi) params.set('status', selectedStatusApi);
        const res = await fetch(`/api/venue/bookings/list?${params}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError((json as { error?: string }).error ?? 'Failed to load appointments');
          return;
        }
        const data = await res.json();
        const raw = (data.bookings ?? []) as RegistryAppointment[];
        const apptOnly = raw.filter((b) => b.practitioner_id);
        setBookings(apptOnly);
      } catch {
        setError('Network error loading appointments');
      } finally {
        if (silent) setIsRefreshing(false);
        else setLoading(false);
      }
    },
    [from, to, viewMode, selectedStatusApi, invalidCustomRange],
  );


  const fetchBookingsForStats = useCallback(async () => {
    if (invalidCustomRange) {
      setAllStatusBookings([]);
      return;
    }
    try {
      const params = new URLSearchParams(viewMode === 'day' ? { date: from } : { from, to });
      const res = await fetch(`/api/venue/bookings/list?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const raw = (data.bookings ?? []) as RegistryAppointment[];
      setAllStatusBookings(raw.filter((b) => b.practitioner_id));
    } catch {
      setAllStatusBookings([]);
    }
  }, [from, to, viewMode, invalidCustomRange]);

  useEffect(() => {
    void fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    void fetchBookingsForStats();
  }, [fetchBookingsForStats]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/venue/practitioners')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPractitioners(data.practitioners ?? []);
      })
      .catch(() => {
        if (!cancelled) setPractitioners([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/venue/appointment-services')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setServices(data.services ?? []);
        setPractitionerServiceLinks(data.practitioner_services ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setServices([]);
          setPractitionerServiceLinks([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('appointments-registry')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `venue_id=eq.${venueId}` },
        () => {
          void fetchBookings({ silent: true });
          void fetchBookingsForStats();
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [venueId, fetchBookings, fetchBookingsForStats]);

  const filteredBookings = useMemo(
    () => filterRegistryAppointments(bookings, practitionerFilter, serviceFilter, searchQuery),
    [bookings, practitionerFilter, serviceFilter, searchQuery],
  );

  const statsBookings = useMemo(
    () =>
      filterRegistryAppointments(allStatusBookings, practitionerFilter, serviceFilter, searchQuery),
    [allStatusBookings, practitionerFilter, serviceFilter, searchQuery],
  );

  const sortedBookings = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const list = [...filteredBookings];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'date':
          cmp = a.booking_date.localeCompare(b.booking_date);
          if (cmp === 0) cmp = a.booking_time.localeCompare(b.booking_time);
          break;
        case 'time':
          cmp = a.booking_time.localeCompare(b.booking_time);
          if (cmp === 0) cmp = a.booking_date.localeCompare(b.booking_date);
          break;
        case 'client':
          cmp = a.guest_name.localeCompare(b.guest_name, undefined, { sensitivity: 'base' });
          break;
        case 'service': {
          const sa = a.appointment_service_id ? serviceMap.get(a.appointment_service_id)?.name ?? '' : '';
          const sb = b.appointment_service_id ? serviceMap.get(b.appointment_service_id)?.name ?? '' : '';
          cmp = sa.localeCompare(sb, undefined, { sensitivity: 'base' });
          break;
        }
        case 'practitioner': {
          const pa = a.practitioner_id ? practitionerMap.get(a.practitioner_id)?.name ?? '' : '';
          const pb = b.practitioner_id ? practitionerMap.get(b.practitioner_id)?.name ?? '' : '';
          cmp = pa.localeCompare(pb, undefined, { sensitivity: 'base' });
          break;
        }
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'deposit':
          cmp = (a.deposit_amount_pence ?? 0) - (b.deposit_amount_pence ?? 0);
          break;
        default:
          break;
      }
      return cmp * dir;
    });
    return list;
  }, [filteredBookings, sortKey, sortDir, serviceMap, practitionerMap]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'date' || key === 'time' ? 'asc' : 'asc');
    }
  }

  async function updateRowStatus(bookingId: string, nextStatus: string) {
    const prev = bookings.find((x) => x.id === bookingId);
    if (!prev) return;
    setStatusUpdatingId(bookingId);
    setBookings((rows) => rows.map((r) => (r.id === bookingId ? { ...r, status: nextStatus } : r)));
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        addToast((j as { error?: string }).error ?? 'Could not update status', 'error');
        setBookings((rows) => rows.map((r) => (r.id === bookingId ? prev : r)));
        return;
      }
      void fetchBookings({ silent: true });
      void fetchBookingsForStats();
    } catch {
      addToast('Could not update status', 'error');
      setBookings((rows) => rows.map((r) => (r.id === bookingId ? prev : r)));
    } finally {
      setStatusUpdatingId(null);
    }
  }

  const groupedByDate = useMemo(() => {
    if (viewMode === 'day') return null;
    const groups: Record<string, RegistryAppointment[]> = {};
    for (const b of sortedBookings) {
      (groups[b.booking_date] ??= []).push(b);
    }
    return groups;
  }, [sortedBookings, viewMode]);

  const stats = useMemo(() => {
    const total = statsBookings.length;
    const confirmed = statsBookings.filter((b) => b.status === 'Confirmed').length;
    const completed = statsBookings.filter((b) => b.status === 'Completed').length;
    const noShows = statsBookings.filter((b) => b.status === 'No-Show').length;
    return { total, confirmed, completed, noShows };
  }, [statsBookings]);

  const detailPrefetch = useMemo((): AppointmentDetailPrefetch | null => {
    if (!detailBookingId) return null;
    const b = bookings.find((x) => x.id === detailBookingId);
    return b ? registryToPrefetch(b) : null;
  }, [detailBookingId, bookings]);

  function tableStatusLabel(s: string): string {
    if (s === 'Seated') return 'In progress';
    if (s === 'No-Show') return 'No show';
    return s;
  }

  const navigate = (direction: -1 | 1) => {
    if (viewMode === 'day') setAnchorDate(addDays(anchorDate, direction));
    else if (viewMode === 'week') setAnchorDate(addDays(anchorDate, direction * 7));
    else if (viewMode === 'month') {
      const d = new Date(`${anchorDate}T12:00:00`);
      d.setMonth(d.getMonth() + direction);
      setAnchorDate(d.toISOString().slice(0, 10));
    }
  };

  const goToday = () => setAnchorDate(todayISO());
  const goTomorrow = () => setAnchorDate(addDays(todayISO(), 1));

  const openCsvModal = () => {
    setCsvFrom(from);
    setCsvTo(to);
    setCsvModalOpen(true);
  };

  const runCsvExport = async () => {
    if (invalidCsvRange) return;
    setCsvExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: csvFrom, to: csvTo });
      const res = await fetch(`/api/venue/bookings/list?${params}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json as { error?: string }).error ?? 'Failed to load appointments for export');
        return;
      }
      const data = await res.json();
      const rows = ((data.bookings ?? []) as RegistryAppointment[]).filter((b) => b.practitioner_id);

      const header = [
        'Date',
        'Time',
        'Booking ref (full)',
        'Status',
        'Source',
        'Client',
        'Phone',
        'Email',
        'Practitioner',
        'Service',
        'Service price',
        'Deposit status',
        'Deposit amount',
        'Customer comments',
        'Staff notes',
      ];

      const csvRows = rows.map((b) => {
        const prac = b.practitioner_id ? practitionerMap.get(b.practitioner_id)?.name ?? '' : '';
        const svc = b.appointment_service_id ? serviceMap.get(b.appointment_service_id)?.name ?? '' : '';
        const price = effectivePricePence(b);
        return [
          b.booking_date,
          b.booking_time.slice(0, 5),
          b.id,
          statusLabelForCsv(b.status),
          sourceLabelForCsv(b.source),
          b.guest_name,
          b.guest_phone ?? '',
          b.guest_email ?? '',
          prac,
          svc,
          formatMoneyPence(price, sym),
          b.deposit_status,
          b.deposit_amount_pence != null ? formatMoneyPence(b.deposit_amount_pence, sym) : '',
          b.special_requests?.replace(/\r\n/g, '\n') ?? '',
          b.internal_notes?.replace(/\r\n/g, '\n') ?? '',
        ];
      });

      const csv = buildCsvFromRows(header, csvRows);
      downloadCsvString(csv, `appointments_${csvFrom}_to_${csvTo}.csv`);
      setCsvModalOpen(false);
    } catch {
      setError('Failed to export CSV');
    } finally {
      setCsvExporting(false);
    }
  };

  const activePractitioners = useMemo(() => practitioners.filter((p) => p.is_active), [practitioners]);

  function SortTh({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) {
    const active = sortKey === k;
    return (
      <th className={`px-3 py-2 text-left ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${
            active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {label}
          {active && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
        </button>
      </th>
    );
  }

  function renderTableRows(list: RegistryAppointment[]) {
    return list.map((b) => {
      const pracName = b.practitioner_id ? practitionerMap.get(b.practitioner_id)?.name ?? '—' : '—';
      const svcName = b.appointment_service_id ? serviceMap.get(b.appointment_service_id)?.name ?? '—' : '—';
      const dep =
        b.deposit_amount_pence != null
          ? `${formatMoneyPence(b.deposit_amount_pence, sym)} (${b.deposit_status})`
          : b.deposit_status;
      return (
        <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50/80">
          <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-800">{b.booking_date}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-800">{b.booking_time.slice(0, 5)}</td>
          <td className="max-w-[140px] truncate px-3 py-2.5 text-sm font-medium text-slate-900">{b.guest_name}</td>
          <td className="hidden max-w-[120px] truncate px-3 py-2.5 text-sm text-slate-600 lg:table-cell">
            {svcName}
          </td>
          <td className="hidden whitespace-nowrap px-3 py-2.5 text-sm text-slate-600 xl:table-cell">{pracName}</td>
          <td className="px-3 py-2.5">
            <select
              value={b.status}
              disabled={statusUpdatingId === b.id}
              onChange={(e) => void updateRowStatus(b.id, e.target.value)}
              className="max-w-[140px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
            >
              {BOOKING_MUTABLE_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {tableStatusLabel(st)}
                </option>
              ))}
            </select>
          </td>
          <td className="hidden whitespace-nowrap px-3 py-2.5 text-sm text-slate-600 md:table-cell">{dep}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-right">
            <button
              type="button"
              onClick={() => setDetailBookingId(b.id)}
              className="text-sm font-medium text-brand-600 hover:text-brand-800"
            >
              View
            </button>
          </td>
        </tr>
      );
    });
  }

  function renderMobileCards(list: RegistryAppointment[]) {
    return (
      <div className="space-y-3 md:hidden">
        {list.map((b) => {
          const pracName = b.practitioner_id ? practitionerMap.get(b.practitioner_id)?.name ?? '—' : '—';
          const svcName = b.appointment_service_id ? serviceMap.get(b.appointment_service_id)?.name ?? '—' : '—';
          return (
            <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{b.guest_name}</p>
                  <p className="text-sm text-slate-600">
                    {b.booking_date} · {b.booking_time.slice(0, 5)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {svcName} · {pracName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailBookingId(b.id)}
                  className="shrink-0 text-sm font-medium text-brand-600"
                >
                  View
                </button>
              </div>
              <label className="mt-3 block text-xs font-medium text-slate-500">Status</label>
              <select
                value={b.status}
                disabled={statusUpdatingId === b.id}
                onChange={(e) => void updateRowStatus(b.id, e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              >
                {BOOKING_MUTABLE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {tableStatusLabel(st)}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {realtimeConnected === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Updates may be delayed. Reconnecting…
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-3 text-red-500 underline hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          <p className="mb-2 text-xs font-medium text-slate-500">View period</p>
          <div className="flex w-max rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(['day', 'week', 'month', 'custom'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setViewMode(mode);
                  if (mode !== 'custom') setAnchorDate(todayISO());
                }}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium capitalize transition-all sm:px-4 ${
                  viewMode === mode ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goTomorrow}
            className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={openCsvModal}
            className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setNewBookingOpen(true)}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New appointment
          </button>
          <button
            type="button"
            onClick={() => setWalkInOpen(true)}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Walk-in
          </button>
        </div>
      </div>

      {viewMode !== 'custom' ? (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm sm:px-4 sm:py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            aria-label="Previous period"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 px-2 text-center">
            <h2 className="truncate text-sm font-semibold text-slate-900 sm:text-base">
              {formatDateLabel(anchorDate, viewMode)}
            </h2>
            {anchorDate === todayISO() && (
              <span className="text-xs font-medium text-brand-600">Today</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            aria-label="Next period"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="appt-custom-from" className="text-xs font-medium text-slate-600">
              From
            </label>
            <input
              id="appt-custom-from"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="appt-custom-to" className="text-xs font-medium text-slate-600">
              To
            </label>
            <input
              id="appt-custom-to"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {invalidCustomRange && (
            <p className="w-full text-sm font-medium text-red-600">“From” must be on or before “To”.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DashboardStatCard label="Appointments" value={stats.total} color="blue" />
        <DashboardStatCard label="Confirmed" value={stats.confirmed} color="emerald" />
        <DashboardStatCard label="Completed" value={stats.completed} color="violet" />
        <DashboardStatCard label="No-shows" value={stats.noShows} color="slate" />
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">Status</p>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatusKey(f.label)}
              className={`flex-shrink-0 rounded-full px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
                statusKey === f.label
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
            <span className="text-xs font-medium text-slate-600">Staff member</span>
            <select
              value={practitionerFilter}
              onChange={(e) => setPractitionerFilter(e.target.value as 'all' | string)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">All staff</option>
              {activePractitioners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
            <span className="text-xs font-medium text-slate-600">Service</span>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value as 'all' | string)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">All services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
            <span className="text-xs font-medium text-slate-600">Search</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Name, phone, email, or booking reference"
              className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              autoComplete="off"
            />
          </label>
        </div>
        {isRefreshing && <p className="text-xs text-slate-500">Syncing…</p>}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-500">No appointments match this period and filters.</p>
          <p className="mt-1 text-xs text-slate-400">Try another date range or clear search.</p>
        </div>
      ) : viewMode === 'day' ? (
        <>
          {renderMobileCards(sortedBookings)}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <SortTh k="date" label="Date" />
                  <SortTh k="time" label="Time" />
                  <SortTh k="client" label="Client" />
                  <SortTh k="service" label="Service" className="hidden lg:table-cell" />
                  <SortTh k="practitioner" label="Staff" className="hidden xl:table-cell" />
                  <SortTh k="status" label="Status" />
                  <SortTh k="deposit" label="Deposit" className="hidden md:table-cell" />
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>{renderTableRows(sortedBookings)}</tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByDate ?? {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dayBookings]) => (
              <section
                key={date}
                className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40 shadow-sm"
                aria-label={`Appointments on ${date}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-800">{formatDayHeader(date)}</h3>
                  <span className="text-xs text-slate-500">
                    {dayBookings.length} appointment{dayBookings.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="p-2 sm:p-3">
                  {renderMobileCards(dayBookings)}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[720px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-white">
                          <SortTh k="date" label="Date" />
                          <SortTh k="time" label="Time" />
                          <SortTh k="client" label="Client" />
                          <SortTh k="service" label="Service" className="hidden lg:table-cell" />
                          <SortTh k="practitioner" label="Staff" className="hidden xl:table-cell" />
                          <SortTh k="status" label="Status" />
                          <SortTh k="deposit" label="Deposit" className="hidden md:table-cell" />
                          <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>{renderTableRows(dayBookings)}</tbody>
                    </table>
                  </div>
                </div>
              </section>
            ))}
        </div>
      )}

      {csvModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => !csvExporting && setCsvModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-export-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="csv-export-title" className="text-lg font-semibold text-slate-900">
              Export appointments (CSV)
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Choose a date range. All appointment statuses are included in the file.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">From</span>
                <input
                  type="date"
                  value={csvFrom}
                  onChange={(e) => setCsvFrom(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">To</span>
                <input
                  type="date"
                  value={csvTo}
                  onChange={(e) => setCsvTo(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              {invalidCsvRange && (
                <p className="text-sm text-red-600">“From” must be on or before “To”.</p>
              )}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={csvExporting}
                onClick={() => setCsvModalOpen(false)}
                className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={csvExporting || invalidCsvRange}
                onClick={() => void runCsvExport()}
                className="min-h-[44px] rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {csvExporting ? 'Preparing…' : 'Download CSV'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AppointmentBookingForm
        open={newBookingOpen}
        onClose={() => setNewBookingOpen(false)}
        onCreated={() => {
          setNewBookingOpen(false);
          void fetchBookings({ silent: true });
          void fetchBookingsForStats();
        }}
        venueId={venueId}
        currency={currency}
        preselectedPractitionerId={practitionerFilter === 'all' ? undefined : practitionerFilter}
      />
      <AppointmentWalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        onCreated={() => {
          setWalkInOpen(false);
          void fetchBookings({ silent: true });
          void fetchBookingsForStats();
        }}
        currency={currency}
      />

      <AppointmentDetailSheet
        open={detailBookingId !== null}
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
        onUpdated={() => {
          void fetchBookings({ silent: true });
          void fetchBookingsForStats();
        }}
        currency={currency}
        practitioners={activePractitioners}
        prefetchedBooking={detailPrefetch}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          duration_minutes: s.duration_minutes,
          colour: s.colour ?? '#6366f1',
          price_pence: s.price_pence ?? null,
        }))}
      />
    </div>
  );
}
