import type { FieldType } from '@/lib/import/constants';
import { splitFullName } from '@/lib/import/normalize';

export type DbMappingRow = {
  id: string;
  source_column: string;
  target_field: string | null;
  action: string;
  custom_field_name: string | null;
  custom_field_type: string | null;
  split_config: {
    separator?: string;
    parts?: Array<{ field: string }>;
  } | null;
};

/** Slug used as `guests.custom_fields` key and `custom_client_fields.field_key`. */
export function slugCustomFieldKey(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 60) || 'custom'
  );
}

function coerceCustom(value: string, t: FieldType | string): string | number | boolean | null {
  const v = value.trim();
  if (!v) return null;
  if (t === 'number') {
    const n = Number.parseFloat(v.replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (t === 'boolean') {
    const x = v.toLowerCase();
    if (['yes', 'true', '1', 'y'].includes(x)) return true;
    if (['no', 'false', '0', 'n'].includes(x)) return false;
    return null;
  }
  return v;
}

export function applyMappingsToDataRow(
  row: Record<string, string>,
  mappings: DbMappingRow[],
): {
  targets: Record<string, string>;
  custom: Record<string, string | number | boolean>;
} {
  const targets: Record<string, string> = {};
  const custom: Record<string, string | number | boolean> = {};

  for (const m of mappings) {
    const col = m.source_column;
    const raw = row[col] ?? '';

    if (m.action === 'ignore') continue;

    if (m.action === 'split' && m.split_config?.parts?.length) {
      const sep = m.split_config.separator ?? ' ';
      const parts = raw.split(sep).map((s) => s.trim());
      m.split_config.parts.forEach((p, i) => {
        if (!p.field) return;
        targets[p.field] = parts[i] ?? '';
      });
      continue;
    }

    if (m.action === 'custom' && m.custom_field_name) {
      const key = slugCustomFieldKey(m.custom_field_name);
      const ft = (m.custom_field_type ?? 'text') as FieldType;
      const coerced = coerceCustom(raw, ft);
      if (coerced !== null) custom[key] = coerced;
      continue;
    }

    if (m.action === 'map' && m.target_field) {
      targets[m.target_field] = raw;
    }
  }

  if (targets.full_name && (!targets.first_name || !targets.last_name)) {
    const { first, last } = splitFullName(targets.full_name);
    targets.first_name ||= first;
    targets.last_name ||= last;
  }

  // Combined datetime mapped to booking_date (e.g. Timely's "Appointment start"
  // = "14/03/2026 14:30"): keep the date part and recover the time component
  // into booking_time so the row doesn't fail the required-time check.
  if (targets.booking_date && !targets.booking_time) {
    const m = targets.booking_date
      .trim()
      .match(/^((?:\d{4}-\d{2}-\d{2})|(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}))[T ](.+)$/);
    if (m?.[1] && m[2]) {
      targets.booking_date = m[1];
      targets.booking_time = m[2].trim();
    }
  }

  return { targets, custom };
}
