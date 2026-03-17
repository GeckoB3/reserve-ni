'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VenueSettings } from '../types';
import { AdjacencyPreview } from './AdjacencyPreview';
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
      setNotice(`Advanced Table Management ${nextValue ? 'enabled' : 'disabled'}.`);
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
        setNotice('Advanced mode enabled, but failed to check unassigned bookings.');
        return;
      }
      const data = await res.json();
      const attempted = Number(data.attempted ?? 0);
      if (attempted > 0) {
        setPreviewUnassignedCount(attempted);
        setShowEnableAssignDialog(true);
      } else {
        setPreviewUnassignedCount(0);
        setNotice('Advanced Table Management enabled. No upcoming unassigned bookings were found.');
      }
    } catch {
      setNotice('Advanced mode enabled, but failed to check unassigned bookings.');
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

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Table Management</h2>
          <p className="mt-1 text-sm text-slate-500">
            Enable per-table booking assignment, floor plan management, and the table timeline grid. When enabled,
            the Day Sheet view is replaced by the Floor Plan and Table Grid views.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              venue.table_management_enabled
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {venue.table_management_enabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            type="button"
            onClick={handleToggle}
            disabled={!isAdmin || saving}
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors ${
              venue.table_management_enabled ? 'bg-brand-600' : 'bg-slate-200'
            } ${!isAdmin || saving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            aria-label="Toggle advanced table management"
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                venue.table_management_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {notice && <p className="mt-3 text-xs text-slate-600">{notice}</p>}

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

      {showDisableWarning && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Turning off Advanced Table Management will hide your Floor Plan and Table Grid views. Your table
            configurations and floor plan will be saved and can be restored by turning this back on. Existing
            bookings will not be affected.
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
              Turn Off
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
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-sm text-indigo-900">
            You have {previewUnassignedCount} upcoming booking{previewUnassignedCount !== 1 ? 's' : ''} without table
            assignments. Would you like to auto-assign them now?
          </p>
          <p className="mt-1 text-xs text-indigo-700">
            Bookings that cannot be auto-assigned will stay visible in the Unassigned lane on Table Grid for manual drag-and-drop.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={assigningUnassigned}
              onClick={() => {
                void autoAssignUnassigned();
              }}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {assigningUnassigned ? 'Assigning...' : 'Auto-Assign Now'}
            </button>
            <button
              type="button"
              disabled={assigningUnassigned}
              onClick={() => {
                setShowEnableAssignDialog(false);
                setNotice(
                  `Advanced Table Management enabled. ${previewUnassignedCount} booking${previewUnassignedCount !== 1 ? 's' : ''} left for manual assignment in Table Grid.`
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
