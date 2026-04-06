import type { BookingModel } from '@/types/booking-models';

export interface VenueEmailData {
  name: string;
  address?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  booking_page_url?: string;
  timezone?: string;
}

/** One line in a group appointment booking (shared guest, multiple treatments). */
export interface GroupAppointmentLine {
  person_label: string;
  booking_date: string;
  booking_time: string;
  practitioner_name: string;
  service_name: string;
  /** e.g. "£45.00" or "Price on enquiry" */
  price_display?: string | null;
}

export interface BookingEmailData {
  id: string;
  guest_name: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  booking_date: string;
  booking_time: string;
  party_size: number;
  special_requests?: string | null;
  dietary_notes?: string | null;
  deposit_amount_pence?: number | null;
  deposit_status?: string | null;
  refund_cutoff?: string | null;
  manage_booking_link?: string | null;
  confirm_cancel_link?: string | null;
  /**
   * Effective booking model for this row (compile/render). Set for C/D/E so comms stay model-aware
   * without separate message types per model.
   */
  booking_model?: BookingModel;
  /**
   * `appointment`: Model B. Copy and detail rows use service / staff / price wording.
   * Omit or `table`: restaurant / table reservations (covers, guests).
   */
  email_variant?: 'table' | 'appointment';
  /** Model B single booking: staff member name */
  practitioner_name?: string | null;
  /** Model B: treatment / service name */
  appointment_service_name?: string | null;
  /** Model B: formatted price, e.g. "£45.00"; omit if POA */
  appointment_price_display?: string | null;
  /** Model B group: one row per person/treatment (omit for single appointment). */
  group_appointments?: GroupAppointmentLine[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RenderedSms {
  body: string;
}

export type CommMessageType =
  | 'booking_confirmation_email'
  | 'booking_confirmation_sms'
  | 'deposit_request_sms'
  | 'deposit_request_email'
  | 'deposit_confirmation_email'
  | 'reminder_56h_email'
  | 'day_of_reminder_sms'
  | 'day_of_reminder_email'
  | 'post_visit_email'
  | 'reminder_1_email'
  | 'reminder_1_sms'
  | 'reminder_2_email'
  | 'reminder_2_sms'
  | 'unified_post_visit_email'
  | 'booking_modification_email'
  | 'booking_modification_sms'
  | 'cancellation_email'
  | 'cancellation_sms';
