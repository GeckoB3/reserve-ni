import Link from 'next/link';

/**
 * Unified entry point for guest class commerce areas (credits, courses, memberships, recurring, saved cards).
 */
export default function AccountClassesHubPage() {
  const links: Array<{ href: string; label: string; description: string }> = [
    { href: '/account/bookings', label: 'Bookings', description: 'Upcoming and past reservations, including multi-session groups.' },
    { href: '/account/credits', label: 'Class credits', description: 'Balances and buying packs from venues you visit.' },
    { href: '/account/courses', label: 'Courses', description: 'Enrollments in multi-session course products.' },
    { href: '/account/memberships', label: 'Memberships', description: 'Subscriptions billed on each venue’s Stripe account.' },
    { href: '/account/recurring', label: 'Recurring rules', description: 'Standing reservations processed by the venue schedule.' },
    { href: '/account/payment-methods', label: 'Saved cards', description: 'Cards on file per venue (Connect customer).' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Classes</h1>
        <p className="mt-2 text-sm text-slate-600">
          Everything for class bookings, packs, courses, memberships, and venue-specific saved payment methods.
        </p>
      </div>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block px-4 py-4 hover:bg-slate-50">
              <p className="font-semibold text-brand-700">{l.label}</p>
              <p className="mt-1 text-sm text-slate-600">{l.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
