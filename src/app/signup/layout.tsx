import { Suspense } from 'react';
import Link from 'next/link';

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <nav className="border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex-shrink-0">
            <img src="/Logo.png" alt="Reserve NI" className="h-9 w-auto" />
          </Link>
          <Link href="/login" className="text-sm font-medium text-slate-500 hover:text-brand-600 transition-colors">
            Already have an account? Sign in
          </Link>
        </div>
      </nav>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-16">
        <Suspense fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          </div>
        }>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
