/**
 * Types for the five booking models and their associated entities.
 * Model A (table_reservation) types live in availability.ts / table-management.ts.
 */

// ---------------------------------------------------------------------------
// Booking model enum
// ---------------------------------------------------------------------------

export type BookingModel =
  | 'table_reservation'
  | 'practitioner_appointment'
  | 'unified_scheduling'
  | 'event_ticket'
  | 'class_session'
  | 'resource_booking';

// ---------------------------------------------------------------------------
// Terminology
// ---------------------------------------------------------------------------

export interface VenueTerminology {
  client: string;   // Guest / Client / Patient / Member / Booker
  booking: string;  // Reservation / Appointment / Booking / Session
  staff: string;    // Staff / Barber / Stylist / Instructor / Manager
}

export const DEFAULT_TERMINOLOGY: Record<BookingModel, VenueTerminology> = {
  table_reservation:        { client: 'Guest',  booking: 'Reservation',  staff: 'Staff' },
  practitioner_appointment: { client: 'Client', booking: 'Appointment',  staff: 'Staff' },
  unified_scheduling:       { client: 'Client', booking: 'Appointment',  staff: 'Staff' },
  event_ticket:             { client: 'Guest',  booking: 'Booking',      staff: 'Host' },
  class_session:            { client: 'Member', booking: 'Booking',      staff: 'Instructor' },
  resource_booking:         { client: 'Booker', booking: 'Booking',      staff: 'Manager' },
};

// ---------------------------------------------------------------------------
// Working hours (shared by practitioners & resources)
// ---------------------------------------------------------------------------

export interface TimeRange {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

/** Day-keyed working hours: keys are lowercase day names or "0"–"6". */
export type WorkingHours = Record<string, TimeRange[]>;

// ---------------------------------------------------------------------------
// Model B: Practitioner appointment
// ---------------------------------------------------------------------------

export interface Practitioner {
  id: string;
  venue_id: string;
  staff_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  working_hours: WorkingHours;
  break_times: TimeRange[];
  /**
   * When set to a non-empty object, breaks use these weekday keys ("0"–"6", or sun–sat) instead of `break_times`.
   * When null/undefined, `break_times` applies to every working day.
   */
  break_times_by_day?: WorkingHours | null;
  days_off: string[]; // recurring day names or "YYYY-MM-DD" dates
  is_active: boolean;
  sort_order: number;
  created_at: string;
  /** Public booking URL segment under /book/{venue-slug}/{slug} */
  slug?: string | null;
  /**
   * Concurrent overlapping appointments allowed (`unified_calendars.parallel_clients`).
   * Omitted or 1 = one busy occupancy interval at a time (default).
   */
  parallel_clients?: number;
}

/** Dated time off (annual / sick) - stored in `practitioner_leave_periods`. */
export type PractitionerLeaveType = 'annual' | 'sick' | 'other';

export interface PractitionerLeavePeriod {
  id: string;
  venue_id: string;
  practitioner_id: string;
  start_date: string;
  end_date: string;
  leave_type: PractitionerLeaveType;
  notes: string | null;
  created_at: string;
}

export interface AppointmentService {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  /** Turnover after service (resource / unified); included in slot occupancy in appointment engine. */
  processing_time_minutes?: number;
  price_pence: number | null;
  deposit_pence: number | null;
  colour: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  /** Admin: which fields individual staff may override for their own calendar. */
  staff_may_customize_name?: boolean;
  staff_may_customize_description?: boolean;
  staff_may_customize_duration?: boolean;
  staff_may_customize_buffer?: boolean;
  staff_may_customize_price?: boolean;
  staff_may_customize_deposit?: boolean;
  staff_may_customize_colour?: boolean;
}

export interface PractitionerService {
  id: string;
  practitioner_id: string;
  service_id: string;
  custom_duration_minutes: number | null;
  custom_price_pence: number | null;
  custom_name?: string | null;
  custom_description?: string | null;
  custom_buffer_minutes?: number | null;
  custom_deposit_pence?: number | null;
  custom_colour?: string | null;
}

// ---------------------------------------------------------------------------
// Model C: Event / experience ticket
// ---------------------------------------------------------------------------

export interface ExperienceEvent {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  event_date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:mm"
  end_time: string;   // "HH:mm"
  capacity: number;
  image_url: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  parent_event_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface EventTicketType {
  id: string;
  event_id: string;
  name: string;
  price_pence: number;
  capacity: number | null;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Model D: Class / group session
// ---------------------------------------------------------------------------

/** Stored as Postgres enum `class_payment_requirement`. */
export type ClassPaymentRequirement = 'none' | 'deposit' | 'full_payment';

export interface ClassType {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  capacity: number;
  instructor_id: string | null;
  /** Guest-facing label when no FK or as display override. */
  instructor_name: string | null;
  price_pence: number | null;
  /** Replaces legacy requires_online_payment boolean. */
  payment_requirement?: ClassPaymentRequirement;
  /** Per-person deposit when payment_requirement is deposit; must be <= price_pence. */
  deposit_amount_pence?: number | null;
  /** @deprecated Use payment_requirement; kept for older API responses until fully migrated. */
  requires_online_payment?: boolean;
  colour: string;
  is_active: boolean;
  created_at: string;
}

export interface ClassTimetableEntry {
  id: string;
  class_type_id: string;
  day_of_week: number; // 0=Sun, 6=Sat
  start_time: string;  // "HH:mm"
  is_active: boolean;
  /** Repeat every N weeks (1 = weekly, 2 = bi-weekly). */
  interval_weeks?: number;
  /** weekly | custom_interval (uses interval_weeks). */
  recurrence_type?: string;
  recurrence_end_date?: string | null;
  total_occurrences?: number | null;
}

export interface ClassInstance {
  id: string;
  class_type_id: string;
  timetable_entry_id: string | null;
  instance_date: string; // "YYYY-MM-DD"
  start_time: string;    // "HH:mm"
  capacity_override: number | null;
  is_cancelled: boolean;
  cancel_reason: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Model E: Resource / facility
// ---------------------------------------------------------------------------

/** Per-date override for resource opening hours (`venue_resources.availability_exceptions`). */
export type ResourceAvailabilityException = { closed: true } | { periods: Array<{ start: string; end: string }> };

export type ResourceAvailabilityExceptions = Record<string, ResourceAvailabilityException>;

export interface VenueResource {
  id: string;
  venue_id: string;
  name: string;
  resource_type: string | null;
  min_booking_minutes: number;
  max_booking_minutes: number;
  slot_interval_minutes: number;
  price_per_slot_pence: number | null;
  availability_hours: WorkingHours;
  /** Optional per-date closed days or replacement `periods` for that date only. */
  availability_exceptions?: ResourceAvailabilityExceptions;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Booking ticket lines (for events and classes)
// ---------------------------------------------------------------------------

export interface BookingTicketLine {
  id: string;
  booking_id: string;
  ticket_type_id: string | null;
  label: string;
  quantity: number;
  unit_price_pence: number;
  created_at: string;
}
