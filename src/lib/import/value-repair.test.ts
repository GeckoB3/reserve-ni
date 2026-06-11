import { describe, expect, it } from 'vitest';
import {
  parseDateWithRepairs,
  parseTimeWithRepairs,
  readValueRepairs,
} from '@/lib/import/value-repair';

describe('readValueRepairs', () => {
  it('returns empty maps when settings have no repairs', () => {
    expect(readValueRepairs(null)).toEqual({ dates: {}, times: {} });
    expect(readValueRepairs({})).toEqual({ dates: {}, times: {} });
  });

  it('reads stored repairs', () => {
    const settings = { value_repairs: { dates: { 'Mar 14th 2026': '2026-03-14' }, times: {} } };
    expect(readValueRepairs(settings).dates['Mar 14th 2026']).toBe('2026-03-14');
  });
});

describe('parseDateWithRepairs', () => {
  const repairs = {
    dates: { '14th March 2026': '2026-03-14', 'TBC': null },
    times: {},
  };

  it('prefers the deterministic parser', () => {
    const r = parseDateWithRepairs('14/03/2026', 'dd/MM/yyyy', repairs);
    expect(r).toEqual({ iso: '2026-03-14', ambiguous: false, repaired: false });
  });

  it('falls back to the repair map for unparseable values', () => {
    const r = parseDateWithRepairs('14th March 2026', null, repairs);
    expect(r).toEqual({ iso: '2026-03-14', ambiguous: false, repaired: true });
  });

  it('returns null for known-unrepairable and unknown values', () => {
    expect(parseDateWithRepairs('TBC', null, repairs).iso).toBeNull();
    expect(parseDateWithRepairs('???', null, repairs).iso).toBeNull();
  });
});

describe('parseTimeWithRepairs', () => {
  const repairs = { dates: {}, times: { 'half past two': '14:30:00' } };

  it('prefers the deterministic parser', () => {
    expect(parseTimeWithRepairs('2:30 PM', repairs)).toEqual({ time: '14:30:00', repaired: false });
  });

  it('falls back to the repair map', () => {
    expect(parseTimeWithRepairs('half past two', repairs)).toEqual({ time: '14:30:00', repaired: true });
  });

  it('returns null when neither works', () => {
    expect(parseTimeWithRepairs('whenever', repairs)).toEqual({ time: null, repaired: false });
  });
});
