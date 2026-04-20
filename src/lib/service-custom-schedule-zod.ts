import { z } from 'zod';
import { timeToMinutes } from '@/lib/availability';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const timeRangeSchema = z
  .object({
    start: hhmm,
    end: hhmm,
  })
  .superRefine((tr, ctx) => {
    if (timeToMinutes(tr.end) <= timeToMinutes(tr.start)) {
      ctx.addIssue({ code: 'custom', message: 'End time must be after start time', path: ['end'] });
    }
  });

const workingHoursSchema = z.record(z.string(), z.array(timeRangeSchema));

const weeklyRuleSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('weekly'),
    windows: workingHoursSchema,
  })
  .refine((r) => Object.keys(r.windows).length > 0, { message: 'Weekly rule needs at least one working day', path: ['windows'] });

const specificDatesRuleSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('specific_dates'),
  entries: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ranges: z.array(timeRangeSchema).min(1),
    }),
  ),
});

const dateRangePatternRuleSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('date_range_pattern'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days_of_week: z.array(z.number().int().min(0).max(6)).min(1),
    ranges: z.array(timeRangeSchema).min(1),
  })
  .superRefine((r, ctx) => {
    if (r.end_date < r.start_date) {
      ctx.addIssue({ code: 'custom', message: 'End date must be on or after start date', path: ['end_date'] });
    }
  });

export const serviceCustomScheduleV2Schema = z.object({
  version: z.literal(2),
  rules: z.array(z.discriminatedUnion('kind', [weeklyRuleSchema, specificDatesRuleSchema, dateRangePatternRuleSchema])).max(40),
});

/** Legacy: day-keyed map only. */
export const legacyCustomWorkingHoursSchema = z.record(z.string(), z.array(timeRangeSchema));

export const serviceCustomScheduleStoredSchema = z.union([serviceCustomScheduleV2Schema, legacyCustomWorkingHoursSchema]);

export const customWorkingHoursRequestSchema = serviceCustomScheduleStoredSchema.nullable();
