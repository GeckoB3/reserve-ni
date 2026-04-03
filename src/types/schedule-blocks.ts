/**
 * Normalized schedule items for staff calendar (Docs §4.2).
 * Excludes Model A (table_reservation). Appointments use the practitioner grid; this feed is for C/D/E + empty shells.
 *
 * **Option A (v1):** Unified / practitioner appointments and `event_session` rows are **not** emitted here - they
 * appear only on the practitioner columns in `PractitionerCalendarView`. Extending this feed with a separate
 * `event_session` block kind (Option B) would require deduping against the grid.
 */

export type ScheduleBlockKind = 'event_ticket' | 'class_session' | 'resource_booking';

/** JSON shape returned by GET /api/venue/schedule */
export interface ScheduleBlockDTO {
  id: string;
  kind: ScheduleBlockKind;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  subtitle?: string | null;
  booking_id?: string | null;
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  resource_id?: string | null;
  status?: string | null;
  /** Left border / legend (hex), optional */
  accent_colour?: string | null;
  /** Model D: total capacity for this class instance (when known). */
  class_capacity?: number | null;
  /** Model D: total spots booked (all guests) for this instance. */
  class_booked_spots?: number | null;
}
