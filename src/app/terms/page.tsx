import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: 'Terms of Service — Reserve NI',
  description: 'Terms and conditions for using the Reserve NI booking platform.',
};

const LAST_UPDATED = '5 March 2026';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center gap-3">
          <Link href="/">
            <Image src="/Logo.png" alt="Reserve NI" width={120} height={36} className="h-8 w-auto" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
          <h1 className="mb-2 text-3xl font-bold text-slate-900">Terms of Service</h1>
          <p className="mb-8 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>

          <div className="space-y-8 text-sm leading-relaxed text-slate-700">

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">1. About Reserve NI</h2>
              <p>
                These Terms of Service govern your use of the Reserve NI platform, including the guest-facing
                booking pages and the venue management dashboard. By making a reservation or using our platform,
                you agree to these terms.
              </p>
              <p className="mt-3">
                Reserve NI is a technology platform that connects guests with participating venues. We are not
                a party to the contract between you and the venue — that contract is between you and the
                restaurant or hospitality business you are booking with.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">2. Making a reservation</h2>
              <p>
                When you make a reservation using Reserve NI, you are entering into an agreement with the venue.
                Reserve NI facilitates this on the venue&apos;s behalf. The venue sets its own booking policies,
                including:
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Whether a deposit is required</li>
                <li>The deposit amount per person</li>
                <li>The cancellation and refund policy</li>
                <li>Party size limits and booking restrictions</li>
              </ul>
              <p className="mt-3">
                You will be shown these conditions clearly before confirming your booking. By proceeding, you
                accept the venue&apos;s specific terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">3. Deposits and payments</h2>
              <p>
                Where a deposit is required, payment is processed securely through Stripe. Deposits are paid
                directly to the venue&apos;s Stripe account — Reserve NI does not hold or handle your funds.
              </p>
              <p className="mt-3">
                The refund policy is set by each venue and will be shown to you at the time of booking.
                Typically, a full refund is available if you cancel with sufficient notice (often 48 hours or
                more in advance). No refund is generally provided for no-shows or very late cancellations.
              </p>
              <p className="mt-3">
                Reserve NI never stores your card details. All payment data is handled by Stripe and subject
                to{' '}
                <a href="https://stripe.com/gb/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                  Stripe&apos;s Privacy Policy
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">4. Cancellations</h2>
              <p>
                You may cancel your reservation using the link provided in your booking confirmation email or
                text message. The cancellation deadline and refund eligibility are determined by the venue and
                will be communicated to you at the time of booking.
              </p>
              <p className="mt-3">
                If you fail to arrive for your reservation without cancelling (&ldquo;no-show&rdquo;), you may
                forfeit any deposit paid, in accordance with the venue&apos;s policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">5. Venue operators</h2>
              <p>
                Venues that use Reserve NI agree to:
              </p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Provide accurate information about opening hours, availability, and policies</li>
                <li>Honour confirmed reservations made through the platform</li>
                <li>Handle guest data in compliance with UK GDPR and applicable privacy law</li>
                <li>Use Stripe Connect to receive deposit payments, in accordance with Stripe&apos;s terms</li>
                <li>
                  Not misuse the platform for purposes other than genuine reservation management
                </li>
              </ul>
              <p className="mt-3">
                Reserve NI reserves the right to suspend venue accounts that breach these obligations.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">6. Data and your rights</h2>
              <p>
                Your personal data is handled in accordance with our{' '}
                <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>.
                Venues are entitled to export their booking and guest data at any time via the dashboard.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">7. Limitation of liability</h2>
              <p>
                Reserve NI provides the platform &ldquo;as is&rdquo; and makes no warranties about uninterrupted
                service availability. We are not liable for losses arising from a venue&apos;s failure to honour
                a reservation, or from circumstances outside our reasonable control.
              </p>
              <p className="mt-3">
                Our maximum liability to you in connection with your use of Reserve NI shall not exceed the
                deposit amount paid for the relevant booking.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">8. Governing law</h2>
              <p>
                These terms are governed by the laws of Northern Ireland and the United Kingdom. Any disputes
                shall be subject to the exclusive jurisdiction of the courts of Northern Ireland.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">9. Contact</h2>
              <p>
                For questions about these terms, contact us at{' '}
                <a href="mailto:support@reserveni.com" className="text-brand-600 hover:underline">
                  support@reserveni.com
                </a>.
              </p>
            </section>

          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          <Link href="/privacy" className="hover:text-brand-600">Privacy Policy</Link>
          {' · '}
          <Link href="/" className="hover:text-brand-600">Back to Reserve NI</Link>
        </div>
      </main>
    </div>
  );
}
