import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function TableSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/floor-plan');
  redirect('/dashboard/floor-plan');
}
