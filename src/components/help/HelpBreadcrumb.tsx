import Link from 'next/link';

export function HelpBreadcrumb({
  categoryTitle,
  categorySlug,
  articleTitle,
}: {
  categoryTitle: string;
  categorySlug: string;
  articleTitle?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/help" className="font-medium text-brand-700 hover:text-brand-900 hover:underline">
            Help
          </Link>
        </li>
        <li aria-hidden className="text-slate-300">
          /
        </li>
        <li>
          <Link
            href={`/help/${categorySlug}`}
            className="font-medium text-brand-700 hover:text-brand-900 hover:underline"
          >
            {categoryTitle}
          </Link>
        </li>
        {articleTitle ? (
          <>
            <li aria-hidden className="text-slate-300">
              /
            </li>
            <li className="font-semibold text-slate-800">{articleTitle}</li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}
