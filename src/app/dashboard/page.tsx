import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SignOutButton } from './sign-out-button';
import { SetPasswordBannerWrapper } from './SetPasswordBannerWrapper';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/dashboard');
  }

  const showSetPasswordBanner = !(user.user_metadata as Record<string, unknown>)?.has_set_password;
  const email = user.email ?? '';

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {showSetPasswordBanner && <SetPasswordBannerWrapper showBanner={true} />}
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-neutral-600">Signed in as {email}</p>
        <nav className="flex flex-wrap gap-4">
          <Link href="/dashboard/bookings" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">Reservations</Link>
          <Link href="/dashboard/day-sheet" className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-200">Day Sheet</Link>
          <Link href="/dashboard/reports" className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-200">Reports</Link>
          <Link href="/dashboard/settings" className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-200">Venue settings</Link>
          <Link href="/dashboard/bookings/new" className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-200">New phone booking</Link>
        </nav>
        <SignOutButton />
      </div>
    </main>
  );
}
