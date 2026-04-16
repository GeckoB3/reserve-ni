'use client';

import { useCallback, useId, useState } from 'react';
import {
  APPOINTMENTS_LIGHT_PRICE,
  APPOINTMENTS_PRICE,
  RESTAURANT_PRICE,
  SMS_LIGHT_GBP_PER_MESSAGE,
  SMS_OVERAGE_GBP_PER_MESSAGE,
} from '@/lib/pricing-constants';

type FaqItem = { question: string; answer: string };

function buildFaqSections(): { heading: string; items: FaqItem[] }[] {
  return [
    {
      heading: 'Switching & Getting Started',
      items: [
        {
          question: 'I already use another booking system. Can I switch to ReserveNI without losing my data?',
          answer:
            'Yes. Download your client list and bookings from your current provider as a CSV file and upload it to ReserveNI. Our smart import tool automatically maps your data across, matching fields like client names, phone numbers, email addresses, and booking history. If anything needs attention, we will flag it for you before importing. Dedicated phone and email support is available if you need a hand.',
        },
        {
          question: 'How long does it take to get set up?',
          answer:
            'Most businesses are up and running within 15 minutes. Our setup wizard walks you through adding your services, setting your availability, and publishing your booking page. If you are a restaurant, allow a little longer to configure your floor plan and table layout. Either way, you can start accepting bookings on your first day.',
        },
        {
          question: 'Do I need any technical knowledge to use ReserveNI?',
          answer:
            'None at all. If you can use a smartphone, you can use ReserveNI. The dashboard is designed for busy business owners, not IT specialists. Everything from setting up services to managing bookings works through a clean, simple interface with no coding, no complicated settings menus, and no jargon.',
        },
      ],
    },
    {
      heading: 'Pricing & Costs',
      items: [
        {
          question: 'What does ReserveNI cost?',
          answer: `Appointments Light is built for sole traders: your first three months are free, then £${APPOINTMENTS_LIGHT_PRICE} per month for one bookable calendar and one venue login, with appointments, classes, events, and resource booking plus email reminders. SMS is pay-as-you-go at ${Math.round(SMS_LIGHT_GBP_PER_MESSAGE * 100)}p per message. The full Appointments plan is £${APPOINTMENTS_PRICE} per month for unlimited team members, calendars, and booking types, with a monthly SMS allowance then ${Math.round(SMS_OVERAGE_GBP_PER_MESSAGE * 100)}p per message over that. The Restaurant plan is £${RESTAURANT_PRICE} per month with table management, floor plan tools, and priority support. There are no setup fees, no contracts, and no per-booking commissions. Cancel anytime with 30 days notice.`,
        },
        {
          question: 'Are there any hidden fees or commissions?',
          answer: `No. Your monthly subscription covers the platform. We never take a commission on your bookings, and we never charge your customers a booking fee. On Appointments Light there is no SMS bundle: each message is billed at ${Math.round(SMS_LIGHT_GBP_PER_MESSAGE * 100)}p. On full Appointments and Restaurant you get a generous monthly SMS allowance; additional messages are ${Math.round(SMS_OVERAGE_GBP_PER_MESSAGE * 100)}p each, clearly shown in your dashboard.`,
        },
        {
          question: 'How does ReserveNI compare to Fresha, Booksy, or ResDiary on price?',
          answer: `Fresha charges a 20% commission every time a new client books through their marketplace. Booksy charges per team member, so a salon with 4 staff pays over £90 per month. ResDiary starts at £89 per month for restaurants. ReserveNI offers Appointments Light: three months free, then £${APPOINTMENTS_LIGHT_PRICE} per month for a single calendar with no per-staff fees, plus full Appointments at £${APPOINTMENTS_PRICE} per month with unlimited team members and no commission, or Restaurant at £${RESTAURANT_PRICE} per month for dining-focused tools. You keep more of what you earn.`,
        },
      ],
    },
    {
      heading: 'Features & Functionality',
      items: [
        {
          question: 'What types of business can use ReserveNI?',
          answer:
            'Any business that takes bookings. Restaurants, barbers, hairdressers, beauty salons, physiotherapists, personal trainers, yoga studios, escape rooms, sports facilities, tutors, dog groomers, and many more. ReserveNI supports appointments, classes, events, and resource bookings, and you can offer any combination of these from a single account.',
        },
        {
          question: 'Can my customers book online without calling me?',
          answer:
            'Yes. Every ReserveNI account gets a branded booking page that your clients can use 24 hours a day, 7 days a week. Share the link on your website, Instagram, Facebook, or WhatsApp. Clients choose their service, pick a time, and book instantly without needing to phone or message you.',
        },
        {
          question: 'Does ReserveNI send booking reminders to my clients?',
          answer:
            'Yes. Automated email reminders are included on every plan. On full Appointments and Restaurant you also get SMS reminders within your monthly allowance (overage priced per message). Appointments Light includes email reminders; you can enable SMS reminders pay-as-you-go when you need them. Reminders include a one-tap confirm or cancel link, which typically reduces no-shows by 30-40%.',
        },
        {
          question: 'Can I collect deposits to protect against no-shows?',
          answer:
            'Yes. You can require a deposit at the time of booking, collected securely through Stripe. You set the amount per service. If the client does not show up, you keep the deposit. If they cancel within your policy window, the deposit is refunded automatically. Payments go directly to your bank account. ReserveNI never holds your money.',
        },
        {
          question: 'Can my staff each have their own calendar and booking link?',
          answer:
            'On the full Appointments plan, yes. Each team member gets their own calendar with individual working hours, breaks, and services, plus a personal booking link (like reserveni.com/book/your-salon/sarah) to share with clients. There is no extra charge for adding team members. Appointments Light is built for sole traders: one bookable calendar and one venue login—upgrade when you need multiple staff with separate calendars.',
        },
        {
          question: 'I run a restaurant. How does ReserveNI compare to ResDiary?',
          answer: `ReserveNI offers table management with a visual timeline grid, interactive floor plan editor, covers-based availability, deposit collection, SMS confirm-or-cancel, and automated reminders: the core features restaurants need. The key differences: ReserveNI costs £${RESTAURANT_PRICE} per month versus ResDiary's £89-£245, we charge zero commission on bookings from any source, and our floor plan editor lets you set up your restaurant visually in minutes rather than through complex configuration forms.`,
        },
      ],
    },
    {
      heading: 'Data, Security & Support',
      items: [
        {
          question: 'Is my data safe?',
          answer:
            "Yes. ReserveNI runs on enterprise-grade infrastructure with Supabase (built on PostgreSQL) for data storage and Vercel for hosting. All data is encrypted in transit and at rest. Payments are handled by Stripe, the world's most trusted payment processor. We never store card details on our servers.",
        },
        {
          question: 'What happens if I want to leave ReserveNI?',
          answer:
            'You can export all your client data and booking history as a CSV file at any time. Your data belongs to you, not us. Cancel your subscription with 30 days notice and your account remains active until the end of your billing period. We do not lock you into contracts or make it difficult to leave.',
        },
        {
          question: 'What support do you offer if I get stuck?',
          answer:
            'Appointments Light includes email support. The full Appointments and Restaurant plans include email and phone support, and Restaurant customers get priority response times. We are a Northern Ireland-based team who understand local businesses, so when you contact us you will reach someone who knows the product inside out, not a chatbot or an overseas call centre.',
        },
        {
          question: 'Can I try ReserveNI before committing?',
          answer:
            'Yes. Appointments Light starts with three months free with no card required to begin. You can also contact us for a free demo tailored to your business type—we will walk you through how ReserveNI fits your setup and answer questions before you sign up.',
        },
      ],
    },
  ];
}

