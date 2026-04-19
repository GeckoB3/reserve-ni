import type {
  BookingEmailData,
  RenderedEmail,
  RenderedSms,
  VenueEmailData,
} from '@/lib/emails/types';
import {
  escapeHtml,
  formatDate,
  formatDepositAmount,
  formatTime,
  renderBaseTemplate,
} from '@/lib/emails/templates/base-template';
import { buildGoogleCalendarAddUrlForBooking } from '@/lib/emails/calendar-links';
import type {
  CommunicationLane,
  CommunicationMessageKey,
} from './policies';

export interface CommunicationRenderOptions {
  lane: CommunicationLane;
  messageKey: CommunicationMessageKey;
  booking: BookingEmailData;
  venue: VenueEmailData;
  emailCustomMessage?: string | null;
  smsCustomMessage?: string | null;
  paymentLink?: string | null;
  confirmLink?: string | null;
  cancelLink?: string | null;
  refundMessage?: string | null;
  rebookLink?: string | null;
  paymentDeadline?: string | null;
  paymentDeadlineHours?: number | null;
  durationText?: string | null;
  preAppointmentInstructions?: string | null;
  cancellationPolicy?: string | null;
  changeSummary?: string | null;
  message?: string | null;
}

function isAppointmentLane(lane: CommunicationLane): boolean {
  return lane === 'appointments_other';
}

function htmlParagraph(text: string): string {
  return `<p style="margin:0 0 14px 0">${escapeHtml(text)}</p>`;
}

function htmlRaw(text: string): string {
  return `<p style="margin:0 0 14px 0">${text}</p>`;
}

function formatMoneyOrNull(pence: number | null | undefined): string | null {
  if (typeof pence !== 'number') return null;
  return `£${formatDepositAmount(pence)}`;
}

/** Strip trailing venue-payment hint so the detail card shows a clean amount. */
export function normalizePriceDisplayForCard(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.replace(/\s*\(pay at venue\)\s*$/i, '').trim();
  return s || null;
}

/** First £ amount in a display string, as pence (for fallbacks when total pence is unset). */
export function parseFirstGbpPence(display: string | null | undefined): number | null {
  if (!display?.trim()) return null;
  const m = display.match(/£\s*([\d.]+)/i);
  if (!m) return null;
  const val = parseFloat(m[1]!);
  if (!Number.isFinite(val)) return null;
  return Math.round(val * 100);
}

function bookingConfirmationPaymentParagraphs(booking: BookingEmailData): string[] {
  const ds = (booking.deposit_status ?? '').toLowerCase();
  const paidPence = booking.deposit_amount_pence;
  const totalPence = booking.booking_total_price_pence ?? null;
  const inferredTotalPence =
    totalPence != null && totalPence > 0
      ? totalPence
      : parseFirstGbpPence(booking.appointment_price_display);

  const hasPositivePrice = inferredTotalPence != null && inferredTotalPence > 0;

  const paidOnline = ds === 'paid' && typeof paidPence === 'number' && paidPence > 0;

  if (paidOnline) {
    const amt = formatMoneyOrNull(paidPence);
    if (!amt) return [];
    if (totalPence != null && totalPence > 0 && paidPence >= totalPence) {
      return [htmlParagraph(`Paid in full online (${amt}).`)];
    }
    if (totalPence != null && totalPence > 0 && paidPence < totalPence) {
      const bal = formatMoneyOrNull(totalPence - paidPence);
      return [
        htmlParagraph(
          `Deposit paid online (${amt}). Remaining balance${bal ? ` (${bal})` : ''}: pay at the venue.`,
        ),
      ];
    }
    return [htmlParagraph(`Payment received online (${amt}).`)];
  }

  if (ds === 'pending') {
    return [];
  }

  if (hasPositivePrice && !paidOnline) {
    return [htmlParagraph('Payment is due at the venue.')];
  }

  return [];
}

