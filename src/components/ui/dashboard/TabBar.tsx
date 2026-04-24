'use client';

import { Skeleton } from '@/components/ui/Skeleton';

export function TabBar<T extends string>({
  tabs,
  value,
  pendingValue,
  onChange,
}: {
  tabs: readonly { id: T; label: string; description?: string }[];
  value: T;
  pendingValue?: T | null;
  onChange: (id: T) => void;
}) {
  const active = tabs.find((t) => t.id === value);
  return (
    <div className="min-w-0 max-w-full space-y-2">
      <p className="text-[11px] font-medium text-slate-500 sm:hidden" role="note">
        Scroll sideways to see all settings tabs
      </p>
      <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] pb-0.5 sm:overflow-visible sm:pb-0">
        <div
          className="inline-flex min-h-11 flex-nowrap gap-1 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-1 shadow-inner sm:flex-wrap sm:gap-1.5"
          role="tablist"
        >
          {tabs.map((t) => {
            const isActive = t.id === value;
            const isPending = pendingValue === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-busy={isPending || undefined}
                aria-current={isActive ? 'page' : undefined}
                title={t.description}
                onClick={() => onChange(t.id)}
                className={`min-h-11 shrink-0 snap-start rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition-all sm:min-h-10 sm:px-4 sm:py-2 ${
                  isActive
                    ? 'bg-white text-brand-800 shadow-md shadow-slate-900/10 ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  {isPending ? <Skeleton.Line className="h-2.5 w-7 shrink-0" /> : null}
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {active?.description ? (
        <p className="hidden text-sm leading-relaxed text-slate-600 sm:block">{active.description}</p>
      ) : null}
    </div>
  );
}
