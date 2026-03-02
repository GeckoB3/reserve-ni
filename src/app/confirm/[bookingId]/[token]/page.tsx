import { ConfirmCancelView } from './ConfirmCancelView';

type PageProps = { params: Promise<{ bookingId: string; token: string }> };

export default async function ConfirmPage({ params }: PageProps) {
  const { bookingId, token } = await params;
  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <ConfirmCancelView bookingId={bookingId} token={token} />
    </main>
  );
}
