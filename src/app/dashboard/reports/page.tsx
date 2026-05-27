import { redirect } from 'next/navigation';

/** Reports live under Settings → Reports tab (admin only). */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  qs.set('tab', 'reports');
  if (sp.tab === 'clients') {
    qs.set('reportsTab', 'clients');
  }
  redirect(`/dashboard/settings?${qs.toString()}`);
}
