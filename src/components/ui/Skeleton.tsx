import type { CSSProperties } from 'react';

/**
 * Shimmer skeleton primitive. Uses the `.skeleton` utility defined in
 * `globals.css` (keyframes + reduced-motion fallback).
 *
 * Compose from primitives rather than inventing bespoke loaders:
 *   <Skeleton.Line className="w-24" />
 *   <Skeleton.Block className="h-28" />
 *   <Skeleton.Card>...structured content...</Skeleton.Card>
 */
function SkeletonBase({
  className = '',
  style,
  rounded = 'md',
  ariaLabel,
}: {
  className?: string;
  style?: CSSProperties;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  ariaLabel?: string;
}) {
  const radius = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full',
  }[rounded];
  return (
    <span
      className={`skeleton block ${radius} ${className}`}
      style={style}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'status' : undefined}
    />
  );
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <SkeletonBase className={`h-3 ${className}`} rounded="md" />;
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <SkeletonBase className={className} rounded="xl" />;
}

function SkeletonCircle({ className = '' }: { className?: string }) {
  return <SkeletonBase className={className} rounded="full" />;
}

function SkeletonCard({
  className = '',
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
      role="status"
      aria-label="Loading"
    >
      {children ?? (
        <div className="space-y-3">
          <SkeletonLine className="w-1/3" />
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-4/5" />
        </div>
      )}
    </div>
  );
}

export const Skeleton = Object.assign(SkeletonBase, {
  Line: SkeletonLine,
  Block: SkeletonBlock,
  Circle: SkeletonCircle,
  Card: SkeletonCard,
});
