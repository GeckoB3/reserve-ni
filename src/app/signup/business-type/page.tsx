'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getBusinessTypesByCategory } from '@/lib/business-config';

const CATEGORY_LABELS: Record<string, string> = {
  hospitality: 'Hospitality',
  beauty_grooming: 'Beauty & Grooming',
  health_wellness: 'Health & Wellness',
  fitness: 'Fitness',
  education: 'Education',
  creative: 'Creative',
  professional: 'Professional Services',
  pets: 'Pets',
  experiences: 'Experiences & Activities',
  entertainment: 'Entertainment',
  family: 'Family',
  business: 'Business',
  sports: 'Sports & Leisure',
  accommodation: 'Accommodation',
  leisure: 'Leisure',
};

const CATEGORY_ORDER = [
  'hospitality',
  'beauty_grooming',
  'health_wellness',
  'fitness',
  'experiences',
  'entertainment',
  'education',
  'sports',
  'creative',
  'professional',
  'business',
  'pets',
  'family',
  'accommodation',
  'leisure',
];

export default function BusinessTypePage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const router = useRouter();

  const grouped = useMemo(() => getBusinessTypesByCategory(), []);

  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return CATEGORY_ORDER.filter((cat) => grouped[cat]?.length);
    return CATEGORY_ORDER.filter((cat) =>
      grouped[cat]?.some((bt) => bt.label.toLowerCase().includes(q))
    );
  }, [search, grouped]);

  function handleContinue() {
    if (!selected) return;
    sessionStorage.setItem('signup_business_type', selected);
    router.push('/signup/plan');
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">What type of business are you?</h1>
        <p className="mt-2 text-sm text-slate-500">
          This helps us set up the right booking model and terminology for your business.
        </p>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search business types..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
        />
      </div>

      <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
        {filteredCategories.map((category) => {
          const items = grouped[category]?.filter((bt) =>
            bt.label.toLowerCase().includes(search.toLowerCase().trim())
          );
          if (!items?.length) return null;
          return (
            <div key={category}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                {CATEGORY_LABELS[category] ?? category}
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((bt) => (
                  <button
                    key={bt.key}
                    type="button"
                    onClick={() => setSelected(bt.key)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                      selected === bt.key
                        ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {bt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Other option */}
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => setSelected('other')}
          className={`text-sm font-medium transition-colors ${
            selected === 'other' ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          My business type isn&apos;t listed
        </button>
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          disabled={!selected}
          onClick={handleContinue}
          className="rounded-xl bg-brand-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
