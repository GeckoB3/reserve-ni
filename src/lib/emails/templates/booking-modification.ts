import type {
  BookingEmailData,
  VenueEmailData,
  RenderedEmail,
  RenderedSms,
} from "../types";
import {
  renderBaseTemplate,
  buildDepositCallout,
  formatDate,
  formatTime,
  formatDepositAmount,
} from "./base-template";

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

export function renderBookingModification(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const depositPaid =
    booking.deposit_status === "Paid" && booking.deposit_amount_pence;
  const appt = isAppointment(booking);

  let depositHtml: string | null = null;
  if (depositPaid) {
    depositHtml = buildDepositCallout(
      formatDepositAmount(booking.deposit_amount_pence!),
      booking.refund_cutoff ?? null,
    );
  }

  const mainContent =
    '<p style="margin:0 0 12px 0">Your booking has been updated. Here are your new details:</p>';

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Your booking at ${venue.name} has been updated`,
    mainContent,
    bookingDate: date,
    bookingTime: time,
    partySize: booking.party_size,
    venueAddress: venue.address,
    depositInfoHtml: depositHtml,
    customMessage,
    emailVariant: appt ? "appointment" : "table",
    practitionerName: booking.practitioner_name ?? null,
    serviceName: booking.appointment_service_name ?? null,
    priceDisplay: booking.appointment_price_display ?? null,
    groupAppointments: booking.group_appointments,
    ctaLabel: booking.manage_booking_link ? "Manage booking" : undefined,
    ctaUrl: booking.manage_booking_link,
  });

  const textParts = [`Hi ${booking.guest_name},`, ""];
  if (appt) {
    textParts.push(
      `Your booking at ${venue.name} has been updated.`,
      "",
      "New details:",
    );
    if (booking.group_appointments && booking.group_appointments.length > 0) {
      for (const g of booking.group_appointments) {
        textParts.push(
          `* ${g.person_label}: ${formatDate(g.booking_date)} ${formatTime(g.booking_time)}. ${g.service_name} with ${g.practitioner_name}`,
        );
      }
    } else {
      textParts.push(`Date: ${date}`, `Time: ${time}`);
      if (booking.appointment_service_name)
        textParts.push(`Service: ${booking.appointment_service_name}`);
      if (booking.practitioner_name)
        textParts.push(`Staff: ${booking.practitioner_name}`);
    }
  } else {
    textParts.push(
      `Your booking at ${venue.name} has been updated.`,
      "",
      "New details:",
      `Date: ${date}`,
      `Time: ${time}`,
      `Party size: ${booking.party_size}`,
    );
  }
  if (venue.address) textParts.push(`Address: ${venue.address}`);
  if (depositPaid) {
    textParts.push(
      "",
      `Deposit paid: £${formatDepositAmount(booking.deposit_amount_pence!)}`,
    );
  }
  if (customMessage) textParts.push("", customMessage);
  if (booking.manage_booking_link) {
    textParts.push("", `Manage your booking: ${booking.manage_booking_link}`);
  }
  textParts.push(
    "",
    "If you have any questions, please contact us.",
    venue.name,
  );

  return {
    subject: `Your booking at ${venue.name} has been updated`,
    html,
    text: textParts.join("\n"),
  };
}

export function renderBookingModificationSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
): RenderedSms {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const appt = isAppointment(booking);
  if (appt) {
    const detail = booking.appointment_service_name
      ? `. ${booking.appointment_service_name}`
      : "";
    return {
      body: `${venue.name}: Your booking is updated to ${date} at ${time}${detail}.`,
    };
  }
  return {
    body: `${venue.name}: Your booking has been updated to ${date} at ${time} (${booking.party_size} guest${booking.party_size !== 1 ? "s" : ""}).`,
  };
}
