import { describe, expect, it } from 'vitest';
import {
  activeModelsToLegacyEnabledModels,
  getDefaultBookingModelFromActive,
  resolveActiveBookingModels,
} from './active-models';

describe('resolveActiveBookingModels', () => {
  it('keeps an explicit appointments model set in canonical order', () => {
    expect(
      resolveActiveBookingModels({
        pricingTier: 'appointments',
        activeBookingModels: ['resource_booking', 'unified_scheduling', 'event_ticket'],
      }),
    ).toEqual(['unified_scheduling', 'event_ticket', 'resource_booking']);
  });

  it('derives appointments models from legacy booking_model and enabled_models', () => {
    expect(
      resolveActiveBookingModels({
        pricingTier: 'appointments',
        bookingModel: 'event_ticket',
        enabledModels: ['resource_booking', 'unified_scheduling'],
      }),
    ).toEqual(['unified_scheduling', 'event_ticket', 'resource_booking']);
  });

  it('keeps table reservations first for restaurant venues', () => {
    expect(
      resolveActiveBookingModels({
        pricingTier: 'restaurant',
        bookingModel: 'table_reservation',
        enabledModels: ['resource_booking', 'event_ticket'],
      }),
    ).toEqual(['table_reservation', 'event_ticket', 'resource_booking']);
  });

  it('treats practitioner_appointment as unified_scheduling', () => {
    expect(
      resolveActiveBookingModels({
        pricingTier: 'appointments',
        bookingModel: 'practitioner_appointment',
      }),
    ).toEqual(['unified_scheduling']);
  });
});

describe('active-model compatibility helpers', () => {
  it('picks the first active model as the default compatibility model', () => {
    expect(
      getDefaultBookingModelFromActive(['class_session', 'event_ticket'], 'table_reservation'),
    ).toBe('class_session');
  });

  it('converts active models back into legacy enabled_models', () => {
    expect(
      activeModelsToLegacyEnabledModels(
        ['unified_scheduling', 'class_session', 'event_ticket'],
        'unified_scheduling',
      ),
    ).toEqual(['class_session', 'event_ticket']);
  });
});
