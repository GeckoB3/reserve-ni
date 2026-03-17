export interface VenueEmailData {
  name: string;
  address?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  booking_page_url?: string;
  timezone?: string;
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
  | 'deposit_request_sms'
  | 'deposit_confirmation_email'
  | 'reminder_56h_email'
  | 'day_of_reminder_sms'
  | 'day_of_reminder_email'
  | 'post_visit_email'
  | 'booking_modification_email'
  | 'booking_modification_sms';
