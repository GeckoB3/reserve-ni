import { describe, expect, it } from 'vitest';
import { buildWaitlistOfferBookingUrl } from '@/lib/booking/waitlist-offer-booking-url';
import { waitlistServiceMatchesFreedSlot } from '@/lib/booking/offer-appointment-waitlist-on-cancel';

describe('buildWaitlistOfferBookingUrl', () => {
  it('includes date, service, offer id, and time', () => {
    const url = buildWaitlistOfferBookingUrl({
      venueSlug: 'demo-clinic',
      desiredDate: '2026-06-15',
      serviceId: '11111111-1111-4111-8111-111111111111',
      waitlistEntryId: '22222222-2222-4222-8222-222222222222',
      offeredSlotHm: '14:30',
    });
    expect(url).toContain('/book/demo-clinic?');
    expect(url).toContain('date=2026-06-15');
    expect(url).toContain('service_id=11111111-1111-4111-8111-111111111111');
    expect(url).toContain('waitlist_offer=22222222-2222-4222-8222-222222222222');
    expect(url).toContain('time=14%3A30');
  });
});

describe('waitlistServiceMatchesFreedSlot cross ids', () => {
  it('matches when either side stores service on a different column', () => {
    expect(
      waitlistServiceMatchesFreedSlot(
        { service_item_id: 'svc-a', appointment_service_id: null },
        { serviceItemId: 'svc-b', appointmentServiceId: 'svc-a' },
      ),
    ).toBe(true);
  });
});
