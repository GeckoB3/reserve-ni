'use client';

import { useEffect, useState } from 'react';

interface Props {
  onDone: () => Promise<void>;
  onModeSelected: (advanced: boolean) => void;
}

type Mode = 'simple' | 'advanced';

interface ModeCopy {
  key: Mode;
  title: string;
  tagline: string;
  bestFor: string;
  pros: string[];
  icon: React.ReactNode;
}

const MODES: ModeCopy[] = [
  {
    key: 'simple',
    title: 'Simple covers mode',
    tagline: 'Start here. Track total covers per time slot; no floor plan required.',
    bestFor: 'Casual dining, brunch, cafés, pubs, and anyone new to booking software.',
    pros: [
      'Online booking uses a simple covers-per-slot limit that you set.',
      'Day-to-day you run service from the Day Sheet: a clean time-ordered list.',
      'You can still add a basic table list to note where each party is seated.',
    ],
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5M3.75 12h16.5m-16.5 6.75h16.5" />
      </svg>
    ),
  },
  {
    key: 'advanced',
    title: 'Advanced table management',
    tagline: 'Model your room. Online booking checks a real table is free for that party.',
    bestFor: 'Fine dining, busy turn-overs, multi-area venues, and anyone who wants tighter control.',
    pros: [
      'Design a visual floor plan with tables, chairs, and dining areas.',
      'Online booking confirms a suitable table (or combination) is actually available.',
      'Run service from the Floor Plan and Table Grid with live status per table.',
    ],
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM14.25 8.25a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25a2.25 2.25 0 0 1-2.25 2.25H16.5a2.25 2.25 0 0 1-2.25-2.25V8.25ZM16.5 20.25a2.25 2.25 0 0 0 2.25-2.25V18a2.25 2.25 0 0 0-2.25-2.25H16.5a2.25 2.25 0 0 0-2.25 2.25v2.25a2.25 2.25 0 0 0 2.25 2.25ZM10.5 17.25a2.25 2.25 0 0 1-2.25-2.25V13.5a2.25 2.25 0 0 1 2.25-2.25H13.5a2.25 2.25 0 0 1 2.25 2.25V15a2.25 2.25 0 0 1-2.25 2.25H10.5Z" />
      </svg>
    ),
  },
];

export function TableModeStep({ onDone, onModeSelected }: Props) {
  const [mode, setMode] = useState<Mode>('simple');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/venue/tables/settings');
        if (!res.ok) return;
        const data = (await res.json()) as {
          settings?: { table_management_enabled?: boolean };
        };
        if (cancelled) return;
        const advanced = Boolean(data.settings?.table_management_enabled);
        const initial: Mode = advanced ? 'advanced' : 'simple';
        setMode(initial);
        onModeSelected(advanced);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Intentionally once on mount; parent onModeSelected is not stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleContinue(nextMode: Mode) {
    setSaving(true);
    setError(null);
    try {
      const advanced = nextMode === 'advanced';
      const res = await fetch('/api/venue/tables/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_management_enabled: advanced }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to save your choice');
      }
      onModeSelected(advanced);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      setSaving(false);
    }
  }

  async function handleSkip() {
    setSaving(true);
    setError(null);
    try {
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue. Please try again.');
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">How do you want to manage tables?</h2>
      <p className="mb-6 text-sm text-slate-500">
        Pick the approach that matches how you run service. This decides how online booking works and what
        your daily dashboard looks like. You can switch any time from Availability → Table Management.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {MODES.map((m) => {
          const selected = mode === m.key;
          const accent = m.key === 'advanced';
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              aria-pressed={selected}
              className={`group flex h-full flex-col rounded-2xl border p-5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                selected
                  ? accent
                    ? 'border-emerald-400 bg-emerald-50/70 ring-1 ring-emerald-400 shadow-sm'
                    : 'border-brand-500 bg-brand-50/70 ring-1 ring-brand-500 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                    accent
                      ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                      : 'bg-slate-100 text-slate-700 ring-slate-200'
                  }`}
                >
                  {m.icon}
                </span>
                <span
                  aria-hidden
                  className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    selected
                      ? accent
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-brand-600 bg-brand-600'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selected && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </span>
              </div>
              <p className="mt-3 text-base font-semibold text-slate-900">{m.title}</p>
              <p className="mt-1 text-sm text-slate-600">{m.tagline}</p>
              <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-600">
                {m.pros.map((pro) => (
                  <li key={pro} className="flex gap-2">
                    <span
                      aria-hidden
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        accent ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-auto pt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Best for
              </p>
              <p className="text-xs leading-relaxed text-slate-600">{m.bestFor}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs leading-relaxed text-slate-600">
        <p className="mb-1 font-semibold text-slate-800">Covers vs tables: the short version</p>
        <p>
          <strong className="font-semibold text-slate-800">Covers</strong> cap how many guests you can take
          overall at one time. <strong className="font-semibold text-slate-800">Tables</strong> are the physical
          seats for those guests. In <strong className="font-semibold text-slate-800">Simple covers mode</strong>,
          online booking only cares about the covers cap. In{' '}
          <strong className="font-semibold text-slate-800">Advanced table management</strong>, a booking is only
          offered when a suitable table (or combination) is actually free.
        </p>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => void handleSkip()}
          disabled={saving}
          className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={() => void handleContinue(mode)}
          disabled={saving}
          className={`rounded-lg px-6 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            mode === 'advanced' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-brand-600 hover:bg-brand-700'
          }`}
        >
          {saving
            ? 'Saving…'
            : mode === 'advanced'
              ? 'Continue with Advanced'
              : 'Continue with Simple covers'}
        </button>
      </div>
    </div>
  );
}
