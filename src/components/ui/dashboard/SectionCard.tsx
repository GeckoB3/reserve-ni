import type { ReactNode } from 'react';

function SectionCardRoot({
  children,
  className = '',
  elevated = false,
}: {
  children: ReactNode;
  className?: string;
  /** Stronger shadow for primary panels */
  elevated?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 ${
        elevated ? 'shadow-xl shadow-slate-900/10' : 'shadow-sm shadow-slate-900/5'
      } ${className}`}
    >
      {children}
    </div>
  );
}

function SectionCardHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title?: string;
  description?: ReactNode;
  right?: ReactNode;
}) {
  if (!eyebrow && !title && !right) return null;
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{eyebrow}</p>
        ) : null}
        {title ? <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h2> : null}
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

function SectionCardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-4 sm:px-6 sm:py-5 ${className}`}>{children}</div>;
}

function SectionCardDivider() {
  return <div className="border-t border-slate-100" role="separator" />;
}

function SectionCardFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border-t border-slate-100 bg-slate-50/40 px-5 py-3 sm:px-6 ${className}`}>{children}</div>
  );
}

export const SectionCard = Object.assign(SectionCardRoot, {
  Header: SectionCardHeader,
  Body: SectionCardBody,
  Divider: SectionCardDivider,
  Footer: SectionCardFooter,
});
