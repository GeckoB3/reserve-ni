'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCallback } from 'react';
import type { VenueSettings, BookingRulesSettings } from '../types';
import { useNumericField } from '@/hooks/useNumericField';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

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
}

export function BookingRulesSection({ venue, onUpdate, isAdmin, bookingModel = 'table_reservation' }: BookingRulesSectionProps) {
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
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Failed to save');
    }
    const { booking_rules } = await res.json();
    onUpdate({ booking_rules });
  }, [onUpdate]);

  const onAppointmentSubmit = useCallback(async (data: AppointmentForm) => {
    const payload = {
      ...rules,
      ...data,
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
  }, [onUpdate, rules]);

  if (isAppointment) {
    const { register, handleSubmit, formState: { errors, isSubmitting }, watch, setValue } = appointmentForm;
    const sameDayValue = watch('allow_same_day_booking');

    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Appointment rules</h2>
        <form onSubmit={handleSubmit(onAppointmentSubmit)} className="space-y-4 max-w-md">
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
