import type { BookingEmailData, VenueEmailData, RenderedEmail } from "../types";
import {
  formatRefundDeadlineIso,
  isDepositRefundAvailableAt,
} from "@/lib/booking/cancellation-deadline";
import {
  renderBaseTemplate,
  formatDate,
  formatTime,
  formatDepositAmount,
} from "./base-template";

const AMBER_BG = "#FFF3CD";
const AMBER_TEXT = "#664D03";
const BRAND = "#4E6B78";
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

function buildRefundNotice(
  amount: string,
  refundCutoffIso: string,
  at: Date = new Date(),
): string {
  const fmt = formatRefundDeadlineIso(refundCutoffIso);
  const refundable = isDepositRefundAvailableAt(refundCutoffIso, at);
  const body = refundable
    ? `You've paid a deposit of \u00A3${amount}. If your plans change, you can cancel for a full refund before <strong>${fmt}</strong>. After this time, the deposit is non-refundable.`
    : `You've paid a deposit of \u00A3${amount}. Under the venue's policy, the deadline to cancel for a refund has already passed, so this deposit is not refundable if you cancel.`;
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${AMBER_BG};border:1px solid #FFE69C;border-radius:8px;margin:16px 0">`,
    `<tr><td style="padding:16px;font-size:14px;color:${AMBER_TEXT}">`,
    `<strong>Deposit refund notice</strong><br/>`,
    body,
    "</td></tr></table>",
  ].join("");
}

/**
 * Primary: confirm attendance (guest page records confirmation for staff).
 * Secondary: manage / change / cancel booking (full guest manage flow).
 */
function buildReminderActionButtons(
  confirmLink: string,
  manageLink: string | null | undefined,
): string {
  const m = manageLink?.trim();
  const blocks: string[] = [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0">',
    "<tr><td>",
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px">`,
    `<tr><td align="center" style="background-color:${BRAND};border-radius:8px;text-align:center">`,
    `<a href="${confirmLink}" target="_blank" style="display:block;padding:16px 32px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;text-decoration:none">Confirm my booking</a>`,
    "</td></tr></table>",
  ];
  if (m) {
    blocks.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">`,
      `<tr><td align="center" style="background-color:#ffffff;border:2px solid ${BRAND};border-radius:8px;text-align:center">`,
      `<a href="${m}" target="_blank" style="display:block;padding:14px 32px;color:${BRAND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;text-decoration:none">Manage or cancel</a>`,
      "</td></tr></table>",
    );
  }
  blocks.push("</td></tr></table>");
  return blocks.join("\n");
}

export function renderReminder56h(
  booking: BookingEmailData,
  venue: VenueEmailData,
  customMessage?: string | null,
): RenderedEmail {
  const date = formatDate(booking.booking_date);
  const time = formatTime(booking.booking_time);
  const hasDeposit =
    booking.deposit_status === "Paid" && booking.deposit_amount_pence;
  const appt = isAppointment(booking);

  let depositHtml: string | null = null;
  if (hasDeposit && booking.refund_cutoff) {
    depositHtml = buildRefundNotice(
      formatDepositAmount(booking.deposit_amount_pence!),
      booking.refund_cutoff,
    );
  }

  const introTable = `<p style="margin:0 0 12px 0">You have an upcoming booking. Please confirm you are still coming, or use <strong>Manage or cancel</strong> if you need to change or cancel your booking. <strong>If you do not reply, your booking stays in place</strong>. We will not cancel it automatically.</p>`;

  const confirmCancelLink = booking.confirm_cancel_link ?? "";
  const manageLink = booking.manage_booking_link ?? "";

  const actionButtonsHtml = confirmCancelLink
    ? buildReminderActionButtons(confirmCancelLink, manageLink || null)
    : "";

  const html = renderBaseTemplate({
    venueName: venue.name,
    venueLogoUrl: venue.logo_url,
    heading: `Please confirm your booking at ${venue.name}`,
    mainContent: introTable + actionButtonsHtml,
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
    footerNote:
      "Paid a deposit? The notice above explains when it is refundable. Use Manage or cancel to change your booking or request cancellation.",
  });

  const textParts = [`Hi ${booking.guest_name},`, ""];
  textParts.push(
    "Quick check on your upcoming booking. Use the confirm link to let us know you are coming, or the manage link to change or cancel. If we do not hear from you, your booking stays in place.",
    "",
  );
  textParts.push(`Date: ${date}`, `Time: ${time}`);
  if (!appt) textParts.push(`Party size: ${booking.party_size}`);
  if (appt && booking.appointment_service_name)
    textParts.push(`Service: ${booking.appointment_service_name}`);
  if (appt && booking.practitioner_name)
    textParts.push(`With: ${booking.practitioner_name}`);
  if (venue.address) textParts.push(`Address: ${venue.address}`);
  if (hasDeposit && booking.refund_cutoff) {
    const fmt = formatRefundDeadlineIso(booking.refund_cutoff);
    const refundable = isDepositRefundAvailableAt(booking.refund_cutoff);
    textParts.push(
      "",
      refundable
        ? `You've paid a deposit of \u00A3${formatDepositAmount(booking.deposit_amount_pence!)}. Full refund if you cancel before ${fmt}. Non-refundable after that.`
        : `You've paid a deposit of \u00A3${formatDepositAmount(booking.deposit_amount_pence!)}. The deadline to cancel for a refund has already passed; this deposit is not refundable if you cancel.`,
    );
  }
  if (customMessage) textParts.push("", customMessage);
  if (confirmCancelLink)
    textParts.push("", `Confirm my booking: ${confirmCancelLink}`);
  if (manageLink && manageLink !== confirmCancelLink) {
    textParts.push(`Manage or cancel: ${manageLink}`);
  }
  textParts.push(
    "",
    "If you take no action, your booking stays in place.",
    venue.name,
  );

  return {
    subject: `Please confirm your booking at ${venue.name} on ${date}`,
    html,
    text: textParts.join("\n"),
  };
}
