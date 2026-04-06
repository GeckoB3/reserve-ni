'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VenueSettings } from '../types';
import type { VenueTable } from '@/types/table-management';
import { AdjacencyPreview } from './AdjacencyPreview';
import { TableList } from '../tables/TableList';
import { NumericInput } from '@/components/ui/NumericInput';

interface Props {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
  isAdmin: boolean;
}

interface ToggleFlags {
  hasConfiguredFloorPlan: boolean;
  hasActiveAssignments: boolean;
}

export function TableManagementSection({ venue, onUpdate, isAdmin }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [flags, setFlags] = useState<ToggleFlags>({ hasConfiguredFloorPlan: false, hasActiveAssignments: false });
  const [showDisableWarning, setShowDisableWarning] = useState(false);
  const [showEnableAssignDialog, setShowEnableAssignDialog] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUnassignedCount, setPreviewUnassignedCount] = useState(0);
  const [assigningUnassigned, setAssigningUnassigned] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState<number>(venue.combination_threshold ?? 80);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcResult, setRecalcResult] = useState<string | null>(null);

  const [coversTables, setCoversTables] = useState<VenueTable[]>([]);
  const [coversTablesLoading, setCoversTablesLoading] = useState(false);

  const fetchCoversTables = useCallback(async () => {
    setCoversTablesLoading(true);
    try {
      const res = await fetch('/api/venue/tables');
      if (!res.ok) return;
      const data = await res.json();
      setCoversTables(data.tables ?? []);
    } catch { /* non-critical */ }
    finally { setCoversTablesLoading(false); }
  }, []);

  useEffect(() => {
    if (!venue.table_management_enabled) {
      void fetchCoversTables();
    }
  }, [venue.table_management_enabled, fetchCoversTables]);

  useEffect(() => {
    let mounted = true;
    async function loadFlags() {
      try {
        const res = await fetch('/api/venue/tables/settings');
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        setFlags(data.flags ?? { hasConfiguredFloorPlan: false, hasActiveAssignments: false });
      } catch {
        // Non-critical; warning modal just won't be triggered.
      }
    }
    loadFlags();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setThresholdDraft(venue.combination_threshold ?? 80);
  }, [venue.combination_threshold]);

  async function commitToggle(nextValue: boolean): Promise<boolean> {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/venue/tables/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_management_enabled: nextValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice(data.error ?? 'Failed to update table management mode.');
        return false;
      }

      onUpdate({ table_management_enabled: nextValue } as Partial<VenueSettings>);
      setNotice(`Advanced table management ${nextValue ? 'enabled' : 'disabled'}.`);
      router.refresh();
      return true;
    } catch {
      setNotice('Failed to update table management mode.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function previewUnassignedBookings() {
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/venue/tables/assignments/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true }),
      });
      if (!res.ok) {
        setNotice('Advanced table management is on, but we could not check unassigned bookings.');
        return;
      }
      const data = await res.json();
      const attempted = Number(data.attempted ?? 0);
      if (attempted > 0) {
        setPreviewUnassignedCount(attempted);
        setShowEnableAssignDialog(true);
      } else {
        setPreviewUnassignedCount(0);
        setNotice('Advanced table management enabled. No upcoming unassigned bookings were found.');
      }
    } catch {
      setNotice('Advanced table management is on, but we could not check unassigned bookings.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function autoAssignUnassigned() {
    setAssigningUnassigned(true);
    try {
      const res = await fetch('/api/venue/tables/assignments/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error ?? 'Failed to auto-assign existing bookings.');
        return;
      }

      const assigned = Number(data.assigned ?? 0);
      const attempted = Number(data.attempted ?? 0);
      const failed = Number(data.failed ?? 0);
      setShowEnableAssignDialog(false);
      setNotice(
        failed > 0
          ? `Auto-assigned ${assigned} of ${attempted} bookings. ${failed} still need manual assignment in Table Grid.`
          : `Auto-assigned ${assigned} upcoming bookings successfully.`
      );
      router.refresh();
    } catch {
      setNotice('Failed to auto-assign existing bookings.');
    } finally {
      setAssigningUnassigned(false);
    }
  }

  async function handleToggle() {
    if (!isAdmin || saving) return;
    const nextValue = !venue.table_management_enabled;
    if (!nextValue && (flags.hasConfiguredFloorPlan || flags.hasActiveAssignments)) {
      setShowDisableWarning(true);
      return;
    }
    const success = await commitToggle(nextValue);
    if (success && nextValue) {
      await previewUnassignedBookings();
    }
  }

  async function saveThreshold() {
    if (!isAdmin || thresholdSaving) return;
    setThresholdSaving(true);
    setNotice(null);
    setRecalcResult(null);
    try {
      const res = await fetch('/api/venue/tables/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combination_threshold: thresholdDraft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice(data.error ?? 'Failed to save combination threshold.');
        return;
      }
      onUpdate({ combination_threshold: thresholdDraft } as Partial<VenueSettings>);
      setNotice('Combination threshold saved.');
      router.refresh();
    } catch {
      setNotice('Failed to save combination threshold.');
    } finally {
      setThresholdSaving(false);
    }
  }

  async function recalculateAdjacency() {
    if (!isAdmin || recalcLoading) return;
    setRecalcLoading(true);
    setRecalcResult(null);
    try {
      const res = await fetch('/api/venue/tables/combinations/recalculate', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRecalcResult(data.error ?? 'Failed to recalculate adjacency.');
        return;
      }
      setRecalcResult(`Done - ${data.adjacent_pairs ?? 0} adjacent table pairs detected.`);
    } catch {
      setRecalcResult('Failed to recalculate adjacency.');
    } finally {
      setRecalcLoading(false);
    }
  }

  const advanced = venue.table_management_enabled;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900">Table Management</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Current mode</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                advanced ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {advanced ? 'Advanced table management' : 'Simple covers mode'}
            </span>
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {advanced
              ? 'Online booking and the dashboard use full table workflows: floor plan, Table Grid, and slots can depend on table availability.'
              : 'Online booking uses total covers per time slot only. Optional tables below help staff see who is sitting where.'}
          </p>

          <details className="group mt-4 overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white shadow-sm transition-shadow open:shadow-md">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-left outline-none marker:hidden ring-brand-500/0 transition-colors hover:bg-slate-100/80 focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200/80" aria-hidden>
                  <svg className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM14.25 8.25a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25a2.25 2.25 0 0 1-2.25 2.25H16.5a2.25 2.25 0 0 1-2.25-2.25V8.25ZM16.5 20.25a2.25 2.25 0 0 0 2.25-2.25V18a2.25 2.25 0 0 0-2.25-2.25H16.5a2.25 2.25 0 0 0-2.25 2.25v2.25a2.25 2.25 0 0 0 2.25 2.25ZM10.5 17.25a2.25 2.25 0 0 1-2.25-2.25V13.5a2.25 2.25 0 0 1 2.25-2.25H13.5a2.25 2.25 0 0 1 2.25 2.25V15a2.25 2.25 0 0 1-2.25 2.25H10.5Z" />
                  </svg>
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">What&apos;s the difference?</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Simple covers vs advanced: how booking and the dashboard change</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 group-open:bg-brand-50 group-open:text-brand-700">
                <span className="group-open:hidden">Compare</span>
                <span className="hidden group-open:inline">Hide</span>
                <svg className="h-4 w-4 text-slate-500 transition-transform duration-200 group-open:rotate-180 group-open:text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </span>
            </summary>
            <div className="border-t border-slate-200/80 bg-slate-50/40 px-4 pb-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-slate-400" aria-hidden />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Simple covers mode</p>
                  </div>
                  <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600">
                    <li className="flex gap-2.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" aria-hidden />
                      <span>Capacity and guest booking slots use <strong className="font-semibold text-slate-800">total covers</strong>, not individual tables.</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" aria-hidden />
                      <span>Staff use the <strong className="font-semibold text-slate-800">Day Sheet</strong> and Reservations for service.</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" aria-hidden />
                      <span>Optional tables are <strong className="font-semibold text-slate-800">seating tracking only</strong>; they don&apos;t block online availability.</span>
                    </li>
                  </ul>
                </div>
                <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/90 to-white p-4 shadow-sm ring-1 ring-emerald-100/80">
                  <div className="flex items-center gap-2 border-b border-emerald-100/80 pb-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-900/80">Advanced table management</p>
                  </div>
                  <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600">
                    <li className="flex gap-2.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                      <span><strong className="font-semibold text-slate-800">Floor Plan</strong> and <strong className="font-semibold text-slate-800">Table Grid</strong> replace the Day Sheet day-to-day.</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                      <span>Combinations, adjacency, and <strong className="font-semibold text-slate-800">stricter table assignment</strong> rules.</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                      <span>Online booking can <strong className="font-semibold text-slate-800">factor in tables</strong> when showing available times.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </details>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5 border-t border-slate-100 pt-3 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0">
          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <span className="text-[11px] font-medium text-slate-400 lg:hidden">Advanced</span>
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] font-medium text-slate-400 lg:inline">Advanced</span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  advanced ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {advanced ? 'On' : 'Off'}
              </span>
              <button
                type="button"
                onClick={handleToggle}
                disabled={!isAdmin || saving}
                className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  advanced ? 'bg-brand-600' : 'bg-slate-200'
                } ${!isAdmin || saving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                aria-label={
                  advanced
                    ? 'Turn off advanced table management and return to simple covers mode'
                    : 'Turn on advanced table management (floor plan, table grid, table-aware booking)'
                }
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                    advanced ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
          <p className="max-w-[20rem] text-[11px] leading-snug text-slate-500 lg:text-right">
            {advanced
              ? 'Turn off to return to Simple covers mode and the Day Sheet. Your table data is kept.'
              : 'Turn on only if you want the floor plan, Table Grid, and table-aware online booking rules.'}
          </p>
        </div>
      </div>

      {notice && <p className="mt-3 text-xs text-slate-600">{notice}</p>}

      {/* Covers-mode: simplified table list for seating tracking */}
      {!venue.table_management_enabled && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-500">
            Optional: define tables for staff seating notes on the Day Sheet. This does not change how many guests can book online.
          </p>
          {coversTablesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
            </div>
          ) : (
            <TableList
              tables={coversTables}
              setTables={setCoversTables}
              isAdmin={isAdmin}
              onRefresh={fetchCoversTables}
              variant="covers"
            />
          )}
        </div>
      )}

      {venue.table_management_enabled && (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Combination Detection Distance
        </label>
        <p className="mt-1 text-xs text-slate-500">
          How close two tables need to be on your floor plan to be suggested as a combination. Default is 80.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <NumericInput
            min={20}
            max={300}
            value={thresholdDraft}
            onChange={(v) => setThresholdDraft(v)}
            disabled={!isAdmin || thresholdSaving}
            className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={saveThreshold}
            disabled={!isAdmin || thresholdSaving}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {thresholdSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={recalculateAdjacency}
            disabled={!isAdmin || recalcLoading}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {recalcLoading ? 'Recalculating...' : 'Recalculate table adjacency'}
          </button>
          {recalcResult && <p className="mt-2 text-xs text-slate-600">{recalcResult}</p>}
        </div>

        <AdjacencyPreview threshold={thresholdDraft} />
      </div>
      )}

      {showDisableWarning && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Switch back to <strong className="font-semibold">Simple covers mode</strong>? Your Floor Plan and Table Grid
            will be hidden and the Day Sheet will be your main service view again. Table layouts and data stay saved and
            return if you turn Advanced on later. Existing bookings are not removed.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setShowDisableWarning(false);
                await commitToggle(false);
              }}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
            >
              Switch to Simple covers
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setShowDisableWarning(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showEnableAssignDialog && (
        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <p className="text-sm text-brand-900">
            <strong className="font-semibold">Advanced table management</strong> is now on. You have{' '}
            {previewUnassignedCount} upcoming booking{previewUnassignedCount !== 1 ? 's' : ''} without table assignments.
            Auto-assign them now?
          </p>
          <p className="mt-1 text-xs text-brand-800">
            Bookings that cannot be auto-assigned stay in the Unassigned lane on Table Grid for manual drag-and-drop.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={assigningUnassigned}
              onClick={() => {
                void autoAssignUnassigned();
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {assigningUnassigned ? 'Assigning...' : 'Auto-Assign Now'}
            </button>
            <button
              type="button"
              disabled={assigningUnassigned}
              onClick={() => {
                setShowEnableAssignDialog(false);
                setNotice(
                  `Advanced table management enabled. ${previewUnassignedCount} booking${previewUnassignedCount !== 1 ? 's' : ''} left for manual assignment in Table Grid.`
                );
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              I&apos;ll Do It Manually
            </button>
            <button
              type="button"
              disabled={assigningUnassigned}
              onClick={() => router.push('/dashboard/table-grid')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Open Table Grid
            </button>
          </div>
        </div>
      )}

      {previewLoading && (
        <p className="mt-3 text-xs text-slate-500">Checking upcoming unassigned bookings...</p>
      )}
    </section>
  );
}
