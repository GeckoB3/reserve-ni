/**
 * Shown below `sm` when a wide table sits in a horizontal scroll container so users know to swipe.
 */
export function HorizontalScrollHint() {
  return (
    <p className="mb-2 text-xs text-slate-500 sm:hidden" role="note">
      Swipe horizontally to see all columns.
    </p>
  );
}
