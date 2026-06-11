/**
 * Offline AI mapping eval: scores runAiColumnMapping against the import corpus
 * goldens. NOT run in CI (needs OPENAI_API_KEY; costs tokens).
 *
 * Usage:  npx tsx scripts/eval-import-ai.ts
 * Env:    OPENAI_API_KEY (required), OPENAI_IMPORT_MODEL (optional override)
 */

import 'dotenv/config';
import { CORPUS } from '../src/lib/import/__fixtures__/corpus';
import { ingestUploadedFile } from '../src/lib/import/ingest-file';
import { profileColumns } from '../src/lib/import/column-profile';
import { runAiColumnMapping } from '../src/lib/import/ai-map-columns';
import { CLIENT_FIELDS, BOOKING_FIELDS } from '../src/lib/import/constants';

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('OPENAI_API_KEY is not set — this eval calls the OpenAI API.');
    process.exit(1);
  }

  let totalCols = 0;
  let totalCorrect = 0;

  for (const f of CORPUS) {
    const { datasets } = ingestUploadedFile(f.filename, Buffer.from(f.csv, 'utf-8'));
    const ds = datasets[0]!;
    const profiles = profileColumns(ds.headers, ds.rows);
    const targetFields = f.fileType === 'bookings' ? BOOKING_FIELDS : CLIENT_FIELDS;

    const started = Date.now();
    const ai = await runAiColumnMapping({
      headers: ds.headers,
      sampleRows: ds.rows.slice(0, 5),
      fileType: f.fileType,
      detectedPlatform: f.expectedPlatform,
      targetFields,
      columnProfiles: profiles,
    });
    const ms = Date.now() - started;

    if (!ai) {
      console.log(`✗ ${f.name}: AI call failed`);
      continue;
    }

    const expectedCols = Object.keys(f.expectedMappings);
    let correct = 0;
    const misses: string[] = [];
    for (const col of expectedCols) {
      const row = ai.mappings.find((m) => m.source_column === col);
      const got =
        row?.action === 'map'
          ? row.target_field
          : row?.action === 'split'
            ? `split(${(row.split_config?.parts ?? []).map((p) => p.field).join('+')})`
            : row?.action ?? 'missing';
      const want = f.expectedMappings[col]!;
      // A split that includes the wanted field (e.g. full_name → first+last) also counts.
      const splitOk =
        row?.action === 'split' &&
        (want === 'full_name' || want === 'guest_full_name' || want === 'booking_date');
      if (got === want || splitOk) correct += 1;
      else misses.push(`    ${col}: wanted ${want}, got ${got}`);
    }

    totalCols += expectedCols.length;
    totalCorrect += correct;
    const pct = Math.round((correct / expectedCols.length) * 100);
    console.log(`${pct === 100 ? '✓' : '•'} ${f.name} [${ai.model}, ${ms}ms]: ${correct}/${expectedCols.length} (${pct}%)`);
    for (const m of misses) console.log(m);
  }

  const overall = totalCols ? Math.round((totalCorrect / totalCols) * 100) : 0;
  console.log(`\nOverall column-mapping accuracy: ${totalCorrect}/${totalCols} (${overall}%)`);
  if (overall < 90) {
    console.log('Below the 90% bar — review prompt/model before shipping changes.');
    process.exit(2);
  }
}

void main();
