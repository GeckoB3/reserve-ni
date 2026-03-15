'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { VenueTable, TableGridData, TableBlock, UndoAction } from '@/types/table-management';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { getTableStatus, type TableOperationalStatus } from '@/lib/table-management/table-status';
import { UnifiedBookingForm } from '@/components/booking/UnifiedBookingForm';
import { UndoToast } from '@/app/dashboard/table-grid/UndoToast';
import { BookingDetailPanel } from '@/app/dashboard/bookings/BookingDetailPanel';
import { ViewToolbar } from '@/components/dashboard/ViewToolbar';
import { WalkInModal } from '@/app/dashboard/bookings/WalkInModal';
import { useToast } from '@/components/ui/Toast';
import { detectAdjacentTables, type CombinationTable } from '@/lib/table-management/combination-engine';
import { BOOKING_REVERT_ACTIONS, canMarkNoShowForSlot, canTransitionBookingStatus, isDestructiveBookingStatus, isRevertTransition, type BookingStatus } from '@/lib/table-management/booking-status';
import { computeValidMoveTargets, resolveDropTarget, type CombinationInfo, type BookingMoveContext } from '@/lib/table-management/move-validation';
import type { FloorDragEvent } from './LiveFloorCanvas';

const LiveFloorCanvas = dynamic(() => import('./LiveFloorCanvas'), { ssr: false });

interface BookingOnTable {
  id: string;
  guest_name: string;
  party_size: number;
  start_time: string;
  estimated_end_time: string | null;
  status: string;
  dietary_notes: string | null;
  occasion: string | null;
  deposit_status?: string | null;
}

interface TableWithState extends VenueTable {
  service_status: TableOperationalStatus;
  booking: BookingOnTable | null;
  elapsed_pct: number;
}

interface DefinedCombination {
  id: string;
  name: string;
  tableIds: string[];
}

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}


