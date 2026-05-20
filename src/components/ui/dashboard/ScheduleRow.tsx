'use client';

import type { ReactNode } from 'react';

export function ScheduleRow({
  timeLabel,
  title,
  subtitle,
  stripClassName = 'bg-brand-600',
  trailing,
  onClick,
  selected,
  dashed,
}: {
  timeLabel: string;
  title: string;
  subtitle?: ReactNode;
  /** Tailwind classes for the vertical colour strip */
  stripClassName?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  /** Empty / open slot styling */
  dashed?: boolean;
}) {
  const rowClass = `flex w-full flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-left transition-colors sm:px-4 sm:py-3 ${
    dashed
      ? 'border-dashed border-slate-200 bg-slate-50/70'
      : selected
        ? 'border-brand-200 bg-brand-50/40 shadow-sm'
        : 'border-slate-100 bg-white hover:border-brand-200/80 hover:bg-slate-50/80'
  } ${onClick ? 'cursor-pointer' : ''}`;

  const inner = (
    <>
      <div className="flex shrink-0 items-start gap-3">
        <span className={`mt-0.5 h-10 w-1.5 shrink-0 rounded-full ${stripClassName}`} aria-hidden />
        <span className="w-14 text-xs font-bold tabular-nums text-slate-900 sm:text-sm">{timeLabel}</span>
      </div>
      <div className="min-w-0 flex-[1_1_12rem]">
        <p className={`break-words text-sm font-semibold ${dashed ? 'text-slate-400' : 'text-slate-900'}`}>{title}</p>
        {subtitle ? <div className="break-words text-xs text-slate-500">{subtitle}</div> : null}
      </div>
      {trailing ? (
        <div className="flex min-w-[min(100%,10rem)] flex-[1_1_auto] flex-wrap items-center justify-end gap-1.5 sm:min-w-[8rem]">
          {trailing}
        </div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rowClass}>
        {inner}
      </button>
    );
  }
  return <div className={rowClass}>{inner}</div>;
}
