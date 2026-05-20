import type { ReactNode } from 'react';

export function WaitlistRequiredLegend({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-snug text-slate-500 ${className}`.trim()}>
      Fields marked with{' '}
      <span className="font-medium text-red-500" aria-hidden="true">
        *
      </span>{' '}
      are required.
    </p>
  );
}

export function WaitlistFieldLabel({
  htmlFor,
  children,
  required = false,
  compact = false,
}: {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
  compact?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={
        compact
          ? 'mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500'
          : 'mb-1.5 block text-sm font-medium text-slate-700'
      }
    >
      {children}
      {required ? (
        <>
          {' '}
          <span className="text-red-500" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      ) : null}
    </label>
  );
}
