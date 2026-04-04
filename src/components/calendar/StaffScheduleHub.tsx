'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { BookingModel } from '@/types/booking-models';
import { StaffScheduleMergedDayGrid } from '@/components/calendar/StaffScheduleMergedDayGrid';

interface Props {
  bookingModel: BookingModel;
  enabledModels: BookingModel[];
}

/**
 * Schedule landing for venues that are calendar-eligible but not unified scheduling
 * (e.g. restaurant + secondary C/D/E, or primary class/event/resource without USE).
 * Does not use PractitionerCalendarView - table primaries keep Day sheet / Floor plan for Model A.
 * Merged C/D/E day grid uses GET /api/venue/schedule (same feed as unified calendar lanes).
 */
export function StaffScheduleHub({ bookingModel, enabledModels }: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const active = useMemo(() => new Set<BookingModel>([bookingModel, ...enabledModels]), [bookingModel, enabledModels]);
  const showAppointments = active.has('unified_scheduling') && bookingModel !== 'unified_scheduling';
  const showEvents = active.has('event_ticket');
  const showClasses = active.has('class_session');
  const showResources = active.has('resource_booking');
  return (
    <div className="flex min-h-0 flex-col space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Schedule</h1>
        <p className="mt-1 text-sm text-slate-600">
          {bookingModel === 'table_reservation' ? (
            <>
              Table reservations and live floor layout use{' '}
              <Link href="/dashboard/day-sheet" className="font-medium text-brand-700 underline underline-offset-2">
                Day sheet
              </Link>{' '}
              and{' '}
              <Link href="/dashboard/floor-plan" className="font-medium text-brand-700 underline underline-offset-2">
                Floor plan
              </Link>
              . This page focuses on appointments, events, classes, and resources when enabled.
            </>
          ) : (
            <>
              Open each area below for full management. The day grid shows ticketed events, class instances, and
              resource bookings - not table reservations.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {showAppointments && (
          <Link
            href="/dashboard/appointment-services"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow"
          >
            <p className="text-sm font-semibold text-slate-900">Appointments &amp; services</p>
            <p className="mt-1 text-xs text-slate-500">Manage calendars, services, and appointment bookings</p>
          </Link>
        )}
        {showEvents && (
          <Link
            href="/dashboard/event-manager"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow"
          >
            <p className="text-sm font-semibold text-slate-900">Events (tickets)</p>
            <p className="mt-1 text-xs text-slate-500">Ticketed events, capacity, and guest bookings</p>
          </Link>
        )}
        {showClasses && (
          <Link
            href="/dashboard/class-timetable"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow"
          >
            <p className="text-sm font-semibold text-slate-900">Class timetable</p>
            <p className="mt-1 text-xs text-slate-500">Instances, roster, and cancellations</p>
          </Link>
        )}
        {showResources && (
          <Link
            href="/dashboard/resource-timeline"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow"
          >
            <p className="text-sm font-semibold text-slate-900">Resources</p>
            <p className="mt-1 text-xs text-slate-500">Dedicated resource timeline and settings</p>
          </Link>
        )}
      </div>

      {(showEvents || showResources) && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Day</span>
            <button
              type="button"
              onClick={() =>
                setDate((d) => {
                  const t = new Date(`${d}T12:00:00`);
                  t.setDate(t.getDate() - 1);
                  return t.toISOString().slice(0, 10);
                })
              }
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setDate(new Date().toISOString().slice(0, 10))}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() =>
                setDate((d) => {
                  const t = new Date(`${d}T12:00:00`);
                  t.setDate(t.getDate() + 1);
                  return t.toISOString().slice(0, 10);
                })
              }
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
            >
              →
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <StaffScheduleMergedDayGrid date={date} bookingModel={bookingModel} enabledModels={enabledModels} />
        </div>
      )}
    </div>
  );
}
