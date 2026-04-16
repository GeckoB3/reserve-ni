'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { TableGridData, UndoAction } from '@/types/table-management';
import { TimelineGrid } from './TimelineGrid';
import { UndoToast } from './UndoToast';
import { useToast } from '@/components/ui/Toast';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { BookingDetailPanel, type BookingDetailPanelSnapshot } from '@/app/dashboard/bookings/BookingDetailPanel';
import { DashboardStaffBookingModal } from '@/components/booking/DashboardStaffBookingModal';
import type { BookingModel } from '@/types/booking-models';
import { detectAdjacentTables, type CombinationTable } from '@/lib/table-management/combination-engine';
import { canMarkNoShowForSlot, canTransitionBookingStatus, type BookingStatus } from '@/lib/table-management/booking-status';
import { computeValidMoveTargets, type BookingMoveContext } from '@/lib/table-management/move-validation';
import { ViewToolbar } from '@/components/dashboard/ViewToolbar';
import type { ViewToolbarSummary } from '@/components/dashboard/ViewToolbar';
import { coversInUseAtTime } from '@/lib/table-management/covers-at-time';
import { computeNextBookingsSlot } from '@/lib/table-management/next-bookings-slot';
import { bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import { CalendarDateTimePicker } from '@/components/calendar/CalendarDateTimePicker';
import { getCalendarGridBounds } from '@/lib/venue-calendar-bounds';
import { isBookingTimeInHourRange } from '@/lib/booking-time-window';
import type { OpeningHours } from '@/types/availability';
import type { VenueArea } from '@/types/areas';

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function withOptimisticBookingMove(
  prev: TableGridData | null,
  bookingId: string,
  patch: { tableIds?: string[]; startTime?: string; endTime?: string }
): TableGridData | null {
  if (!prev) return prev;
  const bookingCells = prev.cells.filter((c) => c.booking_id === bookingId && c.booking_details);
  if (bookingCells.length === 0) return prev;
  const booking = bookingCells[0]!.booking_details!;
  const targetTables = patch.tableIds ?? Array.from(new Set(bookingCells.map((c) => c.table_id)));
  const startTime = patch.startTime ?? booking.start_time.slice(0, 5);
  const durationMins = (() => {
    const start = timeToMinutes(booking.start_time.slice(0, 5));
    const end = booking.end_time ? timeToMinutes(booking.end_time.slice(0, 5)) : start + 90;
    return Math.max(15, end - start);
  })();
  const endTime = patch.endTime ?? (() => {
    const end = timeToMinutes(startTime) + durationMins;
    return `${Math.floor(end / 60).toString().padStart(2, '0')}:${(end % 60).toString().padStart(2, '0')}`;
  })();

  const updatedCells = prev.cells.map((cell) => {
    if (cell.booking_id === bookingId) {
      return {
        ...cell,
        booking_id: null,
        booking_details: null,
      };
    }
    const inTargetTable = targetTables.includes(cell.table_id);
    if (!inTargetTable) return cell;
    const slot = timeToMinutes(cell.time.slice(0, 5));
    const inRange = slot >= timeToMinutes(startTime) && slot < timeToMinutes(endTime);
    if (!inRange) return cell;
    return {
      ...cell,
      booking_id: bookingId,
      booking_details: {
        ...booking,
        start_time: startTime,
        end_time: endTime,
      },
    };
  });

  return {
    ...prev,
    cells: updatedCells,
  };
}

interface CombinationInfo {
  id: string;
  name: string;
  combined_max_covers: number;
  table_ids: string[];
}

interface BlockFormState {
  id?: string;
  table_id: string;
  start_at: string;
  end_at: string;
  reason: string;
  repeat?: 'none' | 'week';
}

interface FetchGridOptions {
  silent?: boolean;
}

export function TableGridView({
  venueId,
  currency,
  bookingModel = 'table_reservation',
  enabledModels = [],
}: {
  venueId: string;
  currency?: string;
  bookingModel?: BookingModel;
  enabledModels?: BookingModel[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [diningAreas, setDiningAreas] = useState<VenueArea[]>([]);
  const [diningAreaId, setDiningAreaId] = useState<string | null>(null);

  const [date, setDate] = useState(formatDateInput(new Date()));
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [services, setServices] = useState<Array<{ id: string; name: string; start_time: string; end_time: string }>>([]);
  const [gridData, setGridData] = useState<TableGridData | null>(null);
  const [combinations, setCombinations] = useState<CombinationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [showNoShow, setShowNoShow] = useState(false);
  const [search, setSearch] = useState('');
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [validDropTargets, setValidDropTargets] = useState<Set<string> | null>(null);
  const [validDropCombos, setValidDropCombos] = useState<Map<string, string> | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  /** Bumps every minute while viewing today so “covers in use” stays current. */
  const [coversClockTick, setCoversClockTick] = useState(0);
  const [newBookingCell, setNewBookingCell] = useState<{ tableId: string; time: string } | null>(null);
  const [cellContext, setCellContext] = useState<{ tableId: string; time: string; x: number; y: number } | null>(null);
  const [blockForm, setBlockForm] = useState<BlockFormState | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockDetails, setBlockDetails] = useState<Array<{
    id: string;
    table_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
    created_at: string;
    created_by: string | null;
  }>>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [walkInCell, setWalkInCell] = useState<{ tableId: string; time: string } | null>(null);
  const [noShowGraceMinutes, setNoShowGraceMinutes] = useState(15);
  const [combinationThreshold, setCombinationThreshold] = useState(80);
  const [showLegend, setShowLegend] = useState(false);
  const [slotWidth, setSlotWidth] = useState<number>(64);
  const [moveBookingId, setMoveBookingId] = useState<string | null>(null);
  const [rescheduleDialog, setRescheduleDialog] = useState<{ bookingId: string; time: string } | null>(null);
  const [assignAllUnassignedLoading, setAssignAllUnassignedLoading] = useState(false);
  const isUndoingRef = useRef(false);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconcileInFlightRef = useRef(false);
  const pendingReconcileRef = useRef(false);
  const lastReconcileAtRef = useRef(0);
  const gridDataRef = useRef<TableGridData | null>(null);
  const { addToast } = useToast();

  const [openingHours, setOpeningHours] = useState<OpeningHours | null>(null);
  const [venueTimezone, setVenueTimezone] = useState<string>('Europe/London');
  const [startHourOverride, setStartHourOverride] = useState<number | null>(null);
  const [endHourOverride, setEndHourOverride] = useState<number | null>(null);
  const [timeRangeFilterActive, setTimeRangeFilterActive] = useState(false);

  const showDiningAreaChrome =
    bookingModel === 'table_reservation' && diningAreas.filter((a) => a.is_active).length > 1;

  useEffect(() => {
    if (bookingModel !== 'table_reservation') return;
    let cancelled = false;
    void fetch('/api/venue/areas')
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => {
        if (cancelled || !j?.areas) return;
        setDiningAreas(j.areas as VenueArea[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookingModel]);

  useEffect(() => {
    if (bookingModel !== 'table_reservation') {
      setDiningAreaId(null);
      return;
    }
    const active = diningAreas.filter((a) => a.is_active);
    if (active.length === 0) {
      setDiningAreaId(null);
      return;
    }
    if (active.length === 1) {
      setDiningAreaId(active[0]!.id);
      return;
    }
    const fromUrl = searchParams.get('area');
    let fromLs: string | null = null;
    try {
      fromLs = window.localStorage.getItem(`diningArea:${venueId}`);
    } catch {
      /* ignore */
    }
    const pick =
      fromUrl && active.some((a) => a.id === fromUrl)
        ? fromUrl
        : fromLs && active.some((a) => a.id === fromLs)
          ? fromLs
          : active[0]!.id;
    setDiningAreaId(pick);
  }, [bookingModel, diningAreas, searchParams, venueId]);

  const setDiningAreaFilter = useCallback(
    (id: string) => {
      setDiningAreaId(id);
      setServiceId(null);
      try {
        window.localStorage.setItem(`diningArea:${venueId}`, id);
      } catch {
        /* ignore */
      }
      const next = new URLSearchParams(searchParams.toString());
      next.set('area', id);
      router.replace(`/dashboard/table-grid?${next}`, { scroll: false });
    },
    [router, searchParams, venueId],
  );

  const selectedBookingSnapshot = useMemo((): BookingDetailPanelSnapshot | null => {
    if (!selectedBookingId || !gridData) return null;
    const cellsWithBooking = gridData.cells.filter(
      (c) => c.booking_id === selectedBookingId && c.booking_details
    );
    if (cellsWithBooking.length > 0) {
      const bd = cellsWithBooking[0]!.booking_details!;
      const tableIds = [...new Set(cellsWithBooking.map((c) => c.table_id))];
      const tableNames = tableIds
        .map((tid) => gridData.tables.find((t) => t.id === tid)?.name)
        .filter((n): n is string => Boolean(n));
      return {
        bookingDate: date,
        guestName: bd.guest_name,
        partySize: bd.party_size,
        status: bd.status,
        startTime: bd.start_time,
        endTime: bd.end_time,
        dietaryNotes: bd.dietary_notes,
        occasion: bd.occasion,
        depositStatus: bd.deposit_status ?? undefined,
        tableNames: tableNames.length > 0 ? tableNames : undefined,
      };
    }
    const unassigned = gridData.unassigned_bookings?.find((b) => b.id === selectedBookingId);
    if (unassigned) {
      return {
        bookingDate: date,
        guestName: unassigned.guest_name,
        partySize: unassigned.party_size,
        status: unassigned.status,
        startTime: unassigned.start_time,
        endTime: unassigned.end_time,
        dietaryNotes: unassigned.dietary_notes,
        occasion: unassigned.occasion,
        tableNames: undefined,
      };
    }
    return null;
  }, [selectedBookingId, gridData, date]);

  useEffect(() => {
    gridDataRef.current = gridData;
  }, [gridData]);

  const fetchServices = useCallback(async () => {
    try {
      const qs =
        bookingModel === 'table_reservation' && diningAreaId
          ? `?area_id=${encodeURIComponent(diningAreaId)}`
          : '';
      const res = await fetch(`/api/venue/services${qs}`);
      if (res.ok) {
        const data = await res.json();
        const svc = (data.services ?? []).filter((s: { is_active: boolean }) => s.is_active);
        setServices(svc);
      }
    } catch (err) {
      console.error('Fetch services failed:', err);
    }
  }, [bookingModel, diningAreaId]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/venue')
      .then((res) => (res.ok ? res.json() : null))
      .then((v) => {
        if (cancelled || !v) return;
        if (v.opening_hours) setOpeningHours(v.opening_hours as OpeningHours);
        const tz = v.timezone;
        if (typeof tz === 'string' && tz.trim() !== '') setVenueTimezone(tz.trim());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setStartHourOverride(null);
    setEndHourOverride(null);
    setTimeRangeFilterActive(false);
  }, [date]);

  const fetchGrid = useCallback(async (options?: FetchGridOptions) => {
    const silent = options?.silent ?? false;
    const showBlockingLoader = !silent || !gridDataRef.current;
    if (showBlockingLoader) {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams({ date });
      if (serviceId) params.set('service_id', serviceId);
      if (bookingModel === 'table_reservation' && diningAreaId) {
        params.set('area_id', diningAreaId);
      }

      const res = await fetch(`/api/venue/tables/availability?${params}`);
      if (res.ok) {
        const data = await res.json();
        setGridData(data);
      }
    } catch (err) {
      console.error('Failed to load grid data:', err);
    } finally {
      if (showBlockingLoader) {
        setLoading(false);
      }
    }
  }, [bookingModel, date, diningAreaId, serviceId]);

  const runSilentReconcile = useCallback(async () => {
    if (reconcileInFlightRef.current) {
      pendingReconcileRef.current = true;
      return;
    }
    const minIntervalMs = 1200;
    const elapsed = Date.now() - lastReconcileAtRef.current;
    if (elapsed < minIntervalMs) {
      pendingReconcileRef.current = true;
      const waitMs = minIntervalMs - elapsed;
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = setTimeout(() => {
        reconcileTimerRef.current = null;
        void runSilentReconcile();
      }, waitMs);
      return;
    }

    reconcileInFlightRef.current = true;
    try {
      await fetchGrid({ silent: true });
      lastReconcileAtRef.current = Date.now();
    } finally {
      reconcileInFlightRef.current = false;
      if (pendingReconcileRef.current) {
        pendingReconcileRef.current = false;
        if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = setTimeout(() => {
          reconcileTimerRef.current = null;
          void runSilentReconcile();
        }, 250);
      }
    }
  }, [fetchGrid]);

  const scheduleReconcile = useCallback((delayMs = 500) => {
    pendingReconcileRef.current = true;
    if (reconcileTimerRef.current) {
      clearTimeout(reconcileTimerRef.current);
    }
    reconcileTimerRef.current = setTimeout(() => {
      reconcileTimerRef.current = null;
      pendingReconcileRef.current = false;
      void runSilentReconcile();
    }, delayMs);
  }, [runSilentReconcile]);

  const fetchCombinations = useCallback(async () => {
    try {
      const areaQs =
        bookingModel === 'table_reservation' && diningAreaId
          ? `?area_id=${encodeURIComponent(diningAreaId)}`
          : '';
      const res = await fetch(`/api/venue/tables/combinations${areaQs}`);
      if (res.ok) {
        const data = await res.json();
        const combos: CombinationInfo[] = (data.combinations ?? [])
          .filter((c: { is_active: boolean }) => c.is_active)
          .map((c: { id: string; name: string; combined_min_covers?: number; combined_max_covers: number; members?: Array<{ table_id: string }> }) => ({
            id: c.id,
            name: c.name,
            combined_min_covers: c.combined_min_covers,
            combined_max_covers: c.combined_max_covers,
            table_ids: (c.members ?? []).map((m) => m.table_id),
          }));
        setCombinations(combos);
      }
    } catch (err) {
      console.error('Fetch combinations failed:', err);
    }
  }, [bookingModel, diningAreaId]);

  useEffect(() => {
    const areaQs =
      bookingModel === 'table_reservation' && diningAreaId
        ? `?area_id=${encodeURIComponent(diningAreaId)}`
        : '';
    fetch(`/api/venue/tables${areaQs}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setNoShowGraceMinutes(data.settings?.no_show_grace_minutes ?? 15);
          setCombinationThreshold(data.settings?.combination_threshold ?? 80);
        }
      })
      .catch(() => {});
  }, [bookingModel, diningAreaId]);
  useEffect(() => { fetchServices(); }, [fetchServices]);
  useEffect(() => { fetchGrid(); }, [fetchGrid]);
  useEffect(() => { fetchCombinations(); }, [fetchCombinations]);
  useEffect(() => {
    return () => {
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
      }
      reconcileInFlightRef.current = false;
      pendingReconcileRef.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const loadBlocks = async () => {
      try {
        const res = await fetch(`/api/venue/tables/blocks?date=${date}`);
        if (!res.ok) return;
        const payload = await res.json();
        if (!cancelled) setBlockDetails(payload.blocks ?? []);
      } catch {
        if (!cancelled) setBlockDetails([]);
      }
    };
    void loadBlocks();
    return () => { cancelled = true; };
  }, [date, gridData?.cells.length]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('reserve:table-grid:slot-width');
      if (!saved) return;
      const next = Number(saved);
      if (Number.isFinite(next)) {
        setSlotWidth(Math.max(30, Math.min(80, next)));
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('reserve:table-grid:slot-width', String(slotWidth));
    } catch {
      // ignore storage errors
    }
  }, [slotWidth]);

  const allCombinations = useMemo(() => {
    if (!gridData) return combinations;

    const comboTables: CombinationTable[] = gridData.tables.map((t) => ({
      id: t.id,
      name: t.name,
      max_covers: t.max_covers,
      is_active: t.is_active,
      position_x: t.position_x,
      position_y: t.position_y,
      width: t.width,
      height: t.height,
      rotation: t.rotation,
    }));

    const adjacencyMap = detectAdjacentTables(comboTables, combinationThreshold);
    const autoCombos: CombinationInfo[] = [];
    const seen = new Set<string>();
    const tableMap = new Map(gridData.tables.map((t) => [t.id, t]));

    for (const [tableId, neighbors] of adjacencyMap) {
      for (const neighborId of neighbors) {
        const key = [tableId, neighborId].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const t1 = tableMap.get(tableId);
        const t2 = tableMap.get(neighborId);
        if (!t1 || !t2) continue;
        autoCombos.push({
          id: `auto_${key}`,
          name: `${t1.name} + ${t2.name}`,
          combined_max_covers: t1.max_covers + t2.max_covers,
          table_ids: [tableId, neighborId].sort(),
        });
      }
    }

    for (const [tableId, neighbors] of adjacencyMap) {
      for (const neighbor1 of neighbors) {
        for (const neighbor2 of adjacencyMap.get(neighbor1) ?? []) {
          if (neighbor2 === tableId) continue;
          const key = [tableId, neighbor1, neighbor2].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          const t1 = tableMap.get(tableId);
          const t2 = tableMap.get(neighbor1);
          const t3 = tableMap.get(neighbor2);
          if (!t1 || !t2 || !t3) continue;
          autoCombos.push({
            id: `auto_${key}`,
            name: `${t1.name} + ${t2.name} + ${t3.name}`,
            combined_max_covers: t1.max_covers + t2.max_covers + t3.max_covers,
            table_ids: [tableId, neighbor1, neighbor2].sort(),
          });
        }
      }
    }

    const manualKeys = new Set(combinations.map((c) => [...c.table_ids].sort().join('|')));
    const merged = [...combinations];
    for (const auto of autoCombos) {
      const key = auto.table_ids.join('|');
      if (!manualKeys.has(key)) {
        merged.push(auto);
      }
    }

    return merged;
  }, [gridData, combinations, combinationThreshold]);

  const handleLiveChange = useCallback(() => {
    scheduleReconcile(700);
  }, [scheduleReconcile]);
  const liveState = useVenueLiveSync({ venueId, date, onChange: handleLiveChange });

  const zones = useMemo(() => {
    if (!gridData) return [];
    return [...new Set(gridData.tables.map((t) => t.zone).filter(Boolean))] as string[];
  }, [gridData]);

  const filteredTables = useMemo(() => {
    if (!gridData) return [];
    let tables = gridData.tables;
    if (zoneFilter) tables = tables.filter((t) => t.zone === zoneFilter);
    return tables;
  }, [gridData, zoneFilter]);

  useEffect(() => {
    const today = formatDateInput(new Date());
    if (date !== today) return;
    const id = window.setInterval(() => setCoversClockTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [date]);

  const viewToolbarSummary = useMemo((): ViewToolbarSummary | null => {
    void coversClockTick;
    if (!gridData) return null;
    const today = formatDateInput(new Date());
    const isToday = date === today;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const visibleTableIds = new Set(filteredTables.map((t) => t.id));
    const inUse = isToday ? coversInUseAtTime(gridData, nowMin, visibleTableIds) : 0;
    const refMin = isToday ? nowMin : 0;
    const next_bookings_slot = computeNextBookingsSlot(gridData, refMin);
    return { ...gridData.summary, covers_in_use_now: inUse, next_bookings_slot };
  }, [gridData, date, filteredTables, coversClockTick]);

  const highlightedBookingIds = useMemo(() => {
    if (!search.trim() || !gridData) return new Set<string>();
    const q = search.toLowerCase();
    const ids = new Set<string>();
    for (const cell of gridData.cells) {
      if (cell.booking_details?.guest_name.toLowerCase().includes(q)) {
        if (cell.booking_id) ids.add(cell.booking_id);
      }
    }
    for (const b of gridData.unassigned_bookings) {
      if (b.guest_name.toLowerCase().includes(q)) ids.add(b.id);
    }
    return ids;
  }, [search, gridData]);

  const computeValidTargets = useCallback((block: { party_size: number; start_time: string; end_time: string; id: string } | null) => {
    if (!block || !gridData) {
      setValidDropTargets(null);
      setValidDropCombos(null);
      return;
    }

    const context: BookingMoveContext = {
      id: block.id,
      party_size: block.party_size,
      start_time: block.start_time,
      end_time: block.end_time,
    };
    const tableInfos = gridData.tables.map((t) => ({ id: t.id, name: t.name, max_covers: t.max_covers, position_x: t.position_x, position_y: t.position_y, width: t.width, height: t.height, rotation: t.rotation }));
    const result = computeValidMoveTargets(context, tableInfos, gridData.cells, allCombinations);

    setValidDropTargets(result.validTableIds);
    setValidDropCombos(result.comboLabels.size > 0 ? result.comboLabels : null);
  }, [gridData, allCombinations]);

  const handleDragValidation = useCallback((block: { party_size: number; start_time: string; end_time: string; id: string } | null) => {
    computeValidTargets(block);
  }, [computeValidTargets]);

  const handleReassign = useCallback(async (bookingId: string, oldTableIds: string[], newTableIds: string[]) => {
    const isUndo = isUndoingRef.current;
    const rollback = gridData;
    setGridData((prev) => withOptimisticBookingMove(prev, bookingId, { tableIds: newTableIds }));

    try {
      const res = await fetch('/api/venue/tables/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reassign',
          booking_id: bookingId,
          old_table_ids: oldTableIds,
          new_table_ids: newTableIds,
        }),
      });

      if (res.ok) {
        if (!isUndo) {
          const action: UndoAction = {
            id: crypto.randomUUID(),
            type: 'reassign_table',
            description: 'Table reassigned',
            timestamp: Date.now(),
            previous_state: { bookingId, tableIds: oldTableIds },
            current_state: { bookingId, tableIds: newTableIds },
          };
          setUndoStack((prev) => [...prev.slice(-9), action]);
          setShowUndoToast(true);
        }
        addToast('Table reassigned', 'success');
        scheduleReconcile();
      } else {
        const data = await res.json().catch(() => ({}));
        setGridData(rollback);
        addToast(data.error ?? 'Failed to reassign table', 'error');
      }
    } catch (err) {
      console.error('Reassign failed:', err);
      setGridData(rollback);
      addToast('Failed to reassign table', 'error');
    }
  }, [scheduleReconcile, addToast, gridData]);

  const handleAssign = useCallback(async (bookingId: string, tableIds: string[]) => {
    try {
      const res = await fetch('/api/venue/tables/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, table_ids: tableIds }),
      });

      if (res.ok) {
        const action: UndoAction = {
          id: crypto.randomUUID(),
          type: 'unassign',
          description: 'Table assigned',
          timestamp: Date.now(),
          previous_state: { bookingId, tableIds: [] },
          current_state: { bookingId, tableIds },
        };
        setUndoStack((prev) => [...prev.slice(-9), action]);
        setShowUndoToast(true);
        addToast('Table assigned', 'success');
        scheduleReconcile();
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.error ?? 'Failed to assign table', 'error');
      }
    } catch (err) {
      console.error('Assign failed:', err);
      addToast('Failed to assign table', 'error');
    }
  }, [scheduleReconcile, addToast]);

  const handleTimeChange = useCallback(async (bookingId: string, newTime: string) => {
    const rollback = gridData;
    setGridData((prev) => withOptimisticBookingMove(prev, bookingId, { startTime: newTime }));
    try {
      const oldBlock = gridData?.cells.find((c) => c.booking_id === bookingId);
      const oldTime = oldBlock?.booking_details?.start_time ?? '';

      const oldStart = timeToMinutes(oldBlock?.booking_details?.start_time?.slice(0, 5) ?? newTime);
      const oldEnd = oldBlock?.booking_details?.end_time
        ? timeToMinutes(oldBlock.booking_details.end_time.slice(0, 5))
        : oldStart + 90;
      const durationMins = Math.max(15, oldEnd - oldStart);
      const newEndMins = timeToMinutes(newTime) + durationMins;
      const newEndTime = `${Math.floor(newEndMins / 60).toString().padStart(2, '0')}:${(newEndMins % 60).toString().padStart(2, '0')}`;

      const res = await fetch('/api/venue/tables/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_time',
          booking_id: bookingId,
          new_time: newTime,
          new_estimated_end_time: `${date}T${newEndTime}:00.000Z`,
        }),
      });

      if (res.ok) {
        const action: UndoAction = {
          id: crypto.randomUUID(),
          type: 'change_time',
          description: 'Booking time changed',
          timestamp: Date.now(),
          previous_state: { bookingId, time: oldTime },
          current_state: { bookingId, time: newTime },
        };
        setUndoStack((prev) => [...prev.slice(-9), action]);
        setShowUndoToast(true);
        addToast('Booking time updated', 'success');
        scheduleReconcile();
      } else {
        const data = await res.json().catch(() => ({}));
        setGridData(rollback);
        addToast(data.error ?? 'Failed to change time', 'error');
      }
    } catch (err) {
      console.error('Time change failed:', err);
      setGridData(rollback);
      addToast('Failed to change time', 'error');
    }
  }, [gridData, date, scheduleReconcile, addToast]);

  const handleUnassign = useCallback(async (bookingId: string) => {
    const existingCells = gridData?.cells.filter((c) => c.booking_id === bookingId) ?? [];
    const existingTableIds = [...new Set(existingCells.map((c) => c.table_id))];

    try {
      const res = await fetch('/api/venue/tables/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unassign', booking_id: bookingId }),
      });

      if (res.ok) {
        const action: UndoAction = {
          id: crypto.randomUUID(),
          type: 'unassign',
          description: 'Table unassigned',
          timestamp: Date.now(),
          previous_state: { bookingId, tableIds: existingTableIds },
          current_state: { bookingId, tableIds: [] },
        };
        setUndoStack((prev) => [...prev.slice(-9), action]);
        setShowUndoToast(true);
        addToast('Table unassigned', 'success');
        scheduleReconcile();
      } else {
        addToast('Failed to unassign table', 'error');
      }
    } catch (err) {
      console.error('Unassign failed:', err);
      addToast('Failed to unassign table', 'error');
    }
  }, [gridData, scheduleReconcile, addToast]);

  const handleResizeBooking = useCallback(async (bookingId: string, newEndTime: string) => {
    const rollback = gridData;
    const startTime = gridData?.cells.find((c) => c.booking_id === bookingId)?.booking_details?.start_time?.slice(0, 5);
    if (!startTime) return;
    const startMinutes = timeToMinutes(startTime);
    const requestedEnd = Math.max(startMinutes + 15, timeToMinutes(newEndTime));
    const bookingTableIds = Array.from(new Set(
      (gridData?.cells ?? []).filter((cell) => cell.booking_id === bookingId).map((cell) => cell.table_id),
    ));
    let nextBoundary: number | null = null;
    for (const cell of gridData?.cells ?? []) {
      if (!cell.booking_id || !cell.booking_details) continue;
      if (cell.booking_id === bookingId) continue;
      if (!bookingTableIds.includes(cell.table_id)) continue;
      const otherStart = timeToMinutes(cell.booking_details.start_time.slice(0, 5));
      if (otherStart > startMinutes && (nextBoundary === null || otherStart < nextBoundary)) {
        nextBoundary = otherStart;
      }
    }
    const clampedEnd = nextBoundary === null ? requestedEnd : Math.min(requestedEnd, nextBoundary);
    const clampedEndTime = `${Math.floor(clampedEnd / 60).toString().padStart(2, '0')}:${(clampedEnd % 60).toString().padStart(2, '0')}`;
    setGridData((prev) => withOptimisticBookingMove(prev, bookingId, { endTime: clampedEndTime }));
    try {
      const res = await fetch('/api/venue/tables/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_time',
          booking_id: bookingId,
          new_time: startTime,
          new_estimated_end_time: `${date}T${clampedEndTime}:00.000Z`,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setGridData(rollback);
        addToast(payload.error ?? 'Failed to resize booking', 'error');
        return;
      }
      addToast('Booking duration updated', 'success');
      scheduleReconcile();
    } catch (err) {
      console.error('Resize failed:', err);
      setGridData(rollback);
      addToast('Failed to resize booking', 'error');
    }
  }, [gridData, date, scheduleReconcile, addToast]);

  const handleBookingStatusChange = useCallback(async (
    bookingId: string,
    currentStatus: BookingStatus,
    nextStatus: BookingStatus,
  ) => {
    const isUndo = isUndoingRef.current;
    if (!canTransitionBookingStatus(currentStatus, nextStatus)) {
      addToast(`Cannot change from ${currentStatus} to ${nextStatus}`, 'error');
      return;
    }
    if (nextStatus === 'No-Show') {
      const startTime = gridDataRef.current?.cells.find((cell) => cell.booking_id === bookingId)?.booking_details?.start_time ?? '00:00';
      if (!canMarkNoShowForSlot(date, startTime, noShowGraceMinutes)) {
        addToast('No-show can only be marked after booking start time', 'error');
        return;
      }
    }
    const res = await fetch(`/api/venue/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      addToast(payload.error ?? 'Failed to update status', 'error');
      return;
    }
    if (!isUndo) {
      const action: UndoAction = {
        id: crypto.randomUUID(),
        type: 'change_status',
        description: `Status changed to ${bookingStatusDisplayLabel(nextStatus, true)}`,
        timestamp: Date.now(),
        previous_state: { bookingId, status: currentStatus },
        current_state: { bookingId, status: nextStatus },
      };
      setUndoStack((prev) => [...prev.slice(-9), action]);
      setShowUndoToast(true);
    }
    addToast('Booking status updated', 'success');
    scheduleReconcile();
  }, [addToast, scheduleReconcile, date, noShowGraceMinutes]);

  const handleAssignAllUnassigned = useCallback(async () => {
    if (assignAllUnassignedLoading) return;
    setAssignAllUnassignedLoading(true);
    try {
      const res = await fetch('/api/venue/tables/assignments/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(data.error ?? 'Failed to auto-assign unassigned bookings', 'error');
        return;
      }
      const assigned = Number(data.assigned ?? 0);
      const attempted = Number(data.attempted ?? 0);
      const failed = Number(data.failed ?? 0);
      if (failed > 0) {
        addToast(`Assigned ${assigned}/${attempted}. ${failed} still unassigned.`, 'success');
      } else {
        addToast(`Assigned ${assigned} booking${assigned !== 1 ? 's' : ''}.`, 'success');
      }
      scheduleReconcile();
    } catch (err) {
      console.error('Assign all unassigned failed:', err);
      addToast('Failed to auto-assign unassigned bookings', 'error');
    } finally {
      setAssignAllUnassignedLoading(false);
    }
  }, [assignAllUnassignedLoading, addToast, scheduleReconcile]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ bookingId: string; endTime: string }>;
      if (!custom.detail?.bookingId || !custom.detail?.endTime) return;
      void handleResizeBooking(custom.detail.bookingId, custom.detail.endTime);
    };
    window.addEventListener('timeline-resize-booking', handler as EventListener);
    return () => window.removeEventListener('timeline-resize-booking', handler as EventListener);
  }, [handleResizeBooking]);

  const handleUndo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;

    isUndoingRef.current = true;
    setUndoStack((s) => s.slice(0, -1));
    setShowUndoToast(false);

    try {
      if (last.type === 'reassign_table') {
        const prev = last.previous_state as { bookingId: string; tableIds: string[] };
        const curr = last.current_state as { bookingId: string; tableIds: string[] };
        await handleReassign(prev.bookingId, curr.tableIds, prev.tableIds);
      } else if (last.type === 'change_time') {
        const prev = last.previous_state as { bookingId: string; time: string };
        if (prev.time) {
          await handleTimeChange(prev.bookingId, prev.time);
        }
      } else if (last.type === 'unassign') {
        const prev = last.previous_state as { bookingId: string; tableIds: string[] };
        const curr = last.current_state as { bookingId: string; tableIds: string[] };
        if (prev.tableIds.length === 0 && curr.tableIds.length > 0) {
          await fetch('/api/venue/tables/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unassign', booking_id: prev.bookingId }),
          });
          scheduleReconcile();
        } else if (prev.tableIds.length > 0 && curr.tableIds.length === 0) {
          await fetch('/api/venue/tables/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: prev.bookingId, table_ids: prev.tableIds }),
          });
          scheduleReconcile();
        }
      } else if (last.type === 'change_status') {
        const prev = last.previous_state as { bookingId: string; status: BookingStatus };
        const curr = last.current_state as { bookingId: string; status: BookingStatus };
        if (prev.bookingId && prev.status && curr.status) {
          await handleBookingStatusChange(prev.bookingId, curr.status, prev.status);
        }
      }
    } finally {
      isUndoingRef.current = false;
    }
  }, [undoStack, handleReassign, handleTimeChange, scheduleReconcile, handleBookingStatusChange]);

  const uniqueBlocks = useMemo(() => {
    if (!gridData) return [];
    const byId = new Map<string, { id: string; table_id: string; start_time: string; end_time: string; reason: string | null }>();
    for (const cell of gridData.cells) {
      if (!cell.block_details || !cell.block_id) continue;
      if (!byId.has(cell.block_id)) {
        byId.set(cell.block_id, {
          id: cell.block_id,
          table_id: cell.table_id,
          start_time: cell.block_details.start_time,
          end_time: cell.block_details.end_time,
          reason: cell.block_details.reason,
        });
      }
    }
    return Array.from(byId.values());
  }, [gridData]);

  const openCreateBlock = useCallback((tableId: string, time: string) => {
    const [hh, mm] = time.split(':').map(Number);
    const start = `${date}T${time}:00.000Z`;
    const endMins = (hh ?? 0) * 60 + (mm ?? 0) + 60;
    const end = `${date}T${Math.floor(endMins / 60).toString().padStart(2, '0')}:${(endMins % 60).toString().padStart(2, '0')}:00.000Z`;
    setBlockForm({
      table_id: tableId,
      start_at: start,
      end_at: end,
      reason: '',
      repeat: 'none',
    });
  }, [date]);

  const openEditBlock = useCallback((blockId: string) => {
    const block = uniqueBlocks.find((b) => b.id === blockId);
    if (!block) return;
    setBlockForm({
      id: block.id,
      table_id: block.table_id,
      start_at: `${date}T${block.start_time}:00.000Z`,
      end_at: `${date}T${block.end_time}:00.000Z`,
      reason: block.reason ?? '',
      repeat: 'none',
    });
  }, [uniqueBlocks, date]);

  const { startHour: derivedStartHour, endHour: derivedEndHour } = useMemo(
    () => getCalendarGridBounds(date, openingHours ?? undefined, 7, 21, { timeZone: venueTimezone }),
    [date, openingHours, venueTimezone],
  );
  const pickerStartHour = startHourOverride ?? derivedStartHour;
  const pickerEndHour = endHourOverride ?? derivedEndHour;

  const selectedService = services.find((s) => s.id === serviceId);

  const timelineStartTime = useMemo(() => {
    if (timeRangeFilterActive) {
      return `${String(pickerStartHour).padStart(2, '0')}:00`;
    }
    if (serviceId && selectedService) {
      return selectedService.start_time;
    }
    return `${String(derivedStartHour).padStart(2, '0')}:00`;
  }, [timeRangeFilterActive, pickerStartHour, serviceId, selectedService, derivedStartHour]);

  const timelineEndTime = useMemo(() => {
    if (timeRangeFilterActive) {
      return `${String(pickerEndHour).padStart(2, '0')}:00`;
    }
    if (serviceId && selectedService) {
      return selectedService.end_time;
    }
    return `${String(derivedEndHour).padStart(2, '0')}:00`;
  }, [timeRangeFilterActive, pickerEndHour, serviceId, selectedService, derivedEndHour]);

  const timelineCells = useMemo(() => {
    if (!gridData?.cells) return [];
    if (!timeRangeFilterActive) return gridData.cells;
    return gridData.cells.map((c) => {
      if (!c.booking_id || !c.booking_details) return c;
      const start = c.booking_details.start_time.slice(0, 5);
      if (!isBookingTimeInHourRange(start, pickerStartHour, pickerEndHour)) {
        return { ...c, booking_id: null, booking_details: null };
      }
      return c;
    });
  }, [gridData, timeRangeFilterActive, pickerStartHour, pickerEndHour]);

  const timelineUnassigned = useMemo(() => {
    if (!gridData?.unassigned_bookings) return [];
    if (!timeRangeFilterActive) return gridData.unassigned_bookings;
    return gridData.unassigned_bookings.filter((b) =>
      isBookingTimeInHourRange(b.start_time.slice(0, 5), pickerStartHour, pickerEndHour),
    );
  }, [gridData, timeRangeFilterActive, pickerStartHour, pickerEndHour]);

  const exportCsv = useCallback(async () => {
    if (!gridData) return;
    const listRes = await fetch(`/api/venue/bookings/list?date=${date}`);
    const listPayload = listRes.ok ? await listRes.json() : { bookings: [] };
    const bookingMeta = new Map<string, { phone: string; email: string; source: string; created: string }>(
      (listPayload.bookings ?? []).map((booking: {
        id: string;
        guest_phone: string | null;
        guest_email: string | null;
        source: string | null;
        created_at?: string | null;
      }) => [booking.id, {
        phone: booking.guest_phone ?? '',
        email: booking.guest_email ?? '',
        source: booking.source ?? '',
        created: booking.created_at ?? '',
      }]),
    );
    const tableNameById = new Map(gridData.tables.map((table) => [table.id, table.name]));
    const byBooking = new Map<string, {
      ref: string;
      guest: string;
      party: number;
      start: string;
      end: string;
      duration: number;
      status: string;
      deposit: string;
      special: string;
      source: string;
      created: string;
      tables: Set<string>;
    }>();
    for (const cell of gridData.cells) {
      if (!cell.booking_id || !cell.booking_details) continue;
      const existing = byBooking.get(cell.booking_id) ?? {
        ref: cell.booking_id,
        guest: cell.booking_details.guest_name,
        party: cell.booking_details.party_size,
        start: cell.booking_details.start_time.slice(0, 5),
        end: cell.booking_details.end_time.slice(0, 5),
        duration: Math.max(15, timeToMinutes(cell.booking_details.end_time.slice(0, 5)) - timeToMinutes(cell.booking_details.start_time.slice(0, 5))),
        status: cell.booking_details.status,
        deposit: cell.booking_details.deposit_status ?? '',
        special: cell.booking_details.dietary_notes ?? cell.booking_details.occasion ?? '',
        source: bookingMeta.get(cell.booking_id)?.source ?? '',
        created: bookingMeta.get(cell.booking_id)?.created ?? '',
        tables: new Set<string>(),
      };
      existing.tables.add(tableNameById.get(cell.table_id) ?? cell.table_id);
      byBooking.set(cell.booking_id, existing);
    }
    const header = [
      'Booking Reference', 'Guest Name', 'Party Size', 'Table', 'Start Time', 'End Time', 'Duration',
      'Status', 'Deposit Status', 'Special Requests', 'Phone', 'Email', 'Source', 'Created At',
    ];
    const rows = [header.join(',')];
    for (const row of byBooking.values()) {
      rows.push([
        row.ref,
        row.guest,
        String(row.party),
        Array.from(row.tables).join(' + '),
        row.start,
        row.end,
        String(row.duration),
        row.status,
        row.deposit,
        row.special,
        bookingMeta.get(row.ref)?.phone ?? '',
        bookingMeta.get(row.ref)?.email ?? '',
        row.source,
        row.created,
      ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `table-grid-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [gridData, date]);

  const printDaySheet = useCallback(async () => {
    if (!gridData) return;
    const listRes = await fetch(`/api/venue/bookings/list?date=${date}`);
    const listPayload = listRes.ok ? await listRes.json() : { bookings: [] };
    const rows = (listPayload.bookings ?? []) as Array<{
      id: string;
      booking_time: string;
      guest_name: string;
      party_size: number;
      status: string;
      dietary_notes?: string | null;
      occasion?: string | null;
    }>;
    const tableNamesByBooking = new Map<string, string[]>();
    for (const cell of gridData.cells) {
      if (!cell.booking_id) continue;
      const existing = tableNamesByBooking.get(cell.booking_id) ?? [];
      const tableName = gridData.tables.find((table) => table.id === cell.table_id)?.name ?? cell.table_id;
      if (!existing.includes(tableName)) existing.push(tableName);
      tableNamesByBooking.set(cell.booking_id, existing);
    }
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const htmlRows = rows.map((booking) => `
      <tr>
        <td>${booking.booking_time?.slice(0, 5) ?? ''}</td>
        <td>${booking.guest_name ?? ''}</td>
        <td>${booking.party_size}</td>
        <td>${(tableNamesByBooking.get(booking.id) ?? []).join(' + ')}</td>
        <td>${booking.status}</td>
        <td>${booking.dietary_notes ?? booking.occasion ?? ''}</td>
      </tr>
    `).join('');
    win.document.write(`
      <html>
        <head>
          <title>Table Grid Day Sheet ${date}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { font-size: 18px; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background: #f4f4f4; }
          </style>
        </head>
        <body>
          <h1>Day Sheet - ${date}</h1>
          <table>
            <thead><tr><th>Time</th><th>Guest</th><th>Party</th><th>Table</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>${htmlRows}</tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }, [gridData, date]);

  return (
    <div className="flex flex-col gap-2 md:gap-3 lg:gap-4">
      {gridData && (
        <ViewToolbar
          title="Table grid"
          summary={viewToolbarSummary ?? gridData.summary}
          date={date}
          onDateChange={setDate}
          liveState={liveState}
          onRefresh={() => { void fetchGrid(); }}
          onNewBooking={() => setNewBookingCell({ tableId: '', time: '' })}
          onWalkIn={() => {
            setWalkInCell({ tableId: '', time: '' });
          }}
          datePicker={(
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <CalendarDateTimePicker
                date={date}
                onDateChange={setDate}
                startHour={pickerStartHour}
                endHour={pickerEndHour}
                onTimeRangeChange={(start, end) => {
                  setStartHourOverride(start);
                  setEndHourOverride(end);
                  setTimeRangeFilterActive(true);
                }}
              />
              {timeRangeFilterActive && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                  <p className="text-xs text-slate-600">
                    Showing bookings with start times from{' '}
                    <span className="font-medium text-slate-800">
                      {String(pickerStartHour).padStart(2, '0')}:00
                    </span>{' '}
                    up to{' '}
                    <span className="font-medium text-slate-800">
                      {String(pickerEndHour).padStart(2, '0')}:00
                    </span>{' '}
                    (not including the end hour).
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setStartHourOverride(null);
                      setEndHourOverride(null);
                      setTimeRangeFilterActive(false);
                    }}
                    className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    Clear time filter
                  </button>
                </div>
              )}
            </div>
          )}
          secondaryActions={(
            <>
              <button
                type="button"
                onClick={() => { void printDaySheet(); }}
                className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 sm:block"
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => { void exportCsv(); }}
                className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 sm:block"
              >
                Export CSV
              </button>
            </>
          )}
        >
          <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
              {showDiningAreaChrome && diningAreaId && (
                <select
                  value={diningAreaId}
                  onChange={(e) => setDiningAreaFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:px-3 sm:py-2 sm:text-sm"
                  aria-label="Dining area"
                >
                  {diningAreas
                    .filter((a) => a.is_active)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              )}
              <select
                value={serviceId ?? ''}
                onChange={(e) => setServiceId(e.target.value || null)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:px-3 sm:py-2 sm:text-sm"
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {serviceId && (
                <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-800 sm:px-2.5 sm:py-1 sm:text-xs">
                  Filtered
                </span>
              )}
              {zones.length > 0 && (
                <select
                  value={zoneFilter ?? ''}
                  onChange={(e) => setZoneFilter(e.target.value || null)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:px-3 sm:py-2 sm:text-sm"
                >
                  <option value="">All zones</option>
                  {zones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              )}
              <select
                value={statusFilter ?? ''}
                onChange={(e) => setStatusFilter(e.target.value || null)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:px-3 sm:py-2 sm:text-sm"
              >
                <option value="">All statuses</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Pending">Pending</option>
                <option value="Seated">Seated</option>
                <option value="Arrived">Arrived</option>
                <option value="No-Show">No-Show</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <label className="hidden cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 sm:inline-flex">
                <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                Cancelled
              </label>
              <label className="hidden cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 sm:inline-flex">
                <input type="checkbox" checked={showNoShow} onChange={(e) => setShowNoShow(e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                No-Show
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className="relative min-w-0 flex-1 sm:min-w-[14rem]">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search guest"
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 pl-8 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 sm:px-3 sm:py-2 sm:pl-9 sm:text-sm"
                />
                <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 sm:left-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
                <button type="button" onClick={() => setSlotWidth((prev) => Math.max(30, prev - 5))} className="px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700 sm:px-2.5 sm:py-2" title="Zoom out">−</button>
                <span className="hidden border-x border-slate-200 px-2 py-1.5 text-xs font-medium tabular-nums text-slate-600 sm:block sm:py-2">{slotWidth}px</span>
                <button type="button" onClick={() => setSlotWidth((prev) => Math.min(80, prev + 5))} className="px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700 sm:px-2.5 sm:py-2" title="Zoom in">+</button>
              </div>
              <button
                type="button"
                onClick={() => setShowLegend((prev) => !prev)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium shadow-sm transition-colors sm:px-3 sm:py-2 sm:text-sm ${
                  showLegend
                    ? 'border-brand-200 bg-brand-50 text-brand-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Legend
              </button>
            </div>
          </div>
        </ViewToolbar>
      )}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-600 shadow-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Pending
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Confirmed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-600" />
            Seated
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            No-Show
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-slate-300" />
            Blocked
          </span>
        </div>
      )}

      <div className="relative w-full rounded-xl border border-slate-200 bg-white shadow-sm">
        <>
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
          </div>
        ) : gridData && gridData.tables.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">No active tables configured</p>
              <p className="mt-1 text-xs text-slate-500">
                Add and activate tables in Tables settings to use the grid.
              </p>
            </div>
          </div>
        ) : gridData ? (
          <TimelineGrid
            tables={filteredTables}
            cells={timelineCells}
            unassignedBookings={timelineUnassigned}
            combinations={allCombinations}
            serviceStartTime={timelineStartTime}
            serviceEndTime={timelineEndTime}
            slotIntervalMinutes={gridData.slot_interval_minutes}
            statusFilter={statusFilter}
            showCancelled={showCancelled}
            showNoShow={showNoShow}
            highlightedBookingIds={highlightedBookingIds}
            validDropTargets={validDropTargets}
            validDropCombos={validDropCombos}
            currentDate={date}
            slotWidth={slotWidth}
            onReassign={handleReassign}
            onTimeChange={handleTimeChange}
            onAssign={handleAssign}
            onUnassign={handleUnassign}
            onResizeBooking={handleResizeBooking}
            onRefresh={fetchGrid}
            onDragValidation={handleDragValidation}
            onError={(msg) => addToast(msg, 'error')}
            onBookingClick={setSelectedBookingId}
            onEditBooking={setSelectedBookingId}
            onSendMessage={setSelectedBookingId}
            onCellClick={(tableId, time) => {
              if (moveBookingId) {
                const currentAssignments = gridData.cells.filter((c) => c.booking_id === moveBookingId).map((c) => c.table_id);
                const oldTableIds = Array.from(new Set(currentAssignments));
                const movingToNewTable = oldTableIds.length > 0 && !oldTableIds.includes(tableId);
                if (movingToNewTable) {
                  void handleReassign(moveBookingId, oldTableIds, [tableId]);
                } else if (oldTableIds.length > 0 && oldTableIds.includes(tableId)) {
                  const currentStart = gridData.cells.find((c) => c.booking_id === moveBookingId)?.booking_details?.start_time?.slice(0, 5);
                  if (currentStart && currentStart !== time) {
                    void handleTimeChange(moveBookingId, time);
                  }
                }
                setMoveBookingId(null);
                return;
              }
              setNewBookingCell({ tableId, time });
            }}
            onBlockClick={(blockId) => setActiveBlockId(blockId)}
            onCellContextMenu={(tableId, time, x, y) => setCellContext({ tableId, time, x, y })}
            onBlockAfterBooking={(tableId, endTime) => openCreateBlock(tableId, endTime)}
            onMoveBooking={setMoveBookingId}
            onRescheduleBooking={(bookingId) => {
              const existing = gridData.cells.find((cell) => cell.booking_id === bookingId)?.booking_details?.start_time?.slice(0, 5) ?? '18:00';
              setRescheduleDialog({ bookingId, time: existing });
            }}
            onAssignAllUnassigned={() => {
              void handleAssignAllUnassigned();
            }}
            assignAllUnassignedLoading={assignAllUnassignedLoading}
            onBookingStatusChange={handleBookingStatusChange}
          />
        ) : (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">No bookings for this date</p>
              <p className="mt-1 text-xs text-slate-500">
                Select a different date or service, or create a booking to see it here.
              </p>
            </div>
          </div>
        )}
        </>
      </div>

      {showUndoToast && undoStack.length > 0 && (
        <UndoToast
          action={undoStack[undoStack.length - 1]!}
          onUndo={handleUndo}
          onDismiss={() => setShowUndoToast(false)}
        />
      )}
      {selectedBookingId && (
        <BookingDetailPanel
          bookingId={selectedBookingId}
          venueId={venueId}
          venueCurrency={currency}
          initialSnapshot={selectedBookingSnapshot}
          onClose={() => setSelectedBookingId(null)}
          onUpdated={() => {
            fetchGrid();
          }}
        />
      )}
      {cellContext && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCellContext(null)} />
          <div
            className="fixed z-50 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
            style={{ left: cellContext.x, top: cellContext.y }}
          >
            <p className="px-2 py-1 text-[11px] font-semibold text-slate-800">Slot actions</p>
            <p className="px-2 pb-1 text-[10px] text-slate-500">{cellContext.time}</p>
            <div className="grid gap-1">
              <button
                type="button"
                onClick={() => {
                  setNewBookingCell({ tableId: cellContext.tableId, time: cellContext.time });
                  setCellContext(null);
                }}
                className="rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                New Booking
              </button>
              <button
                type="button"
                onClick={() => {
                  openCreateBlock(cellContext.tableId, cellContext.time);
                  setCellContext(null);
                }}
                className="rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                Block This Slot
              </button>
              <button
                type="button"
                onClick={() => {
                  setWalkInCell({ tableId: cellContext.tableId, time: '' });
                  setCellContext(null);
                }}
                className="rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                Walk-in
              </button>
            </div>
          </div>
        </>
      )}
      {moveBookingId && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800 shadow">
          Move mode active: click a target cell, or{' '}
          <button type="button" onClick={() => setMoveBookingId(null)} className="font-semibold underline">
            cancel
          </button>
          .
        </div>
      )}
      {activeBlockId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            {(() => {
              const block = blockDetails.find((item) => item.id === activeBlockId);
              const tableName = gridData?.tables.find((table) => table.id === block?.table_id)?.name ?? block?.table_id ?? 'Unknown';
              return (
                <>
                  <h3 className="text-base font-semibold text-slate-900">Block Details</h3>
                  <div className="mt-3 space-y-1 text-sm text-slate-700">
                    <p><span className="font-medium">Table:</span> {tableName}</p>
                    <p><span className="font-medium">Time:</span> {block ? `${new Date(block.start_at).toISOString().slice(11, 16)}-${new Date(block.end_at).toISOString().slice(11, 16)}` : '-'}</p>
                    <p><span className="font-medium">Reason:</span> {block?.reason ?? '-'}</p>
                    <p><span className="font-medium">Created:</span> {block ? new Date(block.created_at).toLocaleString() : '-'}</p>
                    <p><span className="font-medium">Created by:</span> {block?.created_by ?? '-'}</p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        openEditBlock(activeBlockId);
                        setActiveBlockId(null);
                      }}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit Block
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('Remove this block? This will make the slot available for bookings again.')) return;
                        const res = await fetch('/api/venue/tables/blocks', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: activeBlockId }),
                        });
                        if (!res.ok) {
                          addToast('Failed to remove block', 'error');
                          return;
                        }
                        addToast('Block removed', 'success');
                        setActiveBlockId(null);
                        fetchGrid();
                      }}
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      Remove Block
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveBlockId(null)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      {rescheduleDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">Reschedule Booking</h3>
            <p className="mt-1 text-xs text-slate-500">Pick a new start time.</p>
            <input
              type="time"
              value={rescheduleDialog.time}
              onChange={(e) => setRescheduleDialog((prev) => prev ? { ...prev, time: e.target.value } : prev)}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleTimeChange(rescheduleDialog.bookingId, rescheduleDialog.time);
                  setRescheduleDialog(null);
                }}
                className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setRescheduleDialog(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {newBookingCell && (
        <DashboardStaffBookingModal
          open
          title="New booking"
          onClose={() => setNewBookingCell(null)}
          onCreated={() => {
            setNewBookingCell(null);
            fetchGrid();
          }}
          venueId={venueId}
          currency={currency ?? 'GBP'}
          bookingModel={bookingModel}
          enabledModels={enabledModels}
          advancedMode
          initialDate={date}
        />
      )}
      {walkInCell && (
        <DashboardStaffBookingModal
          open
          title="Walk-in"
          bookingIntent="walk-in"
          onClose={() => setWalkInCell(null)}
          onCreated={() => { setWalkInCell(null); fetchGrid(); }}
          venueId={venueId}
          currency={currency ?? 'GBP'}
          bookingModel={bookingModel}
          enabledModels={enabledModels}
          advancedMode
          initialDate={date}
          initialTime={walkInCell.time || undefined}
        />
      )}
      {blockForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">{blockForm.id ? 'Edit Table Block' : 'Block Table'}</h3>
            <div className="mt-4 space-y-3">
              <input
                type="datetime-local"
                value={blockForm.start_at.slice(0, 16)}
                onChange={(e) => setBlockForm((prev) => prev ? { ...prev, start_at: `${e.target.value}:00.000Z` } : prev)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="datetime-local"
                value={blockForm.end_at.slice(0, 16)}
                onChange={(e) => setBlockForm((prev) => prev ? { ...prev, end_at: `${e.target.value}:00.000Z` } : prev)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={blockForm.reason}
                onChange={(e) => setBlockForm((prev) => prev ? { ...prev, reason: e.target.value } : prev)}
                placeholder="Reason (optional)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {!blockForm.id && (
                <select
                  value={blockForm.repeat ?? 'none'}
                  onChange={(e) => setBlockForm((prev) => prev ? { ...prev, repeat: e.target.value as 'none' | 'week' } : prev)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="none">Repeat: None</option>
                  <option value="week">Repeat: Every day this week</option>
                </select>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={blockSaving}
                onClick={async () => {
                  setBlockSaving(true);
                  const method = blockForm.id ? 'PATCH' : 'POST';
                  const body = blockForm.id
                    ? { id: blockForm.id, start_at: blockForm.start_at, end_at: blockForm.end_at, reason: blockForm.reason || null }
                    : {
                        table_id: blockForm.table_id,
                        start_at: blockForm.start_at,
                        end_at: blockForm.end_at,
                        reason: blockForm.reason || null,
                        repeat: blockForm.repeat ?? 'none',
                      };
                  const res = await fetch('/api/venue/tables/blocks', {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  });
                  setBlockSaving(false);
                  if (!res.ok) {
                    const payload = await res.json().catch(() => ({}));
                    addToast(payload.error ?? 'Failed to save block', 'error');
                    return;
                  }
                  addToast(blockForm.id ? 'Block updated' : 'Block created', 'success');
                  setBlockForm(null);
                  setNewBookingCell(null);
                  fetchGrid();
                }}
                className="flex-1 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
              >
                Save
              </button>
              {blockForm.id && (
                <button
                  type="button"
                  disabled={blockSaving}
                  onClick={async () => {
                    if (!confirm('Remove this block?')) return;
                    setBlockSaving(true);
                    const res = await fetch('/api/venue/tables/blocks', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: blockForm.id }),
                    });
                    setBlockSaving(false);
                    if (!res.ok) {
                      const payload = await res.json().catch(() => ({}));
                      addToast(payload.error ?? 'Failed to remove block', 'error');
                      return;
                    }
                    addToast('Block removed', 'success');
                    setBlockForm(null);
                    fetchGrid();
                  }}
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={() => setBlockForm(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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