function bookingConfirmationPaymentTextLines(booking: BookingEmailData): string[] {
  const ds = (booking.deposit_status ?? '').toLowerCase();
  const paidPence = booking.deposit_amount_pence;
  const totalPence = booking.booking_total_price_pence ?? null;
  const inferredTotalPence =
    totalPence != null && totalPence > 0
      ? totalPence
      : parseFirstGbpPence(booking.appointment_price_display);

  const hasPositivePrice = inferredTotalPence != null && inferredTotalPence > 0;

  const paidOnline = ds === 'paid' && typeof paidPence === 'number' && paidPence > 0;

  if (paidOnline) {
    const amt = formatMoneyOrNull(paidPence);
    if (!amt) return [];
    if (totalPence != null && totalPence > 0 && paidPence >= totalPence) {
      return [`Paid in full online (${amt}).`];
    }
    if (totalPence != null && totalPence > 0 && paidPence < totalPence) {
      const bal = formatMoneyOrNull(totalPence - paidPence);
      return [
        `Deposit paid online (${amt}). Remaining balance${bal ? ` (${bal})` : ''}: pay at the venue.`,
      ];
    }
    return [`Payment received online (${amt}).`];
  }

  if (ds === 'pending') {
    return [];
  }

  if (hasPositivePrice && !paidOnline) {
    return ['Payment is due at the venue.'];
  }

  return [];
}

function withStaff(
  base: string,
  booking: BookingEmailData,
): string {
  if (!booking.practitioner_name?.trim()) return base;
  return `${base} with ${booking.practitioner_name.trim()}`;
}

function bookingLabel(booking: BookingEmailData): string {
  return booking.appointment_service_name?.trim() || 'booking';
}

function smsManageTail(booking: BookingEmailData): string {
  if (!booking.manage_booking_link) return '';
  return ` Manage: ${booking.manage_booking_link}`;
}

function emailFooterText(venue: VenueEmailData): string {
  const parts = [venue.name];
  if (venue.phone) parts.push(venue.phone);
  if (venue.address) parts.push(venue.address);
  return parts.join(' • ');
}

function emailVariantForLane(lane: CommunicationLane): 'table' | 'appointment' {
  return isAppointmentLane(lane) ? 'appointment' : 'table';
}

function buildTextLines(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => Boolean(line && line.trim())).join('\n');
}

