'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * Presentation shell for a horizontal timeline slot (calendar / table grid).
 * Parent supplies positioning via className or style.
 */
export function TimelineRow({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
