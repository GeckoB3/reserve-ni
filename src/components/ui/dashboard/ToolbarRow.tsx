'use client';

import type { ReactNode } from 'react';

export function ToolbarRow({
  eyebrow,
  title,
  actions,
  dateRow,
  statsRow,
  toolsRow,
}: {
  eyebrow: string;
  title?: string;
  actions: ReactNode;
  dateRow: ReactNode;
  statsRow?: ReactNode;
  toolsRow?: ReactNode;
}) {
  const showHeading = Boolean(title?.trim());
  return (
    <div className="space-y-3 sm:space-y-4">
      <div
        className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 ${
          showHeading ? 'sm:justify-between' : 'sm:justify-end'
        }`}
      >
        {showHeading ? (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{eyebrow}</p>
            <h1 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg lg:text-xl">{title}</h1>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">{actions}</div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-2 py-2 shadow-sm sm:px-4 sm:py-3">{dateRow}</div>

      {statsRow ? <div>{statsRow}</div> : null}

      {toolsRow ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:px-4 sm:py-3">
          <div className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center sm:gap-3">{toolsRow}</div>
        </div>
      ) : null}
    </div>
  );
}
