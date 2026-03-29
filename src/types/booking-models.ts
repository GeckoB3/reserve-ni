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
}

/** Dated time off (annual / sick) — stored in `practitioner_leave_periods`. */
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

export interface ClassType {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  capacity: number;
  instructor_id: string | null;
  price_pence: number | null;
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
