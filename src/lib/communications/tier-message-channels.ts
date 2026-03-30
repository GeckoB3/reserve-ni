/**
 * Tier-aware overrides for CommunicationService (see Docs tier routing spec).
 */

import type { MessageType } from './types';
import { isSmsAllowed } from '@/lib/tier-enforcement';

/** When non-null, replaces static MESSAGE_CHANNELS for this type. */
export async function getChannelsForMessage(
  messageType: MessageType,
  venueId: string | undefined,
): Promise<Array<'email' | 'sms'> | null> {
  if (messageType === 'deposit_payment_reminder') {
    if (!venueId) return ['email'];
    return (await isSmsAllowed(venueId)) ? ['sms'] : ['email'];
  }
  return null;
}
