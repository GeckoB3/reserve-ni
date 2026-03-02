'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCallback } from 'react';
import type { VenueSettings, BookingRulesSettings } from '../types';

const bookingRulesSchema = z.object({
  min_party_size: z.number().int().min(1).max(20),
  max_party_size: z.number().int().min(1).max(50),
  max_advance_booking_days: z.number().int().min(1).max(365),
  min_notice_hours: z.number().int().min(0).max(168),
});

type FormData = z.infer<typeof bookingRulesSchema>;

const defaultRules: BookingRulesSettings = {
  min_party_size: 1,
  max_party_size: 20,
  max_advance_booking_days: 90,
  min_notice_hours: 24,
};

interface BookingRulesSectionProps {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
  isAdmin: boolean;
}

export function BookingRulesSection({ venue, onUpdate, isAdmin }: BookingRulesSectionProps) {
  const rules = venue.booking_rules ?? defaultRules;

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(bookingRulesSchema),
    defaultValues: {
      min_party_size: rules.min_party_size,
      max_party_size: rules.max_party_size,
      max_advance_booking_days: rules.max_advance_booking_days,
      min_notice_hours: rules.min_notice_hours,
    },
  });

  const onSubmit = useCallback(async (data: FormData) => {
    const res = await fetch('/api/venue/booking-rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Failed to save');
    }
    const { booking_rules } = await res.json();
    onUpdate({ booking_rules });
  }, [onUpdate]);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Booking rules</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
        <div>
          <label htmlFor="min_party_size" className="block text-sm font-medium text-neutral-700 mb-1">Minimum party size</label>
          <input id="min_party_size" type="number" min={1} max={20} {...register('min_party_size', { valueAsNumber: true })} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          {errors.min_party_size && <p className="mt-1 text-sm text-red-600">{errors.min_party_size.message}</p>}
        </div>
        <div>
          <label htmlFor="max_party_size" className="block text-sm font-medium text-neutral-700 mb-1">Maximum party size</label>
          <input id="max_party_size" type="number" min={1} max={50} {...register('max_party_size', { valueAsNumber: true })} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          {errors.max_party_size && <p className="mt-1 text-sm text-red-600">{errors.max_party_size.message}</p>}
        </div>
        <div>
          <label htmlFor="max_advance_booking_days" className="block text-sm font-medium text-neutral-700 mb-1">Maximum advance booking (days)</label>
          <input id="max_advance_booking_days" type="number" min={1} max={365} {...register('max_advance_booking_days', { valueAsNumber: true })} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          {errors.max_advance_booking_days && <p className="mt-1 text-sm text-red-600">{errors.max_advance_booking_days.message}</p>}
        </div>
        <div>
          <label htmlFor="min_notice_hours" className="block text-sm font-medium text-neutral-700 mb-1">Minimum notice (hours before booking)</label>
          <input id="min_notice_hours" type="number" min={0} max={168} {...register('min_notice_hours', { valueAsNumber: true })} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          {errors.min_notice_hours && <p className="mt-1 text-sm text-red-600">{errors.min_notice_hours.message}</p>}
        </div>
        {isAdmin && (
          <button type="submit" disabled={isSubmitting} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {isSubmitting ? 'Saving…' : 'Save booking rules'}
          </button>
        )}
      </form>
    </section>
  );
}
