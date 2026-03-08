/**
 * Detects overlapping service periods.
 * Works with both the onboarding ServiceDraft (no id) and the full Service (with id).
 */

interface ServiceLike {
  name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

export interface OverlapWarning {
  serviceA: string;
  serviceB: string;
  sharedDays: number[];
  overlapStart: string;
  overlapEnd: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function timesOverlap(
  startA: string, endA: string,
  startB: string, endB: string,
): { overlaps: boolean; overlapStart: string; overlapEnd: string } {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);

  const overlapStartMin = Math.max(sA, sB);
  const overlapEndMin = Math.min(eA, eB);

  if (overlapStartMin < overlapEndMin) {
    const fmtH = (m: number) => String(Math.floor(m / 60)).padStart(2, '0');
    const fmtM = (m: number) => String(m % 60).padStart(2, '0');
    return {
      overlaps: true,
      overlapStart: `${fmtH(overlapStartMin)}:${fmtM(overlapStartMin)}`,
      overlapEnd: `${fmtH(overlapEndMin)}:${fmtM(overlapEndMin)}`,
    };
  }
  return { overlaps: false, overlapStart: '', overlapEnd: '' };
}

/**
 * Given a list of services, returns warnings for any pairs that overlap
 * on at least one shared day. Inactive services are ignored.
 */
export function detectOverlaps(services: ServiceLike[]): OverlapWarning[] {
  const active = services.filter(s => s.is_active !== false && s.name.trim());
  const warnings: OverlapWarning[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!;
      const b = active[j]!;

      const sharedDays = a.days_of_week.filter(d => b.days_of_week.includes(d));
      if (sharedDays.length === 0) continue;

      const { overlaps, overlapStart, overlapEnd } = timesOverlap(
        a.start_time, a.end_time,
        b.start_time, b.end_time,
      );

      if (overlaps) {
        warnings.push({
          serviceA: a.name,
          serviceB: b.name,
          sharedDays,
          overlapStart,
          overlapEnd,
        });
      }
    }
  }

  return warnings;
}

/** Format an overlap warning into a human-readable string. */
export function formatOverlapWarning(w: OverlapWarning): string {
  const days = w.sharedDays.map(d => DAY_NAMES[d]).join(', ');
  return `"${w.serviceA}" and "${w.serviceB}" overlap ${w.overlapStart}–${w.overlapEnd} on ${days}`;
}
