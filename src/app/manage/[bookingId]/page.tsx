'use client';

import { useSearchParams } from 'next/navigation';
import { use } from 'react';
import { ManageBookingView } from './[token]/ManageBookingView';

type PageProps = { params: Promise<{ bookingId: string }> };

export default function ManageBookingHmacPage({ params }: PageProps) {
  const { bookingId } = use(params);
  const searchParams = useSearchParams();
  const hmac = searchParams.get('hmac');

  if (!hmac) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md text-center">
          <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
            <p className="text-sm text-red-600">Invalid link</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <ManageBookingView bookingId={bookingId} hmac={hmac} />
    </main>
  );
}
