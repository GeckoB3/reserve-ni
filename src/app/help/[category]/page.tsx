import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCategoryBySlug, helpArticleHref, HELP_CATEGORIES } from '@/lib/help/navigation';
import { HelpBreadcrumb } from '@/components/help/HelpBreadcrumb';

export function generateStaticParams() {
  return HELP_CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const cat = getCategoryBySlug(category);
  return {
    title: cat ? `${cat.title} | Help` : 'Help',
    description: cat?.description,
  };
}

export default async function HelpCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: categorySlug } = await params;
  const cat = getCategoryBySlug(categorySlug);
  if (!cat) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <HelpBreadcrumb categoryTitle={cat.title} categorySlug={cat.slug} />
      <h1 className="text-3xl font-bold text-slate-900">{cat.title}</h1>
      <p className="mt-2 text-base text-slate-600">{cat.description}</p>

      <ul className="mt-8 space-y-2">
        {cat.articles.map((art) => (
          <li key={art.slug}>
            <Link
              href={helpArticleHref(cat.slug, art.slug)}
              className="block rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50/30"
            >
              <span className="font-semibold text-slate-900">{art.title}</span>
              <p className="mt-0.5 text-sm text-slate-600">{art.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
