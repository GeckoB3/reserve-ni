'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getBusinessTypesByCategory, BOOKING_MODEL_SIGNUP_CARDS, BOOKING_MODEL_CHIP_LABEL } from '@/lib/business-config';

const CATEGORY_LABELS: Record<string, string> = {
  hospitality: 'Restaurants & hospitality',
  beauty_grooming: 'Beauty & grooming',
  health_wellness: 'Health & wellness',
  fitness: 'Fitness',
  education: 'Education',
  creative: 'Creative',
  professional: 'Professional services',
  pets: 'Pets',
  experiences: 'Experiences & activities',
  entertainment: 'Entertainment',
  family: 'Family',
  sports: 'Sports',
  business: 'Business',
  leisure: 'Leisure',
  accommodation: 'Accommodation',
};

const CATEGORY_ORDER = [
  'hospitality',
  'beauty_grooming',
  'health_wellness',
  'fitness',
  'education',
  'creative',
  'professional',
  'pets',
  'experiences',
  'entertainment',
  'family',
  'sports',
  'business',
  'leisure',
  'accommodation',
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
      grouped[cat]?.some((bt) => bt.label.toLowerCase().includes(q)),
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
        <h1 className="text-2xl font-bold text-slate-900">What kind of business are you?</h1>
        <p className="mt-2 text-sm text-slate-500">
          Pick the booking model that fits your business. We&apos;ll tailor wording,
          dashboard views, and defaults to your trade.
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setSelected('restaurant')}
          className={`rounded-2xl border px-4 py-4 text-left transition-all ${
            selected === 'restaurant'
              ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">Restaurant, café, pub, hotel</p>
          <p className="mt-1 text-xs text-slate-600">Guests book tables or covers per sitting.</p>
        </button>
        <button
          type="button"
          onClick={() => setSelected('model_unified_scheduling')}
          className={`rounded-2xl border px-4 py-4 text-left transition-all ${
            selected === 'model_unified_scheduling'
              ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">Appointments &amp; services</p>
          <p className="mt-1 text-xs text-slate-600">Clients book with a calendar or team member for a set duration.</p>
        </button>
        <button
          type="button"
          onClick={() => setSelected('model_event_ticket')}
          className={`rounded-2xl border px-4 py-4 text-left transition-all ${
            selected === 'model_event_ticket'
              ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">Events &amp; experiences</p>
          <p className="mt-1 text-xs text-slate-600">Guests buy tickets for events - escape rooms, tours, shows.</p>
        </button>
        <button
          type="button"
          onClick={() => setSelected('model_class_session')}
          className={`rounded-2xl border px-4 py-4 text-left transition-all ${
            selected === 'model_class_session'
              ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">Classes &amp; group sessions</p>
          <p className="mt-1 text-xs text-slate-600">Members book spots in recurring classes from a timetable.</p>
        </button>
        <button
          type="button"
          onClick={() => setSelected('model_resource_booking')}
          className={`rounded-2xl border px-4 py-4 text-left transition-all ${
            selected === 'model_resource_booking'
              ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">Spaces &amp; facilities</p>
          <p className="mt-1 text-xs text-slate-600">Customers book a named space or resource by the slot.</p>
        </button>
      </div>

      <details className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm open:pb-4">
        <summary className="cursor-pointer font-semibold text-slate-800">Our booking models</summary>
        <ul className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          {BOOKING_MODEL_SIGNUP_CARDS.map((card) => (
            <li key={card.model}>
              <p className="font-medium text-slate-900">{card.title}</p>
              <p className="text-slate-600">{card.summary}</p>
              <p className="mt-1 text-xs text-slate-500">Examples: {card.examples}</p>
            </li>
          ))}
        </ul>
      </details>

      <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
        Or choose a specific trade
      </p>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search trades…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
        />
      </div>

      <div className="space-y-6 max-h-[46vh] overflow-y-auto pr-2">
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
                      {BOOKING_MODEL_CHIP_LABEL[bt.model]}
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
          My trade isn&apos;t listed: use flexible appointments
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
