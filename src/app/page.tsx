import Link from "next/link";

const features = [
  {
    icon: "💳",
    title: "Deposit collection",
    description:
      "Reduce no-shows by 60%+ with per-head deposits via Stripe. Funds go directly to your account — Reserve NI never holds your money.",
  },
  {
    icon: "💬",
    title: "Smart communications",
    description:
      "Automated confirmation emails, SMS reminders 24 hours before, and follow-ups — all handled for you.",
  },
  {
    icon: "📊",
    title: "Real-time dashboard",
    description:
      "Live booking management with a day sheet view, walk-in logging, phone bookings, and allergy flag tracking.",
  },
  {
    icon: "⚡",
    title: "Easy setup",
    description:
      "Embed the booking widget on your website or generate a QR code for table-side booking. Up and running in minutes.",
  },
];

const steps = [
  {
    number: "1",
    title: "Sign up and configure your venue",
    description:
      "Create your account, set your sittings, covers, and cancellation policy.",
  },
  {
    number: "2",
    title: "Embed the widget or share your QR code",
    description:
      "Add the booking widget to your website or print a QR code for in-venue use.",
  },
  {
    number: "3",
    title: "Manage bookings from a live dashboard",
    description:
      "See today's bookings at a glance, mark arrivals, handle no-shows, and track deposits.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold tracking-tight text-indigo-600">
            Reserve&nbsp;NI
          </span>
          <Link
            href="/login"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Log in
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-emerald-50">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center sm:py-32 lg:py-40">
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl">
            Reserve&nbsp;NI
          </h1>
          <p className="mt-4 text-lg font-medium text-indigo-600 sm:text-xl">
            Booking and guest management for Northern Ireland&rsquo;s
            independent restaurants
          </p>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Reduce no-shows, collect deposits, and automate guest
            communications&nbsp;&mdash; all in one platform built for NI
            hospitality.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex h-12 items-center rounded-lg bg-indigo-600 px-8 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
            >
              Get started
            </Link>
            <Link
              href="#features"
              className="inline-flex h-12 items-center rounded-lg border border-zinc-200 bg-white px-8 text-base font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              See a demo
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-16 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Everything you need to fill seats&nbsp;&mdash; and keep them filled
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-500">
            Purpose-built for independent restaurants. No enterprise bloat, no
            commission on covers.
          </p>

          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-zinc-100 bg-zinc-50/60 p-6 transition-shadow hover:shadow-md"
              >
                <span className="text-3xl" role="img" aria-label={f.title}>
                  {f.icon}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-zinc-900">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-zinc-50 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            How it works
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-zinc-500">
            Three steps to fewer no-shows and happier guests.
          </p>

          <ol className="mt-14 grid gap-10 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.number} className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white">
                  {s.number}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-zinc-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  {s.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Pricing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-500">
            Simple and transparent&nbsp;&mdash; no commission, no hidden fees.
          </p>

          <div className="mx-auto mt-12 max-w-md rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-8 shadow-sm">
            <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Founding programme
            </span>
            <p className="mt-4 text-4xl font-extrabold text-zinc-900">Free</p>
            <p className="mt-1 text-sm text-zinc-500">
              for the first 10&ndash;20 venues
            </p>

            <ul className="mt-6 space-y-3 text-left text-sm text-zinc-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-500">✓</span>
                Full access to all features during founding programme
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-500">✓</span>
                Deposits go directly to your Stripe account
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-500">✓</span>
                Reserve NI never holds your funds
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-500">✓</span>
                Priority support and onboarding
              </li>
            </ul>

            <Link
              href="/login"
              className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-lg bg-indigo-600 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-700"
            >
              Join the founding programme
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100 bg-zinc-50 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-sm text-zinc-500 sm:flex-row sm:justify-between">
          <p>&copy; 2026 Reserve&nbsp;NI</p>
          <div className="flex gap-6">
            <Link
              href="/login"
              className="transition-colors hover:text-zinc-900"
            >
              Login
            </Link>
            <a
              href="mailto:hello@reserveni.com"
              className="transition-colors hover:text-zinc-900"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
