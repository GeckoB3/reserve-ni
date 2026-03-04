import { ManageBookingView } from './ManageBookingView';

type PageProps = { params: Promise<{ bookingId: string; token: string }> };

export default async function ManageBookingPage({ params }: PageProps) {
  const { bookingId, token } = await params;
  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <ManageBookingView bookingId={bookingId} token={token} />
    </main>
  );
}
