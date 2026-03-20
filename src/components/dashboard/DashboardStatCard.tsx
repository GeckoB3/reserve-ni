'use client';

export type DashboardStatColor =
  | 'blue'
  | 'brand'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'slate';

const colorClasses: Record<DashboardStatColor, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  brand: 'bg-brand-50 text-brand-700 border-brand-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
};

/**
 * Matches the stat tiles on dashboard/bookings for visual consistency.
 */
export function DashboardStatCard({
  label,
  value,
  color,
  subValue,
  subValue2,
}: {
  /** Omit or leave empty to hide the footer line (e.g. next-bookings tile). */
  label?: string;
  value: string | number;
  color: DashboardStatColor;
  /** Optional smaller line under the main value (e.g. percentage). */
  subValue?: string;
  /** Optional second line under subValue. */
  subValue2?: string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${colorClasses[color]}`}>
      <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
      {subValue && <p className="mt-0.5 text-xs font-medium opacity-80 tabular-nums">{subValue}</p>}
      {subValue2 && <p className="mt-0.5 text-xs font-medium opacity-80 tabular-nums">{subValue2}</p>}
      {label ? <p className="mt-1 text-xs font-medium opacity-75">{label}</p> : null}
    </div>
  );
}
