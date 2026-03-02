/**
 * Zod schemas for venue JSONB config fields. Validate before writing to DB.
 */

import { z } from 'zod';

const timeHHmm = z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Use HH:mm');
const dayKeySchema = z.enum(['0', '1', '2', '3', '4', '5', '6']);

/** One service period: open and close time. */
export const openingHoursPeriodSchema = z.object({
  open: timeHHmm,
  close: timeHHmm,
}).refine((p) => p.open < p.close, { message: 'Close must be after open' });

/** One day: either closed or up to 2 periods. */
export const openingHoursDaySchema = z.union([
  z.object({ closed: z.literal(true) }),
  z.object({
    closed: z.literal(false).optional(),
    periods: z.array(openingHoursPeriodSchema).min(1).max(2),
  }),
]);

/** Opening hours: keys "0".."6" (Sun–Sat). Partial allowed (only some days set). */
export const openingHoursSchema = z.record(
  z.string().refine((k) => ['0', '1', '2', '3', '4', '5', '6'].includes(k)),
  openingHoursDaySchema
).optional();

/** Booking rules stored in venues.booking_rules. */
export const bookingRulesSchema = z.object({
  min_party_size: z.number().int().min(1).max(20).default(1),
  max_party_size: z.number().int().min(1).max(50).default(20),
  max_advance_booking_days: z.number().int().min(1).max(365).default(90),
  min_notice_hours: z.number().int().min(0).max(168).default(24),
});

/** Deposit config: which sources require deposit. */
export const depositConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Amount per person in GBP (stored as number, e.g. 5 for £5). */
  amount_per_person_gbp: z.number().min(0).max(100).default(5),
  /** Online bookings always require deposit when enabled. */
  online_requires_deposit: z.boolean().default(true),
  /** Phone bookings: optional per venue. */
  phone_requires_deposit: z.boolean().default(false),
});

/** Fixed intervals availability model. */
export const fixedIntervalsConfigSchema = z.object({
  model: z.literal('fixed_intervals'),
  interval_minutes: z.union([z.literal(15), z.literal(30)]),
  max_covers_by_day: z.record(dayKeySchema, z.number().int().min(0)).optional(),
  turn_time_enabled: z.boolean().optional(),
  sitting_duration_minutes: z.number().int().min(60).max(180).optional(),
  blocked_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  blocked_slots: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: timeHHmm.optional(),
    end_time: timeHHmm.optional(),
  })).optional(),
});

/** One named sitting. */
export const namedSittingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  start_time: timeHHmm,
  end_time: timeHHmm,
  max_covers: z.number().int().min(0),
  /** Optional: max covers per day of week "0".."6". */
  max_covers_by_day: z.record(dayKeySchema, z.number().int().min(0)).optional(),
}).refine((s) => s.start_time < s.end_time, { message: 'End time must be after start time' });

/** Named sittings availability model. */
export const namedSittingsConfigSchema = z.object({
  model: z.literal('named_sittings'),
  sittings: z.array(namedSittingSchema),
  blocked_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  blocked_slots: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: timeHHmm.optional(),
    end_time: timeHHmm.optional(),
  })).optional(),
});

/** Availability config: one of two models. */
export const availabilityConfigSchema = z.union([
  fixedIntervalsConfigSchema,
  namedSittingsConfigSchema,
]);

export type OpeningHoursPeriod = z.infer<typeof openingHoursPeriodSchema>;
export type OpeningHoursDayConfig = z.infer<typeof openingHoursDaySchema>;
export type BookingRules = z.infer<typeof bookingRulesSchema>;
export type DepositConfig = z.infer<typeof depositConfigSchema>;
