/**
 * Communication engine. All guest messages go through this module.
 * Channels: Email (SendGrid), SMS (Twilio). Add WhatsApp = new channel + add to service.
 */

export type { MessageType, CommunicationRequest, Recipient, TemplateVariables, MessageChannel } from './types';
export { communicationService } from './service';
export { mergeVariables, getEmailTemplate, getSmsTemplate } from './templates';
export { EmailChannel } from './channels/email';
export { SMSChannel } from './channels/sms';

import { communicationService } from './service';
import type { CommunicationRequest, MessageType } from './types';
import { getSupabaseAdminClient } from '@/lib/supabase';

const MARKETING_MESSAGE_TYPES = new Set<MessageType>(['post_visit_thankyou', 'dietary_digest', 'custom_message']);

async function shouldSkipMarketingComms(request: CommunicationRequest): Promise<boolean> {
  if (!MARKETING_MESSAGE_TYPES.has(request.type)) return false;

  const supabase = getSupabaseAdminClient();
  let guestId = request.guest_id;
  if (!guestId && request.booking_id) {
    const { data: row } = await supabase.from('bookings').select('guest_id').eq('id', request.booking_id).maybeSingle();
    guestId = row?.guest_id ?? undefined;
  }
  if (!guestId) return false;

  const { data: guest } = await supabase.from('guests').select('marketing_opt_out').eq('id', guestId).maybeSingle();
  return Boolean(guest?.marketing_opt_out);
}

export async function sendCommunication(request: CommunicationRequest): Promise<void> {
  if (await shouldSkipMarketingComms(request)) {
    console.warn(
      JSON.stringify({
        event: 'communication_skipped_marketing_opt_out',
        type: request.type,
        guest_id: request.guest_id,
        booking_id: request.booking_id,
      }),
    );
    return;
  }

  await communicationService.send(
    request.type,
    request.recipient,
    request.payload,
    { venue_id: request.venue_id, booking_id: request.booking_id, guest_id: request.guest_id },
  );
}
