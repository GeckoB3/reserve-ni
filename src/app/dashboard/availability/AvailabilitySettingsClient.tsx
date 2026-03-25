'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ServicesTab } from './ServicesTab';
import { CapacityRulesTab } from './CapacityRulesTab';
import { DiningDurationTab } from './DiningDurationTab';
import { BookingRulesTab } from './BookingRulesTab';
import { ClosuresTab } from './ClosuresTab';
import { AvailabilityCalendarTab } from './AvailabilityCalendarTab';

const TABS = [
  { key: 'services', label: 'Services' },
  { key: 'capacity', label: 'Capacity Rules' },
  { key: 'duration', label: 'Dining Duration' },
  { key: 'rules', label: 'Booking Rules' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'closures', label: 'Closures' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface Service {
  id: string;
  name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  last_booking_time: string;
  is_active: boolean;
  sort_order: number;
}

export default function AvailabilitySettingsClient() {
  const [activeTab, setActiveTab] = useState<TabKey>('services');
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/venue/services');
        if (res.ok) {
          const data = await res.json();
          setServices(data.services ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-xl font-bold text-slate-900">Availability Settings</h1>
          <p className="text-sm text-slate-500">Manage services, capacity, durations, booking rules, calendar blocks, and closures.</p>
        </div>
        <Link
          href="/dashboard/onboarding"
          className="flex-shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors"
        >
          Setup Wizard
        </Link>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'services' && (
        <ServicesTab services={services} setServices={setServices} showToast={showToast} />
      )}
      {activeTab === 'capacity' && (
        <CapacityRulesTab services={services} showToast={showToast} />
      )}
      {activeTab === 'duration' && (
        <DiningDurationTab services={services} showToast={showToast} />
      )}
      {activeTab === 'rules' && (
        <BookingRulesTab services={services} showToast={showToast} />
      )}
      {activeTab === 'calendar' && (
        <AvailabilityCalendarTab services={services} showToast={showToast} />
      )}
      {activeTab === 'closures' && (
        <ClosuresTab services={services} showToast={showToast} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