export function renderCommunicationSms(
  opts: CommunicationRenderOptions,
): RenderedSms | null {
  const venueName = opts.venue.name;
  const date = formatDate(opts.booking.booking_date);
  const time = formatTime(opts.booking.booking_time);
  const manage = smsManageTail(opts.booking);
  const partySize = opts.booking.party_size;
  const label = bookingLabel(opts.booking);
  const lead = opts.smsCustomMessage?.trim();
  const leadPart = lead ? `${lead} ` : '';
  const refundPart = opts.refundMessage ? ` ${opts.refundMessage}` : '';

  const body = (() => {
    switch (opts.messageKey) {
      case 'booking_confirmation': {
        const priceShow = normalizePriceDisplayForCard(opts.booking.appointment_price_display);
        const ds = (opts.booking.deposit_status ?? '').toLowerCase();
        const paidOnline =
          ds === 'paid' &&
          typeof opts.booking.deposit_amount_pence === 'number' &&
          opts.booking.deposit_amount_pence > 0;
        const payHint = (() => {
          if (!isAppointmentLane(opts.lane)) return '';
          if (paidOnline) {
            const amt = formatMoneyOrNull(opts.booking.deposit_amount_pence);
            return amt ? ` Paid ${amt} online.` : '';
          }
          if (ds === 'pending') return '';
          if (priceShow && parseFirstGbpPence(opts.booking.appointment_price_display)) {
            return ` ${priceShow}. Pay at venue.`;
          }
          return priceShow ? ` ${priceShow}.` : '';
        })();
        return isAppointmentLane(opts.lane)
          ? `${leadPart}${venueName}: Your ${withStaff(label, opts.booking)} is booked for ${date} at ${time}.${payHint}${manage}`.trim()
          : `${leadPart}${venueName}: Your table is booked for ${date} at ${time} (${partySize} guests).${manage} See you there!`.trim();
      }
      case 'deposit_payment_request':
        return isAppointmentLane(opts.lane)
          ? `${leadPart}${venueName}: Please pay your deposit to confirm your ${label} on ${date} at ${time}. ${opts.paymentLink ?? ''}`.trim()
          : `${leadPart}${venueName}: Please pay your deposit to confirm your table for ${date} at ${time} (${partySize} guests). ${opts.paymentLink ?? ''}`.trim();
      case 'confirm_or_cancel_prompt':
        return isAppointmentLane(opts.lane)
          ? `${leadPart}${venueName}: Can you still make your ${withStaff(label, opts.booking)} on ${date} at ${time}? Confirm: ${opts.confirmLink ?? ''} Cancel: ${opts.cancelLink ?? ''}`.trim()
          : `${leadPart}${venueName}: Can you still make your table for ${partySize} on ${date} at ${time}? Confirm: ${opts.confirmLink ?? ''} Cancel: ${opts.cancelLink ?? ''}`.trim();
      case 'deposit_payment_reminder':
        return isAppointmentLane(opts.lane)
          ? `${leadPart}${venueName}: Reminder - please pay your deposit to secure your ${label} on ${date} at ${time}. ${opts.paymentLink ?? ''}`.trim()
          : `${leadPart}${venueName}: Reminder - please pay your deposit to secure your table for ${date} at ${time}. ${opts.paymentLink ?? ''}`.trim();
      case 'pre_visit_reminder':
        return isAppointmentLane(opts.lane)
          ? `${leadPart}${venueName}: Reminder - your ${withStaff(label, opts.booking)} is booked for ${date} at ${time}. See you soon!`.trim()
          : `${leadPart}${venueName}: Reminder - your table for ${partySize} is booked for ${date} at ${time}. We look forward to seeing you!`.trim();
      case 'booking_modification':
        return isAppointmentLane(opts.lane)
          ? `${leadPart}${venueName}: Your ${withStaff(label, opts.booking)} has been moved to ${date} at ${time}.${manage}`.trim()
          : `${leadPart}${venueName}: Your table booking has been updated to ${date} at ${time} (${partySize} guests).${manage}`.trim();
      case 'cancellation_confirmation':
        return isAppointmentLane(opts.lane)
          ? `${leadPart}${venueName}: Your ${label} on ${date} at ${time} has been cancelled.${refundPart} We hope to see you again soon.`.trim()
          : `${leadPart}${venueName}: Your table booking for ${date} at ${time} has been cancelled.${refundPart} We hope to see you another time.`.trim();
      case 'auto_cancel_notification':
        return isAppointmentLane(opts.lane)
          ? `${leadPart}${venueName}: Your ${label} on ${date} at ${time} has been cancelled as the deposit was not paid in time. You're welcome to rebook anytime.`.trim()
          : `${leadPart}${venueName}: Your table for ${date} at ${time} has been cancelled as the deposit was not paid in time. You're welcome to rebook anytime.`.trim();
      case 'custom_message':
        return `${venueName}: ${opts.message ?? ''}`.trim();
      default:
        return null;
    }
  })();

  return body ? { body } : null;
}

