'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

import type { BookingModel } from '@/types/booking-models';

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const BASE_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: HomeIcon },
  { href: '/dashboard/bookings', label: 'Reservations', icon: CalendarIcon },
  { href: '/dashboard/bookings/new', label: 'New Booking', icon: PlusIcon },
  { href: '/dashboard/waitlist', label: 'Waitlist', icon: QueueIcon },
  { href: '/dashboard/reports', label: 'Reports', icon: ChartIcon },
  { href: '/dashboard/settings', label: 'Settings', icon: CogIcon },
  { href: '/dashboard/availability', label: 'Availability', icon: ClockIcon },
];

const MODEL_NAV_ITEMS: Partial<Record<BookingModel, NavItem[]>> = {
  practitioner_appointment: [{ href: '/dashboard/appointment-services', label: 'Services', icon: ClockIcon }],
  event_ticket: [
    { href: '/dashboard/event-manager', label: 'Events', icon: CalendarIcon },
  ],
  class_session: [
    { href: '/dashboard/class-timetable', label: 'Timetable', icon: CalendarIcon },
  ],
  resource_booking: [
    { href: '/dashboard/resource-timeline', label: 'Resources', icon: CalendarIcon },
  ],
};

const TABLE_RESERVATION_ONLY = new Set(['/dashboard/waitlist']);

interface Props {
  email: string;
  staffName?: string;
  venueName?: string;
  venueSlug?: string;
  tableManagementEnabled?: boolean;
  /** Business or Founding — with table_reservation and tableManagementEnabled, shows table grid / floor plan. */
  pricingTier?: string;
  bookingModel?: BookingModel;
  /** Reports and Availability nav items are admin-only. */
  isAdmin?: boolean;
}

const ADMIN_ONLY_HREFS = new Set(['/dashboard/reports', '/dashboard/settings']);

