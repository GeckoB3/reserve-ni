import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    const redirectTo = (await searchParams).redirectTo ?? '/dashboard';
    redirect(redirectTo);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">
          Reserve NI — Staff sign in
        </h1>
        <p className="text-sm text-center text-neutral-500">
          Enter your work email and we’ll send you a magic link to sign in.
        </p>
        <LoginForm redirectTo={(await searchParams).redirectTo} />
        {(await searchParams).error === 'auth_callback_error' && (
          <p className="text-sm text-red-600 text-center">
            Sign-in link invalid or expired. Request a new link.
          </p>
        )}
      </div>
    </main>
  );
}
