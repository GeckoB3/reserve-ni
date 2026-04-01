import type { MessageType, Recipient, TemplateVariables, MessageChannel } from './types';
import { compileEmailTemplate, compileSmsTemplate } from './templates';
import { EmailChannel } from './channels/email';
import { SMSChannel } from './channels/sms';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { isSmsAllowed } from '@/lib/tier-enforcement';
import { getChannelsForMessage } from '@/lib/communications/tier-message-channels';
import type { CommMessageType } from '@/lib/emails/types';
import { recordOutboundSms, estimateSmsSegments } from '@/lib/sms-usage';

interface LogContext {
  venue_id?: string;
  booking_id?: string;
  guest_id?: string;
}

export interface CommunicationSettings {
  confirmation_email_enabled: boolean;
  confirmation_email_custom_message: string | null;
  deposit_request_email_enabled: boolean;
  deposit_request_email_custom_message: string | null;
  deposit_sms_enabled: boolean;
  deposit_sms_custom_message: string | null;
  deposit_confirmation_email_enabled: boolean;
  deposit_confirmation_email_custom_message: string | null;
  reminder_email_enabled: boolean;
  reminder_email_custom_message: string | null;
  reminder_hours_before: number;
  day_of_reminder_enabled: boolean;
  day_of_reminder_time: string;
  day_of_reminder_sms_enabled: boolean;
  day_of_reminder_email_enabled: boolean;
  day_of_reminder_custom_message: string | null;
  post_visit_email_enabled: boolean;
  post_visit_email_time: string;
  post_visit_email_custom_message: string | null;
  modification_email_enabled: boolean;
  modification_sms_enabled: boolean;
  modification_custom_message: string | null;
  cancellation_email_enabled: boolean;
  cancellation_sms_enabled: boolean;
  cancellation_custom_message: string | null;
}

const SETTINGS_CACHE = new Map<string, { data: CommunicationSettings; ts: number }>();
const CACHE_TTL = 60_000;

export async function getCommSettings(venueId: string): Promise<CommunicationSettings> {
  const cached = SETTINGS_CACHE.get(venueId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('communication_settings')
    .select('*')
    .eq('venue_id', venueId)
    .maybeSingle();

  if (data) {
    const row = data as Record<string, unknown>;
    const normalized: CommunicationSettings = {
      ...(data as CommunicationSettings),
      deposit_request_email_enabled: row.deposit_request_email_enabled !== false,
      deposit_request_email_custom_message:
        (row.deposit_request_email_custom_message as string | null | undefined) ?? null,
    };
    SETTINGS_CACHE.set(venueId, { data: normalized, ts: Date.now() });
    return normalized;
  }

  // Auto-create with defaults if not found
  const { data: created } = await supabase
    .from('communication_settings')
    .insert({ venue_id: venueId })
    .select('*')
    .single();

  if (created) {
    const row = created as Record<string, unknown>;
    const normalized: CommunicationSettings = {
      ...(created as CommunicationSettings),
      deposit_request_email_enabled: row.deposit_request_email_enabled !== false,
      deposit_request_email_custom_message:
        (row.deposit_request_email_custom_message as string | null | undefined) ?? null,
    };
    SETTINGS_CACHE.set(venueId, { data: normalized, ts: Date.now() });
    return normalized;
  }

  const fallback: CommunicationSettings = {
    confirmation_email_enabled: true,
    confirmation_email_custom_message: null,
    deposit_request_email_enabled: true,
    deposit_request_email_custom_message: null,
    deposit_sms_enabled: true,
    deposit_sms_custom_message: null,
    deposit_confirmation_email_enabled: true,
    deposit_confirmation_email_custom_message: null,
    reminder_email_enabled: true,
    reminder_email_custom_message: null,
    reminder_hours_before: 56,
    day_of_reminder_enabled: true,
    day_of_reminder_time: '09:00:00',
    day_of_reminder_sms_enabled: true,
    day_of_reminder_email_enabled: true,
    day_of_reminder_custom_message: null,
    post_visit_email_enabled: true,
    post_visit_email_time: '09:00:00',
    post_visit_email_custom_message: null,
    modification_email_enabled: true,
    modification_sms_enabled: false,
    modification_custom_message: null,
    cancellation_email_enabled: true,
    cancellation_sms_enabled: false,
    cancellation_custom_message: null,
  };

  SETTINGS_CACHE.set(venueId, { data: fallback, ts: Date.now() });
  return fallback;
}

export function clearSettingsCache(venueId?: string): void {
  if (venueId) SETTINGS_CACHE.delete(venueId);
  else SETTINGS_CACHE.clear();
}

/** Merge API row with safe defaults when columns are missing (pre-migration or partial select). */
export function normalizeCommunicationSettingsRow(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...data,
    deposit_request_email_enabled: data.deposit_request_email_enabled !== false,
    deposit_request_email_custom_message:
      (data.deposit_request_email_custom_message as string | null | undefined) ?? null,
  };
}

