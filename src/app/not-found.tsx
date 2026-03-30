import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Page not found</h1>
      <p className="max-w-md text-sm text-slate-600">
        We could not find that page. It may have been moved or the link is incorrect.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Back to home
      </Link>
    </div>
  );
}
