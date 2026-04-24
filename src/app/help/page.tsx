'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { categoriesForPlanFilter } from '@/lib/help/navigation';
import type { HelpPlanFilter } from '@/lib/help/types';
import { HelpCategoryCard } from '@/components/help/HelpCategoryCard';

type Filter = 'all' | HelpPlanFilter;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All topics' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'appointments', label: 'Appointments' },
];

export default function HelpHomePage() {
  const [filter, setFilter] = useState<Filter>('all');
  const visible = useMemo(() => categoriesForPlanFilter(filter), [filter]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">How can we help?</h1>
        <p className="mt-2 max-w-2xl text-base text-slate-600">
          Step-by-step guides for running your venue on ReserveNI: dashboard basics, restaurant tables and dining setup,
          appointment calendars and services, settings, billing, and fixes for common problems.
        </p>
      </div>

      <div className="mb-8 flex flex-wrap gap-2" aria-label="Filter help topics by product">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <p className="mb-4 text-sm text-slate-500">
        {visible.reduce((n, c) => n + c.articles.length, 0)} articles across {visible.length} categories
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {visible.map((cat) => (
          <HelpCategoryCard key={cat.slug} category={cat} />
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Still stuck?</h2>
        <p className="mt-1 text-sm text-slate-600">
          From the dashboard, open <strong>Support</strong> to message the ReserveNI team, or review the{' '}
          <Link href="/help/troubleshooting" className="font-semibold text-brand-700 hover:underline">
            Troubleshooting
          </Link>{' '}
          section.
        </p>
      </div>
    </div>
  );
}
