'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { VenueTable, TableGridData, TableBlock } from '@/types/table-management';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { getTableStatus, type TableOperationalStatus } from '@/lib/table-management/table-status';
import { SharedNewBookingForm } from '@/app/dashboard/bookings/SharedNewBookingForm';

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

const OPERATIONAL_STATUS_LABELS: Record<TableOperationalStatus, string> = {
  available: 'Available',
  booked: 'Booked',
  pending: 'Pending',
  seated: 'Seated',
  held: 'Held / Blocked',
  no_show: 'No Show',
};

interface DefinedCombination {
  id: string;
  name: string;
  tableIds: string[];
}

export function FloorPlanLiveView({ isAdmin = false, venueId }: { isAdmin?: boolean; venueId: string }) {
  const formatDateInput = (d: Date): string => {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [tables, setTables] = useState<VenueTable[]>([]);
  const [gridData, setGridData] = useState<TableGridData | null>(null);
  const [blocks, setBlocks] = useState<TableBlock[]>([]);
  const [bookingMap, setBookingMap] = useState<Map<string, BookingOnTable>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableWithState | null>(null);
  const [combinedTableGroups, setCombinedTableGroups] = useState<Map<string, string[]>>(new Map());
  const [definedCombinations, setDefinedCombinations] = useState<DefinedCombination[]>([]);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInParty, setWalkInParty] = useState(2);
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(new Date()));
  const [selectedTime, setSelectedTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });
  const [debouncedTime, setDebouncedTime] = useState(selectedTime);
  const [showAssignList, setShowAssignList] = useState(false);
  const [showQuickBookingForm, setShowQuickBookingForm] = useState(false);
  const [reassignMode, setReassignMode] = useState<{
    bookingId: string;
    guestName: string;
    oldTableIds: string[];
  } | null>(null);

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
          (c: { id: string; name: string; members?: { table_id: string }[] }) => ({
            id: c.id,
            name: c.name,
            tableIds: (c.members ?? []).map((m: { table_id: string }) => m.table_id),
          })
        );
        setDefinedCombinations(links);
      }

      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setTables((data.tables ?? []).filter((t: VenueTable) => t.is_active));
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
      const tableStatus = getTableStatus(
        t.id,
        dateTime,
        bookingsForStatus,
        assignmentPairs,
        blocks
      );
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
        const [y, mo, d] = new Date().toISOString().slice(0, 10).split('-').map(Number);
        const [h, m] = booking.start_time.split(':').map(Number);
        const startMs = new Date(y!, mo! - 1, d!, h!, m!).getTime();
        const endMs = new Date(booking.estimated_end_time).getTime();
        const totalMs = endMs - startMs;
        if (totalMs > 0) {
          elapsedPct = Math.min(100, Math.max(0, ((now - startMs) / totalMs) * 100));
        }
      }

      return {
        ...t,
        service_status: tableStatus,
        booking,
        elapsed_pct: elapsedPct,
      };
    });
  }, [tables, bookingMap, selectedDate, debouncedTime, gridData, blocks]);

  const handleBookingStatusChange = useCallback(async (bookingId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        console.error('Status change failed:', payload.error ?? res.statusText);
        return;
      }
      fetchData();
    } catch (err) {
      console.error('Status change failed:', err);
    }
  }, [fetchData]);

  const summary = useMemo(() => {
    const total = tablesWithState.length;
    const seated = tablesWithState.filter((t) => t.service_status !== 'available').length;
    const available = total - seated;
    const totalCovers = tablesWithState.reduce((sum, t) => sum + t.max_covers, 0);
    const usedCovers = tablesWithState
      .filter((t) => t.booking)
      .reduce((sum, t) => sum + (t.booking?.party_size ?? 0), 0);
    return { total, seated, available, totalCovers, usedCovers };
  }, [tablesWithState]);

  const unassignedBookings = useMemo(() => {
    return gridData?.unassigned_bookings ?? [];
  }, [gridData]);

  const selectedBlock = useMemo(() => {
    if (!selectedTable) return null;
    const nowMin = Number(debouncedTime.slice(0, 2)) * 60 + Number(debouncedTime.slice(3, 5));
    return blocks.find((block) => {
      if (block.table_id !== selectedTable.id) return false;
      const start = block.start_at.split('T')[1]?.slice(0, 5) ?? '00:00';
      const end = block.end_at.split('T')[1]?.slice(0, 5) ?? '00:00';
      const startMin = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
      const endMin = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5));
      return nowMin >= startMin && nowMin < endMin;
    }) ?? null;
  }, [selectedTable, blocks, debouncedTime]);

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
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900">No Active Tables</h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          Add tables first to start using the live floor plan.
        </p>
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
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          Arrange your tables on the floor plan editor first.
        </p>
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
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/80 px-5 py-3 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-xs text-slate-500">Available</span>
            <p className="font-semibold text-green-700">{summary.available}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">In Use</span>
            <p className="font-semibold text-blue-700">{summary.seated}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Covers</span>
            <p className="font-semibold text-slate-900">{summary.usedCovers}/{summary.totalCovers}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Unassigned</span>
            <p className="font-semibold text-amber-700">{unassignedBookings.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          />
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              const recommended = tablesWithState.find((table) => table.service_status === 'available') ?? null;
              if (recommended) setSelectedTable(recommended);
              setShowWalkInForm(true);
            }}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            Walk-in
          </button>
          <button
            type="button"
            onClick={fetchData}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>
      {liveState === 'reconnecting' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Live updates paused - reconnecting...
        </div>
      )}

      <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
        {reassignMode && (
          <div className="absolute left-4 right-4 top-4 z-30 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            Select the destination table for {reassignMode.guestName}.{' '}
            <button
              type="button"
              onClick={() => setReassignMode(null)}
              className="font-semibold text-amber-700 underline"
            >
              Cancel Move
            </button>
          </div>
        )}
        <LiveFloorCanvas
          tables={tablesWithState}
          selectedId={selectedTable?.id ?? null}
          combinedTableGroups={combinedTableGroups}
          definedCombinations={definedCombinations}
          onSelect={(id) => {
            const t = tablesWithState.find((x) => x.id === id);
            setSelectedTable(t ?? null);
            setShowWalkInForm(false);
            if (reassignMode && t) {
              void (async () => {
                  const booking = bookingMap.get(reassignMode.bookingId);
                  let targetTableIds: string[] = [t.id];
                  if (booking) {
                    const params = new URLSearchParams({
                      date: selectedDate,
                      time: booking.start_time.slice(0, 5),
                      party_size: String(booking.party_size),
                      booking_id: booking.id,
                    });
                    const suggestRes = await fetch(`/api/venue/tables/combinations/suggest?${params.toString()}`);
                    if (suggestRes.ok) {
                      const suggestionPayload = await suggestRes.json();
                      const suggestions = suggestionPayload.suggestions ?? [];
                      const preferred =
                        suggestions.find((suggestion: { table_ids: string[] }) => suggestion.table_ids.includes(t.id)) ??
                        suggestions[0] ??
                        null;
                      if (preferred?.table_ids?.length) {
                        targetTableIds = preferred.table_ids;
                      }
                    }
                  }
                const res = await fetch('/api/venue/tables/assignments', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'reassign',
                    booking_id: reassignMode.bookingId,
                    old_table_ids: reassignMode.oldTableIds,
                      new_table_ids: targetTableIds,
                  }),
                });
                if (res.ok) {
                  setReassignMode(null);
                  fetchData();
                }
              })();
            }
          }}
        />
      </div>

      {selectedTable && (
        <div className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-lg rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl lg:bottom-6 lg:left-auto lg:right-6 lg:max-w-sm lg:rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">{selectedTable.name}</h3>
              <p className="text-xs text-slate-500">
                {selectedTable.max_covers} covers · {selectedTable.zone ?? 'No zone'}
              </p>
            </div>
            <button onClick={() => setSelectedTable(null)} className="text-slate-400 hover:text-slate-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs font-medium text-slate-500">Status</p>
            <p className="text-sm font-semibold text-slate-900">
              {OPERATIONAL_STATUS_LABELS[selectedTable.service_status] ?? selectedTable.service_status}
            </p>
          </div>

          {selectedTable.booking && (
            <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2">
              <p className="text-xs font-medium text-blue-500">Current Guest</p>
              <p className="text-sm font-semibold text-blue-900">{selectedTable.booking.guest_name}</p>
              <p className="text-xs text-blue-600">
                Party of {selectedTable.booking.party_size} · {selectedTable.booking.start_time.slice(0, 5)}
              </p>
              <p className="text-[10px] text-blue-500">Ref: {selectedTable.booking.id.slice(0, 8).toUpperCase()}</p>
              {(combinedTableGroups.get(selectedTable.booking.id)?.length ?? 0) > 1 && (
                <p className="mt-1 text-[10px] font-medium text-blue-700">
                  Combined: {(combinedTableGroups.get(selectedTable.booking.id) ?? [])
                    .map((tableId) => tablesWithState.find((table) => table.id === tableId)?.name ?? tableId)
                    .join(' + ')}
                </p>
              )}
              {selectedTable.booking.deposit_status && (
                <div className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  selectedTable.booking.deposit_status === 'Paid'
                    ? 'bg-emerald-100 text-emerald-700'
                    : selectedTable.booking.deposit_status === 'Pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-700'
                }`}>
                  Deposit: {selectedTable.booking.deposit_status}
                </div>
              )}
              {(selectedTable.booking.dietary_notes || selectedTable.booking.occasion) && (
                <p className="mt-1 text-[10px] text-blue-700">
                  {selectedTable.booking.dietary_notes ? `Dietary: ${selectedTable.booking.dietary_notes}` : ''}
                  {selectedTable.booking.dietary_notes && selectedTable.booking.occasion ? ' · ' : ''}
                  {selectedTable.booking.occasion ? `Occasion: ${selectedTable.booking.occasion}` : ''}
                </p>
              )}
              {selectedTable.elapsed_pct > 0 && (
                <div className="mt-1.5">
                  <div className="h-1.5 rounded-full bg-blue-200">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        selectedTable.elapsed_pct > 90 ? 'bg-red-500' :
                        selectedTable.elapsed_pct > 75 ? 'bg-amber-500' :
                        'bg-blue-500'
                      }`}
                      style={{ width: `${selectedTable.elapsed_pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {selectedBlock && (
            <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2">
              <p className="text-xs font-medium text-slate-600">Blocked</p>
              <p className="text-xs text-slate-700">
                {(selectedBlock.start_at.split('T')[1] ?? '').slice(0, 5)}-{(selectedBlock.end_at.split('T')[1] ?? '').slice(0, 5)}
                {selectedBlock.reason ? ` · ${selectedBlock.reason}` : ''}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {selectedTable.service_status === 'available' && (
              <>
                <button
                  onClick={() => setShowQuickBookingForm((prev) => !prev)}
                  className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                >
                  New Booking
                </button>
                <button
                  onClick={() => setShowAssignList((prev) => !prev)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Assign Existing
                </button>
                <button
                  onClick={async () => {
                    const [h, m] = selectedTime.split(':').map(Number);
                    const start = `${selectedDate}T${selectedTime}:00.000Z`;
                    const endMinTotal = (h ?? 0) * 60 + (m ?? 0) + 60;
                    const endH = Math.floor(endMinTotal / 60).toString().padStart(2, '0');
                    const endM = (endMinTotal % 60).toString().padStart(2, '0');
                    const end = `${selectedDate}T${endH}:${endM}:00.000Z`;
                    await fetch('/api/venue/tables/blocks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        table_id: selectedTable.id,
                        start_at: start,
                        end_at: end,
                        reason: 'Manual hold',
                      }),
                    });
                    fetchData();
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Block Table
                </button>
              </>
            )}
            {(selectedTable.service_status === 'reserved' || selectedTable.service_status === 'pending') && selectedTable.booking?.id && (
              <>
                <button
                  onClick={() => handleBookingStatusChange(selectedTable.booking!.id, 'Seated')}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                >
                  Mark Seated
                </button>
                <button
                  onClick={() => handleBookingStatusChange(selectedTable.booking!.id, 'No-Show')}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  No Show
                </button>
                <button
                  onClick={() => {
                    const oldTableIds = Array.from(
                      new Set(
                        (gridData?.cells ?? [])
                          .filter((cell) => cell.booking_id === selectedTable.booking?.id)
                          .map((cell) => cell.table_id)
                      )
                    );
                    setReassignMode({
                      bookingId: selectedTable.booking!.id,
                      guestName: selectedTable.booking!.guest_name,
                      oldTableIds,
                    });
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Move Table
                </button>
                <button
                  onClick={() => handleBookingStatusChange(selectedTable.booking!.id, 'Cancelled')}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Cancel
                </button>
              </>
            )}
            {selectedTable.service_status === 'seated' && selectedTable.booking?.id && (
              <button
                onClick={() => handleBookingStatusChange(selectedTable.booking!.id, 'Completed')}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                Mark Completed / Clear
              </button>
            )}
            {selectedBlock && (
              <button
                onClick={async () => {
                  if (!confirm('Remove this table block?')) return;
                  await fetch('/api/venue/tables/blocks', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: selectedBlock.id }),
                  });
                  fetchData();
                }}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Remove Block
              </button>
            )}
          </div>

          {showWalkInForm && selectedTable.service_status === 'available' && (
            <div className="mt-3 space-y-2 rounded-lg border border-green-200 bg-green-50/50 p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="Guest name"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <input
                  type="tel"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  placeholder="Phone"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">Party:</span>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    onClick={() => setWalkInParty(n)}
                    className={`flex h-7 w-7 items-center justify-center rounded text-xs font-medium ${
                      walkInParty === n ? 'bg-green-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >{n}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={walkInSaving}
                  onClick={async () => {
                    setWalkInSaving(true);
                    try {
                      const res = await fetch('/api/venue/bookings/walk-in', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          table_id: selectedTable.id,
                          booking_date: selectedDate,
                          booking_time: selectedTime,
                          party_size: walkInParty,
                          name: walkInName || 'Walk-in',
                          phone: walkInPhone,
                        }),
                      });
                      if (res.ok) {
                        setShowWalkInForm(false);
                        setWalkInName('');
                        setWalkInPhone('');
                        setWalkInParty(2);
                        setSelectedTable(null);
                        fetchData();
                      }
                    } finally {
                      setWalkInSaving(false);
                    }
                  }}
                  className="flex-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {walkInSaving ? 'Seating...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setShowWalkInForm(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showAssignList && selectedTable.service_status === 'available' && (
            <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
              {unassignedBookings
                .filter((booking) => booking.party_size <= selectedTable.max_covers && booking.status === 'Confirmed')
                .map((booking) => (
                  <button
                    key={booking.id}
                    onClick={async () => {
                      await fetch('/api/venue/tables/assignments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ booking_id: booking.id, table_ids: [selectedTable.id] }),
                      });
                      setShowAssignList(false);
                      fetchData();
                    }}
                    className="mb-1 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    {booking.guest_name} - {booking.party_size} - {booking.start_time.slice(0, 5)}
                  </button>
                ))}
            </div>
          )}
          {showQuickBookingForm && selectedTable.service_status === 'available' && (
            <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <SharedNewBookingForm
                compact
                date={selectedDate}
                initialTime={selectedTime}
                defaultTableId={selectedTable.id}
                tables={tables}
                onCreated={() => {
                  setShowQuickBookingForm(false);
                  fetchData();
                }}
                onCancel={() => setShowQuickBookingForm(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
