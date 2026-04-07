import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isPlatformSuperuser } from '@/lib/platform-auth';
import { SuperSidebar } from './SuperSidebar';

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isPlatformSuperuser(user)) {
    redirect('/login');
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-slate-50">
      <SuperSidebar email={user.email ?? ''} />
      <main className="min-h-0 flex-1 overflow-y-auto pt-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:pt-0">
        {children}
      </main>
    </div>
  );
}
