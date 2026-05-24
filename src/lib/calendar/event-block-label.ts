import type { ScheduleBlockDTO } from '@/types/schedule-blocks';

/**
 * Secondary line for event_ticket schedule blocks: prefers structured DTO fields, falls back to API subtitle.
 */
function formatEventArrivedSuffix(arrived: number | null | undefined, bookingCount: number | null): string {
  if (arrived == null || bookingCount == null || bookingCount <= 0) return '';
  return ` · ${arrived} arrived`;
}

export function formatEventUptakeLine(b: ScheduleBlockDTO): string | null {
  if (b.kind !== 'event_ticket') return b.subtitle ?? null;
  const cap = b.event_capacity;
  const cnt = b.event_booking_count ?? null;
  const party = b.event_party_total ?? null;
  const arrived = b.event_arrived_count ?? null;
  const arrivedSuffix = formatEventArrivedSuffix(arrived, cnt);
  if (cnt != null && party != null && cap != null && cap > 0) {
    return `${party}/${cap} spots · ${cnt} booking${cnt === 1 ? '' : 's'}${arrivedSuffix}`;
  }
  if (cnt != null && party != null) {
    return `${cnt} booking${cnt === 1 ? '' : 's'} · ${party} guest${party === 1 ? '' : 's'}${arrivedSuffix}`;
  }
  return b.subtitle ?? null;
}