export function FloorPlanLiveView({ isAdmin = false, venueId }: { isAdmin?: boolean; venueId: string }) {
  const { addToast } = useToast();
  const [tables, setTables] = useState<VenueTable[]>([]);
  const [gridData, setGridData] = useState<TableGridData | null>(null);
  const [blocks, setBlocks] = useState<TableBlock[]>([]);
  const [bookingMap, setBookingMap] = useState<Map<string, BookingOnTable>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [combinedTableGroups, setCombinedTableGroups] = useState<Map<string, string[]>>(new Map());
  const [definedCombinations, setDefinedCombinations] = useState<DefinedCombination[]>([]);
  const [manualCombinations, setManualCombinations] = useState<CombinationInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [selectedTime, setSelectedTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });
  const [debouncedTime, setDebouncedTime] = useState(selectedTime);
  const [noShowGraceMinutes, setNoShowGraceMinutes] = useState(15);
  const [combinationThreshold, setCombinationThreshold] = useState(80);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  // Booking detail panel
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

  // Booking creation / walk-in
  const [showNewBookingForm, setShowNewBookingForm] = useState(false);
  const [showWalkInModal, setShowWalkInModal] = useState(false);

  // Drag/drop & reassign
  const [reassignMode, setReassignMode] = useState<{ bookingId: string; guestName: string; oldTableIds: string[] } | null>(null);
  const [validDropTargets, setValidDropTargets] = useState<Set<string> | null>(null);
  const [validDropComboLabels, setValidDropComboLabels] = useState<Map<string, string> | null>(null);
  const [dragSourceTableIds, setDragSourceTableIds] = useState<string[]>([]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedTime(selectedTime), 300);
    return () => clearTimeout(timeout);
  }, [selectedTime]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tablesRes, gridRes, combosRes, blocksRes] = await Promise.all([
        fetch('/api/venue/tables'),
        fetch(`/api/venue/tables/availability?date=${selectedDate}`),
        fetch('/api/venue/tables/combinations'),
        fetch(`/api/venue/tables/blocks?date=${selectedDate}`),
      ]);

      if (combosRes.ok) {
        const cData = await combosRes.json();
        const links: DefinedCombination[] = (cData.combinations ?? []).map(
          (c: { id: string; name: string; members?: { table_id: string }[]; combined_max_covers?: number }) => ({
            id: c.id,
            name: c.name,
            tableIds: (c.members ?? []).map((m: { table_id: string }) => m.table_id),
          })
        );
        setDefinedCombinations(links);
        const manual: CombinationInfo[] = (cData.combinations ?? []).map(
          (c: { id: string; name: string; combined_min_covers?: number; combined_max_covers?: number; members?: { table_id: string }[] }) => ({
            id: c.id,
            name: c.name,
            combined_min_covers: c.combined_min_covers,
            combined_max_covers: c.combined_max_covers ?? 0,
            table_ids: (c.members ?? []).map((m: { table_id: string }) => m.table_id),
          })
        );
        setManualCombinations(manual);
      }

      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setTables((data.tables ?? []).filter((t: VenueTable) => t.is_active));
        setNoShowGraceMinutes(data.settings?.no_show_grace_minutes ?? 15);
        setCombinationThreshold(data.settings?.combination_threshold ?? 80);
      }

      if (gridRes.ok) {
        const grid = await gridRes.json();
        setGridData(grid);

        const map = new Map<string, BookingOnTable>();
        const groups = new Map<string, string[]>();
        for (const cell of grid.cells ?? []) {
          if (!cell.booking_id || !cell.booking_details) continue;
          if (!map.has(cell.booking_id)) {
            map.set(cell.booking_id, {
              id: cell.booking_id,
              guest_name: cell.booking_details.guest_name,
              party_size: cell.booking_details.party_size,
              start_time: cell.booking_details.start_time,
              estimated_end_time: cell.booking_details.end_time ? `${selectedDate}T${cell.booking_details.end_time}:00.000Z` : null,
              status: cell.booking_details.status,
              deposit_status: cell.booking_details.deposit_status ?? null,
              dietary_notes: cell.booking_details.dietary_notes,
              occasion: cell.booking_details.occasion,
            });
          }
          const existing = groups.get(cell.booking_id) ?? [];
          if (!existing.includes(cell.table_id)) existing.push(cell.table_id);
          groups.set(cell.booking_id, existing);
        }
        setBookingMap(map);
        const multiGroups = new Map<string, string[]>();
        groups.forEach((tids, bid) => {
          if (tids.length > 1) multiGroups.set(bid, tids);
        });
        setCombinedTableGroups(multiGroups);
      } else {
        setGridData(null);
      }

      if (blocksRes.ok) {
        const blockPayload = await blocksRes.json();
        setBlocks(blockPayload.blocks ?? []);
      }
    } catch (err) {
      console.error('Failed to load floor plan data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const liveState = useVenueLiveSync({ venueId, date: selectedDate, onChange: fetchData });

  const tablesWithState: TableWithState[] = useMemo(() => {
    const now = Date.now();
    const dateTime = `${selectedDate}T${debouncedTime}:00.000Z`;
    const bookingsForStatus = Array.from(bookingMap.values()).map((booking) => ({
      id: booking.id,
      status: booking.status as 'Pending' | 'Confirmed' | 'Seated' | 'Completed' | 'No-Show' | 'Cancelled',
      booking_time: booking.start_time,
      estimated_end_time: booking.estimated_end_time,
    }));
    const assignmentPairs: Array<{ booking_id: string; table_id: string }> = [];
    const seenAssignment = new Set<string>();
    for (const cell of gridData?.cells ?? []) {
      if (!cell.booking_id) continue;
      const key = `${cell.booking_id}::${cell.table_id}`;
      if (seenAssignment.has(key)) continue;
      seenAssignment.add(key);
      assignmentPairs.push({ booking_id: cell.booking_id, table_id: cell.table_id });
    }
    return tables.map((t) => {
      const tableStatus = getTableStatus(t.id, dateTime, bookingsForStatus, assignmentPairs, blocks);
      const activeCell = (gridData?.cells ?? []).find((cell) => {
        if (cell.table_id !== t.id || !cell.booking_id || !cell.booking_details) return false;
        const currentMin = Number(debouncedTime.slice(0, 2)) * 60 + Number(debouncedTime.slice(3, 5));
        const startMin = Number(cell.booking_details.start_time.slice(0, 2)) * 60 + Number(cell.booking_details.start_time.slice(3, 5));
        const endMin = cell.booking_details.end_time
          ? Number(cell.booking_details.end_time.slice(0, 2)) * 60 + Number(cell.booking_details.end_time.slice(3, 5))
          : startMin + 90;
        return currentMin >= startMin && currentMin < endMin;
      });
      const booking = activeCell?.booking_id ? bookingMap.get(activeCell.booking_id) ?? null : null;

      let elapsedPct = 0;
      if (booking?.start_time && booking?.estimated_end_time) {
        const [y, mo, d] = selectedDate.split('-').map(Number);
        const [h, m] = booking.start_time.split(':').map(Number);
        const startMs = new Date(y!, mo! - 1, d!, h!, m!).getTime();
        const endMs = new Date(booking.estimated_end_time).getTime();
        const totalMs = endMs - startMs;
        if (totalMs > 0) {
          elapsedPct = Math.min(100, Math.max(0, ((now - startMs) / totalMs) * 100));
        }
      }

      return { ...t, service_status: tableStatus, booking, elapsed_pct: elapsedPct };
    });
  }, [tables, bookingMap, selectedDate, debouncedTime, gridData, blocks]);

  // Build all combinations (manual + auto-detected) -- same as table grid
  const allCombinations = useMemo((): CombinationInfo[] => {
    if (!gridData) return manualCombinations;
    const comboTables: CombinationTable[] = gridData.tables.map((t) => ({
      id: t.id, name: t.name, max_covers: t.max_covers, is_active: t.is_active,
      position_x: t.position_x, position_y: t.position_y, width: t.width, height: t.height, rotation: t.rotation,
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
        autoCombos.push({ id: `auto_${key}`, name: `${t1.name} + ${t2.name}`, combined_max_covers: t1.max_covers + t2.max_covers, table_ids: [tableId, neighborId].sort() });
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
          autoCombos.push({ id: `auto_${key}`, name: `${t1.name} + ${t2.name} + ${t3.name}`, combined_max_covers: t1.max_covers + t2.max_covers + t3.max_covers, table_ids: [tableId, neighbor1, neighbor2].sort() });
        }
      }
    }

    const manualKeys = new Set(manualCombinations.map((c) => [...c.table_ids].sort().join('|')));
    const merged = [...manualCombinations];
    for (const auto of autoCombos) {
      if (!manualKeys.has(auto.table_ids.join('|'))) merged.push(auto);
    }
    return merged;
  }, [gridData, manualCombinations, combinationThreshold]);

  const summaryData = useMemo(() => {
    if (!gridData) return { total_covers_booked: 0, total_covers_capacity: 0, tables_in_use: 0, tables_total: 0, unassigned_count: 0, combos_in_use: 0 };
    return gridData.summary ?? {
      total_covers_booked: tablesWithState.filter((t) => t.booking).reduce((s, t) => s + (t.booking?.party_size ?? 0), 0),
      total_covers_capacity: tablesWithState.reduce((s, t) => s + t.max_covers, 0),
      tables_in_use: tablesWithState.filter((t) => t.service_status !== 'available').length,
      tables_total: tablesWithState.length,
      unassigned_count: (gridData?.unassigned_bookings ?? []).length,
      combos_in_use: combinedTableGroups.size,
    };
  }, [gridData, tablesWithState, combinedTableGroups]);

  // --- Status change handlers ---
  const handleBookingStatusChange = useCallback(async (bookingId: string, currentStatus: BookingStatus, newStatus: BookingStatus) => {
    if (!canTransitionBookingStatus(currentStatus, newStatus)) {
      addToast(`Cannot change from ${currentStatus} to ${newStatus}`, 'error');
      return false;
    }
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        addToast(payload.error ?? 'Status change failed', 'error');
        return false;
      }
      setUndoAction({
        id: crypto.randomUUID(), type: 'change_status',
        description: `Status changed to ${newStatus}`, timestamp: Date.now(),
        previous_state: { bookingId, status: currentStatus },
        current_state: { bookingId, status: newStatus },
      });
      addToast('Booking status updated', 'success');
      fetchData();
      return true;
    } catch (err) {
      console.error('Status change failed:', err);
      addToast('Status change failed', 'error');
      return false;
    }
  }, [fetchData, addToast]);

  const requestBookingStatusChange = useCallback(async (bookingId: string, currentStatus: BookingStatus, newStatus: BookingStatus) => {
    if (newStatus === 'No-Show') {
      const bookingStart = bookingMap.get(bookingId)?.start_time ?? '00:00';
      if (!canMarkNoShowForSlot(selectedDate, bookingStart, noShowGraceMinutes)) {
        addToast('No-show can only be marked after booking start time', 'error');
        return;
      }
    }
    const booking = bookingMap.get(bookingId);
    const guestName = booking?.guest_name ?? 'Guest';
    const partySize = booking?.party_size ?? '?';
    const time = booking?.start_time?.slice(0, 5) ?? '';
    if (isRevertTransition(currentStatus, newStatus)) {
      const revertAction = BOOKING_REVERT_ACTIONS[currentStatus];
      setConfirmDialog({
        title: revertAction?.label ?? `Revert to ${newStatus}`,
        message: `${guestName} (${partySize}) at ${time} will be changed from ${currentStatus} back to ${newStatus}.`,
        confirmLabel: revertAction?.label ?? `Revert to ${newStatus}`,
        onConfirm: () => { void handleBookingStatusChange(bookingId, currentStatus, newStatus); },
      });
      return;
    }
    if (isDestructiveBookingStatus(newStatus)) {
      setConfirmDialog({
        title: `Mark ${newStatus}`,
        message: `${guestName} (${partySize}) at ${time} will be marked ${newStatus}.`,
        confirmLabel: `Mark ${newStatus}`,
        onConfirm: () => { void handleBookingStatusChange(bookingId, currentStatus, newStatus); },
      });
      return;
    }
    await handleBookingStatusChange(bookingId, currentStatus, newStatus);
  }, [addToast, bookingMap, handleBookingStatusChange, selectedDate, noShowGraceMinutes]);

  // --- Reassignment/assignment ---
  const handleReassign = useCallback(async (bookingId: string, oldTableIds: string[], newTableIds: string[]) => {
    try {
      const res = await fetch('/api/venue/tables/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reassign', booking_id: bookingId, old_table_ids: oldTableIds, new_table_ids: newTableIds }),
      });
      if (res.ok) {
        setUndoAction({
          id: crypto.randomUUID(), type: 'reassign_table',
          description: 'Table reassigned', timestamp: Date.now(),
          previous_state: { bookingId, tableIds: oldTableIds },
          current_state: { bookingId, tableIds: newTableIds },
        });
        addToast('Table reassigned', 'success');
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.error ?? 'Failed to reassign table', 'error');
      }
    } catch (err) {
      console.error('Reassign failed:', err);
      addToast('Failed to reassign table', 'error');
    }
  }, [fetchData, addToast]);

  const handleAssign = useCallback(async (bookingId: string, tableIds: string[]) => {
    try {
      const res = await fetch('/api/venue/tables/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, table_ids: tableIds }),
      });
      if (res.ok) {
        addToast('Table assigned', 'success');
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.error ?? 'Failed to assign table', 'error');
      }
    } catch (err) {
      console.error('Assign failed:', err);
      addToast('Failed to assign table', 'error');
    }
  }, [fetchData, addToast]);

  const undoStatusChange = useCallback(async () => {
    if (!undoAction) return;
    if (undoAction.type === 'change_status') {
      const bookingId = String(undoAction.previous_state.bookingId ?? '');
      const previousStatus = String(undoAction.previous_state.status ?? '') as BookingStatus;
      const currentStatus = String(undoAction.current_state.status ?? '') as BookingStatus;
      if (bookingId && previousStatus && currentStatus) {
        setUndoAction(null);
        await handleBookingStatusChange(bookingId, currentStatus, previousStatus);
      }
    } else if (undoAction.type === 'reassign_table') {
      const bookingId = String(undoAction.previous_state.bookingId ?? '');
      const oldTableIds = (undoAction.previous_state.tableIds ?? []) as string[];
      const newTableIds = (undoAction.current_state.tableIds ?? []) as string[];
      if (bookingId && oldTableIds.length > 0) {
        setUndoAction(null);
        await handleReassign(bookingId, newTableIds, oldTableIds);
      }
    }
  }, [undoAction, handleBookingStatusChange, handleReassign]);

  // --- Drag/drop validation ---
  const startDragValidation = useCallback((bookingId: string, sourceTableIds: string[]) => {
    const booking = bookingMap.get(bookingId);
    if (!booking || !gridData) return;
    setDragSourceTableIds(sourceTableIds);
    const context: BookingMoveContext = {
      id: bookingId,
      party_size: booking.party_size,
      start_time: booking.start_time,
      end_time: booking.estimated_end_time
        ? new Date(booking.estimated_end_time).toISOString().slice(11, 16)
        : '',
    };
    const tableInfos = gridData.tables.map((t) => ({ id: t.id, name: t.name, max_covers: t.max_covers, position_x: t.position_x, position_y: t.position_y, width: t.width, height: t.height, rotation: t.rotation }));
    const result = computeValidMoveTargets(context, tableInfos, gridData.cells, allCombinations);
    setValidDropTargets(result.validTableIds);
    setValidDropComboLabels(result.comboLabels.size > 0 ? result.comboLabels : null);
  }, [bookingMap, gridData, allCombinations]);

  const clearDragValidation = useCallback(() => {
    setValidDropTargets(null);
    setValidDropComboLabels(null);
    setDragSourceTableIds([]);
  }, []);

  const handleFloorDragEnd = useCallback((event: FloorDragEvent) => {
    const booking = bookingMap.get(event.bookingId);
    if (!booking || !gridData) {
      clearDragValidation();
      return;
    }
    const context: BookingMoveContext = {
      id: event.bookingId,
      party_size: booking.party_size,
      start_time: booking.start_time,
      end_time: booking.estimated_end_time
        ? new Date(booking.estimated_end_time).toISOString().slice(11, 16)
        : '',
    };
    const tableInfos = gridData.tables.map((t) => ({ id: t.id, name: t.name, max_covers: t.max_covers, position_x: t.position_x, position_y: t.position_y, width: t.width, height: t.height, rotation: t.rotation }));
    const targetTableIds = resolveDropTarget(event.targetTableId, context, tableInfos, gridData.cells, allCombinations);
    clearDragValidation();

    if (!targetTableIds) {
      addToast('Cannot move booking to that table', 'error');
      return;
    }

    const oldTableIds = event.sourceTableIds.length > 0 ? event.sourceTableIds : dragSourceTableIds;
    if (oldTableIds.length > 0) {
      void handleReassign(event.bookingId, oldTableIds, targetTableIds);
    } else {
      void handleAssign(event.bookingId, targetTableIds);
    }
  }, [bookingMap, gridData, allCombinations, clearDragValidation, addToast, handleReassign, handleAssign, dragSourceTableIds]);

  // Click-based reassign mode
  const handleTableSelect = useCallback((id: string | null) => {
    if (reassignMode && id) {
      const booking = bookingMap.get(reassignMode.bookingId);
      if (!booking || !gridData) return;
      const context: BookingMoveContext = {
        id: reassignMode.bookingId,
        party_size: booking.party_size,
        start_time: booking.start_time,
        end_time: booking.estimated_end_time
          ? new Date(booking.estimated_end_time).toISOString().slice(11, 16)
          : '',
      };
      const tableInfos = gridData.tables.map((t) => ({ id: t.id, name: t.name, max_covers: t.max_covers, position_x: t.position_x, position_y: t.position_y, width: t.width, height: t.height, rotation: t.rotation }));
      const targetTableIds = resolveDropTarget(id, context, tableInfos, gridData.cells, allCombinations);
      if (!targetTableIds) {
        addToast('Cannot move booking to that table', 'error');
        return;
      }
      void handleReassign(reassignMode.bookingId, reassignMode.oldTableIds, targetTableIds);
      setReassignMode(null);
      clearDragValidation();
      return;
    }
    setSelectedTableId(id);
  }, [reassignMode, bookingMap, gridData, allCombinations, addToast, handleReassign, clearDragValidation]);

  const startReassignMode = useCallback((bookingId: string) => {
    const booking = bookingMap.get(bookingId);
    if (!booking) return;
    const oldTableIds = Array.from(new Set(
      (gridData?.cells ?? []).filter((c) => c.booking_id === bookingId).map((c) => c.table_id)
    ));
    setReassignMode({ bookingId, guestName: booking.guest_name, oldTableIds });
    setSelectedTableId(null);
    startDragValidation(bookingId, oldTableIds);
  }, [bookingMap, gridData, startDragValidation]);

  const selectedTable = useMemo(() => {
    if (!selectedTableId) return null;
    return tablesWithState.find((t) => t.id === selectedTableId) ?? null;
  }, [selectedTableId, tablesWithState]);

  // Walk-in handler

  // --- Render ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900">No Active Tables</h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500">Add tables first to start using the live floor plan.</p>
      </div>
    );
  }

  const hasPositions = tables.some((t) => t.position_x != null && t.position_y != null);
  if (!hasPositions) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900">No Floor Plan Set Up</h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500">Arrange your tables on the floor plan editor first.</p>
        {isAdmin ? (
          <p className="mt-4 text-xs text-slate-500">Use Edit Layout to arrange your tables.</p>
        ) : (
          <p className="mt-4 text-xs text-slate-500">Ask an admin to set up your floor plan.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col space-y-3">
      <ViewToolbar
        summary={summaryData}
        date={selectedDate}
        onDateChange={setSelectedDate}
        liveState={liveState}
        onRefresh={fetchData}
        onNewBooking={() => setShowNewBookingForm(true)}
        onWalkIn={() => setShowWalkInModal(true)}
      >
        <input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm" />
      </ViewToolbar>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
        {reassignMode && (
          <div className="absolute left-4 right-4 top-4 z-30 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 shadow-sm">
            <span>Click a highlighted table to move <strong>{reassignMode.guestName}</strong></span>
            <button type="button" onClick={() => { setReassignMode(null); clearDragValidation(); }} className="font-semibold text-amber-700 underline">Cancel</button>
          </div>
        )}
        <LiveFloorCanvas
          tables={tablesWithState}
          selectedId={selectedTableId}
          combinedTableGroups={combinedTableGroups}
          definedCombinations={definedCombinations}
          validDropTargets={validDropTargets}
          validDropComboLabels={validDropComboLabels}
          reassignMode={reassignMode ? { bookingId: reassignMode.bookingId, guestName: reassignMode.guestName } : null}
          onSelect={handleTableSelect}
          onDragStart={startDragValidation}
          onDragEnd={handleFloorDragEnd}
          onDragCancel={clearDragValidation}
        />
      </div>

      {/* Table detail bottom sheet */}
      {selectedTable && !detailBookingId && (
        <div className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-h-[60vh] max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl lg:bottom-6 lg:left-auto lg:right-6 lg:max-h-[calc(100vh-12rem)] lg:max-w-sm lg:rounded-2xl lg:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">{selectedTable.name}</h3>
              <p className="text-xs text-slate-500">{selectedTable.max_covers} covers · {selectedTable.zone ?? 'No zone'}</p>
            </div>
            <button aria-label="Close" onClick={() => setSelectedTableId(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {selectedTable.booking && (
            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{selectedTable.booking.guest_name}</p>
                  <p className="text-xs text-slate-600">Party of {selectedTable.booking.party_size} · {selectedTable.booking.start_time.slice(0, 5)}</p>
                </div>
                <button type="button" onClick={() => setDetailBookingId(selectedTable.booking!.id)} className="rounded-lg border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
                  Full Details
                </button>
              </div>
              {(combinedTableGroups.get(selectedTable.booking.id)?.length ?? 0) > 1 && (
                <p className="mt-1.5 text-[10px] font-medium text-purple-700">
                  Combined: {(combinedTableGroups.get(selectedTable.booking.id) ?? []).map((tid) => tablesWithState.find((t) => t.id === tid)?.name ?? tid).join(' + ')}
                </p>
              )}
              {selectedTable.elapsed_pct > 0 && (
                <div className="mt-2 h-1.5 rounded-full bg-blue-200">
                  <div className={`h-1.5 rounded-full transition-all ${selectedTable.elapsed_pct > 90 ? 'bg-red-500' : selectedTable.elapsed_pct > 75 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${selectedTable.elapsed_pct}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedTable.service_status === 'available' && (
              <>
                <button onClick={() => { setShowNewBookingForm(true); }} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">New Booking</button>
                <button onClick={async () => {
                  const [h, m] = selectedTime.split(':').map(Number);
                  const start = `${selectedDate}T${selectedTime}:00.000Z`;
                  const endMin = (h ?? 0) * 60 + (m ?? 0) + 60;
                  const end = `${selectedDate}T${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}:00.000Z`;
                  await fetch('/api/venue/tables/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_id: selectedTable.id, start_at: start, end_at: end, reason: 'Manual hold' }) });
                  fetchData();
                }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Block Table</button>
              </>
            )}
            {(selectedTable.service_status === 'booked' || selectedTable.service_status === 'pending') && selectedTable.booking?.id && (
              <>
                <button onClick={() => { void requestBookingStatusChange(selectedTable.booking!.id, selectedTable.booking!.status as BookingStatus, 'Seated'); }} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">Seat Guest</button>
                <button onClick={() => startReassignMode(selectedTable.booking!.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Move</button>
                <button onClick={() => setDetailBookingId(selectedTable.booking!.id)} className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">Details</button>
                <button onClick={() => { void requestBookingStatusChange(selectedTable.booking!.id, selectedTable.booking!.status as BookingStatus, 'No-Show'); }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">No-Show</button>
                <button onClick={() => { void requestBookingStatusChange(selectedTable.booking!.id, selectedTable.booking!.status as BookingStatus, 'Cancelled'); }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Cancel</button>
              </>
            )}
            {selectedTable.service_status === 'seated' && selectedTable.booking?.id && (
              <>
                <button onClick={() => { void requestBookingStatusChange(selectedTable.booking!.id, selectedTable.booking!.status as BookingStatus, 'Completed'); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Complete</button>
                <button onClick={() => startReassignMode(selectedTable.booking!.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Move</button>
                <button onClick={() => setDetailBookingId(selectedTable.booking!.id)} className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">Details</button>
                <button onClick={() => { void requestBookingStatusChange(selectedTable.booking!.id, selectedTable.booking!.status as BookingStatus, 'Confirmed'); }} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">Unseat</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Booking detail panel */}
      {detailBookingId && (
        <BookingDetailPanel
          bookingId={detailBookingId}
          onClose={() => setDetailBookingId(null)}
          onUpdated={() => { fetchData(); }}
        />
      )}

      {/* New booking form */}
      {showNewBookingForm && (
        <UnifiedBookingForm
          asModal
          venueId={venueId}
          advancedMode
          initialDate={selectedDate}
          onCreated={() => { setShowNewBookingForm(false); fetchData(); }}
          onClose={() => setShowNewBookingForm(false)}
        />
      )}

      {/* Walk-in modal */}
      {showWalkInModal && (
        <WalkInModal
          advancedMode
          initialDate={selectedDate}
          initialTime={selectedTime}
          onClose={() => setShowWalkInModal(false)}
          onCreated={() => { setShowWalkInModal(false); fetchData(); }}
        />
      )}

      {/* Undo toast */}
      {undoAction && (
        <UndoToast action={undoAction} onUndo={() => { void undoStatusChange(); }} onDismiss={() => setUndoAction(null)} />
      )}

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmDialog(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">{confirmDialog.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{confirmDialog.message}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">{confirmDialog.confirmLabel}</button>
              <button type="button" onClick={() => setConfirmDialog(null)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
