'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { VenueSettings } from '@/app/dashboard/settings/types';
import { TableManagementSection } from '@/app/dashboard/settings/sections/TableManagementSection';

interface Props {
  onDone: () => Promise<void>;
  onModeSelected: (advanced: boolean) => void;
}

export function TableModeStep({ onDone, onModeSelected }: Props) {
  const [venue, setVenue] = useState<VenueSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [vRes, tRes] = await Promise.all([fetch('/api/venue'), fetch('/api/venue/tables/settings')]);
        if (!vRes.ok || !tRes.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const vData = (await vRes.json()) as Record<string, unknown>;
        const tData = (await tRes.json()) as {
          settings?: { table_management_enabled?: boolean; combination_threshold?: number };
        };
        if (cancelled) return;
        const tm = Boolean(tData.settings?.table_management_enabled);
        const ct = Number(tData.settings?.combination_threshold ?? 80);
        onModeSelected(tm);
        setVenue({
          id: vData.id as string,
          name: (vData.name as string) ?? '',
          slug: (vData.slug as string) ?? '',
          address: (vData.address as string | null) ?? null,
          phone: (vData.phone as string | null) ?? null,
          email: (vData.email as string | null) ?? null,
          website_url: (vData.website_url as string | null) ?? null,
          cover_photo_url: (vData.cover_photo_url as string | null) ?? null,
          cuisine_type: (vData.cuisine_type as string | null) ?? null,
          price_band: (vData.price_band as string | null) ?? null,
          no_show_grace_minutes: (vData.no_show_grace_minutes as number) ?? 15,
          kitchen_email: (vData.kitchen_email as string | null) ?? null,
          communication_templates:
            (vData.communication_templates as VenueSettings['communication_templates']) ?? null,
          opening_hours: (vData.opening_hours as VenueSettings['opening_hours']) ?? null,
          booking_rules: (vData.booking_rules as VenueSettings['booking_rules']) ?? null,
          deposit_config: (vData.deposit_config as VenueSettings['deposit_config']) ?? null,
          availability_config: (vData.availability_config as VenueSettings['availability_config']) ?? null,
          stripe_connected_account_id: (vData.stripe_connected_account_id as string | null) ?? null,
          timezone: (vData.timezone as string) ?? 'Europe/London',
          table_management_enabled: tm,
          combination_threshold: ct,
          pricing_tier: vData.pricing_tier as string | undefined,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Intentionally once on mount: sync initial table mode; parent onModeSelected is not stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUpdate = useCallback(
    (patch: Partial<VenueSettings>) => {
      setVenue((prev) => (prev ? { ...prev, ...patch } : null));
      if (patch.table_management_enabled != null) {
        onModeSelected(patch.table_management_enabled);
      }
    },
    [onModeSelected],
  );

  if (loading || !venue) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Table management</h2>
      <p className="mb-4 text-sm text-slate-500">
        Same controls as{' '}
        <Link
          href="/dashboard/availability?tab=table"
          className="font-medium text-brand-600 underline hover:text-brand-700"
        >
          Availability → Table Management
        </Link>
        . Toggle advanced mode, then continue to lay out tables if it is on.
      </p>

      <TableManagementSection venue={venue} onUpdate={onUpdate} isAdmin />

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={() => void onDone()}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
