import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - Reserve NI',
  description:
    'How Reserve NI collects, uses, and protects personal data in line with UK data protection law.',
};

const LAST_UPDATED = '16 April 2026';

export default function PrivacyPage() {
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
          <h1 className="mb-2 text-3xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="mb-8 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>

          <div className="prose prose-slate max-w-none space-y-8 text-sm leading-relaxed text-slate-700">
            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">1. Purpose and scope</h2>
              <p>
                This Privacy Policy explains how Reserve NI (&ldquo;we&rdquo;, &ldquo;us&rdquo;) processes
                personal data when you use reserveni.com and our booking and guest management platform for
                independent venues in Northern Ireland, including guest-facing booking, communications, payments
                facilitated through Stripe, and the staff dashboard.
              </p>
              <p className="mt-3">
                We process personal data in accordance with the UK General Data Protection Regulation (UK GDPR) as
                it forms part of the law of the United Kingdom by virtue of the European Union (Withdrawal) Act
                2018, the Data Protection Act 2018, the Privacy and Electronic Communications Regulations 2003
                (PECR) where they apply, and related UK law.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">2. Who is responsible for your data</h2>
              <p>
                <strong>Reserve NI as controller.</strong> We are the data controller for personal data we process
                to operate our service, authenticate venue users, take subscription payments, provide support,
                comply with law, and secure our systems.
              </p>
              <p className="mt-3">
                <strong>Venues as controllers.</strong> Each venue that uses Reserve NI decides why and how guest
                data is used for its own bookings and marketing (where permitted). In those situations the venue is
                typically an independent data controller and we process that data as a{' '}
                <strong>processor</strong> on the venue&apos;s documented instructions, under our agreement with
                them, unless we are also required to process the same data as controller for our own legal or
                security purposes (for example fraud prevention).
              </p>
              <p className="mt-3">
                If you make a booking, you may exercise privacy rights with the venue directly. You can also
                contact us and we will forward or assist where appropriate.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">3. Contact details</h2>
              <p>
                Email:{' '}
                <a href="mailto:hello@reserveni.com" className="text-brand-600 hover:underline">
                  hello@reserveni.com
                </a>{' '}
                (please include &ldquo;Privacy&rdquo; in the subject line).
              </p>
              <p className="mt-3">
                If we need to verify your identity before fulfilling a rights request, we will tell you. Venue staff
                may use{' '}
                <a href="mailto:support@reserveni.com" className="text-brand-600 hover:underline">
                  support@reserveni.com
                </a>{' '}
                for account-related support; privacy rights about your own staff account can still be sent to
                hello@reserveni.com.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">4. Personal data we collect</h2>
              <p>
                <strong>Guests.</strong>                 When you book or interact with a venue that uses Reserve NI, we may process name, email address,
                phone number, booking details (time, party size, occasion, dietary or
                accessibility notes you choose to provide), communications we send on the venue&apos;s behalf, and
                records of confirmations, cancellations, deposits, and no-shows as configured by the venue.
                Payment card data is collected by Stripe; we do not store full card numbers on our systems.
              </p>
              <p className="mt-3">
                <strong>Venue users and account holders.</strong> We process account identifiers (such as email),
                profile and business details you supply, Stripe or billing references, usage and audit logs needed
                for security, and correspondence with support.
              </p>
              <p className="mt-3">
                <strong>Website and enquiries.</strong> If you contact us via forms or email, we process what you
                send us and technical metadata needed to deliver the message.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">5. Purposes and lawful bases (UK GDPR Article 6)</h2>
              <p>We process personal data on the following bases, as applicable:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Contract</strong> (Article 6(1)(b)): to provide the Service, manage subscriptions, and
                  facilitate bookings and payments you have asked for.
                </li>
                <li>
                  <strong>Legitimate interests</strong> (Article 6(1)(f)): to secure the platform, troubleshoot,
                  improve the Service in ways you would expect, and protect our business and users, balanced against
                  your rights.
                </li>
                <li>
                  <strong>Legal obligation</strong> (Article 6(1)(c)): to comply with tax, accounting, or lawful
                  requests from authorities.
                </li>
                <li>
                  <strong>Consent</strong> (Article 6(1)(a)): where the law requires consent (for example certain
                  marketing cookies or optional marketing messages), which you may withdraw at any time.
                </li>
              </ul>
              <p className="mt-3">
                Venues must identify their own lawful bases when they act as controllers for guest data (often
                contract and legitimate interests for service messages; consent or soft opt-in under PECR for some
                marketing, depending on context).
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">6. Special category and criminal offence data</h2>
              <p>
                If you give us or a venue health-related or other special category data (for example dietary
                information that reveals health), we expect venues to collect it only where necessary and lawful. We
                process it strictly to provide the Service and on appropriate legal grounds (which may include
                explicit consent or substantial public interest conditions as set out in UK law).
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">7. Recipients and processors</h2>
              <p>We share personal data only as needed to run the Service:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>The venue you book with</strong>, for operational and customer service purposes.
                </li>
                <li>
                  <strong>Stripe</strong> (United States and other locations where Stripe operates): payment
                  services and fraud prevention. Stripe acts as a controller for some processing; see{' '}
                  <a
                    href="https://stripe.com/gb/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline"
                  >
                    stripe.com/gb/privacy
                  </a>
                  . International transfers rely on appropriate safeguards such as the UK International Data
                  Transfer Agreement or addendum, or adequacy regulations, as applicable.
                </li>
                <li>
                  <strong>Supabase</strong> and infrastructure partners: hosting and database services. We
                  configure services to use regions appropriate for our deployment (commonly EU or UK where
                  available).
                </li>
                <li>
                  <strong>SendGrid</strong> and <strong>Twilio</strong> (or equivalent providers): to send email and
                  SMS as configured by you or the venue. Their use is governed by our agreements and their privacy
                  notices.
                </li>
              </ul>
              <p className="mt-3">We do not sell your personal data.</p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">8. International transfers</h2>
              <p>
                Some providers may process data outside the UK and European Economic Area. Where we transfer personal
                data to countries not subject to a UK adequacy decision, we use appropriate safeguards recognised
                under UK law (such as the UK International Data Transfer Agreement / Addendum to the EU Standard
                Contractual Clauses, or provider-specific transfer mechanisms).
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">9. Retention</h2>
              <p>
                We keep personal data only as long as necessary for the purposes above, including legal, accounting,
                and dispute resolution needs. Booking and guest records may be retained for the period venues need
                to operate and as configured in the product, within limits we apply for the platform. When data is no
                longer needed, we delete or anonymise it in line with our internal schedules, subject to statutory
                retention duties.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">10. Security</h2>
              <p>
                We implement appropriate technical and organisational measures to protect personal data against
                unauthorised access, alteration, loss, or destruction, including access controls and encryption in
                transit where standard for the Service. No online service is perfectly secure; we encourage strong
                passwords and prompt reporting of suspected misuse.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">11. Your rights</h2>
              <p>Under UK data protection law you have the right to:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>access a copy of your personal data;</li>
                <li>rectify inaccurate data;</li>
                <li>erase data in certain circumstances;</li>
                <li>restrict processing in certain circumstances;</li>
                <li>object to processing based on legitimate interests or for direct marketing;</li>
                <li>data portability for data you provided where processing is automated and based on consent or contract;</li>
                <li>withdraw consent where processing is consent-based, without affecting earlier lawful processing;</li>
                <li>
                  lodge a complaint with the UK Information Commissioner&apos;s Office (
                  <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                    ico.org.uk
                  </a>
                  ).
                </li>
              </ul>
              <p className="mt-3">
                To exercise rights against Reserve NI, email hello@reserveni.com. Where your booking data is
                controlled by a venue, we may need to direct you to them or work with them to respond.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">12. Cookies and similar technologies</h2>
              <p>
                We use cookies and similar technologies that are strictly necessary to operate the site (for example
                session and security cookies). Where non-essential cookies are introduced in the future, we will
                obtain consent as required by PECR and UK GDPR. We do not use third-party advertising cookies on the
                core Service as described here.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">13. Children</h2>
              <p>
                The Service is aimed at businesses and adults making bookings. It is not directed at children under
                13 for commercial use. If you believe we hold data about a child in error, contact us and we will
                take appropriate steps.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">14. Automated decision-making</h2>
              <p>
                We do not use solely automated decision-making that produces legal or similarly significant effects
                about you in the sense of Article 22 UK GDPR for core booking flows. Venues may apply their own
                rules (for example waitlists); those are the venue&apos;s responsibility.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">15. Changes to this policy</h2>
              <p>
                We may update this Privacy Policy to reflect changes to our practices or the law. We will revise the
                &ldquo;Last updated&rdquo; date and, where changes are material for venue customers, notify them by
                reasonable means (such as email or an in-product notice).
              </p>
            </section>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          <Link href="/terms" className="hover:text-brand-600">
            Terms of Service
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
