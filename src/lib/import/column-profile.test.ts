import { describe, expect, it } from 'vitest';
import { inferDateFormatFromProfiles, profileColumns } from '@/lib/import/column-profile';

function rowsFrom(column: string, values: string[]): Array<Record<string, string>> {
  return values.map((v) => ({ [column]: v }));
}

describe('profileColumns', () => {
  it('computes fill rate, distinct count and top values', () => {
    const rows = rowsFrom('Tag', ['VIP', 'VIP', 'Regular', '', 'VIP']);
    const [p] = profileColumns(['Tag'], rows);
    expect(p!.fill_rate).toBe(0.8);
    expect(p!.distinct_count).toBe(2);
    expect(p!.top_values[0]).toBe('VIP');
  });

  it('classifies emails, phones, dates, times and datetimes', () => {
    const rows = [
      {
        Email: 'a@b.com',
        Phone: '+44 7725 002233',
        Date: '14/03/2026',
        Time: '2:30 PM',
        When: '14/03/2026 14:30',
      },
    ];
    const profiles = profileColumns(['Email', 'Phone', 'Date', 'Time', 'When'], rows);
    expect(profiles[0]!.type_counts.email).toBe(1);
    expect(profiles[1]!.type_counts.phone).toBe(1);
    expect(profiles[2]!.type_counts.date).toBe(1);
    expect(profiles[3]!.type_counts.time).toBe(1);
    expect(profiles[4]!.type_counts.datetime).toBe(1);
  });

  it('collects day-first evidence when the first component exceeds 12', () => {
    const rows = rowsFrom('Date', ['14/03/2026', '02/04/2026', '25/12/2025']);
    const [p] = profileColumns(['Date'], rows);
    expect(p!.date_evidence).toEqual({ first_gt_12: 2, second_gt_12: 0 });
  });

  it('collects month-first evidence when the second component exceeds 12', () => {
    const rows = rowsFrom('Date', ['03/14/2026', '12/25/2025']);
    const [p] = profileColumns(['Date'], rows);
    expect(p!.date_evidence).toEqual({ first_gt_12: 0, second_gt_12: 2 });
  });
});

describe('inferDateFormatFromProfiles', () => {
  it('returns dd/MM/yyyy when only day-first evidence exists', () => {
    const profiles = profileColumns(['Date'], rowsFrom('Date', ['14/03/2026', '01/02/2026']));
    expect(inferDateFormatFromProfiles(profiles)).toBe('dd/MM/yyyy');
  });

  it('returns MM/dd/yyyy when only month-first evidence exists', () => {
    const profiles = profileColumns(['Date'], rowsFrom('Date', ['03/14/2026']));
    expect(inferDateFormatFromProfiles(profiles)).toBe('MM/dd/yyyy');
  });

  it('returns null when evidence is mixed or absent', () => {
    const mixed = profileColumns(['Date'], rowsFrom('Date', ['14/03/2026', '03/14/2026']));
    expect(inferDateFormatFromProfiles(mixed)).toBeNull();
    const none = profileColumns(['Date'], rowsFrom('Date', ['01/02/2026', '03/04/2026']));
    expect(inferDateFormatFromProfiles(none)).toBeNull();
  });
});
