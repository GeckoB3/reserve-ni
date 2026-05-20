import type { SupabaseClient } from '@supabase/supabase-js';

export interface BookingDetailCommunicationRow {
  id: string;
  message_type: string;
  channel: string;
  status: string;
  created_at: string;
  recipient?: string | null;
  error_message?: string | null;
}

type CommLogRow = {
  id: string;
  message_type: string;
  channel: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  recipient: string | null;
  error_message: string | null;
};

type LegacyCommRow = {
  id: string;
  message_type: string;
  channel: string;
  status: string;
  created_at: string;
  recipient_email: string | null;
  recipient_phone: string | null;
};

/**
 * Loads all guest-facing messages for a booking from `communication_logs` (current)
 * and legacy `communications` rows, newest first.
 */
export async function loadBookingDetailCommunications(
  db: SupabaseClient,
  bookingId: string,
): Promise<BookingDetailCommunicationRow[]> {
  const [logsResult, legacyResult] = await Promise.all([
    db
      .from('communication_logs')
      .select('id, message_type, channel, status, created_at, sent_at, recipient, error_message')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false }),
    db
      .from('communications')
      .select('id, message_type, channel, status, created_at, recipient_email, recipient_phone')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false }),
  ]);

  if (logsResult.error) {
    console.error('[loadBookingDetailCommunications] communication_logs failed:', logsResult.error);
    throw logsResult.error;
  }
  if (legacyResult.error) {
    console.error('[loadBookingDetailCommunications] communications failed:', legacyResult.error);
    throw legacyResult.error;
  }

  const fromLogs = (logsResult.data ?? []).map((row) => {
    const r = row as CommLogRow;
    return {
      id: r.id,
      message_type: r.message_type,
      channel: r.channel,
      status: r.status,
      created_at: r.sent_at ?? r.created_at,
      recipient: r.recipient,
      error_message: r.error_message,
    };
  });

  const fromLegacy = (legacyResult.data ?? []).map((row) => {
    const r = row as LegacyCommRow;
    return {
      id: r.id,
      message_type: r.message_type,
      channel: r.channel,
      status: r.status,
      created_at: r.created_at,
      recipient: r.recipient_email ?? r.recipient_phone ?? null,
      error_message: null,
    };
  });

  return [...fromLogs, ...fromLegacy].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
