import Link from 'next/link';
import type { HelpCategory, HelpPlanFilter } from '@/lib/help/types';
import { Pill } from '@/components/ui/dashboard/Pill';

function planBadge(plan: HelpPlanFilter) {
  if (plan === 'restaurant') return { label: 'Restaurant', variant: 'neutral' as const };
  if (plan === 'appointments') return { label: 'Appointments', variant: 'brand' as const };
  return { label: 'All plans', variant: 'neutral' as const };
}

export function HelpCategoryCard({ category }: { category: HelpCategory }) {
  const badge = planBadge(category.plan);
  return (
    <Link
      href={`/help/${category.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-brand-200 hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 group-hover:text-brand-800">{category.title}</h2>
        <Pill variant={badge.variant} size="sm" className="shrink-0">
          {badge.label}
        </Pill>
      </div>
      <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-600">{category.description}</p>
      <p className="text-sm font-semibold text-brand-700 group-hover:underline">
        {category.articles.length} articles →
      </p>
    </Link>
  );
}
