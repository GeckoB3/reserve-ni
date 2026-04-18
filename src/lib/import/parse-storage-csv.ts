import Papa from 'papaparse';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ParsedCsvFile {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

export async function downloadAndParseCsv(
  admin: SupabaseClient,
  storagePath: string,
): Promise<ParsedCsvFile> {
  const { data, error } = await admin.storage.from('imports').download(storagePath);
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to download import file');
  }
  const text = await data.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    console.warn('[parse csv] warnings', parsed.errors.slice(0, 3));
  }
  const headers = parsed.meta.fields?.filter(Boolean) ?? [];
  const rows = (parsed.data ?? []).map((row) => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      out[h] = row[h] != null ? String(row[h]) : '';
    }
    return out;
  });
  return {
    headers,
    rows,
    rowCount: rows.length,
  };
}
