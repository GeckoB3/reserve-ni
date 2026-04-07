import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isPlatformSuperuser } from '@/lib/platform-auth';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && isPlatformSuperuser(user)) {
    redirect('/super');
  }
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <nav className="border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-center px-6 py-4">
          <Link href="/" className="flex-shrink-0">
            <img src="/Logo.png" alt="Reserve NI" className="h-9 w-auto" />
          </Link>
        </div>
      </nav>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-16">
        {children}
      </main>
    </div>
  );
}
