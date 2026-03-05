import Link from "next/link";

const features = [
  {
    title: "Deposit Collection",
    description: "Reduce no-shows by 60%+ with per-head deposits via Stripe. Funds go directly to your account — Reserve NI never holds your money.",
    icon: CreditCardIcon,
  },
  {
    title: "Smart Communications",
    description: "Automated confirmation emails, SMS reminders 24 hours before, and follow-ups — all handled for you.",
    icon: ChatIcon,
  },
  {
    title: "Real-time Dashboard",
    description: "Live booking management with a day sheet view, walk-in logging, phone bookings, and allergy flag tracking.",
    icon: DashboardIcon,
  },
  {
    title: "Easy Setup",
    description: "Embed the booking widget on your website or generate a QR code for table-side booking. Up and running in minutes.",
    icon: BoltIcon,
  },
];

const steps = [
  { number: "1", title: "Sign up and configure", description: "Create your account, set your sittings, covers, and cancellation policy." },
  { number: "2", title: "Embed or share", description: "Add the booking widget to your website or print a QR code for in-venue use." },
  { number: "3", title: "Manage live", description: "See today's bookings at a glance, mark arrivals, handle no-shows, and track deposits." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <img src="/Logo.png" alt="Reserve NI" className="h-9 w-auto" />
          <Link href="/login" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700">
            Log in
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-emerald-50" />
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(13,148,136,0.08) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(5,150,105,0.06) 0%, transparent 50%)' }} />
        <div className="relative mx-auto max-w-4xl px-6 py-24 text-center sm:py-32 lg:py-40">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Reserve&nbsp;NI
          </h1>
          <p className="mt-4 text-lg font-medium text-brand-700 sm:text-xl">
            Booking and guest management for Northern Ireland&rsquo;s independent restaurants
          </p>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-500 sm:text-lg">
            Reduce no-shows, collect deposits, and automate guest communications&nbsp;&mdash; all in one platform built for NI hospitality.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/login" className="inline-flex h-12 items-center rounded-xl bg-brand-600 px-8 text-base font-semibold text-white shadow-lg shadow-brand-600/20 transition-all hover:bg-brand-700 hover:shadow-xl hover:shadow-brand-600/30">
              Get started
            </Link>
            <Link href="#features" className="inline-flex h-12 items-center rounded-xl border border-slate-200 bg-white px-8 text-base font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
              Learn more
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-16 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything you need to fill seats&nbsp;&mdash; and keep them filled
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-500">
            Purpose-built for independent restaurants. No enterprise bloat, no commission on covers.
          </p>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="group rounded-2xl border border-slate-100 bg-white p-6 transition-all hover:border-brand-200 hover:shadow-lg hover:shadow-brand-600/5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                  <f.icon />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How it works</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-500">Three steps to fewer no-shows and happier guests.</p>
          <ol className="mt-14 grid gap-10 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.number} className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white shadow-lg shadow-brand-600/20">{s.number}</span>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Pricing</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-500">Simple and transparent&nbsp;&mdash; no commission, no hidden fees.</p>
          <div className="mx-auto mt-12 max-w-md overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white shadow-sm">
            <div className="p-8">
              <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Founding programme</span>
              <p className="mt-4 text-5xl font-extrabold text-slate-900">Free</p>
              <p className="mt-1 text-sm text-slate-500">for the first 10&ndash;20 venues</p>
              <ul className="mt-6 space-y-3 text-left text-sm text-slate-600">
                <li className="flex items-start gap-2.5">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  Full access to all features during founding programme
                </li>
                <li className="flex items-start gap-2.5">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  Deposits go directly to your Stripe account
                </li>
                <li className="flex items-start gap-2.5">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  Reserve NI never holds your funds
                </li>
                <li className="flex items-start gap-2.5">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  Priority support and onboarding
                </li>
              </ul>
              <Link href="/login" className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-600 text-base font-semibold text-white shadow-lg shadow-brand-600/20 transition-all hover:bg-brand-700 hover:shadow-xl">
                Join the founding programme
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-slate-50 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-sm text-slate-500 sm:flex-row sm:justify-between">
          <p>&copy; 2026 Reserve&nbsp;NI</p>
          <div className="flex gap-6">
            <Link href="/login" className="transition-colors hover:text-slate-900">Login</Link>
            <a href="mailto:hello@reserveni.com" className="transition-colors hover:text-slate-900">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CreditCardIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
  );
}
