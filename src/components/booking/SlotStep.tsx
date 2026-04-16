'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AvailableSlot, ServiceGroup } from './types';
import type { CountryCode } from 'libphonenumber-js';
import { PhoneWithCountryField } from '@/components/phone/PhoneWithCountryField';
import { normalizeToE164 } from '@/lib/phone/e164';

interface SlotStepProps {
  date: string;
  slots: AvailableSlot[];
  serviceGroups?: ServiceGroup[];
  loading?: boolean;
  largePartyRedirect?: boolean;
  largePartyMessage?: string | null;
  venueId?: string;
  partySize?: number;
  phoneDefaultCountry?: CountryCode;
  onSelect: (slot: AvailableSlot) => void;
  onBack: () => void;
  onDateChange?: (date: string) => void;
  /** When true, show tabs to switch dining area (manual multi-area mode). */
  showAreaTabs?: boolean;
  areas?: Array<{ id: string; name: string; colour: string }>;
  selectedAreaId?: string | null;
  onAreaChange?: (areaId: string) => void;
  /** Scope empty-state “nearby dates” fetch the same as the main availability call. */
  availabilityAreaId?: string | null;
  publicBookingAreaMode?: 'auto' | 'manual';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDateStr(date: string): string {
  const d = new Date(date + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function SlotStep({
  date,
  slots,
  serviceGroups,
  loading,
  largePartyRedirect,
  largePartyMessage,
  venueId,
  partySize,
  phoneDefaultCountry = 'GB',
  onSelect,
  onBack,
  onDateChange,
  showAreaTabs = false,
  areas = [],
  selectedAreaId = null,
  onAreaChange,
  availabilityAreaId = null,
  publicBookingAreaMode = 'auto',
}: SlotStepProps) {
  const dateStr = formatDateStr(date);
  const [nearbyDates, setNearbyDates] = useState<Array<{ date: string; label: string; slotCount: number }>>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  const mergedSlots = getMergedSlots(slots, serviceGroups);
  const hasLargePartyService = serviceGroups?.some((g) => g.large_party_redirect) ?? false;
  const noAvailability = !loading && !largePartyRedirect && mergedSlots.length === 0 && !hasLargePartyService;

  const fetchNearbyDates = useCallback(async () => {
    if (!venueId || !partySize || !noAvailability) return;
    setNearbyLoading(true);
    try {
      const results: Array<{ date: string; label: string; slotCount: number }> = [];
      const baseDate = new Date(date + 'T12:00:00');
      const offsets = [-1, 1, -2, 2, -3, 3];

      for (const offset of offsets) {
        if (results.length >= 3) break;
        const checkDate = new Date(baseDate);
        checkDate.setDate(checkDate.getDate() + offset);
        if (checkDate < new Date()) continue;

        const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        try {
          let nearbyUrl = `/api/booking/availability?venue_id=${encodeURIComponent(venueId)}&date=${encodeURIComponent(checkStr)}&party_size=${partySize}`;
          if (publicBookingAreaMode === 'manual' && availabilityAreaId) {
            nearbyUrl += `&area_id=${encodeURIComponent(availabilityAreaId)}`;
          }
          const res = await fetch(nearbyUrl);
          if (res.ok) {
            const data = await res.json();
            const slotCount = (data.slots ?? []).length;
            if (slotCount > 0) {
              results.push({ date: checkStr, label: formatDateStr(checkStr), slotCount });
            }
          }
        } catch {
          // skip this date
        }
      }

      setNearbyDates(results);
    } finally {
      setNearbyLoading(false);
    }
  }, [venueId, partySize, date, noAvailability, publicBookingAreaMode, availabilityAreaId]);

  useEffect(() => {
    if (noAvailability && venueId && partySize) {
      fetchNearbyDates();
    } else {
      setNearbyDates([]);
    }
  }, [noAvailability, venueId, partySize, fetchNearbyDates]);

  return (
    <div className="space-y-5">
      {showAreaTabs && areas.length > 1 && onAreaChange && (
        <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
          {areas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAreaChange(a.id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                selectedAreaId === a.id
                  ? 'border-brand-500 bg-brand-50 text-brand-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.colour || '#6366F1' }} />
              {a.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600" aria-label="Go back">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <p className="text-sm font-medium text-slate-600">{dateStr}</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-500">Loading available times&hellip;</p>
        </div>
      ) : largePartyRedirect ? (
        <div className="flex flex-col items-center rounded-xl border border-amber-200 bg-amber-50 py-10 px-6 text-center">
          <svg className="mb-3 h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
          </svg>
          <p className="text-sm font-medium text-amber-800">{largePartyMessage ?? 'Please call us to book for large parties.'}</p>
          <button type="button" onClick={onBack} className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700">Choose a smaller party size</button>
        </div>
      ) : mergedSlots.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Select a time for your reservation</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {mergedSlots.map((slot) => (
              <button
                key={slot.key}
                type="button"
                onClick={() => onSelect(slot)}
                className="group relative flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-3.5 transition-all hover:border-brand-300 hover:bg-brand-50/50 hover:shadow-sm active:scale-[0.97]"
              >
                <span className="text-base font-semibold text-slate-900 group-hover:text-brand-700">{slot.start_time.slice(0, 5)}</span>
                {slot.limited && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 items-center rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                    Limited
                  </span>
                )}
              </button>
            ))}
          </div>
          {hasLargePartyService && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
              {serviceGroups?.find((g) => g.large_party_redirect)?.large_party_message ?? 'Some services require you to call for large party bookings.'}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 py-10 px-6 text-center">
          <svg className="mb-3 h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <p className="text-sm font-medium text-slate-500">No availability on this date</p>
          <p className="mt-1 text-xs text-slate-400">Try a different date or party size</p>

          {nearbyLoading && (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border border-slate-300 border-t-transparent" />
              Checking nearby dates&hellip;
            </div>
          )}

          {!nearbyLoading && nearbyDates.length > 0 && (
            <div className="mt-5 w-full space-y-2">
              <p className="text-xs font-medium text-slate-500">Available nearby</p>
              {nearbyDates.map((nd) => (
                <button
                  key={nd.date}
                  type="button"
                  onClick={() => onDateChange?.(nd.date)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all hover:border-brand-300 hover:bg-brand-50 hover:shadow-sm"
                >
                  <span className="font-medium text-slate-700">{nd.label}</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">{nd.slotCount} {nd.slotCount === 1 ? 'time' : 'times'}</span>
                </button>
              ))}
            </div>
          )}

          {venueId && partySize && (
            <WaitlistForm venueId={venueId} date={date} partySize={partySize} phoneDefaultCountry={phoneDefaultCountry} />
          )}

          <button type="button" onClick={onBack} className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700">Choose another date</button>
        </div>
      )}
    </div>
  );
}

function getMergedSlots(slots: AvailableSlot[], serviceGroups?: ServiceGroup[]): AvailableSlot[] {
  if (serviceGroups && serviceGroups.length > 0) {
    const allSlots = serviceGroups
      .filter((g) => !g.large_party_redirect)
      .flatMap((g) => g.slots);
    allSlots.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return allSlots;
  }
  return [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

function WaitlistForm({
  venueId,
  date,
  partySize,
  phoneDefaultCountry,
}: {
  venueId: string;
  date: string;
  partySize: number;
  phoneDefaultCountry: CountryCode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [desiredTime, setDesiredTime] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const guestPhone = normalizeToE164(phone, phoneDefaultCountry);
    if (!name.trim() || !guestPhone) return;
    setStatus('submitting');
    try {
      const res = await fetch('/api/booking/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          desired_date: date,
          desired_time: desiredTime || undefined,
          party_size: partySize,
          guest_name: name,
          guest_phone: guestPhone,
          guest_email: email || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage(data.message ?? 'Added to standby list!');
      } else {
        setStatus('error');
        setMessage(data.error ?? 'Failed to join waitlist');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  }

  if (status === 'success') {
    return (
      <div className="mt-4 w-full rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-center text-sm text-green-700">
        {message}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100"
      >
        Join Standby List
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 w-full space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-left">
      <p className="text-xs font-medium text-slate-600">We&apos;ll notify you if a spot opens up.</p>
      {status === 'error' && (
        <p className="text-xs text-red-600">{message}</p>
      )}
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 text-base placeholder:text-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
      <PhoneWithCountryField
        value={phone}
        onChange={setPhone}
        defaultCountry={phoneDefaultCountry}
        inputClassName="min-h-[44px] w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-base placeholder:text-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 text-base placeholder:text-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
      <input type="time" value={desiredTime} onChange={(e) => setDesiredTime(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 text-base focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
      <div className="flex gap-2">
        <button type="submit" disabled={status === 'submitting' || !name.trim() || !normalizeToE164(phone, phoneDefaultCountry)} className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {status === 'submitting' ? 'Adding...' : 'Join Standby'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
      </div>
    </form>
  );
}
