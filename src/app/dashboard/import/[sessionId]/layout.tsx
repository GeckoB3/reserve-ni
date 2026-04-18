import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDashboardStaff } from '@/lib/venue-auth';
import Link from 'next/link';

const STEPS = [
  { href: 'upload', label: 'Upload' },
  { href: 'map', label: 'Map' },
  { href: 'review', label: 'Review' },
  { href: 'references', label: 'References' },
  { href: 'validate', label: 'Validate' },
  { href: 'importing', label: 'Import' },
] as const;

export default async function ImportSessionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ sessionId: string }>;
}) {
  const supabase = await createClient();
  const staff = await getDashboardStaff(supabase);
  if (!staff?.venue_id || staff.role !== 'admin') {
    redirect('/dashboard');
  }

  const { sessionId } = await params;

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {STEPS.map((s) => (
            <Link
              key={s.href}
              href={`/dashboard/import/${sessionId}/${s.href}`}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {s.label}
            </Link>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
