import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  decodeUploadText,
  detectHeaderRow,
  importFileExtensionAllowed,
  ingestUploadedFile,
} from '@/lib/import/ingest-file';

describe('importFileExtensionAllowed', () => {
  it('accepts spreadsheets and delimited text', () => {
    for (const n of ['a.csv', 'b.tsv', 'c.txt', 'd.xlsx', 'e.XLS']) {
      expect(importFileExtensionAllowed(n)).toBe(true);
    }
    expect(importFileExtensionAllowed('f.pdf')).toBe(false);
  });
});

describe('decodeUploadText', () => {
  it('decodes plain UTF-8 and strips the BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Siân,£10', 'utf-8')]);
    const { text, encoding } = decodeUploadText(buf);
    expect(encoding).toBe('utf-8');
    expect(text).toBe('Siân,£10');
  });

  it('falls back to Windows-1252 for non-UTF-8 bytes', () => {
    // "Siân,£10" encoded as Windows-1252: â = 0xE2, £ = 0xA3 (invalid as UTF-8 continuation)
    const buf = Buffer.from([0x53, 0x69, 0xe2, 0x6e, 0x2c, 0xa3, 0x31, 0x30]);
    const { text, encoding } = decodeUploadText(buf);
    expect(encoding).toBe('windows-1252');
    expect(text).toBe('Siân,£10');
  });

  it('decodes UTF-16 LE with BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Name\n', 'utf16le')]);
    expect(decodeUploadText(buf)).toEqual({ text: 'Name\n', encoding: 'utf-16le' });
  });
});

describe('detectHeaderRow', () => {
  it('returns 0 for a normal file', () => {
    expect(
      detectHeaderRow([
        ['First Name', 'Last Name', 'Email'],
        ['Sarah', 'Jones', 's@j.com'],
      ]),
    ).toBe(0);
  });

  it('skips title and metadata rows above the header', () => {
    expect(
      detectHeaderRow([
        ['Client Report', '', ''],
        ['Generated 01/06/2026', '', ''],
        ['First Name', 'Last Name', 'Email'],
        ['Sarah', 'Jones', 's@j.com'],
      ]),
    ).toBe(2);
  });
});

describe('ingestUploadedFile', () => {
  it('ingests a CSV with junk rows above the header into clean canonical CSV', () => {
    const csv = 'My Salon Export\n\nFirst Name,Last Name,Email\nSarah,Jones,s@j.com\nJohn,Smith,j@s.com\n';
    const { datasets, warnings } = ingestUploadedFile('clients.csv', Buffer.from(csv, 'utf-8'));
    expect(datasets).toHaveLength(1);
    const ds = datasets[0]!;
    expect(ds.headers).toEqual(['First Name', 'Last Name', 'Email']);
    expect(ds.rowCount).toBe(2);
    expect(ds.rows[0]).toEqual({ 'First Name': 'Sarah', 'Last Name': 'Jones', Email: 's@j.com' });
    expect(ds.csvText.split('\n')[0]).toBe('First Name,Last Name,Email');
    expect(warnings.some((w) => w.includes('skipped'))).toBe(true);
  });

  it('ingests semicolon-delimited CSV via Papa auto-detection', () => {
    const csv = 'First Name;Last Name\nSarah;Jones\n';
    const { datasets } = ingestUploadedFile('clients.csv', Buffer.from(csv, 'utf-8'));
    expect(datasets[0]!.headers).toEqual(['First Name', 'Last Name']);
    expect(datasets[0]!.rows[0]).toEqual({ 'First Name': 'Sarah', 'Last Name': 'Jones' });
  });

  it('ingests every non-empty sheet of an XLSX workbook', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['First Name', 'Last Name'],
        ['Sarah', 'Jones'],
      ]),
      'Clients',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Date', 'Time', 'Service'],
        ['14/03/2026', '14:30', 'Cut'],
      ]),
      'Bookings',
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Empty');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const { datasets } = ingestUploadedFile('export.xlsx', buf);
    expect(datasets).toHaveLength(2);
    expect(datasets[0]!.label).toBe('export.xlsx — Clients');
    expect(datasets[0]!.rows[0]).toEqual({ 'First Name': 'Sarah', 'Last Name': 'Jones' });
    expect(datasets[1]!.label).toBe('export.xlsx — Bookings');
    expect(datasets[1]!.rows[0]).toEqual({ Date: '14/03/2026', Time: '14:30', Service: 'Cut' });
  });

  it('disambiguates duplicate headers with a warning', () => {
    const csv = 'Name,Notes,Notes\nSarah,a,b\n';
    const { datasets, warnings } = ingestUploadedFile('clients.csv', Buffer.from(csv, 'utf-8'));
    expect(datasets[0]!.headers).toEqual(['Name', 'Notes', 'Notes_2']);
    expect(warnings.some((w) => w.includes('duplicate'))).toBe(true);
  });

  it('throws a friendly error for empty files', () => {
    expect(() => ingestUploadedFile('empty.csv', Buffer.from('', 'utf-8'))).toThrow(/No data found/);
  });
});
