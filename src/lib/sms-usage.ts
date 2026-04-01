import { getSupabaseAdminClient } from '@/lib/supabase';

function billingMonthFirstDayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Persist SMS to sms_log and increment monthly usage (metered billing data).
 */
export async function recordOutboundSms(opts: {
  venueId: string;
  bookingId?: string;
  messageType: string;
  recipientPhone: string;
  twilioSid?: string;
  segmentCount: number;
}): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    const billingMonth = billingMonthFirstDayUtc();

    await admin.from('sms_log').insert({
      venue_id: opts.venueId,
      booking_id: opts.bookingId ?? null,
      message_type: opts.messageType,
      recipient_phone: opts.recipientPhone,
      twilio_message_sid: opts.twilioSid ?? null,
      status: 'sent',
      segment_count: Math.max(1, opts.segmentCount),
    });

    const { error } = await admin.rpc('increment_sms_usage', {
      p_venue_id: opts.venueId,
      p_billing_month: billingMonth,
    });

    if (error) {
      console.error('[recordOutboundSms] increment_sms_usage failed:', error.message, { venueId: opts.venueId });
    }
  } catch (err) {
    console.error('[recordOutboundSms] failed:', err);
  }
}

export function estimateSmsSegments(body: string): number {
  const hasNonGsm = /[^\u0000-\u007F\u00A1-\u00FF]/.test(body);
  const limit = hasNonGsm ? 70 : 160;
  return Math.max(1, Math.ceil(body.length / limit));
}
