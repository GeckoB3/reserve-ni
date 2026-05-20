import type { CSSProperties } from 'react';
import Script from 'next/script';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import { EMBED_IFRAME_DEFAULT_HEIGHT_PX } from '@/lib/embed/widget-frame';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-salon-display',
});

const body = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-salon-body',
});

const SERVICES = [
  { name: 'Cut & finish', duration: '45 min', price: 'from £42' },
  { name: 'Full colour', duration: '2 hrs', price: 'from £85' },
  { name: 'Highlights', duration: '2.5 hrs', price: 'from £95' },
  { name: 'Blow dry', duration: '30 min', price: 'from £28' },
  { name: 'Balayage', duration: '3 hrs', price: 'from £120' },
  { name: 'Bridal trial', duration: '90 min', price: 'from £75' },
] as const;

const TEAM = [
  { name: 'Sarah Mitchell', role: 'Director · Colour specialist' },
  { name: 'James O\'Neill', role: 'Senior stylist' },
  { name: 'Emma Hughes', role: 'Stylist · Extensions' },
] as const;

export function EmbedTestSalonSite({
  venueName,
  venueSlug,
  embedUrl,
  resizeScriptSrc,
  bookUrl,
  snippet,
  accentHex,
}: {
  venueName: string;
  venueSlug: string;
  embedUrl: string;
  resizeScriptSrc: string;
  bookUrl: string;
  snippet: string;
  accentHex?: string | null;
}) {
  const iframeSrc = embedUrl;
  const salonAccent = accentHex ? `#${accentHex}` : '#5c4033';

  return (
    <div
      className={`${display.variable} ${body.variable} min-h-screen bg-[#f7f4f0] text-[#2c2825] antialiased`}
      style={
        {
          fontFamily: 'var(--font-salon-body), system-ui, sans-serif',
          '--salon-accent': salonAccent,
        } as CSSProperties
      }
    >
      <a
        href="#book"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to online booking
      </a>

      <header className="sticky top-0 z-40 border-b border-[#e8e0d6]/80 bg-[#f7f4f0]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <a href="#" className="group flex min-w-0 flex-col">
            <span
              className="truncate text-xl font-semibold tracking-tight text-[#2c2825] sm:text-2xl"
              style={{ fontFamily: 'var(--font-salon-display), Georgia, serif' }}
            >
              {venueName}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#8a7f72]">
              Hair · Colour · Styling
            </span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#5c554c] md:flex" aria-label="Main">
            <a href="#services" className="transition-colors hover:text-[#2c2825]">
              Services
            </a>
            <a href="#team" className="transition-colors hover:text-[#2c2825]">
              Our team
            </a>
            <a href="#visit" className="transition-colors hover:text-[#2c2825]">
              Visit us
            </a>
            <a
              href="#book"
              className="rounded-full px-5 py-2.5 text-white shadow-sm transition hover:opacity-90"
              style={{ backgroundColor: 'var(--salon-accent)' }}
            >
              Book online
            </a>
          </nav>
          <a
            href="#book"
            className="rounded-full px-4 py-2 text-sm font-semibold text-white md:hidden"
            style={{ backgroundColor: 'var(--salon-accent)' }}
          >
            Book
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#e8e0d6]">
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#ebe4da] via-[#f7f4f0] to-[#e8ddd0]"
          aria-hidden
        />
        <div
          className="absolute -right-24 top-1/4 h-96 w-96 rounded-full bg-[#c9a88a]/20 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-[#8b6f5c]/10 blur-3xl"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-2 md:items-center md:py-24">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#8a7f72]">
              Belfast city centre
            </p>
            <h1
              className="text-4xl font-semibold leading-[1.1] text-[#2c2825] sm:text-5xl lg:text-[3.25rem]"
              style={{ fontFamily: 'var(--font-salon-display), Georgia, serif' }}
            >
              Your best hair day,
              <span className="block text-[#6b4f3a]">booked in minutes</span>
            </h1>
            <p className="max-w-md text-base leading-relaxed text-[#5c554c] sm:text-lg">
              Expert cuts, colour, and styling in a relaxed studio. Reserve your chair online — choose your
              service, pick a time, and pay your deposit securely.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#book"
                className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
                style={{ backgroundColor: 'var(--salon-accent)' }}
              >
                Book an appointment
              </a>
              <a
                href="#services"
                className="inline-flex items-center justify-center rounded-full border border-[#c9baa8] bg-white/60 px-7 py-3.5 text-sm font-semibold text-[#5c4033] transition hover:bg-white"
              >
                View services
              </a>
            </div>
          </div>
          <div className="relative hidden md:block">
            <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-[#e8e0d6] bg-gradient-to-t from-[#d4c4b0] to-[#f0ebe3] shadow-xl">
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#c9a88a]/40 bg-white/50">
                  <svg
                    className="h-10 w-10 text-[#8b6f5c]"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1}
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
                    />
                  </svg>
                </div>
                <p
                  className="text-lg font-medium text-[#5c4033]"
                  style={{ fontFamily: 'var(--font-salon-display), Georgia, serif' }}
                >
                  Colour · Cut · Care
                </p>
                <p className="text-sm text-[#6b5f52]">Walk-ins welcome when we have availability</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="border-b border-[#e8e0d6] bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="mb-10 max-w-xl">
            <h2
              className="text-3xl font-semibold text-[#2c2825] sm:text-4xl"
              style={{ fontFamily: 'var(--font-salon-display), Georgia, serif' }}
            >
              Services &amp; pricing
            </h2>
            <p className="mt-3 text-[#5c554c]">
              A full menu of cuts, colour, and finishing. Exact price confirmed at consultation for longer
              services.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((svc) => (
              <li
                key={svc.name}
                className="flex flex-col justify-between rounded-xl border border-[#ebe4da] bg-[#faf8f5] px-5 py-4 transition hover:border-[#d4c4b0]"
              >
                <div>
                  <p className="font-semibold text-[#2c2825]">{svc.name}</p>
                  <p className="mt-1 text-sm text-[#8a7f72]">{svc.duration}</p>
                </div>
                <p className="mt-3 text-sm font-medium text-[#6b4f3a]">{svc.price}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="team" className="border-b border-[#e8e0d6] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <h2
            className="text-3xl font-semibold text-[#2c2825] sm:text-4xl"
            style={{ fontFamily: 'var(--font-salon-display), Georgia, serif' }}
          >
            Meet the team
          </h2>
          <ul className="mt-10 grid gap-6 sm:grid-cols-3">
            {TEAM.map((member) => (
              <li key={member.name} className="text-center sm:text-left">
                <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#e8ddd0] to-[#c9baa8] sm:mx-0">
                  <span className="text-2xl font-semibold text-[#5c4033]/80">
                    {member.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                </div>
                <p className="font-semibold text-[#2c2825]">{member.name}</p>
                <p className="mt-1 text-sm text-[#8a7f72]">{member.role}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Booking section: same structure as a typical salon “Book online” page block */}
      <section id="book" className="scroll-mt-20 bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="mb-8 text-center sm:text-left">
            <h2
              className="text-3xl font-semibold text-[#2c2825] sm:text-4xl"
              style={{ fontFamily: 'var(--font-salon-display), Georgia, serif' }}
            >
              Book online
            </h2>
            <p className="mt-3 text-[#5c554c]">
              Choose your service and preferred time below. You&apos;ll receive confirmation by email.
            </p>
          </div>

          {/*
            Production embed — matches Settings → Booking Page → Website widget snippet:
            iframe (id reserveni-widget) + /embed/resize.js on the host page.
          */}
          <iframe
            src={iframeSrc}
            width="100%"
            height={EMBED_IFRAME_DEFAULT_HEIGHT_PX}
            style={{ border: 'none', overflow: 'hidden' }}
            scrolling="no"
            id="reserveni-widget"
            title={`Book online — ${venueName}`}
          />
        </div>
      </section>

      <section id="visit" className="border-t border-[#e8e0d6] bg-[#f0ebe3] py-14 sm:py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 md:grid-cols-2">
          <div>
            <h2
              className="text-2xl font-semibold text-[#2c2825]"
              style={{ fontFamily: 'var(--font-salon-display), Georgia, serif' }}
            >
              Visit us
            </h2>
            <address className="mt-4 not-italic text-[#5c554c] leading-relaxed">
              14 Royal Avenue
              <br />
              Belfast BT1 1FF
              <br />
              <a href="tel:+442890123456" className="mt-2 inline-block font-medium text-[#5c4033] hover:underline">
                028 9012 3456
              </a>
            </address>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8a7f72]">Opening hours</h3>
            <dl className="mt-3 space-y-1.5 text-sm text-[#5c554c]">
              <div className="flex justify-between gap-4 border-b border-[#e8e0d6] py-2">
                <dt>Mon – Fri</dt>
                <dd className="font-medium text-[#2c2825]">9:00 – 18:00</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[#e8e0d6] py-2">
                <dt>Saturday</dt>
                <dd className="font-medium text-[#2c2825]">9:00 – 17:00</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt>Sunday</dt>
                <dd className="font-medium text-[#2c2825]">Closed</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#e8e0d6] bg-[#2c2825] py-10 text-[#c9baa8]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-center text-sm sm:flex-row sm:px-8 sm:text-left">
          <p>
            © {new Date().getFullYear()} {venueName}. All rights reserved.
          </p>
          <p className="text-xs text-[#8a7f72]">
            Online booking powered by{' '}
            <a href="https://reserveni.com" className="underline hover:text-[#e8ddd0]">
              Reserve NI
            </a>
          </p>
        </div>
      </footer>

      <Script src={resizeScriptSrc} strategy="afterInteractive" />

      <details className="border-t border-[#e8e0d6] bg-[#ebe4da]/50">
        <summary className="cursor-pointer px-5 py-3 text-center text-xs font-medium text-[#8a7f72] hover:text-[#5c554c] sm:px-8">
          Developer reference (embed test page)
        </summary>
        <div className="mx-auto max-w-3xl space-y-4 px-5 pb-8 text-sm text-[#5c554c] sm:px-8">
          <p>
            Venue slug: <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-xs">{venueSlug}</code>
            {' · '}
            Hosted page:{' '}
            <a href={bookUrl} className="font-medium text-[#5c4033] underline">
              {bookUrl}
            </a>
            {accentHex ? (
              <>
                {' · '}
                Embed accent: <code className="font-mono text-xs">#{accentHex}</code> (from venue settings)
              </>
            ) : (
              <>
                {' · '}
                No embed accent saved — set one in Settings → Booking page
              </>
            )}
          </p>
          <pre className="overflow-x-auto rounded-lg bg-[#2c2825] p-4 text-xs leading-relaxed text-[#e8ddd0]">
            {snippet}
          </pre>
        </div>
      </details>
    </div>
  );
}
