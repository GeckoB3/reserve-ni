import type { ReactNode } from 'react';

/**
 * Desktop: table-like list with dividers. Mobile: stacked cards.
 */
export function StackedList<T>({
  items,
  keyExtractor,
  renderDesktopRow,
  renderMobileCard,
  empty,
  /** When true, desktop list has no outer card chrome (use inside `SectionCard` body). */
  flush = false,
}: {
  items: readonly T[];
  keyExtractor: (item: T) => string;
  renderDesktopRow: (item: T) => ReactNode;
  renderMobileCard: (item: T) => ReactNode;
  empty?: ReactNode;
  flush?: boolean;
}) {
  if (items.length === 0 && empty) {
    return <>{empty}</>;
  }
  const desktopListClass = flush
    ? 'hidden divide-y divide-slate-100 md:block'
    : 'hidden divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm md:block';
  return (
    <>
      <ul className={desktopListClass}>
        {items.map((item) => (
          <li key={keyExtractor(item)} className="px-1 py-0.5 sm:px-2">
            {renderDesktopRow(item)}
          </li>
        ))}
      </ul>
      <div className="space-y-2 md:hidden">
        {items.map((item) => (
          <div key={keyExtractor(item)}>{renderMobileCard(item)}</div>
        ))}
      </div>
    </>
  );
}
