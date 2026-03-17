'use client';

import { useState } from 'react';
import type { VenueTable } from '@/types/table-management';
import { getTableDimensions, computeGridPositions } from '@/types/table-management';
import { NumericInput } from '@/components/ui/NumericInput';

interface Props {
  onComplete: (tables: VenueTable[]) => void;
  onCancel: () => void;
}

const PRESETS = [
  { count: 10, label: '10' },
  { count: 15, label: '15' },
  { count: 20, label: '20' },
  { count: 25, label: '25' },
  { count: 30, label: '30' },
];

const TABLE_SIZE_PRESETS = [
  { label: 'Mostly 2-tops', min: 1, max: 2, ratio: 0.6 },
  { label: 'Mix of 2 & 4-tops', min: 1, max: 4, ratio: 0.5 },
  { label: 'Mostly 4-tops', min: 2, max: 4, ratio: 0.6 },
  { label: 'Varied (2, 4, 6-tops)', min: 1, max: 6, ratio: 0.33 },
];

export function SetupWizard({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [tableCount, setTableCount] = useState(15);
  const [sizePreset, setSizePreset] = useState(1);
  const [zones, setZones] = useState<string[]>([]);
  const [newZone, setNewZone] = useState('');
  const [saving, setSaving] = useState(false);

  const addZone = () => {
    const z = newZone.trim();
    if (z && !zones.includes(z)) {
      setZones([...zones, z]);
      setNewZone('');
    }
  };

  const removeZone = (z: string) => {
    setZones(zones.filter((x) => x !== z));
  };

  const finish = async () => {
    setSaving(true);
    const preset = TABLE_SIZE_PRESETS[sizePreset]!;
    const tables: Array<{
      name: string;
      min_covers: number;
      max_covers: number;
      shape: string;
      zone: string | null;
      sort_order: number;
      position_x: number;
      position_y: number;
      width: number;
      height: number;
    }> = [];

    const rawTables: Array<{
      name: string;
      min_covers: number;
      max_covers: number;
      shape: string;
      zone: string | null;
      sort_order: number;
    }> = [];

    for (let i = 0; i < tableCount; i++) {
      let maxCovers: number;
      if (preset.label === 'Varied (2, 4, 6-tops)') {
        const roll = Math.random();
        if (roll < 0.4) maxCovers = 2;
        else if (roll < 0.75) maxCovers = 4;
        else maxCovers = 6;
      } else {
        maxCovers = Math.random() < preset.ratio ? preset.max : Math.max(2, preset.min + 1);
      }

      const zone = zones.length > 0 ? zones[i % zones.length]! : null;
      const shape = maxCovers <= 2 ? 'circle' : 'rectangle';

      rawTables.push({
        name: `Table ${i + 1}`,
        min_covers: 1,
        max_covers: maxCovers,
        shape,
        zone,
        sort_order: i,
      });
    }

    const positions = computeGridPositions(rawTables);

    for (let i = 0; i < rawTables.length; i++) {
      const dims = getTableDimensions(rawTables[i]!.max_covers, rawTables[i]!.shape);
      tables.push({
        ...rawTables[i]!,
        position_x: positions[i]!.position_x,
        position_y: positions[i]!.position_y,
        width: dims.width,
        height: dims.height,
      });
    }

    try {
      const res = await fetch('/api/venue/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables }),
      });

      if (res.ok) {
        const data = await res.json();
        onComplete(data.tables);
      }
    } catch (err) {
      console.error('Setup wizard create tables failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    {
      title: 'How many tables?',
      subtitle: 'Select the number of dining tables in your restaurant.',
      content: (
        <div className="flex flex-wrap gap-3">
          {PRESETS.map((p) => (
            <button
              key={p.count}
              onClick={() => setTableCount(p.count)}
              className={`flex h-16 w-16 items-center justify-center rounded-xl border-2 text-lg font-semibold transition-all ${
                tableCount === p.count
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center">
            <NumericInput
              value={tableCount}
              onChange={(v) => setTableCount(v)}
              min={1}
              max={100}
              className="h-16 w-20 rounded-xl border-2 border-slate-200 px-3 text-center text-lg font-semibold"
            />
          </div>
        </div>
      ),
    },
    {
      title: 'Typical table sizes?',
      subtitle: 'We\'ll auto-generate tables based on your selection. You can edit them later.',
      content: (
        <div className="space-y-2">
          {TABLE_SIZE_PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => setSizePreset(i)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                sizePreset === i
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                sizePreset === i ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                <span className="text-sm font-semibold">{p.max}</span>
              </div>
              <span className="text-sm font-medium text-slate-700">{p.label}</span>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: 'Separate dining areas?',
      subtitle: 'Optional: define zones like Main, Patio, Private Room. You can skip this.',
      content: (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newZone}
              onChange={(e) => setNewZone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addZone()}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Zone name (e.g. Main, Patio)"
            />
            <button
              onClick={addZone}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Add
            </button>
          </div>
          {zones.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {zones.map((z) => (
                <span
                  key={z}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700"
                >
                  {z}
                  <button onClick={() => removeZone(z)} className="text-slate-400 hover:text-red-500">
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  const currentStep = steps[step]!;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-slate-900">Set Up Table Management</h2>
        <p className="mt-1 text-sm text-slate-500">Step {step + 1} of {steps.length}</p>
      </div>

      <div className="flex gap-1">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-brand-600' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-lg font-medium text-slate-900">{currentStep.title}</h3>
        <p className="mb-5 text-sm text-slate-500">{currentStep.subtitle}</p>
        {currentStep.content}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={step === 0 ? onCancel : () => setStep(step - 1)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <button
          onClick={step === steps.length - 1 ? finish : () => setStep(step + 1)}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Creating...' : step === steps.length - 1 ? `Create ${tableCount} Tables` : 'Next'}
        </button>
      </div>
    </div>
  );
}