export function DashboardSidebar({
  email,
  staffName,
  venueSlug,
  tableManagementEnabled,
  pricingTier = 'standard',
  bookingModel = 'table_reservation',
  isAdmin = false,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const showTableManagementNav =
    Boolean(tableManagementEnabled) &&
    bookingModel === 'table_reservation' &&
    (pricingTier === 'business' || pricingTier === 'founding');

  const navItems = useMemo(() => {
    const isTableReservation = bookingModel === 'table_reservation';
    const isAppointment = bookingModel === 'practitioner_appointment';

    let items = BASE_NAV_ITEMS.filter((item) => {
      if (!isTableReservation && TABLE_RESERVATION_ONLY.has(item.href)) return false;
      if (!isAdmin && item.href === '/dashboard/availability' && !isAppointment) return false;
      if (!isAdmin && ADMIN_ONLY_HREFS.has(item.href)) {
        // Model B: staff can open Settings for their own account (name, email, phone, password) only.
        if (item.href === '/dashboard/settings' && isAppointment) return true;
        return false;
      }
      return true;
    });

    // Rename nav items for appointment businesses
    if (isAppointment) {
      items = items.map((item) => {
        if (item.href === '/dashboard/bookings') return { ...item, label: 'Appointments' };
        if (item.href === '/dashboard/bookings/new') return { ...item, label: 'New Appointment' };
        return item;
      });
    }

    const modelItems = MODEL_NAV_ITEMS[bookingModel];
    if (modelItems) {
      const insertIdx = items.findIndex((i) => i.href === '/dashboard/bookings/new');
      if (insertIdx >= 0) {
        items = [...items.slice(0, insertIdx + 1), ...modelItems, ...items.slice(insertIdx + 1)];
      } else {
        items = [...items, ...modelItems];
      }
    }

    // Model B: Availability directly under Services, before Reports (not at the bottom with Settings).
    if (isAppointment) {
      const availIdx = items.findIndex((i) => i.href === '/dashboard/availability');
      const avail = availIdx >= 0 ? items[availIdx] : undefined;
      if (avail) {
        items = items.filter((i) => i.href !== '/dashboard/availability');
        const svcIdx = items.findIndex((i) => i.href === '/dashboard/appointment-services');
        if (svcIdx >= 0) {
          items.splice(svcIdx + 1, 0, avail);
        } else {
          items.push(avail);
        }
      }
    }

    return items;
  }, [isAdmin, bookingModel]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    if (href === '/dashboard/bookings') {
      return pathname === '/dashboard/bookings';
    }
    if (href === '/dashboard/calendar') {
      return pathname.startsWith('/dashboard/calendar') || pathname.startsWith('/dashboard/practitioner-calendar');
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <img src="/Logo.png" alt="Reserve NI" className="h-7 w-auto" />
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <XIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-40 h-full w-64 flex flex-col border-r border-slate-200 bg-white
        transition-transform duration-200 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Brand */}
        <div className="border-b border-slate-100 px-5 py-4">
          <img src="/Logo.png" alt="Reserve NI" className="h-8 w-auto" />
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            if (item.href === '/dashboard/bookings' && !showTableManagementNav) {
              const scheduleActive = bookingModel === 'practitioner_appointment'
                ? pathname.startsWith('/dashboard/calendar') || pathname.startsWith('/dashboard/practitioner-calendar')
                : pathname.startsWith('/dashboard/day-sheet');
              const isAppt = bookingModel === 'practitioner_appointment';
              return (
                <div key="reservations-with-day-sheet" className="space-y-1">
                  <Link
                    href={isAppt ? '/dashboard/calendar' : '/dashboard/day-sheet'}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      scheduleActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {isAppt ? (
                      <CalendarIcon className={`h-5 w-5 flex-shrink-0 ${scheduleActive ? 'text-brand-600' : 'text-slate-400'}`} />
                    ) : (
                      <ClipboardIcon className={`h-5 w-5 flex-shrink-0 ${scheduleActive ? 'text-brand-600' : 'text-slate-400'}`} />
                    )}
                    {isAppt ? 'Calendar' : 'Day Sheet'}
                  </Link>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                      ${isActive(item.href)
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }
                    `}
                  >
                    <item.icon className={`h-5 w-5 flex-shrink-0 ${isActive(item.href) ? 'text-brand-600' : 'text-slate-400'}`} />
                    {item.label}
                  </Link>
                </div>
              );
            }

            if (item.href === '/dashboard/bookings' && showTableManagementNav) {
              const reservationsActive = isActive(item.href);
              return (
                <div key="reservations-with-table-views" className="space-y-1">
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                      ${reservationsActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }
                    `}
                  >
                    <item.icon className={`h-5 w-5 flex-shrink-0 ${reservationsActive ? 'text-brand-600' : 'text-slate-400'}`} />
                    {item.label}
                  </Link>
                  <Link
                    href="/dashboard/table-grid"
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      pathname.startsWith('/dashboard/table-grid')
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <TableGridIcon className={`h-5 w-5 flex-shrink-0 ${pathname.startsWith('/dashboard/table-grid') ? 'text-brand-600' : 'text-slate-400'}`} />
                    Table Grid
                  </Link>
                  <Link
                    href="/dashboard/floor-plan"
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      pathname.startsWith('/dashboard/floor-plan')
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <MapIcon className={`h-5 w-5 flex-shrink-0 ${pathname.startsWith('/dashboard/floor-plan') ? 'text-brand-600' : 'text-slate-400'}`} />
                    Floor Plan
                  </Link>
                </div>
              );
            }

            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                  ${active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }
                `}
              >
                <item.icon className={`h-5 w-5 flex-shrink-0 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
                {item.label}
              </Link>
            );
          })}

          {/* Your Booking Page — external link */}
          {venueSlug && (
            <a
              href={`/book/${venueSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <ExternalLinkIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
              Your Booking Page
            </a>
          )}
        </nav>

        {/* Support link */}
        <div className="px-3 pb-1">
          <Link
            href="/dashboard/support"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname.startsWith('/dashboard/support')
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <SupportIcon className={`h-5 w-5 flex-shrink-0 ${pathname.startsWith('/dashboard/support') ? 'text-brand-600' : 'text-slate-400'}`} />
            Support
          </Link>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-4 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-medium text-brand-700">
              {(staffName ?? email).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              {staffName && <p className="text-xs font-medium text-slate-700 truncate">{staffName}</p>}
              <p className="text-xs text-slate-400 truncate">{email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function CogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function QueueIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function TableGridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12c-.621 0-1.125.504-1.125 1.125M12 12c.621 0 1.125.504 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
    </svg>
  );
}

function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

function SupportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
    </svg>
  );
}
