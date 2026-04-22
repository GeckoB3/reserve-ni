import type { OpeningHoursDaySettings, OpeningHoursSettings } from '@/app/dashboard/settings/types';
import type { WorkingHours } from '@/types/booking-models';
import { defaultPractitionerWorkingHours } from '@/lib/availability/practitioner-defaults';

const DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const;

/** Aligns with `OpeningHoursControl` / persisted venue opening_hours shape. */
function getDayConfig(oh: OpeningHoursSettings | null, day: string): OpeningHoursDaySettings {
  const d = oh?.[day] as
    | { closed?: boolean; periods?: { open: string; close: string }[]; open?: string; close?: string }
    | undefined;
  if (!d) return { closed: true };
  if (d.periods?.length) return { periods: d.periods };
  if (d.closed === true) return { closed: true };
  if (typeof d.open === 'string' && typeof d.close === 'string') {
    return { periods: [{ open: d.open, close: d.close }] };
  }
  return { closed: true };
}

/** Maps venue opening hours to per-calendar `WorkingHours` (closed days omitted). */
export function openingHoursSettingsToWorkingHours(oh: OpeningHoursSettings): WorkingHours {
  const out: WorkingHours = {};
  for (const key of DAY_KEYS) {
    const config = getDayConfig(oh, key);
    if ('closed' in config && config.closed) continue;
    if ('periods' in config && config.periods?.length) {
      out[key] = config.periods.map((p) => ({ start: p.open, end: p.close }));
    }
  }
  return out;
}

/**
 * Default calendar weekly hours from business opening hours (onboarding + empty practitioner rows).
 * Falls back to generic practitioner template if opening hours yield no working days.
 */
export function defaultCalendarWorkingHoursFromOpeningHours(oh: OpeningHoursSettings): WorkingHours {
  const wh = openingHoursSettingsToWorkingHours(oh);
  const hasDay = Object.values(wh).some((ranges) => Array.isArray(ranges) && ranges.length > 0);
  return hasDay ? wh : defaultPractitionerWorkingHours();
}
