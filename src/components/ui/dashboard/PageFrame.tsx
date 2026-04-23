import type { ReactNode } from 'react';

export function PageFrame({
  children,
  className = '',
  maxWidthClass = 'max-w-[1400px]',
}: {
  children: ReactNode;
  className?: string;
  /** Override for wider views e.g. calendar */
  maxWidthClass?: string;
}) {
  return (
    <div
      className={`mx-auto w-full px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 ${maxWidthClass} ${className}`}
    >
      {children}
    </div>
  );
}
