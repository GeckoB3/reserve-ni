import { z } from 'zod';
import { normalizeTimeToHhMm } from '@/lib/experience-events/experience-event-validation';

/**
 * Accepts HH:mm or HH:mm:ss (and similar) from browsers/DB; validates as HH:mm.
 */
export const zExperienceEventHhMm = z.preprocess(
  (v) => (typeof v === 'string' ? normalizeTimeToHhMm(v) : v),
  z.string().regex(/^\d{2}:\d{2}$/),
);

/** Clients often JSON-serialise empty optional fields as `null`; Zod's `.optional()` allows only `undefined`. */
export const zExperienceEventDescription = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? undefined : v),
  z.string().max(2000).optional(),
);

/** Human-readable line for API responses that include `zod` flatten() output. */
export function formatZodFlattenedError(details: unknown): string {
  if (!details || typeof details !== 'object') return '';
  const d = details as { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> };
  const parts: string[] = [];
  if (Array.isArray(d.formErrors)) parts.push(...d.formErrors);
  for (const [key, vals] of Object.entries(d.fieldErrors ?? {})) {
    if (vals && vals.length) parts.push(`${key}: ${vals.join(', ')}`);
  }
  return parts.filter(Boolean).join(' · ');
}
