'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StaffExpandedBookingModifyDetailLite, StaffExpandedBookingModifySource } from '@/components/booking/StaffExpandedBookingModifyModal';
import { StaffResourceBookingModifySlotPicker } from '@/components/booking/StaffResourceBookingModifySlotPicker';
import { PhoneWithCountryField } from '@/components/phone/PhoneWithCountryField';
import type { CountryCode } from 'libphonenumber-js';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/default-country';
import { minutesBetweenStartAndEndHM } from '@/lib/booking/validate-appointment-modification';
import { validateResourceBookingModificationUrl } from '@/lib/booking/booking-flow-api';

function initialResourceDurationMinutes(booking: StaffExpandedBookingModifySource): number {
  const start = booking.booking_time.slice(0, 5);
  if (booking.booking_end_time && booking.booking_end_time.length >= 5) {
    return Math.max(5, minutesBetweenStartAndEndHM(start, booking.booking_end_time.slice(0, 5)));
  }
  if (booking.estimated_end_time) {
    const d = new Date(booking.estimated_end_time.trim());
    if (!Number.isNaN(d.getTime())) {
      const hm = d.toISOString().slice(11, 16);
      return Math.max(5, minutesBetweenStartAndEndHM(start, hm));
    }
  }
  return 60;
}

const RESOURCE_RESCHEDULABLE_STATUSES = new Set(['Pending', 'Booked', 'Confirmed', 'Seated']);

