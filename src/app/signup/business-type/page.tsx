'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  getBusinessTypesByCategory,
  BOOKING_MODEL_CHIP_LABEL,
  BOOKING_MODEL_SIGNUP_CARDS,
} from '@/lib/business-config';
import type { BookingModel } from '@/types/booking-models';

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

type SignupMode = 'business_types' | 'booking_models';

export default function BusinessTypePage() {
  const [mode, setMode] = useState<SignupMode>('business_types');
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const router = useRouter();

  const grouped = useMemo(() => getBusinessTypesByCategory(), []);

  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return CATEGORY_ORDER.filter((cat) => grouped[cat]?.length);
    return CATEGORY_ORDER.filter((cat) =>
      grouped[cat]?.some((bt) => bt.label.toLowerCase().includes(q)),
    );
  }, [search, grouped]);

  function handleContinue() {
    if (!selected) return;
    sessionStorage.setItem('signup_business_type', selected);
    router.push('/signup/plan');
  }

  function switchMode(next: SignupMode) {
    setMode(next);
    setSelected(null);
    setSearch('');
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">How should Reserve NI work for you?</h1>
        <p className="mt-2 text-sm text-slate-500">
          Pick a trade to get tailored defaults, or choose a booking pattern if your business isn&apos;t listed.
        </p>
      </div>

      <div
        className="mb-6 flex rounded-xl border border-slate-200 bg-slate-50/80 p-1 text-sm font-medium"
        role="tablist"
        aria-label="Signup path"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'business_types'}
          onClick={() => switchMode('business_types')}
          className={`flex-1 rounded-lg px-3 py-2.5 transition-colors ${
            mode === 'business_types'
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          By business type
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'booking_models'}
          onClick={() => switchMode('booking_models')}
          className={`flex-1 rounded-lg px-3 py-2.5 transition-colors ${
            mode === 'booking_models'
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          By booking type
        </button>
      </div>

      {mode === 'business_types' && (
        <>
          <details className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm open:pb-4">
            <summary className="cursor-pointer font-semibold text-slate-800">
              The five booking types (read before you choose)
            </summary>
            <p className="mt-2 text-xs text-slate-500">
              Every trade below maps to one of these. If two sound similar, pick the one that matches how
              customers actually book you.
            </p>
            <ul className="mt-3 space-y-3 border-t border-slate-100 pt-3">
              {BOOKING_MODEL_SIGNUP_CARDS.map((card) => (
                <li key={card.model}>
                  <p className="font-medium text-slate-900">{card.title}</p>
                  <p className="text-slate-600">{card.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.examples}</p>
                </li>
              ))}
            </ul>
          </details>

          <div className="mb-6">
            <input
              type="text"
              placeholder="Search business types..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
          </div>

          <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2">
            {filteredCategories.map((category) => {
              const items = grouped[category]?.filter((bt) =>
                bt.label.toLowerCase().includes(search.toLowerCase().trim()),
              );
              if (!items?.length) return null;
              return (
                <div key={category}>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                    {CATEGORY_LABELS[category] ?? category}
                  </h2>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                        <span className="block">{bt.label}</span>
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          {BOOKING_MODEL_CHIP_LABEL[bt.model as BookingModel]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col items-center gap-2 border-t border-slate-100 pt-4 text-center">
            <button
              type="button"
              onClick={() => setSelected('other')}
              className={`text-sm font-medium transition-colors ${
                selected === 'other' ? 'text-brand-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              My business type isn&apos;t listed — use flexible appointments
            </button>
            <button
              type="button"
              onClick={() => switchMode('booking_models')}
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              I know how my bookings work — choose a booking type instead
            </button>
          </div>
        </>
      )}

      {mode === 'booking_models' && (
        <>
          <p className="mb-4 text-sm text-slate-600">
            Select the pattern that best matches how customers book you. You can still rename guests,
            appointments, and staff labels later in settings.
          </p>
          <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
            {BOOKING_MODEL_SIGNUP_CARDS.map((card) => (
              <button
                key={card.model}
                type="button"
                onClick={() => setSelected(card.businessTypeKey)}
                className={`w-full rounded-xl border px-4 py-4 text-left transition-all ${
                  selected === card.businessTypeKey
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className="text-base font-semibold text-slate-900">{card.title}</span>
                <p className="mt-1 text-sm text-slate-600">{card.detail}</p>
                <p className="mt-2 text-xs font-medium text-slate-500">Examples: {card.examples}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => switchMode('business_types')}
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Back to business type list
            </button>
          </div>
        </>
      )}

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
