'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { VenueSettings } from './types';
import { ProfileSection } from './sections/ProfileSection';
import { VenueProfileSection } from './sections/VenueProfileSection';
import { OpeningHoursSection } from './sections/OpeningHoursSection';
import { StaffSection } from './sections/StaffSection';
import { CommunicationTemplatesSection } from './sections/CommunicationTemplatesSection';
import { StripeConnectSection } from './sections/StripeConnectSection';
import { DataExportSection } from './sections/DataExportSection';

interface SettingsViewProps {
  initialVenue: VenueSettings | null;
  isAdmin: boolean;
  initialTab?: string;
}

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'payments', label: 'Payments' },
  { key: 'comms', label: 'Communications' },
  { key: 'staff', label: 'Staff' },
] as const;

type TabKey = typeof TABS[number]['key'];

export function SettingsView({ initialVenue, isAdmin, initialTab }: SettingsViewProps) {
  const [venue, setVenue] = useState<VenueSettings | null>(initialVenue);
  const validTabs = TABS.map(t => t.key) as readonly string[];
  const [activeTab, setActiveTab] = useState<TabKey>(
    initialTab && validTabs.includes(initialTab) ? initialTab as TabKey : 'profile'
  );

  const onUpdate = useCallback((patch: Partial<VenueSettings>) => {
    setVenue((v) => (v ? { ...v, ...patch } : null));
  }, []);

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
        {TABS.map((tab) => (
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
            <VenueProfileSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
            <OpeningHoursSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
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
        {activeTab === 'payments' && (
          <StripeConnectSection stripeAccountId={venue.stripe_connected_account_id} isAdmin={isAdmin} />
        )}
        {activeTab === 'comms' && (
          <CommunicationTemplatesSection venue={venue} onUpdate={onUpdate} isAdmin={isAdmin} />
        )}
        {activeTab === 'staff' && (
          <>
            <StaffSection venueId={venue.id} isAdmin={isAdmin} />
            <DataExportSection />
          </>
        )}
      </div>
    </div>
  );
}
