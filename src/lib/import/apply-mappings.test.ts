import { describe, expect, it } from 'vitest';
import { applyMappingsToDataRow, type DbMappingRow } from './apply-mappings';

function map(
  source_column: string,
  target_field: string | null,
  overrides: Partial<DbMappingRow> = {},
): DbMappingRow {
  return {
    id: source_column,
    source_column,
    target_field,
    action: target_field ? 'map' : 'ignore',
    custom_field_name: null,
    custom_field_type: null,
    split_config: null,
    ...overrides,
  };
}

describe('applyMappingsToDataRow full-name fallback', () => {
  it('splits a full name when first/last are not mapped', () => {
    const { targets } = applyMappingsToDataRow(
      { 'Full Name': 'Sarah Jane Smith' },
      [map('Full Name', 'full_name')],
    );
    expect(targets.first_name).toBe('Sarah');
    expect(targets.last_name).toBe('Jane Smith');
  });

  it('does not overwrite an explicitly mapped first/last name', () => {
    const { targets } = applyMappingsToDataRow(
      { 'Full Name': 'Pete L Smith', First: 'Pete', Last: 'Smith' },
      [
        map('Full Name', 'full_name'),
        map('First', 'first_name'),
        map('Last', 'last_name'),
      ],
    );
    expect(targets.first_name).toBe('Pete');
    expect(targets.last_name).toBe('Smith');
  });

  it('only fills the missing half when one of first/last is mapped', () => {
    const { targets } = applyMappingsToDataRow(
      { 'Full Name': 'Sarah Smith', First: 'Sarah' },
      [map('Full Name', 'full_name'), map('First', 'first_name')],
    );
    expect(targets.first_name).toBe('Sarah');
    expect(targets.last_name).toBe('Smith');
  });

  it('handles comma-separated full names', () => {
    const { targets } = applyMappingsToDataRow(
      { 'Full Name': 'Smith, Mary' },
      [map('Full Name', 'full_name')],
    );
    expect(targets.first_name).toBe('Mary');
    expect(targets.last_name).toBe('Smith');
  });
});

describe('applyMappingsToDataRow datetime recovery', () => {
  it('splits a combined datetime mapped to booking_date into date + time', () => {
    const { targets } = applyMappingsToDataRow(
      { 'Appointment start': '14/03/2026 14:30' },
      [map('Appointment start', 'booking_date')],
    );
    expect(targets.booking_date).toBe('14/03/2026');
    expect(targets.booking_time).toBe('14:30');
  });

  it('handles ISO datetimes and AM/PM time parts', () => {
    const iso = applyMappingsToDataRow(
      { When: '2026-03-14T14:30:00' },
      [map('When', 'booking_date')],
    );
    expect(iso.targets.booking_date).toBe('2026-03-14');
    expect(iso.targets.booking_time).toBe('14:30:00');

    const ampm = applyMappingsToDataRow(
      { When: '14/03/2026 2:30 PM' },
      [map('When', 'booking_date')],
    );
    expect(ampm.targets.booking_date).toBe('14/03/2026');
    expect(ampm.targets.booking_time).toBe('2:30 PM');
  });

  it('leaves plain dates and explicit booking_time mappings alone', () => {
    const { targets } = applyMappingsToDataRow(
      { Date: '14/03/2026', Time: '10:00' },
      [map('Date', 'booking_date'), map('Time', 'booking_time')],
    );
    expect(targets.booking_date).toBe('14/03/2026');
    expect(targets.booking_time).toBe('10:00');
  });
});
