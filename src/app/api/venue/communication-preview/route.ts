import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { CommunicationChannel, CommunicationLane, CommunicationMessageKey } from '@/lib/communications/policies';
import { resolveCommPolicy } from '@/lib/communications/policy-resolver';
import {
  getPreviewBookingSample,
  getPreviewVenueSample,
  type CommunicationPreviewSampleVariant,
} from '@/lib/communications/preview-samples';
import {
  renderCommunicationEmail,
  renderCommunicationSms,
} from '@/lib/communications/renderer';

/**
 * POST /api/venue/communication-preview
 * Returns rendered preview of a specific message type with optional custom message.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await request.json();
    const messageKey = body.messageKey as CommunicationMessageKey;
    const channel = body.channel as CommunicationChannel | undefined;
    const lane = body.lane as CommunicationLane | undefined;
    const customMessage = (body.customMessage as string | undefined) ?? null;
    const sampleVariant = body.sampleVariant as
      | CommunicationPreviewSampleVariant
      | undefined;

    if (!messageKey || !channel || !lane) {
      return NextResponse.json(
        { error: 'Missing messageKey, channel, or lane' },
        { status: 400 },
      );
    }

    const admin = getSupabaseAdminClient();
    const { data: venue } = await admin
      .from('venues')
      .select('name, address, booking_model')
      .eq('id', staff.venue_id)
      .single();

    const bookingModel =
      (venue as { booking_model?: string | null } | null)?.booking_model ?? null;
    const resolved = await resolveCommPolicy({
      venueId: staff.venue_id,
      messageKey,
      bookingModel,
      lane,
      requestedChannels: [channel],
    });

    const venueData = getPreviewVenueSample(venue?.name ?? undefined, venue?.address ?? undefined);
    const booking = getPreviewBookingSample(
      lane,
      sampleVariant,
    );
    const emailCustomMessage =
      channel === 'email'
        ? customMessage
        : resolved.emailCustomMessage;
    const smsCustomMessage =
      channel === 'sms'
        ? customMessage
        : resolved.smsCustomMessage;

    const emailPreview =
      channel === 'email'
        ? renderCommunicationEmail({
            lane,
            messageKey,
            booking,
            venue: venueData,
            emailCustomMessage,
            smsCustomMessage,
            paymentLink: 'https://www.reserveni.com/pay?t=preview',
            confirmLink: 'https://www.reserveni.com/confirm/preview',
            cancelLink: 'https://www.reserveni.com/cancel/preview',
            refundMessage: '£20 deposit refunded',
            rebookLink: venueData.booking_page_url ?? null,
            paymentDeadline: '20 March at 17:00',
            paymentDeadlineHours: 24,
            durationText: '45 minutes',
            preAppointmentInstructions: 'Please arrive 10 minutes early.',
            cancellationPolicy:
              'Full refund if you cancel before the cutoff. No refund after that.',
            changeSummary: 'Time moved by 30 minutes.',
            message:
              'We have a quick update about your booking. Please contact us if you need anything else.',
          })
        : null;
    const smsPreview =
      channel === 'sms'
        ? renderCommunicationSms({
            lane,
            messageKey,
            booking,
            venue: venueData,
            emailCustomMessage,
            smsCustomMessage,
            paymentLink: 'https://www.reserveni.com/pay?t=preview',
            confirmLink: 'https://www.reserveni.com/confirm/preview',
            cancelLink: 'https://www.reserveni.com/cancel/preview',
            refundMessage: '£20 deposit refunded.',
            rebookLink: venueData.booking_page_url ?? null,
            paymentDeadline: '20 March at 17:00',
            paymentDeadlineHours: 24,
            durationText: '45 minutes',
            preAppointmentInstructions: 'Please arrive 10 minutes early.',
            cancellationPolicy:
              'Full refund if you cancel before the cutoff. No refund after that.',
            changeSummary: 'Time moved by 30 minutes.',
            message:
              'We have a quick update about your booking. Please contact us if you need anything else.',
          })
        : null;

    return NextResponse.json({
      messageKey,
      channel,
      lane,
      subject: emailPreview?.subject ?? null,
      html: emailPreview?.html ?? null,
      text: emailPreview?.text ?? smsPreview?.body ?? null,
      previewSampleKind: sampleVariant ?? lane,
    });
  } catch (err) {
    console.error('Preview render failed:', err);
    return NextResponse.json({ error: 'Render failed' }, { status: 500 });
  }
}
