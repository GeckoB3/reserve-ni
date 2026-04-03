'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VenueSettings, BookingRulesSettings } from '../types';
import { useNumericField } from '@/hooks/useNumericField';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import type { BookingModel } from '@/types/booking-models';
import { BOOKING_MODEL_ORDER, normalizeEnabledModels } from '@/lib/booking/enabled-models';
import { bookingModelShortLabel } from '@/lib/booking/infer-booking-row-model';

const restaurantSchema = z.object({
  min_party_size: z.number().int().min(1).max(20),
  max_party_size: z.number().int().min(1).max(50),
  max_advance_booking_days: z.number().int().min(1).max(365),
  min_notice_hours: z.number().int().min(0).max(168),
});

const appointmentSchema = z.object({
  max_advance_booking_days: z.number().int().min(1).max(365),
  min_notice_hours: z.number().int().min(0).max(168),
  cancellation_notice_hours: z.number().int().min(0).max(168),
  allow_same_day_booking: z.boolean(),
});

type RestaurantForm = z.infer<typeof restaurantSchema>;
type AppointmentForm = z.infer<typeof appointmentSchema>;

const defaultRules: BookingRulesSettings = {
  min_party_size: 1,
  max_party_size: 20,
  max_advance_booking_days: 90,
  min_notice_hours: 1,
  cancellation_notice_hours: 48,
  allow_same_day_booking: true,
};

interface BookingRulesSectionProps {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
  isAdmin: boolean;
  bookingModel?: string;
  enabledModels?: BookingModel[];
}

