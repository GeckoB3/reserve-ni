/**
 * Short label for the resource slot interval length (e.g. "30 min", "1 hour").
 * Used for "price per …" copy where billing is per `slot_interval_minutes`.
 */
export function slotIntervalDurationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'interval';
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? '1 hour' : `${h} hours`;
  }
  return `${minutes} min`;
}
