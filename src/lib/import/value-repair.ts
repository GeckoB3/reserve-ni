/**
 * Stage 3 value repair: rescue unparseable date/time strings instead of
 * skipping their rows.
 *
 * Deterministic parsers run first everywhere. Whatever still fails is collected
 * as a small set of DISTINCT strings during validation, sent to the model in one
 * batched call per kind, and the repaired values are kept in
 * `import_sessions.session_settings.value_repairs` as a raw → repaired map.
 * Every AI repair is re-validated with the deterministic parser before being
 * accepted, and "couldn't repair" results are stored as null so the same string
 * is never re-asked. Validation and execute both consult the map before parsing.
 */

import { parseDateString, parseTimeString } from '@/lib/import/normalize';
import { runImportAiJson } from '@/lib/import/openai-client';

export interface ValueRepairs {
  /** raw → ISO date (YYYY-MM-DD), or null when the model could not repair it. */
  dates: Record<string, string | null>;
  /** raw → HH:mm:ss, or null when the model could not repair it. */
  times: Record<string, string | null>;
}

export function readValueRepairs(settings: Record<string, unknown> | null | undefined): ValueRepairs {
  const vr = (settings?.value_repairs ?? {}) as Partial<ValueRepairs>;
  return {
    dates: vr.dates ?? {},
    times: vr.times ?? {},
  };
}

/** Resolve a date string: deterministic parse first, then the repair map. */
export function parseDateWithRepairs(
  raw: string,
  preferred: 'dd/MM/yyyy' | 'MM/dd/yyyy' | null | undefined,
  repairs: ValueRepairs,
): { iso: string | null; ambiguous: boolean; repaired: boolean } {
  const direct = parseDateString(raw, preferred ?? undefined);
  if (direct.iso) return { ...direct, repaired: false };
  const fixed = repairs.dates[raw.trim()];
  if (fixed) return { iso: fixed, ambiguous: false, repaired: true };
  return { iso: null, ambiguous: false, repaired: false };
}

/** Resolve a time string: deterministic parse first, then the repair map. */
export function parseTimeWithRepairs(
  raw: string,
  repairs: ValueRepairs,
): { time: string | null; repaired: boolean } {
  const direct = parseTimeString(raw);
  if (direct) return { time: direct, repaired: false };
  const fixed = repairs.times[raw.trim()];
  if (fixed) return { time: fixed, repaired: true };
  return { time: null, repaired: false };
}

const REPAIR_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['repairs'],
  properties: {
    repairs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['raw', 'repaired'],
        properties: {
          raw: { type: 'string' },
          repaired: {
            type: ['string', 'null'],
            description: 'The normalised value, or null when the input is not genuinely a date/time.',
          },
        },
      },
    },
  },
};

const MAX_REPAIR_VALUES = 200;

/**
 * Batch-repair distinct unparseable values. Returns a raw → repaired-or-null
 * map (null = model says unrepairable), or null when AI is unavailable.
 * Repairs that don't survive the deterministic parser are stored as null.
 */
export async function runAiValueRepair(params: {
  kind: 'date' | 'time';
  values: string[];
  dateFormatHint?: 'dd/MM/yyyy' | 'MM/dd/yyyy' | null;
}): Promise<Record<string, string | null> | null> {
  const distinct = [...new Set(params.values.map((v) => v.trim()).filter(Boolean))].slice(
    0,
    MAX_REPAIR_VALUES,
  );
  if (!distinct.length) return {};

  const target =
    params.kind === 'date'
      ? 'an ISO calendar date formatted exactly as YYYY-MM-DD'
      : 'a 24-hour time formatted exactly as HH:MM:SS';

  const hint =
    params.kind === 'date' && params.dateFormatHint
      ? `\nWhen a value is ambiguous between day-first and month-first, this file uses ${params.dateFormatHint === 'dd/MM/yyyy' ? 'day-first (DD/MM/YYYY)' : 'month-first (MM/DD/YYYY)'}.`
      : '';

  const user = `
These strings come from one column of a booking-platform export and our parser could not
read them. For each string, return ${target}, or null if the string is not genuinely a
${params.kind} (e.g. "TBC", "n/a", header fragments).${hint}

Strings to repair:
${JSON.stringify(distinct, null, 1)}

Rules:
- Repair formatting only — never invent information that is not in the string.
- Two-digit years: 00–68 → 20xx, 69–99 → 19xx.
- Return one entry per input string, with "raw" exactly as given.
`;

  const result = await runImportAiJson<{ repairs: Array<{ raw: string; repaired: string | null }> }>({
    callSite: `value-repair-${params.kind}`,
    system:
      'You repair malformed date and time strings from spreadsheet exports. You never guess missing information.',
    user,
    schemaName: 'value_repairs',
    schema: REPAIR_SCHEMA,
  });

  if (!result) return null;

  const out: Record<string, string | null> = {};
  for (const raw of distinct) out[raw] = null; // default: tried, unrepairable
  for (const r of result.data.repairs ?? []) {
    const key = r.raw?.trim();
    if (!key || !(key in out)) continue;
    if (r.repaired == null) continue;
    // Trust nothing: a repair only counts if the deterministic parser accepts it.
    if (params.kind === 'date') {
      const check = parseDateString(r.repaired);
      out[key] = check.iso && /^\d{4}-\d{2}-\d{2}$/.test(r.repaired) ? r.repaired : null;
    } else {
      const check = parseTimeString(r.repaired);
      out[key] = check;
    }
  }
  return out;
}
