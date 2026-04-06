import { ConfirmCancelView } from "./ConfirmCancelView";

type PageProps = { params: Promise<{ bookingId: string; token: string }> };

export default async function ConfirmPage({ params }: PageProps) {
  const { bookingId, token } = await params;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <ConfirmCancelView bookingId={bookingId} token={token} />
    </main>
  );
}
