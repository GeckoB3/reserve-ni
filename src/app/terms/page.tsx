import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service - Reserve NI',
  description:
    'Terms and conditions for using Reserve NI, the booking and guest management platform for businesses in Northern Ireland.',
};

const LAST_UPDATED = '16 April 2026';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5">
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
              <h2 className="mb-3 text-lg font-semibold text-slate-900">1. About these terms</h2>
              <p>
                These Terms of Service (&ldquo;Terms&rdquo;) govern access to and use of the Reserve NI website,
                guest-facing booking journeys, venue management dashboard, embeddable booking tools, and related
                services (together, the &ldquo;Service&rdquo;) operated by Reserve NI (&ldquo;Reserve NI&rdquo;,
                &ldquo;we&rdquo;, &ldquo;us&rdquo;).
              </p>
              <p className="mt-3">
                By using the Service you agree to these Terms. If you are accepting on behalf of a business or
                organisation, you confirm that you have authority to bind that entity. If you do not agree, do not
                use the Service.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">2. Who may use Reserve NI</h2>
              <p>
                <strong>Venue customers.</strong> Independent restaurants, cafés, salons, studios, and other
                bookable businesses in Northern Ireland may subscribe to Reserve NI to take and manage bookings,
                collect deposits where offered, and communicate with guests. You enter a contract with us when you
                create an account and subscribe on the terms shown at signup (including plan, price, and billing
                cycle).
              </p>
              <p className="mt-3">
                <strong>Guests.</strong> Anyone may use the guest-facing parts of the Service to make or manage a
                booking with a venue that uses Reserve NI. Your booking is a separate agreement between you and
                that venue. Reserve NI facilitates the booking and payment flow on the venue&apos;s instructions.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">3. The Service</h2>
              <p>
                Reserve NI provides software for online booking, guest and visit records, communications (such as
                email and SMS, according to your plan and settings), reporting, and related tools. Features depend on
                your subscription. We may change or withdraw non-material features, or update the Service to
                reflect law, security, or industry practice, provided we give reasonable notice where the change
                materially reduces what you reasonably rely on.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">4. Guest bookings and venue policies</h2>
              <p>
                When you complete a booking, you enter a contract with the venue. The venue sets availability,
                pricing, deposits, party size, dietary or access requirements, and cancellation and refund rules.
                Those rules are presented or linked before you confirm. By proceeding, you agree to the venue&apos;s
                terms as applied to that booking.
              </p>
              <p className="mt-3">
                You may cancel or amend only as the venue allows. &ldquo;No-show&rdquo; rules and forfeit deposits
                apply as the venue has made clear in advance.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">5. Payments and deposits</h2>
              <p>
                Deposits and card payments for guests are processed by Stripe. Where Stripe Connect is used, charges
                are paid to the venue&apos;s connected Stripe account. Reserve NI does not hold guest funds as
                principal; payment timing and settlement follow Stripe and the venue&apos;s setup.
              </p>
              <p className="mt-3">
                Subscription fees for venue accounts are charged as shown when you subscribe, via our payment
                provider. You authorise us and our providers to take payment according to your plan.
              </p>
              <p className="mt-3">
                We do not store full card numbers on our systems. Payment data is handled by Stripe and is subject
                to{' '}
                <a
                  href="https://stripe.com/gb/legal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline"
                >
                  Stripe&apos;s terms and privacy notice
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">6. Venue accounts, security, and acceptable use</h2>
              <p>You must provide accurate information and keep login credentials confidential. You must not:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>use the Service unlawfully, fraudulently, or to harm or harass others;</li>
                <li>probe, scan, or test the vulnerability of the Service without our written consent;</li>
                <li>reverse engineer the Service except where the law allows;</li>
                <li>send spam or mislead guests about who operates the venue or the terms of booking;</li>
                <li>
                  use the Service in breach of Stripe, communications providers, or other third parties&apos; terms.
                </li>
              </ul>
              <p className="mt-3">
                You are responsible for how your staff use the account and for ensuring your use of guest data
                complies with UK data protection law (see our{' '}
                <Link href="/privacy" className="text-brand-600 hover:underline">
                  Privacy Policy
                </Link>
                ).
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">7. Intellectual property</h2>
              <p>
                We and our licensors own the Service, including software, branding, and content we provide. We grant
                you a non-exclusive, non-transferable right to use the Service for your business during your
                subscription. You may not copy our platform except as needed for normal use or as permitted by law.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">8. Availability and support</h2>
              <p>
                We aim to run the Service with reasonable care and skill. The Service depends on third parties
                (including hosting and payment providers). We do not guarantee uninterrupted or error-free
                operation. We may suspend access for maintenance, security, or legal reasons, and will try to
                minimise disruption for venue customers where practicable.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">9. Suspension and termination</h2>
              <p>
                We may suspend or close accounts that breach these Terms or pose a security or legal risk. Venue
                customers may cancel their subscription in line with the cancellation terms shown at signup and in
                the dashboard (including notice periods where stated). Provisions that by nature survive termination
                (including limitations applying lawfully, confidentiality, and accrued rights) continue.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">10. Your statutory rights</h2>
              <p>
                If you are a consumer (an individual acting wholly or mainly outside your trade, business, craft,
                or profession), nothing in these Terms reduces your statutory rights under the Consumer Rights Act
                2015 and other mandatory UK law. If you are a business user, the parties acknowledge the contract
                is a business-to-business agreement; statutory provisions that cannot be limited by agreement still
                apply.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">11. Limitation of liability</h2>
              <p>
                Nothing in these Terms excludes or limits our liability for death or personal injury caused by our
                negligence, fraud or fraudulent misrepresentation, or any other liability that cannot be excluded or
                limited under English and UK law.
              </p>
              <p className="mt-3">
                Subject to the paragraph above, we are not liable for loss of profit, revenue, goodwill, or
                indirect or consequential loss arising from your use of the Service. Our total liability to you in
                contract, tort (including negligence), or otherwise arising out of a connected series of claims in
                any twelve-month period is limited to the greater of (a) the fees you paid us for the Service in
                that period or (b) where you are a guest, the amount of the disputed booking payment processed
                through us for that booking.
              </p>
              <p className="mt-3">
                We are not responsible for the acts or omissions of venues or other users, or for disputes between
                you and a venue. You should resolve booking disputes with the venue; we may assist only where
                reasonable and proportionate.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">12. Data protection</h2>
              <p>
                Our use of personal data is described in our{' '}
                <Link href="/privacy" className="text-brand-600 hover:underline">
                  Privacy Policy
                </Link>
                , which forms part of these Terms where applicable.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">13. Changes to these Terms</h2>
              <p>
                We may update these Terms to reflect changes to the Service or the law. We will publish the updated
                Terms on this page and change the &ldquo;Last updated&rdquo; date. For venue customers, where changes
                are material we will give reasonable notice (for example by email or in-product notice). Continued
                use after the effective date may constitute acceptance where the law allows.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">14. Governing law and jurisdiction</h2>
              <p>
                These Terms are governed by the law of Northern Ireland and the United Kingdom. Subject to mandatory
                protections for consumers in their home jurisdiction, the courts of Northern Ireland have
                non-exclusive jurisdiction in relation to any dispute arising from these Terms or the Service. If
                you are a consumer resident elsewhere in the UK, you may also bring proceedings in your home courts
                where the law allows.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">15. Contact</h2>
              <p>
                Questions about these Terms:{' '}
                <a href="mailto:hello@reserveni.com" className="text-brand-600 hover:underline">
                  hello@reserveni.com
                </a>
                . Venue account holders may also contact{' '}
                <a href="mailto:support@reserveni.com" className="text-brand-600 hover:underline">
                  support@reserveni.com
                </a>
                .
              </p>
            </section>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          <Link href="/privacy" className="hover:text-brand-600">
            Privacy policy
          </Link>
          {' · '}
          <Link href="/" className="hover:text-brand-600">
            Back to Reserve NI
          </Link>
        </div>
      </main>
    </div>
  );
}
