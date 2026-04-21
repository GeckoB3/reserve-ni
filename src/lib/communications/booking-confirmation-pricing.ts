import type { BookingEmailData } from '@/lib/emails/types';
import {
  escapeHtml,
  formatDepositAmount,
} from '@/lib/emails/templates/base-template';

function htmlParagraph(text: string): string {
  return `<p style="margin:0 0 14px 0">${escapeHtml(text)}</p>`;
}

export function formatMoneyOrNull(pence: number | null | undefined): string | null {
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

/** Total price in pence when known (prefers `booking_total_price_pence`, else first £ in display). */
export function inferredTotalPricePence(booking: BookingEmailData): number | null {
  const totalPence = booking.booking_total_price_pence ?? null;
  if (totalPence != null && totalPence > 0) return totalPence;
  if (totalPence === 0) return 0;
  return parseFirstGbpPence(booking.appointment_price_display);
}

/**
 * Whether the confirmation should present the booking as free (no monetary charge).
 * Excludes pending/paid deposits where money is still involved.
 */
export function isFreeBookingDisplay(booking: BookingEmailData): boolean {
  const t = inferredTotalPricePence(booking);
  if (t != null && t > 0) return false;
  const ds = (booking.deposit_status ?? '').toLowerCase();
  if (ds === 'pending' && (booking.deposit_amount_pence ?? 0) > 0) return false;
  if (ds === 'paid' && (booking.deposit_amount_pence ?? 0) > 0) return false;

  if (t === 0) return true;
  if (t == null) {
    const gbp = parseFirstGbpPence(booking.appointment_price_display);
    if (gbp != null && gbp > 0) return false;
    const raw = booking.appointment_price_display?.trim();
    if (raw && !/£/.test(raw)) return false;
    return true;
  }
  return false;
}

/** Single line for the email detail card "Price" row (non–group bookings). */
export function priceDisplayForConfirmationCard(booking: BookingEmailData): string | null {
  if (booking.group_appointments && booking.group_appointments.length > 0) return null;

  if (isFreeBookingDisplay(booking)) return 'Free';

  const normalized = normalizePriceDisplayForCard(booking.appointment_price_display);
  if (normalized) return normalized;

  const inf = inferredTotalPricePence(booking);
  if (inf != null && inf > 0) return formatMoneyOrNull(inf);

  const raw = booking.appointment_price_display?.trim();
  if (raw && !/£/.test(raw)) return raw;

  return null;
}

export function bookingConfirmationPaymentParagraphs(booking: BookingEmailData): string[] {
  const ds = (booking.deposit_status ?? '').toLowerCase();
  const paidPence = booking.deposit_amount_pence;
  const totalPence = booking.booking_total_price_pence ?? null;
  const inferredTotal =
    totalPence != null && totalPence > 0
      ? totalPence
      : parseFirstGbpPence(booking.appointment_price_display);

  const hasPositivePrice = inferredTotal != null && inferredTotal > 0;
  const paidOnline = ds === 'paid' && typeof paidPence === 'number' && paidPence > 0;

  if (paidOnline) {
    const amt = formatMoneyOrNull(paidPence);
    if (!amt) return [];
    if (totalPence != null && totalPence > 0 && paidPence >= totalPence) {
      const totalFmt = formatMoneyOrNull(totalPence);
      return [
        htmlParagraph(
          totalFmt
            ? `Paid in full online (${amt} — total ${totalFmt}).`
            : `Paid in full online (${amt}).`,
        ),
      ];
    }
    if (totalPence != null && totalPence > 0 && paidPence < totalPence) {
      const bal = formatMoneyOrNull(totalPence - paidPence);
      return [
        htmlParagraph(
          `Deposit paid online (${amt}). Balance due at the venue${bal ? `: ${bal}` : ''}.`,
        ),
      ];
    }
    return [htmlParagraph(`Payment received online (${amt}).`)];
  }

  if (ds === 'pending' && typeof paidPence === 'number' && paidPence > 0) {
    const dep = formatMoneyOrNull(paidPence);
    const parts: string[] = [
      dep
        ? `A deposit of ${dep} is required to confirm this booking. You will receive payment details in a separate message.`
        : 'A deposit is required to confirm this booking. You will receive payment details in a separate message.',
    ];
    const totalFmt =
      totalPence != null && totalPence > 0
        ? formatMoneyOrNull(totalPence)
        : hasPositivePrice && inferredTotal != null
          ? formatMoneyOrNull(inferredTotal)
          : null;
    if (totalFmt) {
      parts.push(`Total price ${totalFmt}.`);
    }
    return [htmlParagraph(parts.join(' '))];
  }

  if (hasPositivePrice && !paidOnline) {
    const totalFmt = inferredTotal != null ? formatMoneyOrNull(inferredTotal) : null;
    const line = totalFmt
      ? `Total price ${totalFmt}. Pay at the venue.`
      : 'Payment is due at the venue.';
    return [htmlParagraph(line)];
  }

  if (isFreeBookingDisplay(booking)) {
    return [htmlParagraph('There is no charge for this booking.')];
  }

  return [];
}

export function bookingConfirmationPaymentTextLines(booking: BookingEmailData): string[] {
  const ds = (booking.deposit_status ?? '').toLowerCase();
  const paidPence = booking.deposit_amount_pence;
  const totalPence = booking.booking_total_price_pence ?? null;
  const inferredTotal =
    totalPence != null && totalPence > 0
      ? totalPence
      : parseFirstGbpPence(booking.appointment_price_display);

  const hasPositivePrice = inferredTotal != null && inferredTotal > 0;
  const paidOnline = ds === 'paid' && typeof paidPence === 'number' && paidPence > 0;

  if (paidOnline) {
    const amt = formatMoneyOrNull(paidPence);
    if (!amt) return [];
    if (totalPence != null && totalPence > 0 && paidPence >= totalPence) {
      const totalFmt = formatMoneyOrNull(totalPence);
      return [
        totalFmt
          ? `Paid in full online (${amt} — total ${totalFmt}).`
          : `Paid in full online (${amt}).`,
      ];
    }
    if (totalPence != null && totalPence > 0 && paidPence < totalPence) {
      const bal = formatMoneyOrNull(totalPence - paidPence);
      return [
        `Deposit paid online (${amt}). Balance due at the venue${bal ? `: ${bal}` : ''}.`,
      ];
    }
    return [`Payment received online (${amt}).`];
  }

  if (ds === 'pending' && typeof paidPence === 'number' && paidPence > 0) {
    const dep = formatMoneyOrNull(paidPence);
    const totalFmt =
      totalPence != null && totalPence > 0
        ? formatMoneyOrNull(totalPence)
        : hasPositivePrice && inferredTotal != null
          ? formatMoneyOrNull(inferredTotal)
          : null;
    const head =
      dep != null
        ? `A deposit of ${dep} is required. You will receive payment details in a separate message.`
        : 'A deposit is required. You will receive payment details in a separate message.';
    return totalFmt ? [head, `Total price ${totalFmt}.`] : [head];
  }

  if (hasPositivePrice && !paidOnline) {
    const totalFmt = inferredTotal != null ? formatMoneyOrNull(inferredTotal) : null;
    return totalFmt ? [`Total price ${totalFmt}. Pay at the venue.`] : ['Payment is due at the venue.'];
  }

  if (isFreeBookingDisplay(booking)) {
    return ['There is no charge for this booking.'];
  }

  return [];
}

/**
 * Short suffix for SMS (leading space when non-empty). Appointments / unified lanes only.
 */
export function bookingConfirmationSmsPriceSuffix(booking: BookingEmailData): string {
  const ds = (booking.deposit_status ?? '').toLowerCase();
  const paidPence = booking.deposit_amount_pence;
  const totalPence = booking.booking_total_price_pence ?? null;
  const inferredTotal =
    totalPence != null && totalPence > 0
      ? totalPence
      : parseFirstGbpPence(booking.appointment_price_display);
  const hasPositivePrice = inferredTotal != null && inferredTotal > 0;
  const paidOnline = ds === 'paid' && typeof paidPence === 'number' && paidPence > 0;

  if (paidOnline) {
    const amt = formatMoneyOrNull(paidPence);
    if (!amt) return '';
    if (totalPence != null && totalPence > 0 && paidPence >= totalPence) {
      const totalFmt = formatMoneyOrNull(totalPence);
      return totalFmt
        ? ` Paid in full (${amt}, total ${totalFmt}).`
        : ` Paid in full (${amt}).`;
    }
    if (totalPence != null && totalPence > 0 && paidPence < totalPence) {
      const bal = formatMoneyOrNull(totalPence - paidPence);
      return bal ? ` Paid ${amt} online; ${bal} at venue.` : ` Paid ${amt} online; balance at venue.`;
    }
    return ` Paid ${amt} online.`;
  }

  if (ds === 'pending' && (paidPence ?? 0) > 0) {
    const dep = formatMoneyOrNull(paidPence);
    const totalFmt =
      totalPence != null && totalPence > 0 ? formatMoneyOrNull(totalPence) : null;
    if (dep && totalFmt) return ` Deposit ${dep} required (total ${totalFmt}).`;
    return dep ? ` Deposit ${dep} required.` : ' Deposit required.';
  }

  if (isFreeBookingDisplay(booking)) return ' Free.';

  const priceShow =
    normalizePriceDisplayForCard(booking.appointment_price_display) ??
    (inferredTotal != null && inferredTotal > 0 ? formatMoneyOrNull(inferredTotal) : null);

  if (hasPositivePrice && priceShow) {
    return ` ${priceShow}. Pay at venue.`;
  }
  if (priceShow) return ` ${priceShow}.`;

  return '';
}
