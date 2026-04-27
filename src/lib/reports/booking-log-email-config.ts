import { z } from 'zod';

export interface BookingLogEmailScheduleEntry {
  day: number;
  time: string;
}

export interface BookingLogEmailConfig {
  enabled: boolean;
  recipient_email: string | null;
  schedule: BookingLogEmailScheduleEntry[];
}

export const BOOKING_LOG_EMAIL_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DEFAULT_BOOKING_LOG_EMAIL_SCHEDULE: BookingLogEmailScheduleEntry[] = [
  { day: 1, time: '17:00' },
  { day: 2, time: '17:00' },
  { day: 3, time: '17:00' },
  { day: 4, time: '17:00' },
  { day: 5, time: '17:00' },
];

/**
 * Value stored for new venues: emails disabled; empty schedule (UI may suggest
 * default weekdays when the admin first customises, via {@link normalizeBookingLogEmailConfig}).
 */
export const DEFAULT_VENUE_BOOKING_LOG_EMAIL_CONFIG: BookingLogEmailConfig = {
  enabled: false,
  recipient_email: null,
  schedule: [],
};

export const bookingLogEmailConfigSchema = z.object({
  enabled: z.boolean(),
  recipient_email: z.string().email().nullable(),
  schedule: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
    )
    .max(14),
});

export function normalizeBookingLogEmailConfig(
  value: unknown,
  defaultRecipientEmail: string | null = null,
): BookingLogEmailConfig {
  const parsed = bookingLogEmailConfigSchema.safeParse(value);
  if (!parsed.success) {
    return {
      enabled: false,
      recipient_email: defaultRecipientEmail,
      schedule: DEFAULT_BOOKING_LOG_EMAIL_SCHEDULE,
    };
  }

  return {
    enabled: parsed.data.enabled,
    recipient_email: parsed.data.recipient_email ?? defaultRecipientEmail,
    schedule: parsed.data.schedule.length > 0 ? parsed.data.schedule : DEFAULT_BOOKING_LOG_EMAIL_SCHEDULE,
  };
}
