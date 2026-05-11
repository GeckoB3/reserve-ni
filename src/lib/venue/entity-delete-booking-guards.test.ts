import { describe, expect, it } from 'vitest';
import {
  buildEntityNotFoundMessage,
  buildUpcomingBookingsBlockMessage,
  type DeletableEntityKind,
} from './entity-delete-booking-guards';

describe('buildUpcomingBookingsBlockMessage', () => {
  it('uses singular grammar with "this" for one upcoming booking on a service', () => {
    const msg = buildUpcomingBookingsBlockMessage('service', 1);
    expect(msg).toBe(
      "Can't delete this service: there is 1 upcoming active booking linked to it. Cancel or reschedule it first, then try again.",
    );
  });

  it('uses plural grammar for multiple upcoming bookings on a class', () => {
    const msg = buildUpcomingBookingsBlockMessage('class', 4);
    expect(msg).toBe(
      "Can't delete this class: there are 4 upcoming active bookings linked to it. Cancel or reschedule them first, then try again.",
    );
  });

  it('falls back to a generic message when the count is unknown (-1)', () => {
    const msg = buildUpcomingBookingsBlockMessage('event', -1);
    expect(msg).toBe(
      "Can't delete this event while it has upcoming active bookings. Cancel or reschedule them first, then try again.",
    );
  });

  it('falls back to a generic message when the count is zero (defensive)', () => {
    const msg = buildUpcomingBookingsBlockMessage('class_session', 0);
    expect(msg).toBe(
      "Can't delete this session while it has upcoming active bookings. Cancel or reschedule them first, then try again.",
    );
  });

  it('uses entity-appropriate labels for every kind', () => {
    const cases: Array<{ kind: DeletableEntityKind; label: string }> = [
      { kind: 'service', label: 'this service' },
      { kind: 'class', label: 'this class' },
      { kind: 'class_session', label: 'this session' },
      { kind: 'class_schedule', label: 'this schedule entry' },
      { kind: 'event', label: 'this event' },
      { kind: 'resource', label: 'this resource' },
    ];
    for (const { kind, label } of cases) {
      const msg = buildUpcomingBookingsBlockMessage(kind, 2);
      expect(msg).toContain(label);
      expect(msg).toContain('2 upcoming active bookings');
    }
  });

  it('always tells the operator how to unblock the delete (cancel or reschedule)', () => {
    expect(buildUpcomingBookingsBlockMessage('service', 1).toLowerCase()).toContain(
      'cancel or reschedule',
    );
    expect(buildUpcomingBookingsBlockMessage('event', 7).toLowerCase()).toContain(
      'cancel or reschedule',
    );
  });

  it('always identifies upcoming bookings as the reason the delete was declined', () => {
    expect(buildUpcomingBookingsBlockMessage('class', 3).toLowerCase()).toContain('upcoming');
    expect(buildUpcomingBookingsBlockMessage('resource', 1).toLowerCase()).toContain('upcoming');
  });
});

describe('buildEntityNotFoundMessage', () => {
  it("uses the entity's friendly label and suggests refreshing the page", () => {
    const msg = buildEntityNotFoundMessage('service');
    expect(msg).toBe(
      "Can't find this service. It may have already been deleted, or the page is out of date — refresh and try again.",
    );
  });

  it('covers every entity kind with an entity-appropriate label', () => {
    const cases: Array<{ kind: DeletableEntityKind; label: string }> = [
      { kind: 'service', label: 'this service' },
      { kind: 'class', label: 'this class' },
      { kind: 'class_session', label: 'this session' },
      { kind: 'class_schedule', label: 'this schedule entry' },
      { kind: 'event', label: 'this event' },
      { kind: 'resource', label: 'this resource' },
    ];
    for (const { kind, label } of cases) {
      const msg = buildEntityNotFoundMessage(kind);
      expect(msg).toContain(label);
      expect(msg.toLowerCase()).toContain('refresh');
    }
  });

  it('never falls back to a bare "not found" message', () => {
    const msg = buildEntityNotFoundMessage('event');
    expect(msg.toLowerCase()).not.toMatch(/^not found$/);
    expect(msg).toMatch(/already been deleted|out of date/i);
  });
});