const FAQ_SECTIONS = buildFaqSections();

function FaqToggleIcon({ open }: { open: boolean }) {
  return (
    <span
      className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border transition-all duration-300 ease-out ${
        open
          ? 'border-brand-300/80 bg-brand-600 text-white shadow-md shadow-brand-900/15'
          : 'border-slate-200/90 bg-white text-slate-500 shadow-sm group-hover:border-brand-200 group-hover:bg-brand-50/80 group-hover:text-brand-700'
      }`}
      aria-hidden
    >
      <svg
        className={`absolute h-4 w-4 transition-all duration-300 ease-out ${
          open ? 'scale-75 opacity-0 rotate-90' : 'scale-100 opacity-100 rotate-0'
        }`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2.25}
        stroke="currentColor"
      >
        <path strokeLinecap="round" d="M12 5v14M5 12h14" />
      </svg>
      <svg
        className={`absolute h-4 w-4 transition-all duration-300 ease-out ${
          open ? 'scale-100 opacity-100 rotate-0' : 'scale-75 opacity-0 -rotate-90'
        }`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2.25}
        stroke="currentColor"
      >
        <path strokeLinecap="round" d="M5 12h14" />
      </svg>
    </span>
  );
}

export default function HomeFaq() {
  const baseId = useId();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    setOpenKey((prev) => (prev === key ? null : key));
  }, []);

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="relative scroll-mt-16 overflow-hidden border-t border-slate-200/60 py-20 sm:py-28"
    >
      {/* Ambient background */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-10%,rgba(78,107,120,0.09),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-50/90 via-white to-slate-50/50"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-40 top-1/3 h-72 w-72 rounded-full bg-brand-200/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 bottom-20 h-64 w-64 rounded-full bg-emerald-100/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent"
        aria-hidden
      />

      <div className="relative mx-auto max-w-4xl px-6">
        <div className="text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-brand-200/60 bg-white/90 px-4 py-1.5 shadow-sm shadow-slate-200/40 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shadow-sm shadow-brand-600/40" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
              Questions
            </p>
          </div>
          <h2
            id="faq-heading"
            className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl sm:tracking-tight"
          >
            Frequently asked questions
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600">
            Straight answers about switching, pricing, features, and how we keep your data safe.
          </p>
        </div>

        <div className="mt-16 space-y-16 sm:mt-20 sm:space-y-20">
          {FAQ_SECTIONS.map((section, sIdx) => (
            <div key={section.heading}>
              <div className="mb-5 flex items-start gap-4 sm:mb-6 sm:items-center">
                <span
                  className="mt-1 hidden h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand-500 via-brand-400 to-brand-600/70 shadow-sm shadow-brand-700/20 sm:mt-0 sm:block sm:h-12"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 text-left sm:flex sm:items-baseline sm:gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold tabular-nums text-brand-800 ring-1 ring-brand-200/60 sm:hidden">
                    {sIdx + 1}
                  </span>
                  <h3 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                    {section.heading}
                  </h3>
                </div>
              </div>

              <ul className="flex flex-col gap-3 sm:gap-3.5">
                {section.items.map((item, iIdx) => {
                  const key = `${sIdx}-${iIdx}`;
                  const isOpen = openKey === key;
                  const panelId = `${baseId}-panel-${sIdx}-${iIdx}`;
                  const buttonId = `${baseId}-btn-${sIdx}-${iIdx}`;

                  return (
                    <li key={key}>
                      <div
                        className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ease-out ${
                          isOpen
                            ? 'border-brand-200/70 bg-white shadow-xl shadow-brand-900/[0.06] ring-1 ring-brand-100/80'
                            : 'border-slate-200/70 bg-white/70 shadow-sm shadow-slate-200/30 backdrop-blur-[2px] hover:border-slate-300/80 hover:bg-white hover:shadow-md hover:shadow-slate-200/40'
                        }`}
                      >
                        {isOpen ? (
                          <div
                            className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-500 via-brand-500 to-brand-600"
                            aria-hidden
                          />
                        ) : null}
                        <h4 className="m-0">
                          <button
                            id={buttonId}
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            onClick={() => toggle(key)}
                            className={`group flex w-full items-start gap-4 px-4 py-4 text-left transition-colors sm:gap-5 sm:px-6 sm:py-5 ${
                              isOpen ? 'pl-5 sm:pl-7' : 'pl-4 sm:pl-6'
                            }`}
                          >
                            <span className="min-w-0 flex-1 pt-0.5 text-[15px] font-semibold leading-snug tracking-tight text-slate-900 sm:text-base sm:leading-snug">
                              {item.question}
                            </span>
                            <FaqToggleIcon open={isOpen} />
                          </button>
                        </h4>
                        <div
                          id={panelId}
                          role="region"
                          aria-labelledby={buttonId}
                          className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${
                            isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                          }`}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div
                              className={`border-t border-slate-100/90 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
                                isOpen ? 'opacity-100 delay-75' : 'opacity-0'
                              }`}
                            >
                              <p className="max-w-prose px-4 pb-5 pl-4 text-[15px] leading-[1.7] text-slate-600 sm:px-6 sm:pb-6 sm:pl-7 sm:text-base sm:leading-[1.75]">
                                {item.answer}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
