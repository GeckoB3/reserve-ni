/** Pure validation helpers (safe for client and server). */

/**
 * Normalises time strings to HH:mm for API validation and payloads.
 * Browser `input type="time"` may return HH:mm:ss; stored rows may include seconds.
 */
export function normalizeTimeToHhMm(input: string): string {
  const s = String(input).trim();
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export function normalizeTimeForDb(t: string): string {
  const s = t.trim();
  if (s.length === 5) return `${s}:00`;
  return s;
}

function parseTimeToMinutes(t: string): number {
  const s = t.slice(0, 5);
  const [h, m] = s.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

export function validateStartEndTimes(startTime: string, endTime: string): string | null {
  const a = parseTimeToMinutes(startTime);
  const b = parseTimeToMinutes(endTime);
  if (Number.isNaN(a) || Number.isNaN(b)) return 'Invalid start or end time';
  if (b <= a) return 'End time must be after start time';
  return null;
}

export function validateMergedEventTimes(
  existingStart: string | null | undefined,
  existingEnd: string | null | undefined,
  patch: { start_time?: string; end_time?: string },
): string | null {
  const startSrc = patch.start_time ?? (existingStart ? String(existingStart).slice(0, 5) : '');
  const endSrc = patch.end_time ?? (existingEnd ? String(existingEnd).slice(0, 5) : '');
  if (!startSrc || !endSrc) return null;
  return validateStartEndTimes(startSrc, endSrc);
}
