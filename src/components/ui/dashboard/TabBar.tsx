'use client';

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="min-w-0 max-w-full">
      <p className="mb-1 text-[11px] font-medium text-slate-500 sm:hidden" role="note">
        Swipe tabs to see more
      </p>
      <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] pb-0.5 sm:overflow-visible sm:pb-0">
        <div
          className="inline-flex min-h-10 flex-nowrap gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1 shadow-inner sm:flex-wrap"
          role="tablist"
        >
          {tabs.map((t) => {
            const active = t.id === value;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChange(t.id)}
                className={`min-h-10 shrink-0 snap-start rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors sm:py-2 ${
                  active
                    ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
