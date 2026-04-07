import type { ScheduleBlockDTO } from '@/types/schedule-blocks';

/**
 * Secondary line for event_ticket schedule blocks: prefers structured DTO fields, falls back to API subtitle.
 */
export function formatEventUptakeLine(b: ScheduleBlockDTO): string | null {
  if (b.kind !== 'event_ticket') return b.subtitle ?? null;
  const cap = b.event_capacity;
  const cnt = b.event_booking_count ?? null;
  const party = b.event_party_total ?? null;
  if (cnt != null && party != null && cap != null && cap > 0) {
    return `${party}/${cap} spots · ${cnt} booking${cnt === 1 ? '' : 's'}`;
  }
  if (cnt != null && party != null) {
    return `${cnt} booking${cnt === 1 ? '' : 's'} · ${party} guest${party === 1 ? '' : 's'}`;
  }
  return b.subtitle ?? null;
}
