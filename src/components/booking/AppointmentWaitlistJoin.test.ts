import { describe, expect, it } from 'vitest';
import {
  buildPreferenceOptions,
  buildServiceOptions,
} from '@/components/booking/AppointmentWaitlistJoin';

const catalog = [
  {
    id: 'cal-a',
    name: 'Alex',
    services: [
      { id: 'svc-1', name: 'Massage' },
      { id: 'svc-2', name: 'Facial' },
    ],
  },
  {
    id: 'cal-b',
    name: 'Blair',
    services: [{ id: 'svc-1', name: 'Massage' }],
  },
];

describe('AppointmentWaitlistJoin catalog helpers', () => {
  it('deduplicates services across calendars', () => {
    expect(buildServiceOptions(catalog).map((s) => s.id).sort()).toEqual(['svc-1', 'svc-2']);
  });

  it('lists preferences that offer the selected service', () => {
    expect(buildPreferenceOptions(catalog, 'svc-1').map((p) => p.id)).toEqual(['cal-a', 'cal-b']);
    expect(buildPreferenceOptions(catalog, 'svc-2').map((p) => p.id)).toEqual(['cal-a']);
    expect(buildPreferenceOptions(catalog, '')).toEqual([]);
  });
});