function buildMainContentEmail(opts: CommunicationRenderOptions): {
  subject: string;
  heading: string;
  mainContent: string;
  textLines: Array<string | null>;
  ctaLabel?: string;
  ctaUrl?: string | null;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string | null;
} {
  const guestName = opts.booking.guest_name || 'Guest';
  const date = formatDate(opts.booking.booking_date);
  const time = formatTime(opts.booking.booking_time);
  const partySize = opts.booking.party_size;
  const depositAmount = formatMoneyOrNull(opts.booking.deposit_amount_pence);
  const label = bookingLabel(opts.booking);
  const withStaffLabel = withStaff(label, opts.booking);
  const appointment = isAppointmentLane(opts.lane);

  switch (opts.messageKey) {
    case 'booking_confirmation': {
      const priceLineText =
        appointment && opts.booking.appointment_price_display
          ? `Price: ${normalizePriceDisplayForCard(opts.booking.appointment_price_display) ?? opts.booking.appointment_price_display}`
          : null;
      const paymentHtml = appointment ? bookingConfirmationPaymentParagraphs(opts.booking) : [];
      const paymentText = appointment ? bookingConfirmationPaymentTextLines(opts.booking) : [];
      return {
        subject: appointment
          ? `Your appointment at ${opts.venue.name} is confirmed`
          : `Your booking at ${opts.venue.name} is confirmed`,
        heading: appointment ? 'Your appointment is confirmed' : 'Your booking is confirmed',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph(
            appointment
              ? 'Your appointment is confirmed. Here are the details:'
              : 'Your table is booked. Here are the details:',
          ),
          ...paymentHtml,
          opts.cancellationPolicy ? htmlRaw(`<strong>Cancellation policy:</strong> ${escapeHtml(opts.cancellationPolicy)}`) : '',
          opts.preAppointmentInstructions && appointment
            ? htmlRaw(`<strong>Before your appointment:</strong><br/>${escapeHtml(opts.preAppointmentInstructions)}`)
            : '',
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          appointment
            ? 'Your appointment is confirmed. Here are the details:'
            : 'Your table is booked. Here are the details:',
          appointment ? `Service: ${withStaffLabel}` : null,
          `Date: ${date}`,
          `Time: ${time}`,
          appointment ? opts.durationText ? `Duration: ${opts.durationText}` : null : `Guests: ${partySize}`,
          priceLineText,
          ...paymentText,
          opts.cancellationPolicy ? `Cancellation policy: ${opts.cancellationPolicy}` : null,
          opts.preAppointmentInstructions && appointment
            ? `Before your appointment: ${opts.preAppointmentInstructions}`
            : null,
          '',
          'Need to make changes?',
        ],
        ctaLabel: 'Manage Your Booking',
        ctaUrl: opts.booking.manage_booking_link ?? null,
      };
    }
    case 'deposit_payment_request':
      return {
        subject: `Complete your booking at ${opts.venue.name}`,
        heading: 'Complete your booking',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph(
            appointment
              ? 'Your appointment has been reserved, but a deposit is required to confirm it:'
              : 'Your table has been reserved, but a deposit is required to confirm it:',
          ),
          depositAmount ? htmlRaw(`<strong>Deposit required:</strong> ${escapeHtml(depositAmount)}`) : '',
          opts.paymentDeadlineHours != null
            ? htmlParagraph(
                appointment
                  ? `Please complete your payment within ${opts.paymentDeadlineHours} hours to secure your appointment.`
                  : `Please complete your payment within ${opts.paymentDeadlineHours} hours to secure your booking.`,
              )
            : '',
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          appointment
            ? 'Your appointment has been reserved, but a deposit is required to confirm it:'
            : 'Your table has been reserved, but a deposit is required to confirm it:',
          appointment ? `Service: ${withStaffLabel}` : null,
          `Date: ${date}`,
          `Time: ${time}`,
          appointment ? null : `Guests: ${partySize}`,
          depositAmount ? `Deposit required: ${depositAmount}` : null,
          opts.paymentDeadlineHours != null
            ? `Please complete payment within ${opts.paymentDeadlineHours} hours to secure it.`
            : null,
        ],
        ctaLabel: 'Pay Deposit Now',
        ctaUrl: opts.paymentLink ?? null,
      };
    case 'deposit_confirmation':
      return {
        subject: `Deposit received for ${opts.venue.name}`,
        heading: 'Deposit received',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph('Your deposit has been received and your booking is secured.'),
          depositAmount ? htmlRaw(`<strong>Deposit paid:</strong> ${escapeHtml(depositAmount)}`) : '',
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          'Your deposit has been received and your booking is secured.',
          depositAmount ? `Deposit paid: ${depositAmount}` : null,
        ],
        ctaLabel: 'Manage Your Booking',
        ctaUrl: opts.booking.manage_booking_link ?? null,
      };
    case 'confirm_or_cancel_prompt':
      return {
        subject: `Are you still coming to ${opts.venue.name}?`,
        heading: appointment ? 'Can you still make your appointment?' : 'Are you still coming?',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph(
            appointment
              ? "We're getting ready for your appointment and want to make sure everything is in order."
              : "We're getting ready for your visit and want to make sure everything is in order.",
          ),
          opts.cancellationPolicy ? htmlRaw(escapeHtml(opts.cancellationPolicy)) : '',
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          appointment
            ? "We're getting ready for your appointment and want to make sure everything is in order."
            : "We're getting ready for your visit and want to make sure everything is in order.",
          appointment ? `Service: ${withStaffLabel}` : null,
          `Date: ${date}`,
          `Time: ${time}`,
          appointment ? null : `Guests: ${partySize}`,
          opts.cancellationPolicy ?? null,
        ],
        ctaLabel: "Yes, I'm Coming",
        ctaUrl: opts.confirmLink ?? null,
        secondaryCtaLabel: appointment ? 'Cancel My Appointment' : 'Cancel My Booking',
        secondaryCtaUrl: opts.cancelLink ?? null,
      };
    case 'deposit_payment_reminder':
      return {
        subject: `Reminder: Complete your deposit for ${opts.venue.name}`,
        heading: 'Deposit reminder',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph(
            appointment
              ? "Just a quick reminder that your deposit for your upcoming appointment hasn't been paid yet:"
              : "Just a quick reminder that your deposit for your upcoming booking hasn't been paid yet:",
          ),
          depositAmount ? htmlRaw(`<strong>Deposit required:</strong> ${escapeHtml(depositAmount)}`) : '',
          opts.paymentDeadline
            ? htmlParagraph(`Please complete payment by ${opts.paymentDeadline}.`)
            : '',
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          appointment
            ? "Just a quick reminder that your deposit for your upcoming appointment hasn't been paid yet:"
            : "Just a quick reminder that your deposit for your upcoming booking hasn't been paid yet:",
          appointment ? `Service: ${withStaffLabel}` : null,
          `Date: ${date}`,
          `Time: ${time}`,
          appointment ? null : `Guests: ${partySize}`,
          depositAmount ? `Deposit required: ${depositAmount}` : null,
          opts.paymentDeadline ? `Please complete payment by ${opts.paymentDeadline}.` : null,
        ],
        ctaLabel: 'Pay Deposit Now',
        ctaUrl: opts.paymentLink ?? null,
      };
    case 'pre_visit_reminder':
      return {
        subject: appointment
          ? `Reminder: Your appointment at ${opts.venue.name} is coming up`
          : `Reminder: Your booking at ${opts.venue.name} is coming up`,
        heading: appointment ? 'Appointment reminder' : 'Booking reminder',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph(
            appointment
              ? 'This is a friendly reminder about your upcoming appointment:'
              : 'This is a friendly reminder about your upcoming booking:',
          ),
          opts.preAppointmentInstructions && appointment
            ? htmlRaw(`<strong>Before your appointment:</strong><br/>${escapeHtml(opts.preAppointmentInstructions)}`)
            : '',
          depositAmount ? htmlRaw(`<strong>Deposit paid:</strong> ${escapeHtml(depositAmount)}`) : '',
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          appointment
            ? 'This is a friendly reminder about your upcoming appointment:'
            : 'This is a friendly reminder about your upcoming booking:',
          appointment ? `Service: ${withStaffLabel}` : null,
          `Date: ${date}`,
          `Time: ${time}`,
          appointment ? opts.durationText ? `Duration: ${opts.durationText}` : null : `Guests: ${partySize}`,
          opts.preAppointmentInstructions && appointment
            ? `Before your appointment: ${opts.preAppointmentInstructions}`
            : null,
          depositAmount ? `Deposit paid: ${depositAmount}` : null,
        ],
        ctaLabel: 'Manage Your Booking',
        ctaUrl: opts.booking.manage_booking_link ?? null,
      };
    case 'booking_modification':
      return {
        subject: appointment
          ? `Your appointment at ${opts.venue.name} has been updated`
          : `Your booking at ${opts.venue.name} has been updated`,
        heading: appointment ? 'Your appointment has been updated' : 'Your booking has been updated',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph('Your booking has been updated. Here are the new details:'),
          opts.changeSummary ? htmlRaw(`<strong>What changed:</strong> ${escapeHtml(opts.changeSummary)}`) : '',
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          'Your booking has been updated. Here are the new details:',
          appointment ? `Service: ${withStaffLabel}` : null,
          `Date: ${date}`,
          `Time: ${time}`,
          appointment ? opts.durationText ? `Duration: ${opts.durationText}` : null : `Guests: ${partySize}`,
          opts.changeSummary ? `What changed: ${opts.changeSummary}` : null,
        ],
        ctaLabel: 'Manage Your Booking',
        ctaUrl: opts.booking.manage_booking_link ?? null,
      };
    case 'cancellation_confirmation':
      return {
        subject: appointment
          ? `Your appointment at ${opts.venue.name} has been cancelled`
          : `Your booking at ${opts.venue.name} has been cancelled`,
        heading: appointment ? 'Your appointment has been cancelled' : 'Your booking has been cancelled',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph(appointment ? 'Your appointment has been cancelled:' : 'Your booking has been cancelled:'),
          opts.refundMessage ? htmlParagraph(opts.refundMessage) : '',
          htmlParagraph(
            appointment
              ? "We're sorry to see you cancel. We'd love to welcome you back another time."
              : "We're sorry to see you cancel. We'd love to welcome you another time.",
          ),
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          appointment ? 'Your appointment has been cancelled:' : 'Your booking has been cancelled:',
          appointment ? `Service: ${withStaffLabel}` : null,
          `Date: ${date}`,
          `Time: ${time}`,
          appointment ? null : `Guests: ${partySize}`,
          opts.refundMessage ?? null,
        ],
        ctaLabel: 'Book Again',
        ctaUrl: opts.rebookLink ?? opts.venue.booking_page_url ?? null,
      };
    case 'auto_cancel_notification':
      return {
        subject: appointment
          ? `Your appointment at ${opts.venue.name} has been cancelled`
          : `Your booking at ${opts.venue.name} has been cancelled`,
        heading: 'Booking cancelled',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph(
            appointment
              ? "We're sorry to let you know that your appointment has been cancelled because the deposit wasn't paid in time:"
              : "We're sorry to let you know that your booking has been cancelled because the deposit wasn't paid in time:",
          ),
          htmlParagraph(
            appointment
              ? "The slot has been released. If you'd still like to book, you're welcome to choose a new time."
              : "The slot has been released. If you'd still like to visit us, you're welcome to make a new booking.",
          ),
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          appointment
            ? "We're sorry to let you know that your appointment has been cancelled because the deposit wasn't paid in time:"
            : "We're sorry to let you know that your booking has been cancelled because the deposit wasn't paid in time:",
          appointment ? `Service: ${withStaffLabel}` : null,
          `Date: ${date}`,
          `Time: ${time}`,
          appointment ? null : `Guests: ${partySize}`,
        ],
        ctaLabel: 'Book Again',
        ctaUrl: opts.rebookLink ?? opts.venue.booking_page_url ?? null,
      };
    case 'custom_message':
      return {
        subject: `A message from ${opts.venue.name}`,
        heading: 'A message from your venue',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          opts.message ? htmlParagraph(opts.message) : '',
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          opts.message ?? '',
        ],
      };
    case 'no_show_notification':
      return {
        subject: `We missed you at ${opts.venue.name}`,
        heading: 'We missed you',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph(
            appointment
              ? 'Your booking was marked as a no-show.'
              : 'Your table booking was marked as a no-show.',
          ),
          opts.refundMessage ? htmlParagraph(opts.refundMessage) : '',
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          appointment
            ? 'Your booking was marked as a no-show.'
            : 'Your table booking was marked as a no-show.',
          `Date: ${date}`,
          `Time: ${time}`,
          opts.refundMessage ?? null,
        ],
      };
    case 'post_visit_thankyou':
      return {
        subject: `Thank you for visiting ${opts.venue.name}`,
        heading: 'Thank you for your visit',
        mainContent: [
          htmlParagraph(`Hi ${guestName},`),
          htmlParagraph(
            appointment
              ? 'Thank you for choosing us for your appointment. We hope your experience was excellent.'
              : 'Thank you for dining with us. We hope you had a wonderful experience.',
          ),
        ].join(''),
        textLines: [
          `Hi ${guestName},`,
          '',
          appointment
            ? 'Thank you for choosing us for your appointment.'
            : 'Thank you for dining with us.',
        ],
        ctaLabel: 'Book Again',
        ctaUrl: opts.rebookLink ?? opts.venue.booking_page_url ?? null,
      };
  }
}

