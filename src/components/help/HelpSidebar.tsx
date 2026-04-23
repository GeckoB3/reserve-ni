'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { HelpCategory } from '@/lib/help/types';
import { Pill } from '@/components/ui/dashboard/Pill';

function planPill(plan: HelpCategory['plan']) {
  if (plan === 'restaurant') return <Pill variant="neutral" size="sm">Restaurant</Pill>;
  if (plan === 'appointments') return <Pill variant="brand" size="sm">Appointments</Pill>;
  return null;
}

export function HelpSidebar({ categories, onNavigate }: { categories: HelpCategory[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Help topics" className="flex flex-col gap-6 text-sm">
      {categories.map((cat) => {
        const catActive = pathname === `/help/${cat.slug}` || pathname.startsWith(`/help/${cat.slug}/`);
        return (
          <div key={cat.slug}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link
                href={`/help/${cat.slug}`}
                onClick={onNavigate}
                className={`rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide ${
                  catActive ? 'text-brand-800' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {cat.title}
              </Link>
              {planPill(cat.plan)}
            </div>
            <ul className="space-y-0.5 border-l border-slate-200 pl-3">
              {cat.articles.map((art) => {
                const href = `/help/${cat.slug}/${art.slug}`;
                const active = pathname === href;
                return (
                  <li key={art.slug}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      className={`block rounded-r-lg py-1.5 pl-2 text-[13px] leading-snug transition-colors ${
                        active
                          ? 'border-l-2 border-brand-600 bg-brand-50/80 font-semibold text-brand-900 -ml-px pl-[7px]'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {art.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
