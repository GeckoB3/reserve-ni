import type { ReactNode } from 'react';

type Size = 'compact' | 'default' | 'hero';

export function EmptyState({
  title,
  description,
  action,
  icon,
  size = 'default',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  /**
   * - `compact`: use inside a card body alongside other content (tight padding).
   * - `default`: standalone empty state (current behaviour).
   * - `hero`: page-level empty state with generous padding.
   */
  size?: Size;
}) {
  const wrap = {
    compact: 'px-4 py-6 sm:py-8',
    default: 'px-6 py-12 sm:py-14',
    hero: 'px-6 py-16 sm:py-24',
  }[size];
  const iconWrap = {
    compact: 'mb-2',
    default: 'mb-4',
    hero: 'mb-6',
  }[size];
  const titleCls = {
    compact: 'text-sm font-semibold',
    default: 'text-base font-semibold',
    hero: 'text-lg font-semibold sm:text-xl',
  }[size];
  const descCls = {
    compact: 'mt-1 text-xs text-slate-600',
    default: 'mt-2 text-sm text-slate-600',
    hero: 'mt-2 text-sm text-slate-600 sm:text-base',
  }[size];

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 text-center ${wrap}`}
    >
      {icon ? <div className={`${iconWrap} text-brand-500`}>{icon}</div> : null}
      <p className={`${titleCls} text-slate-900`}>{title}</p>
      {description ? <p className={`${descCls} max-w-md`}>{description}</p> : null}
      {action ? <div className={size === 'compact' ? 'mt-3' : 'mt-5'}>{action}</div> : null}
    </div>
  );
}
