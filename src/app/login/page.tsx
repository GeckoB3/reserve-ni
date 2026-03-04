import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const redirectTo = (await searchParams).redirectTo ?? '/dashboard';
    redirect(redirectTo);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(13,148,136,0.06) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(5,150,105,0.04) 0%, transparent 50%)' }} />
      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white shadow-lg shadow-teal-600/20">R</div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Reserve NI</h1>
          <p className="mt-1 text-sm text-slate-500">Staff sign in</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm redirectTo={(await searchParams).redirectTo} />
          {(await searchParams).error === 'auth_callback_error' && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
              Sign-in link invalid or expired. Request a new link.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
