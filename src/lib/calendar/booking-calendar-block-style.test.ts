import { describe, expect, it } from 'vitest';
import {
  bookingCalendarBlockCardStyle,
  bookingCalendarBlockPalette,
  bookingCalendarBlockPaletteWithOverlay,
  calendarBookingVisualKey,
  CalendarBookingStatusStripe,
  isArrivedWaitingDisplay,
} from './booking-calendar-block-style';

describe('bookingCalendarBlockPalette', () => {
  it('maps lifecycle statuses to distinct accent (dot/pill) colours', () => {
    expect(bookingCalendarBlockPalette({ status: 'Booked' }).accent).toBe('#0369A1');
    expect(bookingCalendarBlockPalette({ status: 'Confirmed' }).accent).toBe('#003B6F');
    expect(bookingCalendarBlockPalette({ status: 'Booked' }).bg).not.toBe(
      bookingCalendarBlockPalette({ status: 'Confirmed' }).bg,
    );
    expect(bookingCalendarBlockPalette({ status: 'Seated' }).accent).toBe('#047857');
    expect(bookingCalendarBlockPalette({ status: 'Completed' }).accent).toBe('#4B5563');
    expect(bookingCalendarBlockPalette({ status: 'No-Show' }).accent).toBe('#DC2626');
  });

  it('uses bold saturated fills with white text on dark statuses', () => {
    // The bar fill now carries the status hue (not a pale tint), so dark statuses
    // pair a saturated fill with white text for maximum standout + legibility.
    expect(bookingCalendarBlockPalette({ status: 'Confirmed' }).bg).toBe('#003B6F');
    expect(bookingCalendarBlockPalette({ status: 'Confirmed' }).text).toBe('#FFFFFF');
    expect(bookingCalendarBlockPalette({ status: 'Booked' }).bg).toBe('#0369A1');
    expect(bookingCalendarBlockPalette({ status: 'Booked' }).text).toBe('#FFFFFF');
    expect(bookingCalendarBlockPalette({ status: 'Seated' }).text).toBe('#FFFFFF');
    expect(bookingCalendarBlockPalette({ status: 'No-Show' }).text).toBe('#FFFFFF');
    // Arrived (guest waiting) is a bright amber "glow" — the one lifecycle fill light
    // enough to take a deep brown text instead of white.
    const arrived = bookingCalendarBlockPalette({
      status: 'Confirmed',
      client_arrived_at: '2026-06-01T18:00:00.000Z',
    });
    expect(arrived.bg).toBe('#F59E0B');
    expect(arrived.text).toBe('#451A03');
  });

  it('uses Arrived stripe when client_arrived_at is set before start', () => {
    expect(
      isArrivedWaitingDisplay({
        status: 'Confirmed',
        client_arrived_at: '2026-06-01T18:00:00.000Z',
      }),
    ).toBe(true);
    expect(calendarBookingVisualKey({
      status: 'Confirmed',
      client_arrived_at: '2026-06-01T18:00:00.000Z',
    })).toBe('Arrived');
    expect(
      bookingCalendarBlockPalette({
        status: 'Confirmed',
        client_arrived_at: '2026-06-01T18:00:00.000Z',
      }).accent,
    ).toBe('#B45309');
  });

  it('applies optimistic client_arrived overlay before refetch', () => {
    expect(
      bookingCalendarBlockPaletteWithOverlay(
        { status: 'Confirmed', client_arrived_at: null },
        { client_arrived_at: '2026-06-01T18:00:00.000Z' },
      ).accent,
    ).toBe('#B45309');
  });

  it('renders the left stripe as a decorative glass highlight, not the status hue', () => {
    const p = bookingCalendarBlockPalette({
      status: 'Confirmed',
      client_arrived_at: '2026-06-01T18:00:00.000Z',
    });
    // The saturated bar fill now carries the status hue, so the left stripe is a purely
    // decorative luminous edge (a light gloss) rather than the status accent colour.
    const stripe = CalendarBookingStatusStripe({ palette: p });
    // React 19 types `ReactElement.props` as `unknown`; narrow to read the inline style.
    const stripeProps = stripe.props as {
      style: { backgroundColor?: string; backgroundImage?: string };
      'aria-hidden'?: boolean;
    };
    expect(stripeProps['aria-hidden']).toBe(true);
    expect(stripeProps.style.backgroundColor).not.toBe(p.accent);
    expect(String(stripeProps.style.backgroundImage)).toContain('rgba(255,255,255');
    // The status hue lives on the card fill instead.
    expect(bookingCalendarBlockCardStyle(p).backgroundColor).toBe(p.bg);
  });

  it('gives linked cards a non-colour distinction (dashed border + hatch) while keeping the status hue', () => {
    const p = bookingCalendarBlockPalette({ status: 'Confirmed' });
    const own = bookingCalendarBlockCardStyle(p);
    const linked = bookingCalendarBlockCardStyle(p, { linked: true });
    expect(own.borderStyle).toBe('solid');
    expect(linked.borderStyle).toBe('dashed');
    // Status hue still backs the card (legibility / fallback) in both variants.
    expect(linked.backgroundColor).toBe(p.bg);
    // The linked surface adds a diagonal hatch the own-venue surface doesn't have.
    expect(String(linked.backgroundImage)).toContain('repeating-linear-gradient');
    expect(String(own.backgroundImage)).not.toContain('repeating-linear-gradient');
  });

  it('treats attendance-confirmed Booked as Confirmed stripe', () => {
    expect(
      calendarBookingVisualKey({
        status: 'Booked',
        staff_attendance_confirmed_at: '2026-06-01T12:00:00.000Z',
      }),
    ).toBe('Confirmed');
  });
});
