'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCallback } from 'react';
import type { VenueSettings, DepositConfigSettings } from '../types';
import { useNumericField } from '@/hooks/useNumericField';

const depositConfigSchema = z.object({
  enabled: z.boolean(),
  amount_per_person_gbp: z.number().min(0).max(100),
  online_requires_deposit: z.boolean(),
  phone_requires_deposit: z.boolean(),
  min_party_size_for_deposit: z.number().int().min(1).max(50).optional(),
  weekend_only: z.boolean().optional(),
});

type FormData = z.infer<typeof depositConfigSchema>;

const defaultConfig: DepositConfigSettings = {
  enabled: false,
  amount_per_person_gbp: 5,
  online_requires_deposit: true,
  phone_requires_deposit: false,
  min_party_size_for_deposit: undefined,
  weekend_only: false,
};

interface DepositConfigSectionProps {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
  isAdmin: boolean;
}

export function DepositConfigSection({ venue, onUpdate, isAdmin }: DepositConfigSectionProps) {
  const config = venue.deposit_config ?? defaultConfig;
  const { integerProps, floatProps } = useNumericField();
  const int = integerProps();
  const flt = floatProps();

  const { register, handleSubmit, formState: { errors, isSubmitting }, watch } = useForm<FormData>({
    resolver: zodResolver(depositConfigSchema),
    defaultValues: {
      enabled: config.enabled,
      amount_per_person_gbp: config.amount_per_person_gbp,
      online_requires_deposit: config.online_requires_deposit,
      phone_requires_deposit: config.phone_requires_deposit,
      min_party_size_for_deposit: config.min_party_size_for_deposit ?? undefined,
      weekend_only: config.weekend_only ?? false,
    },
  });

  const enabled = watch('enabled');

  const onSubmit = useCallback(async (data: FormData) => {
    const res = await fetch('/api/venue/deposit-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Failed to save');
    }
    const { deposit_config } = await res.json();
    onUpdate({ deposit_config });
  }, [onUpdate]);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Deposit config</h2>

      <div className="mb-4 rounded bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
        <strong>Cancellation policy (MVP):</strong> Deposits are refundable if the guest cancels at least 48 hours before the booking time. Otherwise the deposit is forfeited. This is fixed for the MVP and not editable here.
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('enabled')} disabled={!isAdmin} className="rounded" />
          <span className="text-sm font-medium">Deposits enabled</span>
        </label>

        {enabled && (
          <>
            <div>
              <label htmlFor="amount_per_person_gbp" className="block text-sm font-medium text-neutral-700 mb-1">Amount per person (£)</label>
              <input id="amount_per_person_gbp" {...flt.inputProps} min={0} max={100} step={0.5} {...register('amount_per_person_gbp', flt.registerOptions)} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
              {errors.amount_per_person_gbp && <p className="mt-1 text-sm text-red-600">{errors.amount_per_person_gbp.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('online_requires_deposit')} disabled={!isAdmin} className="rounded" />
                <span className="text-sm">Online bookings always require deposit</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('phone_requires_deposit')} disabled={!isAdmin} className="rounded" />
                <span className="text-sm">Phone bookings require deposit (optional)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('weekend_only')} disabled={!isAdmin} className="rounded" />
                <span className="text-sm">Weekends only (Fri–Sun)</span>
              </label>
            </div>
            <div>
              <label htmlFor="min_party_size_for_deposit" className="block text-sm font-medium text-neutral-700 mb-1">Minimum party size for deposit</label>
              <input id="min_party_size_for_deposit" {...int.inputProps} min={1} max={50} {...register('min_party_size_for_deposit', int.registerOptions)} disabled={!isAdmin} placeholder="e.g. 4 (leave blank for all sizes)" className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
              <p className="mt-1 text-xs text-neutral-500">Only require deposits for groups of this size or larger. Leave blank for all bookings.</p>
            </div>
          </>
        )}

        {isAdmin && (
          <button type="submit" disabled={isSubmitting} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {isSubmitting ? 'Saving…' : 'Save deposit config'}
          </button>
        )}
      </form>
    </section>
  );
}
