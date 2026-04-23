'use client';

import { useCallback, useState } from 'react';
import type { VenueSettings, OpeningHoursSettings, OpeningHoursDaySettings } from '../types';
import { BusinessClosuresSection } from './BusinessClosuresSection';
import { OpeningHoursControl } from '@/components/scheduling/OpeningHoursControl';
import { SectionCard } from '@/components/ui/dashboard/SectionCard';

const DAYS: { key: string; label: string }[] = [
  { key: '0', label: 'Sunday' },
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
];

function getDayConfig(oh: OpeningHoursSettings | null, day: string): OpeningHoursDaySettings {
  const d = oh?.[day] as { closed?: boolean; periods?: { open: string; close: string }[]; open?: string; close?: string } | undefined;
  if (!d) return { closed: true };
  if (d.periods?.length) return { periods: d.periods };
  if (d.closed === true) return { closed: true };
  if (typeof d.open === 'string' && typeof d.close === 'string') return { periods: [{ open: d.open, close: d.close }] };
  return { closed: true };
}

interface OpeningHoursSectionProps {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
  isAdmin: boolean;
  bookingModel: string;
}

export function OpeningHoursSection({ venue, onUpdate, isAdmin, bookingModel }: OpeningHoursSectionProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [local, setLocal] = useState<OpeningHoursSettings>(() => {
    const o: OpeningHoursSettings = {};
    for (const { key } of DAYS) {
      o[key] = getDayConfig(venue.opening_hours, key);
    }
    return o;
  });

  const save = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/venue/opening-hours', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(local),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to save');
      }
      const { opening_hours } = await res.json();
      onUpdate({ opening_hours });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [local, onUpdate]);

  return (
    <SectionCard elevated>
      <SectionCard.Header eyebrow="Hours" title="Opening hours" description="Set your business opening hours." />
      <SectionCard.Body>
      <OpeningHoursControl value={local} onChange={setLocal} disabled={!isAdmin} />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {isAdmin && (
        <button type="button" onClick={save} disabled={saving} className="mt-4 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save opening hours'}
        </button>
      )}

      <BusinessClosuresSection bookingModel={bookingModel} venue={venue} isAdmin={isAdmin} onUpdate={onUpdate} />
      </SectionCard.Body>
    </SectionCard>
  );
}
