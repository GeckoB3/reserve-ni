/**
 * Staff-initiated guest message delivery channel for POST /api/venue/bookings/[id]/message.
 */
export type GuestMessageChannel = 'email' | 'sms' | 'both';

export const GUEST_MESSAGE_CHANNEL_OPTIONS: Array<{ value: GuestMessageChannel; label: string }> = [
  { value: 'both', label: 'Email & SMS (use what is on file)' },
  { value: 'email', label: 'Email only' },
  { value: 'sms', label: 'SMS only' },
];
