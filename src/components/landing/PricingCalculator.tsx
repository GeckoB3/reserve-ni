'use client';

import { useState } from 'react';
import { STANDARD_PRICE_PER_CALENDAR, BUSINESS_PRICE } from '@/lib/pricing-constants';

export function PricingCalculator() {
  const [count, setCount] = useState(1);
  const total = count * STANDARD_PRICE_PER_CALENDAR;

  return (
    <div className="mt-4">
      <label className="text-xs font-medium text-slate-500">
        How many calendars?
      </label>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setCount(Math.max(1, count - 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-sm text-slate-500 hover:bg-slate-50"
        >
          -
        </button>
        <span className="w-6 text-center text-sm font-semibold text-slate-900">{count}</span>
        <button
          type="button"
          onClick={() => setCount(count + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-sm text-slate-500 hover:bg-slate-50"
        >
          +
        </button>
        <span className="text-sm font-semibold text-brand-600">
          = &pound;{total}/mo
        </span>
      </div>
      {count >= 4 && count * STANDARD_PRICE_PER_CALENDAR > BUSINESS_PRICE && (
        <p className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-700">
          At {count} bookable calendars, Standard totals &pound;{count * STANDARD_PRICE_PER_CALENDAR}/mo. Business is
          &pound;{BUSINESS_PRICE}/mo with unlimited calendars, 800 SMS/month, and priority support.
        </p>
      )}
    </div>
  );
}
