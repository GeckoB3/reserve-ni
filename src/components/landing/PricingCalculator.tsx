'use client';

import { useState } from 'react';

export function PricingCalculator() {
  const [count, setCount] = useState(1);
  const total = count * 10;

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
      {count >= 8 && (
        <p className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-700">
          At {count} calendars, Business (&pound;79/mo) gives you unlimited calendars plus SMS and priority support.
        </p>
      )}
    </div>
  );
}
