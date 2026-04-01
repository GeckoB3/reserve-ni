import { getSupabaseAdminClient } from '@/lib/supabase';

/** Mirrors `venues.notification_settings` JSONB default (USE §4). */
export interface VenueNotificationSettings {
  confirmation_enabled: boolean;
  confirmation_channels: Array<'email' | 'sms'>;
  reminder_1_enabled: boolean;
  reminder_1_hours_before: number;
  reminder_1_channels: Array<'email' | 'sms'>;
  reminder_2_enabled: boolean;
  reminder_2_hours_before: number;
  reminder_2_channels: Array<'email' | 'sms'>;
  reschedule_notification_enabled: boolean;
  cancellation_notification_enabled: boolean;
  no_show_notification_enabled: boolean;
  post_visit_enabled: boolean;
  post_visit_timing: string;
  daily_schedule_enabled: boolean;
  staff_new_booking_alert: boolean;
  staff_cancellation_alert: boolean;
}

const DEFAULT_NOTIFICATION_SETTINGS: VenueNotificationSettings = {
  confirmation_enabled: true,
  confirmation_channels: ['email', 'sms'],
  reminder_1_enabled: true,
  reminder_1_hours_before: 24,
  reminder_1_channels: ['email', 'sms'],
  reminder_2_enabled: true,
  reminder_2_hours_before: 2,
  reminder_2_channels: ['sms'],
  reschedule_notification_enabled: true,
  cancellation_notification_enabled: true,
  no_show_notification_enabled: true,
  post_visit_enabled: true,
  post_visit_timing: '4_hours_after',
  daily_schedule_enabled: false,
  staff_new_booking_alert: true,
  staff_cancellation_alert: true,
};

export function parseNotificationSettings(raw: unknown): VenueNotificationSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NOTIFICATION_SETTINGS };
  const o = raw as Record<string, unknown>;
  return {
    confirmation_enabled: o.confirmation_enabled !== false,
    confirmation_channels: parseChannels(o.confirmation_channels),
    reminder_1_enabled: o.reminder_1_enabled !== false,
    reminder_1_hours_before: num(o.reminder_1_hours_before, 24),
    reminder_1_channels: parseChannels(o.reminder_1_channels),
    reminder_2_enabled: o.reminder_2_enabled !== false,
    reminder_2_hours_before: num(o.reminder_2_hours_before, 2),
    reminder_2_channels: parseChannels(o.reminder_2_channels),
    reschedule_notification_enabled: o.reschedule_notification_enabled !== false,
    cancellation_notification_enabled: o.cancellation_notification_enabled !== false,
    no_show_notification_enabled: o.no_show_notification_enabled !== false,
    post_visit_enabled: o.post_visit_enabled !== false,
    post_visit_timing: typeof o.post_visit_timing === 'string' ? o.post_visit_timing : '4_hours_after',
    daily_schedule_enabled: o.daily_schedule_enabled === true,
    staff_new_booking_alert: o.staff_new_booking_alert !== false,
    staff_cancellation_alert: o.staff_cancellation_alert !== false,
  };
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function parseChannels(v: unknown): Array<'email' | 'sms'> {
  if (!Array.isArray(v)) return ['email', 'sms'];
  const out: Array<'email' | 'sms'> = [];
  for (const x of v) {
    if (x === 'email' || x === 'sms') out.push(x);
  }
  return out.length ? out : ['email', 'sms'];
}

export async function getVenueNotificationSettings(venueId: string): Promise<VenueNotificationSettings> {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.from('venues').select('notification_settings').eq('id', venueId).maybeSingle();
  return parseNotificationSettings((data as { notification_settings?: unknown } | null)?.notification_settings);
}
