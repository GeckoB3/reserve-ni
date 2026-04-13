'use client';

/**
 * Shown when the venue has not connected Stripe but the user selected deposit or full payment online.
 */
export function StripePaymentWarning({
  stripeConnected,
  requiresOnlinePayment,
}: {
  stripeConnected: boolean;
  requiresOnlinePayment: boolean;
}) {
  if (stripeConnected || !requiresOnlinePayment) return null;
  return (
    <p className="mt-2 text-xs font-medium text-amber-700">
      Stripe is not connected. Connect your Stripe account in Settings before guests can pay online.
    </p>
  );
}
