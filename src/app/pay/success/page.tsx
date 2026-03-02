export default function PaySuccessPage() {
  return (
    <main className="min-h-screen bg-neutral-50 p-6 flex items-center justify-center">
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 max-w-sm text-center">
        <p className="font-medium text-green-800">Payment received</p>
        <p className="mt-2 text-sm text-green-700">Your deposit has been paid. You will receive a confirmation by email or SMS shortly.</p>
      </div>
    </main>
  );
}
