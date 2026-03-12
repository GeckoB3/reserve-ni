'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { TableGridData, UndoAction } from '@/types/table-management';
import { TimelineGrid } from './TimelineGrid';
import { SummaryBar } from './SummaryBar';
import { UndoToast } from './UndoToast';
import { useToast } from '@/components/ui/Toast';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { BookingDetailPanel } from '@/app/dashboard/bookings/BookingDetailPanel';
import { SharedNewBookingForm } from '@/app/dashboard/bookings/SharedNewBookingForm';
import { detectAdjacentTables, type CombinationTable } from '@/lib/table-management/combination-engine';

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

function shiftDate(isoDate: string, deltaDays: number): string {
  const base = new Date(`${isoDate}T00:00:00`);
  base.setDate(base.getDate() + deltaDays);
  return formatDateInput(base);
}

function getRoundedLocalNow(slotIntervalMinutes = 15): string {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const minutesSinceMidnight = hours * 60 + minutes;
  const rounded = Math.ceil(minutesSinceMidnight / slotIntervalMinutes) * slotIntervalMinutes;
  const safe = Math.min(rounded, (23 * 60) + 45);
  const hh = Math.floor(safe / 60).toString().padStart(2, '0');
  const mm = (safe % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
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

export function TableGridView({ venueId }: { venueId: string }) {
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
  const [viewportWidth, setViewportWidth] = useState<number>(1200);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
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
  const [quickBooking, setQuickBooking] = useState({
    name: '',
    phone: '',
    party_size: 2,
  });
  const [showLegend, setShowLegend] = useState(false);
  const [slotWidth, setSlotWidth] = useState<number>(64);
  const [moveBookingId, setMoveBookingId] = useState<string | null>(null);
  const [rescheduleDialog, setRescheduleDialog] = useState<{ bookingId: string; time: string } | null>(null);
  const [assignAllUnassignedLoading, setAssignAllUnassignedLoading] = useState(false);
  const [walkInSuggestions, setWalkInSuggestions] = useState<Array<{
    source: 'single' | 'auto' | 'manual';
    table_ids: string[];
    table_names: string[];
    combined_capacity: number;
    spare_covers: number;
  }>>([]);
  const [walkInSuggestionsLoading, setWalkInSuggestionsLoading] = useState(false);
  const [selectedWalkInSuggestionKey, setSelectedWalkInSuggestionKey] = useState<string | null>(null);
  const isUndoingRef = useRef(false);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconcileInFlightRef = useRef(false);
  const pendingReconcileRef = useRef(false);
  const lastReconcileAtRef = useRef(0);
  const gridDataRef = useRef<TableGridData | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    gridDataRef.current = gridData;
  }, [gridData]);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch('/api/venue/services');
      if (res.ok) {
        const data = await res.json();
        const svc = (data.services ?? []).filter((s: { is_active: boolean }) => s.is_active);
        setServices(svc);
      }
    } catch (err) {
      console.error('Fetch services failed:', err);
    }
  }, []);

  const fetchGrid = useCallback(async (options?: FetchGridOptions) => {
    const silent = options?.silent ?? false;
    const showBlockingLoader = !silent || !gridDataRef.current;
    if (showBlockingLoader) {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams({ date });
      if (serviceId) params.set('service_id', serviceId);

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
  }, [date, serviceId]);

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
      const res = await fetch('/api/venue/tables/combinations');
      if (res.ok) {
        const data = await res.json();
        const combos: CombinationInfo[] = (data.combinations ?? [])
          .filter((c: { is_active: boolean }) => c.is_active)
          .map((c: { id: string; name: string; combined_max_covers: number; members?: Array<{ table_id: string }> }) => ({
            id: c.id,
            name: c.name,
            combined_max_covers: c.combined_max_covers,
            table_ids: (c.members ?? []).map((m) => m.table_id),
          }));
        setCombinations(combos);
      }
    } catch (err) {
      console.error('Fetch combinations failed:', err);
    }
  }, []);

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
    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

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

    const adjacencyMap = detectAdjacentTables(comboTables, 80);
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
  }, [gridData, combinations]);

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

    const valid = new Set<string>();
    const comboLabels = new Map<string, string>();
    const blockStart = timeToMinutes(block.start_time);
    const blockEnd = block.end_time ? timeToMinutes(block.end_time) : blockStart + 90;

    const isTableFree = (tableId: string): boolean => {
      for (const cell of gridData.cells) {
        if (cell.table_id !== tableId) continue;
        if (cell.is_blocked) {
          const cTime = timeToMinutes(cell.time);
          if (blockStart <= cTime && cTime < blockEnd) return false;
        }
        if (!cell.booking_id || !cell.booking_details) continue;
        if (cell.booking_id === block.id) continue;
        const cStart = timeToMinutes(cell.booking_details.start_time);
        const cEnd = cell.booking_details.end_time
          ? timeToMinutes(cell.booking_details.end_time)
          : cStart + 90;
        if (blockStart < cEnd && blockEnd > cStart) return false;
      }
      return true;
    };

    for (const table of gridData.tables) {
      // Prefer single-table targets when they can seat the party and are free.
      if (block.party_size <= table.max_covers && isTableFree(table.id)) {
        valid.add(table.id);
        continue;
      }

      const comboCandidates = allCombinations
        .filter((combo) => combo.table_ids.includes(table.id))
        .filter((combo) => combo.combined_max_covers >= block.party_size)
        .sort((a, b) => a.combined_max_covers - b.combined_max_covers);

      for (const combo of comboCandidates) {
        const allFree = combo.table_ids.every((tid) => isTableFree(tid));
        if (!allFree) continue;

        valid.add(table.id);
        const tableNames = combo.table_ids.map((tid) => {
          const t = gridData.tables.find((tbl) => tbl.id === tid);
          return t?.name ?? tid;
        });
        comboLabels.set(table.id, tableNames.join(' + '));
        for (const tid of combo.table_ids) {
          valid.add(tid);
        }
        break;
      }
    }

    setValidDropTargets(valid);
    setValidDropCombos(comboLabels.size > 0 ? comboLabels : null);
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
      }
      setUndoStack((s) => s.slice(0, -1));
    } finally {
      isUndoingRef.current = false;
    }
  }, [undoStack, handleReassign, handleTimeChange, scheduleReconcile]);

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

  const selectedService = services.find((s) => s.id === serviceId);
  const availableTimesForNewBooking = useMemo(() => {
    if (!gridData || !newBookingCell?.tableId) return [];
    const tableCells = gridData.cells
      .filter((cell) => cell.table_id === newBookingCell.tableId)
      .filter((cell) => !cell.booking_id && !cell.is_blocked)
      .map((cell) => cell.time)
      .sort();
    return tableCells;
  }, [gridData, newBookingCell?.tableId]);

  useEffect(() => {
    if (!walkInCell) {
      setWalkInSuggestions([]);
      setWalkInSuggestionsLoading(false);
      setSelectedWalkInSuggestionKey(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setWalkInSuggestionsLoading(true);
      try {
        const params = new URLSearchParams({
          date,
          time: walkInCell.time,
          party_size: String(quickBooking.party_size),
        });
        const res = await fetch(`/api/venue/tables/combinations/suggest?${params.toString()}`);
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        const suggestions = payload.suggestions ?? [];
        setWalkInSuggestions(suggestions);
        if (suggestions.length > 0) {
          setSelectedWalkInSuggestionKey(`${suggestions[0].source}:${suggestions[0].table_ids.join('|')}`);
        } else {
          setSelectedWalkInSuggestionKey(null);
        }
      } catch {
        if (!cancelled) {
          setWalkInSuggestions([]);
          setSelectedWalkInSuggestionKey(null);
        }
      } finally {
        if (!cancelled) {
          setWalkInSuggestionsLoading(false);
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [walkInCell, date, quickBooking.party_size]);

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
    <div className="flex h-[calc(100vh-120px)] flex-col space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => setDate((prev) => shiftDate(prev, -1))}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => setDate(formatDateInput(new Date()))}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => setDate((prev) => shiftDate(prev, 1))}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Next
        </button>
        <select
          value={serviceId ?? ''}
          onChange={(e) => setServiceId(e.target.value || null)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All Services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {serviceId && (
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700">
            Service filter active
          </span>
        )}
        {zones.length > 0 && (
          <select
            value={zoneFilter ?? ''}
            onChange={(e) => setZoneFilter(e.target.value || null)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">All Zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        )}
        <select
          value={statusFilter ?? ''}
          onChange={(e) => setStatusFilter(e.target.value || null)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Pending">Pending</option>
          <option value="Seated">Seated</option>
          <option value="Arrived">Arrived</option>
          <option value="No-Show">No-Show</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <label className="inline-flex items-center gap-1 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
          />
          Show Cancelled
        </label>
        <label className="inline-flex items-center gap-1 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={showNoShow}
            onChange={(e) => setShowNoShow(e.target.checked)}
          />
          Show No-Show
        </label>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guest name..."
            className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 pl-8 text-sm"
          />
          <svg className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <button
          type="button"
          onClick={fetchGrid}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium ${
          liveState === 'live'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}>
          <span className={`inline-block h-2 w-2 rounded-full ${liveState === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {liveState === 'live' ? 'Live' : 'Reconnecting'}
        </span>
        <button
          type="button"
          onClick={() => setSlotWidth((prev) => Math.max(30, prev - 5))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title="Zoom out"
        >
          -
        </button>
        <span className="text-xs text-slate-600">{slotWidth}px</span>
        <button
          type="button"
          onClick={() => setSlotWidth((prev) => Math.min(80, prev + 5))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setShowLegend((prev) => !prev)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Legend
        </button>
        <button
          type="button"
          onClick={() => {
            setNewBookingCell({ tableId: '', time: '' });
          }}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          New Booking
        </button>
        <button
          type="button"
          onClick={() => {
            const defaultTableId = filteredTables.find((t) => t.is_active)?.id ?? gridData?.tables.find((t) => t.is_active)?.id;
            if (!defaultTableId) {
              addToast('No active tables available', 'error');
              return;
            }
            const defaultTime = getRoundedLocalNow(gridData?.slot_interval_minutes ?? 15);
            setWalkInSuggestionsLoading(true);
            setWalkInCell({ tableId: defaultTableId, time: defaultTime });
          }}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
        >
          Walk-in
        </button>
        <button
          type="button"
          onClick={() => {
            void printDaySheet();
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Print
        </button>
        <button
          type="button"
          onClick={() => {
            void exportCsv();
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>
      {showLegend && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Pending</span>
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-500" />Confirmed</span>
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />Seated</span>
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />No-Show</span>
          <span><span className="mr-1 inline-block h-2 w-2 bg-slate-300" />Blocked</span>
        </div>
      )}
      {liveState === 'reconnecting' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Live updates paused - reconnecting...
        </div>
      )}

      {gridData && <SummaryBar summary={gridData.summary} />}

      <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {viewportWidth < 900 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-semibold text-slate-800">Table Grid requires a wider screen</p>
            <p className="max-w-md text-xs text-slate-500">
              Use a device with at least 900px width, or manage live service from Floor Plan / Reservations on smaller screens.
            </p>
          </div>
        ) : (
          <>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
          </div>
        ) : gridData && gridData.tables.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
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
            cells={gridData.cells}
            unassignedBookings={gridData.unassigned_bookings}
            combinations={allCombinations}
            serviceStartTime={selectedService?.start_time}
            serviceEndTime={selectedService?.end_time}
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
                if (oldTableIds.length > 0 && oldTableIds[0] !== tableId) {
                  void handleReassign(moveBookingId, oldTableIds, [tableId]);
                }
                const currentStart = gridData.cells.find((c) => c.booking_id === moveBookingId)?.booking_details?.start_time?.slice(0, 5);
                if (currentStart && currentStart !== time) {
                  void handleTimeChange(moveBookingId, time);
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
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
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
        )}
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
                  setWalkInSuggestionsLoading(true);
                  setWalkInCell({ tableId: cellContext.tableId, time: cellContext.time });
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
                    <p><span className="font-medium">Time:</span> {block ? `${new Date(block.start_at).toISOString().slice(11, 16)}-${new Date(block.end_at).toISOString().slice(11, 16)}` : '—'}</p>
                    <p><span className="font-medium">Reason:</span> {block?.reason ?? '—'}</p>
                    <p><span className="font-medium">Created:</span> {block ? new Date(block.created_at).toLocaleString() : '—'}</p>
                    <p><span className="font-medium">Created by:</span> {block?.created_by ?? '—'}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">New Booking</h3>
            <p className="mt-1 text-xs text-slate-500">Shared booking form used across operational surfaces.</p>
            <div className="mt-4">
              <SharedNewBookingForm
                date={date}
                initialTime={newBookingCell.time || (selectedService?.start_time?.slice(0, 5) ?? '18:00')}
                defaultTableId={newBookingCell.tableId || undefined}
                tables={gridData?.tables ?? []}
                availableTimes={availableTimesForNewBooking}
                onCreated={() => {
                  addToast('Booking created', 'success');
                  setNewBookingCell(null);
                  fetchGrid();
                }}
                onCancel={() => setNewBookingCell(null)}
              />
            </div>
          </div>
        </div>
      )}
      {walkInCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">Walk-in</h3>
            <div className="mt-3 space-y-2">
              <input
                value={quickBooking.name}
                onChange={(e) => setQuickBooking((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Guest name (optional)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={quickBooking.phone}
                onChange={(e) => setQuickBooking((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone (optional)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                value={quickBooking.party_size}
                onChange={(e) => setQuickBooking((prev) => ({ ...prev, party_size: Number(e.target.value) || 1 }))}
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={walkInCell.time}
                onChange={(e) => setWalkInCell((prev) => prev ? { ...prev, time: e.target.value } : prev)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {walkInSuggestions.length > 0 ? (
                <div className="relative rounded-lg border border-slate-200 bg-slate-50 p-2">
                  {walkInSuggestionsLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/60">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                    </div>
                  )}
                  <p className="text-[11px] font-semibold text-slate-600">Suggested tables</p>
                  <MiniWalkInPreview
                    tables={gridData?.tables ?? []}
                    highlightedTableIds={
                      (walkInSuggestions.find((suggestion) => `${suggestion.source}:${suggestion.table_ids.join('|')}` === selectedWalkInSuggestionKey)?.table_ids)
                      ?? walkInSuggestions[0]?.table_ids
                      ?? []
                    }
                  />
                  <div className="mt-1 space-y-1">
                    {walkInSuggestions.slice(0, 4).map((suggestion, index) => {
                      const key = `${suggestion.source}:${suggestion.table_ids.join('|')}`;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedWalkInSuggestionKey(key)}
                          className={`w-full rounded border px-2 py-1 text-left text-xs ${
                            selectedWalkInSuggestionKey === key
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-medium">{index === 0 ? 'Best fit: ' : ''}{suggestion.table_names.join(' + ')}</span>
                          <span className="ml-1 text-[10px] text-slate-500">Cap {suggestion.combined_capacity}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : walkInSuggestionsLoading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                  <div className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-slate-600" />
                    Loading available table suggestions...
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  No tables currently available for a party of {quickBooking.party_size}. You can add this guest to the waitlist instead.
                  <div className="mt-1">
                    <a href="/dashboard/waitlist" className="font-semibold underline">
                      Add to Waitlist
                    </a>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const selectedSuggestion = walkInSuggestions.find((suggestion) => `${suggestion.source}:${suggestion.table_ids.join('|')}` === selectedWalkInSuggestionKey);
                  const tableIds = selectedSuggestion?.table_ids ?? [walkInCell.tableId];
                  const res = await fetch('/api/venue/bookings/walk-in', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      table_id: tableIds.length === 1 ? tableIds[0] : undefined,
                      booking_date: date,
                      booking_time: walkInCell.time,
                      party_size: quickBooking.party_size,
                      name: quickBooking.name || 'Walk-in',
                      phone: quickBooking.phone || undefined,
                    }),
                  });
                  if (!res.ok) {
                    const payload = await res.json().catch(() => ({}));
                    addToast(payload.error ?? 'Failed to create walk-in', 'error');
                    return;
                  }
                  const payload = await res.json();
                  if (payload?.id && tableIds.length > 1) {
                    const assignRes = await fetch('/api/venue/tables/assignments', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ booking_id: payload.id, table_ids: tableIds }),
                    });
                    if (!assignRes.ok) {
                      const assignmentPayload = await assignRes.json().catch(() => ({}));
                      addToast(assignmentPayload.error ?? 'Walk-in created but table assignment failed', 'error');
                      return;
                    }
                  }
                  addToast('Walk-in created', 'success');
                  setWalkInCell(null);
                  fetchGrid();
                }}
                disabled={walkInSuggestionsLoading}
                className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                Seat Walk-in
              </button>
              <button
                type="button"
                onClick={() => setWalkInCell(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
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

function MiniWalkInPreview({
  tables,
  highlightedTableIds,
}: {
  tables: TableGridData['tables'];
  highlightedTableIds: string[];
}) {
  const positioned = tables.filter((table) => table.position_x != null && table.position_y != null);
  if (positioned.length === 0) return null;
  return (
    <div className="relative mt-2 h-24 rounded border border-slate-200 bg-white">
      {positioned.slice(0, 25).map((table) => {
        const selected = highlightedTableIds.includes(table.id);
        return (
          <div
            key={table.id}
            className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border text-[8px] leading-4 text-center ${
              selected ? 'border-emerald-500 bg-emerald-100 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-500'
            }`}
            style={{ left: `${table.position_x}%`, top: `${table.position_y}%` }}
            title={table.name}
          >
            {table.name.slice(0, 1)}
          </div>
        );
      })}
    </div>
  );
}
