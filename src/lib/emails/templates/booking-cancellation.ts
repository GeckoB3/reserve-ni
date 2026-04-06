import type {
  BookingEmailData,
  VenueEmailData,
  RenderedEmail,
  RenderedSms,
} from "../types";
import { renderBaseTemplate, formatDate, formatTime } from "./base-template";

const AMBER_BG = "#FFF3CD";
const AMBER_TEXT = "#664D03";

function isAppointment(booking: BookingEmailData): boolean {
  return (
    booking.email_variant === "appointment" ||
    Boolean(
      booking.group_appointments?.length ||
      booking.practitioner_name ||
      booking.appointment_service_name,
    )
  );
}

function buildRefundCallout(refundMessage: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${AMBER_BG};border:1px solid #FFE69C;border-radius:8px;margin:16px 0"><tr><td style="padding:16px;font-size:14px;color:${AMBER_TEXT}">${refundMessage}</td></tr></table>`;
}

export function renderBookingCancellation(
  booking: BookingEmailData,
  venue: VenueEmailData,
  refundMessage?: string | null,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const appt = isAppointment(booking);

  const mainContent =
    '<p style="margin:0 0 12px 0">Your booking has been cancelled.</p>';

  const refundHtml = refundMessage ? buildRefundCallout(refundMessage) : null;

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Booking cancelled: ${venue.name}`,
    mainContent,
    bookingDate: date,
    bookingTime: time,
    partySize: booking.party_size,
    venueAddress: venue.address,
    depositInfoHtml: refundHtml,
    customMessage,
    emailVariant: appt ? "appointment" : "table",
    practitionerName: booking.practitioner_name ?? null,
    serviceName: booking.appointment_service_name ?? null,
    priceDisplay: booking.appointment_price_display ?? null,
    groupAppointments: booking.group_appointments,
    footerNote: "We hope to see you another time.",
  });

  const textParts = [`Hi ${booking.guest_name},`, ""];
  textParts.push(`Your booking at ${venue.name} has been cancelled.`, "");
  if (appt && booking.appointment_service_name)
    textParts.push(`Service was: ${booking.appointment_service_name}`);
  textParts.push(`Date: ${date}`, `Time: ${time}`);
  if (!appt) textParts.push(`Party size: ${booking.party_size}`);
  if (refundMessage) textParts.push("", refundMessage);
  if (customMessage) textParts.push("", customMessage);
  textParts.push("", "We hope to see you another time.", venue.name);

  return {
    subject: `Booking cancelled: ${venue.name}`,
    html,
    text: textParts.join("\n"),
  };
}

export function renderBookingCancellationSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  refundMessage?: string | null,
): RenderedSms {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const refundPart = refundMessage ? ` ${refundMessage}` : "";
  const appt = isAppointment(booking);
  if (appt) {
    return {
      body: `${venue.name}: Your booking on ${date} at ${time} has been cancelled.${refundPart} We hope to see you another time.`,
    };
  }
  return {
    body: `${venue.name}: Your booking for ${date} at ${time} has been cancelled.${refundPart} We hope to see you another time.`,
  };
}