export function StaffResourceBookingModifyForm({
  bookingId,
  booking,
  detail,
  venueId,
  venueCurrency,
  initialSlotSectionOpen = true,
  onSaved,
  onClose,
}: {
  bookingId: string;
  booking: StaffExpandedBookingModifySource;
  detail: StaffExpandedBookingModifyDetailLite | undefined;
  venueId: string;
  venueCurrency: string;
  initialSlotSectionOpen?: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const defaultCountry = defaultPhoneCountryForVenueCurrency(venueCurrency) as CountryCode;
  const resourceId = booking.resource_id?.trim() ?? '';
  const initialDuration = initialResourceDurationMinutes(booking);
  const canChangeSlot = Boolean(resourceId) && RESOURCE_RESCHEDULABLE_STATUSES.has(booking.status);

  const g = detail?.guest;
  const [firstName, setFirstName] = useState(
    () => g?.first_name ?? booking.guest_first_name ?? booking.guest_name.split(/\s+/)[0] ?? '',
  );
  const [lastName, setLastName] = useState(
    () =>
      g?.last_name ??
      booking.guest_last_name ??
      booking.guest_name.split(/\s+/).slice(1).join(' ') ??
      '',
  );
  const [email, setEmail] = useState(() => g?.email ?? booking.guest_email ?? '');
  const [phone, setPhone] = useState(() => g?.phone ?? booking.guest_phone ?? '');
  const [internalNotes, setInternalNotes] = useState(() => detail?.internal_notes ?? '');

  const [bookingDate, setBookingDate] = useState(booking.booking_date);
  const [bookingTime, setBookingTime] = useState(booking.booking_time.slice(0, 5));
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [slotSectionOpen, setSlotSectionOpen] = useState(canChangeSlot && initialSlotSectionOpen);

  const [validationState, setValidationState] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baselineFirst = g?.first_name ?? booking.guest_first_name ?? booking.guest_name.split(/\s+/)[0] ?? '';
  const baselineLast =
    g?.last_name ??
    booking.guest_last_name ??
    booking.guest_name.split(/\s+/).slice(1).join(' ') ??
    '';
  const baselineEmail = g?.email ?? booking.guest_email ?? '';
  const baselinePhone = g?.phone ?? booking.guest_phone ?? '';
  const baselineInternal = detail?.internal_notes ?? '';

  const slotChanged =
    bookingDate !== booking.booking_date ||
    bookingTime !== booking.booking_time.slice(0, 5) ||
    durationMinutes !== initialDuration;

  const guestChanged =
    firstName.trim() !== baselineFirst.trim() ||
    lastName.trim() !== baselineLast.trim() ||
    email.trim() !== baselineEmail.trim() ||
    phone.trim() !== baselinePhone.trim() ||
    internalNotes.trim() !== baselineInternal.trim();

  const hasChanges = slotChanged || guestChanged;

  const runValidate = useCallback(async () => {
    if (!canChangeSlot || !resourceId || !slotChanged) {
      setValidationState('idle');
      setValidationMessage(null);
      return;
    }
    if (!bookingTime) {
      setValidationState('invalid');
      setValidationMessage('Select a start time.');
      return;
    }
    setValidationState('loading');
    setValidationMessage(null);
    try {
      const res = await fetch(validateResourceBookingModificationUrl(bookingId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_date: bookingDate,
          booking_time: bookingTime,
          duration_minutes: durationMinutes,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setValidationState('invalid');
        setValidationMessage(data.error ?? 'This slot is not valid.');
        return;
      }
      setValidationState('valid');
    } catch (e) {
      console.error('Staff resource validate failed:', e);
      setValidationState('invalid');
      setValidationMessage('Could not validate availability.');
    }
  }, [bookingDate, bookingId, bookingTime, canChangeSlot, durationMinutes, resourceId, slotChanged]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!canChangeSlot || !slotChanged) {
      setValidationState('idle');
      setValidationMessage(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runValidate();
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [bookingDate, bookingTime, canChangeSlot, durationMinutes, runValidate, slotChanged]);

  const saveDisabled =
    saving ||
    !hasChanges ||
    (slotChanged &&
      (!bookingTime ||
        validationState === 'loading' ||
        validationState === 'invalid' ||
        validationState === 'idle'));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (guestChanged) {
        body.guest_first_name = firstName.trim() || null;
        body.guest_last_name = lastName.trim() || null;
        body.guest_email = email.trim() || null;
        body.guest_phone = phone.trim() || null;
        body.internal_notes = internalNotes.trim() || null;
      }
      if (slotChanged && canChangeSlot) {
        body.booking_date = bookingDate;
        body.booking_time = bookingTime.length === 5 ? `${bookingTime}:00` : bookingTime;
        body.duration_minutes = durationMinutes;
      }

      const res = await fetch(`/api/venue/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? 'Could not save.');
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {canChangeSlot ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => setSlotSectionOpen((open) => !open)}
            className="flex w-full items-center justify-between px-3 py-3 text-left"
          >
            <div>
              <p className="text-xs font-semibold text-slate-800">Change slot</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {booking.booking_date} · {booking.booking_time.slice(0, 5)} · {initialDuration} min
              </p>
            </div>
            <span className="text-xs font-semibold text-brand-700">{slotSectionOpen ? 'Hide' : 'Edit'}</span>
          </button>
          {slotSectionOpen ? (
            <div className="border-t border-slate-200 px-3 pb-3 pt-1">
              <StaffResourceBookingModifySlotPicker
                venueId={venueId}
                bookingId={bookingId}
                resourceId={resourceId}
                initialBookingDate={booking.booking_date}
                initialBookingTime={booking.booking_time.slice(0, 5)}
                initialDurationMinutes={initialDuration}
                bookingDate={bookingDate}
                bookingTime={bookingTime}
                durationMinutes={durationMinutes}
                onBookingDateChange={setBookingDate}
                onBookingTimeChange={setBookingTime}
                onDurationChange={setDurationMinutes}
                validationState={slotChanged ? validationState : 'idle'}
                validationMessage={validationMessage}
                disabled={saving}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          This booking can no longer be rescheduled from here.
        </p>
      )}

      <p className="text-xs text-slate-600">Update client contact details or internal notes below.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-700">
          First name
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          Last name
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block text-xs font-semibold text-slate-700">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      <div>
        <p className="text-xs font-semibold text-slate-700">Phone</p>
        <div className="mt-1">
          <PhoneWithCountryField
            value={phone}
            onChange={setPhone}
            defaultCountry={defaultCountry}
            inputClassName="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <label className="block text-xs font-semibold text-slate-700">
        Staff notes (internal)
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      {error ? <p className="rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p> : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={saveDisabled}
          onClick={() => void handleSave()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
