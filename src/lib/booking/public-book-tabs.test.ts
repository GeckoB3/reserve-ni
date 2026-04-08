import { describe, expect, it } from 'vitest';
import {
  defaultPublicBookTabSlug,
  publicBookTabsForVenue,
  resolvePublicBookTabFromQuery,
} from './public-book-tabs';

describe('public booking tabs for active models', () => {
  it('orders tabs using the canonical active model order', () => {
    const tabs = publicBookTabsForVenue([
      'resource_booking',
      'unified_scheduling',
      'event_ticket',
      'class_session',
    ]);

    expect(tabs.map((tab) => tab.slug)).toEqual([
      'appointments',
      'classes',
      'events',
      'resources',
    ]);
  });

  it('defaults to the first active model tab', () => {
    expect(defaultPublicBookTabSlug(['class_session', 'event_ticket'])).toBe('classes');
  });

  it('falls back to the default tab when the query tab is not exposed', () => {
    expect(
      resolvePublicBookTabFromQuery('events', ['unified_scheduling', 'class_session']),
    ).toBe('appointments');
  });

  it('accepts an exposed tab from the query string', () => {
    expect(
      resolvePublicBookTabFromQuery('resources', ['unified_scheduling', 'resource_booking']),
    ).toBe('resources');
  });
});