/**
 * Log to the new communication_logs table using INSERT ON CONFLICT DO NOTHING.
 * Returns true if the insert succeeded (i.e. no duplicate existed), false otherwise.
 */
export async function logToCommLogs(opts: {
  venue_id: string;
  booking_id: string;
  message_type: CommMessageType;
  channel: 'email' | 'sms';
  recipient: string;
  status: 'pending' | 'sent' | 'failed';
  external_id?: string | null;
  error_message?: string | null;
}): Promise<boolean> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('communication_logs')
      .insert({
        venue_id: opts.venue_id,
        booking_id: opts.booking_id,
        message_type: opts.message_type,
        channel: opts.channel,
        recipient: opts.recipient,
        status: opts.status,
        external_id: opts.external_id ?? null,
        error_message: opts.error_message ?? null,
        sent_at: opts.status === 'sent' ? new Date().toISOString() : null,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') return false; // unique_message_per_booking violated = duplicate
      console.error('[logToCommLogs] insert error:', error);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.error('[logToCommLogs] failed:', err);
    return false;
  }
}

/**
 * Update an existing communication_logs row status (e.g. pending → sent or failed).
 */
export async function updateCommLogStatus(opts: {
  venue_id: string;
  booking_id: string;
  message_type: CommMessageType;
  status: 'sent' | 'failed';
  external_id?: string | null;
  error_message?: string | null;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from('communication_logs')
      .update({
        status: opts.status,
        external_id: opts.external_id ?? null,
        error_message: opts.error_message ?? null,
        sent_at: opts.status === 'sent' ? new Date().toISOString() : null,
      })
      .eq('booking_id', opts.booking_id)
      .eq('message_type', opts.message_type);
  } catch (err) {
    console.error('[updateCommLogStatus] failed:', err);
  }
}

/** Which channels each message type uses. */
const MESSAGE_CHANNELS: Record<MessageType, Array<'email' | 'sms'>> = {
  booking_confirmation: [],
  deposit_payment_request: [],
  deposit_payment_reminder: [],
  pre_visit_reminder: [],
  confirm_or_cancel_prompt: [],
  dietary_digest: ['email'],
  post_visit_thankyou: [],
  auto_cancel_notification: ['email', 'sms'],
  booking_modification: [],
  cancellation_confirmation: [],
  no_show_notification: ['email'],
  custom_message: ['email', 'sms'],
};

const emailChannel: MessageChannel = new EmailChannel();
const smsChannel: MessageChannel = new SMSChannel();
const DEDUPED_MESSAGE_TYPES = new Set<MessageType>([
  'booking_confirmation',
  'deposit_payment_reminder',
  'pre_visit_reminder',
  'confirm_or_cancel_prompt',
  'auto_cancel_notification',
  'cancellation_confirmation',
  'no_show_notification',
]);

function getChannel(ch: 'email' | 'sms'): MessageChannel {
  return ch === 'email' ? emailChannel : smsChannel;
}