export function renderCommunicationEmail(
  opts: CommunicationRenderOptions,
): RenderedEmail | null {
  const config = buildMainContentEmail(opts);

  const calendarUrl =
    opts.messageKey === 'booking_confirmation'
      ? buildGoogleCalendarAddUrlForBooking(opts.booking, opts.venue)
      : null;

  let ctaLabel = config.ctaLabel;
  let ctaUrl = config.ctaUrl;
  let secondaryCtaLabel = config.secondaryCtaLabel;
  let secondaryCtaUrl = config.secondaryCtaUrl;

  if (calendarUrl) {
    if (ctaUrl) {
      secondaryCtaLabel = 'Add to calendar';
      secondaryCtaUrl = calendarUrl;
    } else {
      ctaLabel = 'Add to calendar';
      ctaUrl = calendarUrl;
    }
  }

  const priceForCard =
    opts.messageKey === 'booking_confirmation' && isAppointmentLane(opts.lane)
      ? normalizePriceDisplayForCard(opts.booking.appointment_price_display)
      : null;

  const html = renderBaseTemplate({
    venueName: opts.venue.name,
    venueLogoUrl: opts.venue.logo_url ?? null,
    heading: config.heading,
    mainContent: config.mainContent,
    bookingDate: formatDate(opts.booking.booking_date),
    bookingTime: formatTime(opts.booking.booking_time),
    partySize: opts.booking.party_size,
    venueAddress: opts.venue.address ?? null,
    specialRequests: opts.booking.special_requests ?? null,
    customMessage: opts.emailCustomMessage ?? null,
    ctaLabel,
    ctaUrl,
    secondaryCtaLabel,
    secondaryCtaUrl,
    footerNote: emailFooterText(opts.venue),
    emailVariant: emailVariantForLane(opts.lane),
    practitionerName: opts.booking.practitioner_name ?? null,
    serviceName: isAppointmentLane(opts.lane) ? bookingLabel(opts.booking) : null,
    priceDisplay: priceForCard,
    groupAppointments: opts.booking.group_appointments,
  });

  const text = buildTextLines([
    ...config.textLines,
    opts.emailCustomMessage ? '' : null,
    opts.emailCustomMessage ?? null,
    ctaLabel && ctaUrl ? '' : null,
    ctaLabel && ctaUrl ? `${ctaLabel}: ${ctaUrl}` : null,
    secondaryCtaLabel && secondaryCtaUrl ? `${secondaryCtaLabel}: ${secondaryCtaUrl}` : null,
    '',
    opts.venue.name,
    opts.venue.phone ?? null,
    opts.venue.address ?? null,
  ]);

  return {
    subject: config.subject,
    html,
    text,
  };
}
