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
import type { CommunicationRequest } from './types';

export async function sendCommunication(request: CommunicationRequest): Promise<void> {
  await communicationService.send(
    request.type,
    request.recipient,
    request.payload,
    { venue_id: request.venue_id, booking_id: request.booking_id, guest_id: request.guest_id },
  );
}