function normalisePayload(payload: TemplateVariables): Record<string, string | number | undefined> {
  const p = { ...payload } as Record<string, string | number | undefined>;
  if (p.deposit_amount_pence != null && p.deposit_amount == null) {
    p.deposit_amount = (Number(p.deposit_amount_pence) / 100).toFixed(2);
  }
  if (p.booking_time != null && typeof p.booking_time === 'string' && p.booking_time.length > 5) {
    p.booking_time = p.booking_time.slice(0, 5);
  }
  if (typeof p.booking_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.booking_date)) {
    const [y, m, d] = p.booking_date.split('-');
    p.booking_date = `${d}/${m}/${y}`;
  }
  if (typeof p.cancellation_deadline === 'string' && p.cancellation_deadline.includes('T')) {
    try {
      const dt = new Date(p.cancellation_deadline);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      const hh = String(dt.getHours()).padStart(2, '0');
      const min = String(dt.getMinutes()).padStart(2, '0');
      p.cancellation_deadline = `${dd}/${mm}/${yyyy} at ${hh}:${min}`;
    } catch {
      // leave as-is
    }
  }
  return p;
}

export class CommunicationService {
  private async isDuplicateSend(
    type: MessageType,
    channel: 'email' | 'sms',
    ctx: LogContext
  ): Promise<boolean> {
    if (!ctx.venue_id) return false;
    if (!ctx.booking_id && !ctx.guest_id) return false;
    try {
      const supabase = getSupabaseAdminClient();
      let query = supabase
        .from('communications')
        .select('id')
        .eq('venue_id', ctx.venue_id)
        .eq('message_type', type)
        .eq('channel', channel)
        .eq('status', 'sent')
        .limit(1);
      if (ctx.booking_id) {
        query = query.eq('booking_id', ctx.booking_id);
      } else if (ctx.guest_id) {
        query = query.eq('guest_id', ctx.guest_id);
      }
      const { data } = await query.maybeSingle();
      return Boolean(data);
    } catch (err) {
      console.error('[CommunicationService] dedupe check failed, continuing send:', err);
      return false;
    }
  }

  private async logCommunication(
    type: MessageType,
    channel: string,
    recipient: Recipient,
    status: 'sent' | 'failed',
    ctx: LogContext,
  ): Promise<void> {
    try {
      if (!ctx.venue_id) return;
      const supabase = getSupabaseAdminClient();
      await supabase.from('communications').insert({
        venue_id: ctx.venue_id,
        booking_id: ctx.booking_id ?? null,
        guest_id: ctx.guest_id ?? null,
        message_type: type,
        channel,
        recipient_email: recipient.email ?? null,
        recipient_phone: recipient.phone ?? null,
        status,
      });
    } catch (logErr) {
      console.error('[CommunicationService] Failed to log communication:', logErr);
    }
  }

  async send(type: MessageType, recipient: Recipient, payload: TemplateVariables, ctx: LogContext = {}): Promise<void> {
    const tierChannels = await getChannelsForMessage(type, ctx.venue_id);
    const channels = tierChannels ?? MESSAGE_CHANNELS[type];
    if (!channels?.length) {
      console.warn('[CommunicationService] No channels for type', type);
      return;
    }

    const smsAllowed = ctx.venue_id ? await isSmsAllowed(ctx.venue_id) : false;

    const vars = normalisePayload(payload);

    for (const ch of channels) {
      if (ch === 'sms' && !smsAllowed) continue;

      try {
        if (DEDUPED_MESSAGE_TYPES.has(type)) {
          const duplicate = await this.isDuplicateSend(type, ch, ctx);
          if (duplicate) continue;
        }
        if (ch === 'email') {
          const compiled = compileEmailTemplate(type, vars);
          if (compiled && recipient.email) {
            await getChannel('email').send(recipient, { subject: compiled.subject, body: compiled.body }, payload);
            await this.logCommunication(type, 'email', recipient, 'sent', ctx);
          }
        } else {
          const body = compileSmsTemplate(type, vars);
          if (body && recipient.phone) {
            await getChannel('sms').send(recipient, { body }, payload);
            await this.logCommunication(type, 'sms', recipient, 'sent', ctx);
            if (ctx.venue_id) {
              await recordOutboundSms({
                venueId: ctx.venue_id,
                bookingId: ctx.booking_id,
                messageType: type,
                recipientPhone: recipient.phone,
                segmentCount: estimateSmsSegments(body),
              });
            }
          }
        }
      } catch (err) {
        console.error(`[CommunicationService] ${ch} failed for ${type}:`, err);
        await this.logCommunication(type, ch, recipient, 'failed', ctx);
      }
    }
  }
}

export const communicationService = new CommunicationService();