export function BookingRulesSection({
  venue,
  onUpdate,
  isAdmin,
  bookingModel = 'table_reservation',
  enabledModels = [],
}: BookingRulesSectionProps) {
  const isAppointment = isUnifiedSchedulingVenue(bookingModel);
  const rules = venue.booking_rules ?? defaultRules;
  const { integerProps } = useNumericField();
  const int = integerProps();

  const restaurantForm = useForm<RestaurantForm>({
    resolver: zodResolver(restaurantSchema),
    defaultValues: {
      min_party_size: rules.min_party_size,
      max_party_size: rules.max_party_size,
      max_advance_booking_days: rules.max_advance_booking_days,
      min_notice_hours: rules.min_notice_hours,
    },
  });

  const appointmentForm = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      max_advance_booking_days: rules.max_advance_booking_days,
      min_notice_hours: rules.min_notice_hours,
      cancellation_notice_hours: rules.cancellation_notice_hours ?? 48,
      allow_same_day_booking: rules.allow_same_day_booking ?? true,
    },
  });

  const onRestaurantSubmit = useCallback(async (data: RestaurantForm) => {
    const res = await fetch('/api/venue/booking-rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rules, ...data }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Failed to save');
    }
    const { booking_rules } = await res.json();
    onUpdate({ booking_rules });
  }, [onUpdate, rules]);

  const primaryModel = bookingModel as BookingModel;
  const normalizedSecondaries = normalizeEnabledModels(enabledModels, primaryModel);
  const modelsForPerRules = useMemo(
    () =>
      BOOKING_MODEL_ORDER.filter((m) =>
        new Set<BookingModel>([primaryModel, ...normalizedSecondaries]).has(m),
      ),
    [primaryModel, normalizedSecondaries],
  );
  const showPerModelTiming = modelsForPerRules.length > 1;

  const [perCancelHrs, setPerCancelHrs] = useState<Partial<Record<BookingModel, string>>>({});
  const [perRem1, setPerRem1] = useState<Partial<Record<BookingModel, string>>>({});
  const [perRem2, setPerRem2] = useState<Partial<Record<BookingModel, string>>>({});

  useEffect(() => {
    const c = rules.cancellation_notice_hours_by_model;
    const r = rules.reminder_hours_before_by_model;
    const nextC: Partial<Record<BookingModel, string>> = {};
    const nextR1: Partial<Record<BookingModel, string>> = {};
    const nextR2: Partial<Record<BookingModel, string>> = {};
    if (c) {
      for (const m of modelsForPerRules) {
        const v = c[m];
        if (typeof v === 'number' && Number.isFinite(v)) nextC[m] = String(v);
      }
    }
    if (r) {
      for (const m of modelsForPerRules) {
        const row = r[m];
        if (row?.reminder_1 != null && Number.isFinite(row.reminder_1)) nextR1[m] = String(row.reminder_1);
        if (row?.reminder_2 != null && Number.isFinite(row.reminder_2)) nextR2[m] = String(row.reminder_2);
      }
    }
    setPerCancelHrs(nextC);
    setPerRem1(nextR1);
    setPerRem2(nextR2);
  }, [venue.id, rules, modelsForPerRules]);

  const onAppointmentSubmit = useCallback(
    async (data: AppointmentForm) => {
      const cancelByModel: Partial<Record<BookingModel, number>> = {
        ...(rules.cancellation_notice_hours_by_model ?? {}),
      };
      const reminderByModel: Partial<Record<BookingModel, { reminder_1?: number; reminder_2?: number }>> = {
        ...(rules.reminder_hours_before_by_model ?? {}),
      };
      for (const m of modelsForPerRules) {
        const cs = perCancelHrs[m];
        if (cs === '') {
          delete cancelByModel[m];
        } else if (cs != null && cs !== '' && Number.isFinite(Number(cs))) {
          cancelByModel[m] = Math.min(168, Math.max(0, parseInt(cs, 10)));
        }
        const r1 = perRem1[m];
        const r2 = perRem2[m];
        const prev = reminderByModel[m] ?? {};
        let nextRow = { ...prev };
        if (r1 === '') {
          delete nextRow.reminder_1;
        } else if (r1 != null && r1 !== '' && Number.isFinite(Number(r1))) {
          nextRow = { ...nextRow, reminder_1: Math.min(336, Math.max(0, parseInt(r1, 10))) };
        }
        if (r2 === '') {
          delete nextRow.reminder_2;
        } else if (r2 != null && r2 !== '' && Number.isFinite(Number(r2))) {
          nextRow = { ...nextRow, reminder_2: Math.min(336, Math.max(0, parseInt(r2, 10))) };
        }
        if (Object.keys(nextRow).length > 0) reminderByModel[m] = nextRow;
        else delete reminderByModel[m];
      }

      const payload = {
        ...rules,
        ...data,
        cancellation_notice_hours_by_model:
          Object.keys(cancelByModel).length > 0 ? cancelByModel : undefined,
        reminder_hours_before_by_model:
          Object.keys(reminderByModel).length > 0 ? reminderByModel : undefined,
      };

      const res = await fetch('/api/venue/booking-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to save');
      }
      const { booking_rules } = await res.json();
      onUpdate({ booking_rules });
    },
    [onUpdate, rules, modelsForPerRules, perCancelHrs, perRem1, perRem2],
  );

  if (isAppointment) {
    const { register, handleSubmit, formState: { errors, isSubmitting }, watch, setValue } = appointmentForm;
    const sameDayValue = watch('allow_same_day_booking');

    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Appointment rules</h2>
        <form onSubmit={handleSubmit(onAppointmentSubmit)} className="space-y-4 max-w-2xl">
          <div>
            <label htmlFor="max_advance_booking_days" className="block text-sm font-medium text-neutral-700 mb-1">Maximum advance booking (days)</label>
            <input id="max_advance_booking_days" {...int.inputProps} min={1} max={365} {...register('max_advance_booking_days', int.registerOptions)} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
            <p className="mt-1 text-xs text-neutral-500">How far in advance clients can book an appointment</p>
            {errors.max_advance_booking_days && <p className="mt-1 text-sm text-red-600">{errors.max_advance_booking_days.message}</p>}
          </div>
          <div>
            <label htmlFor="min_notice_hours" className="block text-sm font-medium text-neutral-700 mb-1">Minimum booking notice (hours)</label>
            <input id="min_notice_hours" {...int.inputProps} min={0} max={168} {...register('min_notice_hours', int.registerOptions)} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
            <p className="mt-1 text-xs text-neutral-500">How many hours in advance clients must book</p>
            {errors.min_notice_hours && <p className="mt-1 text-sm text-red-600">{errors.min_notice_hours.message}</p>}
          </div>
          <div>
            <label htmlFor="cancellation_notice_hours" className="block text-sm font-medium text-neutral-700 mb-1">Cancellation notice (hours)</label>
            <input id="cancellation_notice_hours" {...int.inputProps} min={0} max={168} {...register('cancellation_notice_hours', int.registerOptions)} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
            <p className="mt-1 text-xs text-neutral-500">How many hours before the appointment a client must cancel to receive a deposit refund</p>
            {errors.cancellation_notice_hours && <p className="mt-1 text-sm text-red-600">{errors.cancellation_notice_hours.message}</p>}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setValue('allow_same_day_booking', !sameDayValue)}
              disabled={!isAdmin}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                sameDayValue ? 'bg-blue-600' : 'bg-slate-300'
              } disabled:opacity-50`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  sameDayValue ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <div>
              <span className="text-sm font-medium text-neutral-700">Allow same-day bookings</span>
              <p className="text-xs text-neutral-500">When off, clients can only book from the next day onwards</p>
            </div>
          </div>
          {showPerModelTiming && (
            <div className="max-w-2xl space-y-4 border-t border-neutral-200 pt-4">
              <h3 className="text-sm font-semibold text-neutral-900">Per booking type (optional)</h3>
              <p className="text-xs text-neutral-500">
                Override cancellation notice and reminder lead times for each booking type your venue offers. Leave a field blank to use the global value above or notification defaults.
              </p>
              <div className="overflow-x-auto rounded border border-neutral-200">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-neutral-50 text-xs font-medium text-neutral-600">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Cancel notice (h)</th>
                      <th className="px-3 py-2">Reminder 1 (h before)</th>
                      <th className="px-3 py-2">Reminder 2 (h before)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelsForPerRules.map((m) => (
                      <tr key={m} className="border-t border-neutral-100">
                        <td className="px-3 py-2 font-medium text-neutral-800">{bookingModelShortLabel(m)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={perCancelHrs[m] ?? ''}
                            onChange={(e) => setPerCancelHrs((prev) => ({ ...prev, [m]: e.target.value }))}
                            disabled={!isAdmin}
                            placeholder="—"
                            className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm disabled:bg-neutral-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={perRem1[m] ?? ''}
                            onChange={(e) => setPerRem1((prev) => ({ ...prev, [m]: e.target.value }))}
                            disabled={!isAdmin}
                            placeholder="—"
                            className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm disabled:bg-neutral-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={perRem2[m] ?? ''}
                            onChange={(e) => setPerRem2((prev) => ({ ...prev, [m]: e.target.value }))}
                            disabled={!isAdmin}
                            placeholder="—"
                            className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm disabled:bg-neutral-50"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {isAdmin && (
            <button type="submit" disabled={isSubmitting} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save appointment rules'}
            </button>
          )}
        </form>
      </section>
    );
  }

  const { register, handleSubmit, formState: { errors, isSubmitting } } = restaurantForm;
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Booking rules</h2>
      <form onSubmit={handleSubmit(onRestaurantSubmit)} className="space-y-4 max-w-md">
        <div>
          <label htmlFor="min_party_size" className="block text-sm font-medium text-neutral-700 mb-1">Minimum party size</label>
          <input id="min_party_size" {...int.inputProps} min={1} max={20} {...register('min_party_size', int.registerOptions)} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          {errors.min_party_size && <p className="mt-1 text-sm text-red-600">{errors.min_party_size.message}</p>}
        </div>
        <div>
          <label htmlFor="max_party_size" className="block text-sm font-medium text-neutral-700 mb-1">Maximum party size</label>
          <input id="max_party_size" {...int.inputProps} min={1} max={50} {...register('max_party_size', int.registerOptions)} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          {errors.max_party_size && <p className="mt-1 text-sm text-red-600">{errors.max_party_size.message}</p>}
        </div>
        <div>
          <label htmlFor="max_advance_booking_days" className="block text-sm font-medium text-neutral-700 mb-1">Maximum advance booking (days)</label>
          <input id="max_advance_booking_days" {...int.inputProps} min={1} max={365} {...register('max_advance_booking_days', int.registerOptions)} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          {errors.max_advance_booking_days && <p className="mt-1 text-sm text-red-600">{errors.max_advance_booking_days.message}</p>}
        </div>
        <div>
          <label htmlFor="min_notice_hours" className="block text-sm font-medium text-neutral-700 mb-1">Minimum notice (hours before booking)</label>
          <input id="min_notice_hours" {...int.inputProps} min={0} max={168} {...register('min_notice_hours', int.registerOptions)} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
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
