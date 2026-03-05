import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: 'Privacy Policy — Reserve NI',
  description: 'How Reserve NI collects, uses, and protects your personal data.',
};

const LAST_UPDATED = '5 March 2026';

export default function PrivacyPage() {
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
          <h1 className="mb-2 text-3xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="mb-8 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>

          <div className="prose prose-slate max-w-none space-y-8 text-sm leading-relaxed text-slate-700">

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">1. Who we are</h2>
              <p>
                Reserve NI (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is an online reservation and
                guest management platform for independent restaurants and hospitality venues in Northern Ireland.
                We act as a data processor on behalf of the venues that use our platform, and as a data controller
                for the information we collect to operate our service.
              </p>
              <p className="mt-3">
                If you have questions about this policy, contact us at{' '}
                <a href="mailto:hello@reserveni.com" className="text-brand-600 hover:underline">
                  hello@reserveni.com
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">2. What data we collect</h2>
              <p>When you make a reservation through a venue using Reserve NI, we collect:</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Your name, email address, and phone number</li>
                <li>The details of your reservation (date, time, party size, occasion, dietary notes)</li>
                <li>Payment status information (we store only a Stripe payment reference — we never store card numbers)</li>
                <li>Communications sent to you regarding your booking</li>
              </ul>
              <p className="mt-3">
                When you use Reserve NI as a venue operator, we also collect business contact details and the
                information you provide when setting up your venue profile.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">3. How we use your data</h2>
              <p>We use the data we collect to:</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Confirm, manage, and communicate about your reservation</li>
                <li>Process deposit payments via Stripe on behalf of the venue</li>
                <li>Send pre-visit reminders and post-visit messages as requested by the venue</li>
                <li>Allow the venue to manage their bookings and guest records</li>
                <li>Operate and improve the Reserve NI platform</li>
              </ul>
              <p className="mt-3">
                We do not sell your personal data to any third party.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">4. Legal basis (UK GDPR)</h2>
              <p>We process your personal data under the following legal bases:</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  <strong>Contract performance</strong> — to fulfil and manage your reservation
                </li>
                <li>
                  <strong>Legitimate interests</strong> — to operate our service, prevent fraud, and improve our platform
                </li>
                <li>
                  <strong>Consent</strong> — where you have provided explicit consent (e.g. marketing communications)
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">5. Who we share data with</h2>
              <p>We share data only where necessary:</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>
                  <strong>The venue</strong> — the restaurant receives your booking details in order to prepare for
                  your visit
                </li>
                <li>
                  <strong>Stripe</strong> — for secure payment processing (subject to{' '}
                  <a href="https://stripe.com/gb/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                    Stripe&apos;s Privacy Policy
                  </a>)
                </li>
                <li>
                  <strong>SendGrid / Twilio</strong> — for email and SMS delivery
                </li>
                <li>
                  <strong>Supabase</strong> — for secure database hosting (data stored in EU data centres)
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">6. How long we keep your data</h2>
              <p>
                We retain booking and guest data for up to 2 years to support the operational needs of venues and
                to comply with applicable regulations. Venues may request deletion of their data at any time.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">7. Your rights</h2>
              <p>Under UK GDPR, you have the right to:</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Access the personal data we hold about you</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your data (&ldquo;right to be forgotten&rdquo;)</li>
                <li>Object to or restrict processing of your data</li>
                <li>Receive a copy of your data in a portable format</li>
                <li>Lodge a complaint with the Information Commissioner&apos;s Office (ICO) at{' '}
                  <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                    ico.org.uk
                  </a>
                </li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, contact us at{' '}
                <a href="mailto:hello@reserveni.com" className="text-brand-600 hover:underline">
                  hello@reserveni.com
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">8. Cookies</h2>
              <p>
                Reserve NI uses cookies and similar technologies only for essential functionality (authentication
                and session management). We do not use advertising or tracking cookies.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">9. Changes to this policy</h2>
              <p>
                We may update this privacy policy from time to time. We will notify venues of significant changes
                by email. The &ldquo;Last updated&rdquo; date at the top of this page reflects the most recent revision.
              </p>
            </section>

          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          <Link href="/terms" className="hover:text-brand-600">Terms of Service</Link>
          {' · '}
          <Link href="/" className="hover:text-brand-600">Back to Reserve NI</Link>
        </div>
      </main>
    </div>
  );
}
