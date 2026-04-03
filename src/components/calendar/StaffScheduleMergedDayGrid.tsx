'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScheduleFeedColumn } from '@/app/dashboard/practitioner-calendar/ScheduleFeedColumn';
import { getCalendarGridBounds } from '@/lib/venue-calendar-bounds';
import { minutesToTime } from '@/lib/availability';
import { venueExposesBookingModel } from '@/lib/booking/enabled-models';
import type { BookingModel } from '@/types/booking-models';
import type { OpeningHours } from '@/types/availability';
import type { ScheduleBlockDTO } from '@/types/schedule-blocks';

const SLOT_HEIGHT = 48;
const SLOT_MINUTES = 15;

interface Props {
  date: string;
  bookingModel: BookingModel;
  enabledModels: BookingModel[];
}

/**
 * Merged Events / Classes / Resources day columns for non–unified-scheduling venues
 * (e.g. table + secondaries, or C/D/E primary). Uses GET /api/venue/schedule — same
 * feed as PractitionerCalendarView merged lanes; does not include Model A tables.
 */
export function StaffScheduleMergedDayGrid({ date, bookingModel, enabledModels }: Props) {
  const router = useRouter();
  const [openingHours, setOpeningHours] = useState<OpeningHours | null>(null);
  const [blocks, setBlocks] = useState<ScheduleBlockDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/venue')
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (v?.opening_hours) setOpeningHours(v.opening_hours as OpeningHours);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBlocks([]);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/venue/schedule?date=${encodeURIComponent(date)}`);
        if (!res.ok) throw new Error('Failed to load schedule');
        const j = (await res.json()) as { blocks?: ScheduleBlockDTO[] };
        if (!cancelled) setBlocks(j.blocks ?? []);
      } catch {
        if (!cancelled) {
          setError('Could not load schedule for this date.');
          setBlocks([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const { startHour, endHour } = useMemo(
    () => getCalendarGridBounds(date, openingHours ?? undefined, 7, 21),
    [date, openingHours],
  );

  const showEvents = venueExposesBookingModel(bookingModel, enabledModels, 'event_ticket');
  const showClasses = venueExposesBookingModel(bookingModel, enabledModels, 'class_session');
  const showResources = venueExposesBookingModel(bookingModel, enabledModels, 'resource_booking');
  const showMerged = showEvents || showClasses || showResources;

  const onBookingClick = useCallback(
    (bookingId: string) => {
      router.push(`/dashboard/bookings?openBooking=${encodeURIComponent(bookingId)}`);
    },
    [router],
  );

  const totalSlots = ((endHour - startHour) * 60) / SLOT_MINUTES;
  const timeLabels = useMemo(
    () =>
      Array.from({ length: totalSlots + 1 }, (_, i) => {
        const mins = startHour * 60 + i * SLOT_MINUTES;
        return minutesToTime(mins);
      }),
    [startHour, totalSlots],
  );

  if (!showMerged) return null;

  const dayBlocks = blocks.filter((b) => b.date === date);
  const hasAnyBlock = dayBlocks.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Events, classes & resources</span>
        {showEvents && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded bg-violet-500" aria-hidden />
            Events
          </span>
        )}
        {showClasses && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded bg-emerald-500" aria-hidden />
            Classes
          </span>
        )}
        {showResources && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded bg-slate-500" aria-hidden />
            Resources
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
      )}

      {loading && !hasAnyBlock ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-12 text-sm text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          Loading schedule…
        </div>
      ) : (
        <div className="max-h-[min(720px,70vh)] overflow-auto rounded-xl border border-slate-200 bg-white">
          <div className="flex min-w-[600px]">
            <div className="w-16 flex-shrink-0 border-r border-slate-100 bg-slate-50">
              <div className="h-10 border-b border-slate-100" />
              <div className="relative" style={{ height: totalSlots * SLOT_HEIGHT }}>
                {timeLabels.map((t, i) =>
                  i % 4 === 0 ? (
                    <div
                      key={`${t}-${i}`}
                      className="absolute left-0 w-full pr-2 text-right text-xs text-slate-400"
                      style={{ top: i * SLOT_HEIGHT - 6 }}
                    >
                      {t}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
            {showEvents ? (
              <ScheduleFeedColumn
                label="Events"
                date={date}
                blocks={blocks.filter((b) => b.kind === 'event_ticket')}
                startHour={startHour}
                endHour={endHour}
                onBookingClick={onBookingClick}
              />
            ) : null}
            {showClasses ? (
              <ScheduleFeedColumn
                label="Classes"
                date={date}
                blocks={blocks.filter((b) => b.kind === 'class_session')}
                startHour={startHour}
                endHour={endHour}
                onBookingClick={onBookingClick}
              />
            ) : null}
            {showResources ? (
              <ScheduleFeedColumn
                label="Resources"
                date={date}
                blocks={blocks.filter((b) => b.kind === 'resource_booking')}
                startHour={startHour}
                endHour={endHour}
                onBookingClick={onBookingClick}
              />
            ) : null}
          </div>
        </div>
      )}

      {!loading && !error && !hasAnyBlock && (
        <p className="text-sm text-slate-500">
          No ticketed events, class instances, or resource bookings on this day. Use the shortcuts above to manage
          catalogue.
        </p>
      )}
    </div>
  );
}
