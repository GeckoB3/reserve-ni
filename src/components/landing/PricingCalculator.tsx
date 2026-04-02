'use client';

import { useState } from 'react';
import { STANDARD_PRICE_PER_CALENDAR, BUSINESS_PRICE } from '@/lib/pricing-constants';

const MAX_STAFF = 30;

export function PricingCalculator() {
  const [count, setCount] = useState(1);
  const total = count * STANDARD_PRICE_PER_CALENDAR;
  const showCrossoverNudge = count * STANDARD_PRICE_PER_CALENDAR > BUSINESS_PRICE;

  return (
    <div className="mt-4">
      <label className="text-sm font-medium text-slate-700">How many staff will use Reserve NI?</label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCount(1)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Just me (&pound;{STANDARD_PRICE_PER_CALENDAR})
        </button>
        <button
          type="button"
          onClick={() => setCount(2)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          2 (&pound;{STANDARD_PRICE_PER_CALENDAR * 2})
        </button>
        <button
          type="button"
          onClick={() => setCount(3)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          3 (&pound;{STANDARD_PRICE_PER_CALENDAR * 3})
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setCount(Math.max(1, count - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          -
        </button>
        <span className="w-8 text-center text-lg font-semibold text-slate-900">{count}</span>
        <button
          type="button"
          onClick={() => setCount(Math.min(MAX_STAFF, count + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          +
        </button>
      </div>
      <p className="mt-2 text-sm font-semibold text-brand-600">
        {count} &times; &pound;{STANDARD_PRICE_PER_CALENDAR}/month = &pound;{total}/month
      </p>
      {showCrossoverNudge && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          At {count} staff, that&apos;s &pound;{total}/month. The Business plan is &pound;{BUSINESS_PRICE}/month for unlimited team
          members plus SMS reminders and priority support.
        </p>
      )}
    </div>
  );
}
