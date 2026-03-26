'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import type { VenueSettings } from './types';
import { ProfileSection } from './sections/ProfileSection';
import { VenueProfileSection } from './sections/VenueProfileSection';
import { OpeningHoursSection } from './sections/OpeningHoursSection';
import { StaffSection } from './sections/StaffSection';
import { CommunicationTemplatesSection } from './sections/CommunicationTemplatesSection';
import { StripeConnectSection } from './sections/StripeConnectSection';
import { TableManagementSection } from './sections/TableManagementSection';
import { AvailabilityConfigSection } from './sections/AvailabilityConfigSection';
import { BookingRulesSection } from './sections/BookingRulesSection';
import { StaffPersonalSettingsSection } from './sections/StaffPersonalSettingsSection';

interface SettingsViewProps {
  initialVenue: VenueSettings | null;
  isAdmin: boolean;
  initialTab?: string;
  hasServiceConfig?: boolean;
  bookingModel?: string;
}

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'plan', label: 'Plan' },
  { key: 'payments', label: 'Payments' },
  { key: 'comms', label: 'Communications' },
  { key: 'staff', label: 'Staff' },
] as const;

type TabKey = typeof TABS[number]['key'];

function resolveInitialTab(initialTab: string | undefined, admin: boolean): TabKey {
  const allowedKeys = (admin ? TABS : TABS.filter((t) => t.key !== 'staff')).map((t) => t.key) as TabKey[];
  const t = initialTab as TabKey | undefined;
  if (t && allowedKeys.includes(t)) {
    return t;
  }
  return 'profile';
}

function PlanSection({ venue }: { venue: VenueSettings }) {
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const tier = venue.pricing_tier ?? 'standard';
  const planStatus = venue.plan_status ?? 'active';
  const calendarCount = venue.calendar_count ?? null;
  const tierLabel = tier === 'founding' ? 'Founding Partner' : tier === 'business' ? 'Business' : 'Standard';

  async function handleAction(action: string) {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/venue/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      if (data.ok) {
        window.location.reload();
        return;
      }
      setActionError(data.error || 'Something went wrong. Please try again.');
    } catch {
      setActionError('Network error. Please check your connection and try again.');
    }
    setLoading(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Your Plan</h2>
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
          tier === 'founding' ? 'bg-emerald-100 text-emerald-700' :
          tier === 'business' ? 'bg-brand-100 text-brand-700' :
          'bg-slate-100 text-slate-700'
        }`}>
          {tierLabel}
        </span>
        <span className={`text-xs font-medium ${planStatus === 'active' ? 'text-green-600' : planStatus === 'past_due' ? 'text-red-600' : 'text-amber-600'}`}>
          {planStatus === 'active' ? 'Active' : planStatus === 'past_due' ? 'Payment due' : planStatus === 'cancelled' ? 'Cancelled' : planStatus}
        </span>
      </div>
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {tier === 'standard' && calendarCount && (
        <p className="text-sm text-slate-500">{calendarCount} calendar{calendarCount > 1 ? 's' : ''} at &pound;{calendarCount * 10}/month</p>
      )}
      {tier === 'business' && (
        <p className="text-sm text-slate-500">Unlimited calendars, SMS, table management. &pound;79/month</p>
      )}
      {tier === 'founding' && (
        <p className="text-sm text-slate-500">Full Business-tier access, free during founding period</p>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        {tier === 'standard' && (
          <button type="button" disabled={loading} onClick={() => handleAction('upgrade')} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Upgrade to Business
          </button>
        )}
        {tier === 'business' && (
          <button type="button" disabled={loading} onClick={() => handleAction('downgrade')} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Switch to Standard
          </button>
        )}
        {planStatus === 'active' && tier !== 'founding' && (
          <button type="button" disabled={loading} onClick={() => handleAction('cancel')} className="rounded-lg border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
            Cancel plan
          </button>
        )}
        {planStatus === 'cancelled' && (
          <button type="button" disabled={loading} onClick={() => handleAction('resubscribe')} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            Resubscribe
          </button>
        )}
      </div>
      {tier === 'standard' && (
        <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50 p-4">
          <p className="text-sm font-medium text-brand-800">Upgrade to unlock more</p>
          <ul className="mt-2 space-y-1 text-xs text-brand-700">
            <li>&bull; SMS communications</li>
            <li>&bull; Unlimited calendars</li>
            <li>&bull; Table management (restaurants)</li>
            <li>&bull; Priority support</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export function SettingsView({ initialVenue, isAdmin, initialTab, hasServiceConfig = false, bookingModel = 'table_reservation' }: SettingsViewProps) {
  const isAppointment = bookingModel === 'practitioner_appointment';
  const [venue, setVenue] = useState<VenueSettings | null>(initialVenue);
  const visibleTabs = useMemo(
    () => (isAdmin ? [...TABS] : TABS.filter((t) => t.key !== 'staff')),
    [isAdmin],
  );
  const [activeTab, setActiveTab] = useState<TabKey>(() => resolveInitialTab(initialTab, isAdmin));

  const onUpdate = useCallback((patch: Partial<VenueSettings>) => {
    setVenue((v) => (v ? { ...v, ...patch } : null));
  }, []);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-slate-600">
          Manage your personal details and password. Venue settings (payments, communications, opening hours, and
          more) are only visible to admins — ask an admin if something needs to change.
        </p>
        <StaffPersonalSettingsSection />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {activeTab === 'profile' && (
          <>
            <ProfileSection />
            <VenueProfileSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} bookingModel={bookingModel} />
            <OpeningHoursSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
            {!isAppointment && <TableManagementSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />}
            {!isAppointment && !hasServiceConfig && (
              <AvailabilityConfigSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
            )}
            {isAppointment && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700 shadow-sm">
                <p className="font-semibold text-slate-900">Services and Availability</p>
                <p className="mt-2">
                  {hasServiceConfig
                    ? 'Manage your appointment services, team members, working hours, and booking availability.'
                    : 'Set up your appointment services and team to start accepting bookings.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard/appointment-services"
                    className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    {hasServiceConfig ? 'Manage Services' : 'Create First Service'}
                  </Link>
                  <Link
                    href="/dashboard/availability"
                    className="inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Availability Settings
                  </Link>
                </div>
              </div>
            )}
            {isAppointment && <BookingRulesSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} bookingModel={bookingModel} />}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Booking Widget & QR Code</h2>
              <p className="mt-1 text-sm text-slate-500">Get embed code and a printable QR code for your booking page.</p>
              <Link href="/dashboard/settings/widget" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Open Widget Settings
              </Link>
            </div>
          </>
        )}
        {activeTab === 'plan' && (
          <PlanSection venue={venue} />
        )}
        {activeTab === 'payments' && (
          <StripeConnectSection stripeAccountId={venue.stripe_connected_account_id} isAdmin={isAdmin} />
        )}
        {activeTab === 'comms' && (
          <CommunicationTemplatesSection venue={venue} isAdmin={isAdmin} />
        )}
        {activeTab === 'staff' && isAdmin && <StaffSection venueId={venue.id} isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
