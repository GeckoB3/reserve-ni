import type { AvailabilityBlock } from '@/types/availability';
import type { VenueOpeningException } from '@/types/venue-opening-exceptions';

/**
 * Convert availability_blocks rows (closed / amended_hours, venue-wide only)
 * into the VenueOpeningException[] shape consumed by the appointment and event
 * engines. This lets those engines keep their existing minute-range logic while
 * reading from the unified availability_blocks table.
 */
export function blocksToVenueOpeningExceptions(
  blocks: AvailabilityBlock[],
): VenueOpeningException[] {
  const out: VenueOpeningException[] = [];

  for (const b of blocks) {
    if (b.service_id != null) continue;
    if (b.block_type === 'closed' || b.block_type === 'special_event') {
      out.push({
        id: b.id,
        date_start: b.date_start,
        date_end: b.date_end,
        closed: true,
        reason: b.reason ?? undefined,
      });
    } else if (b.block_type === 'amended_hours' && Array.isArray(b.override_periods) && b.override_periods.length > 0) {
      out.push({
        id: b.id,
        date_start: b.date_start,
        date_end: b.date_end,
        closed: false,
        periods: b.override_periods,
        reason: b.reason ?? undefined,
      });
    }
  }

  out.sort((a, b) => (a.date_start < b.date_start ? -1 : a.date_start > b.date_start ? 1 : 0));
  return out;
}
