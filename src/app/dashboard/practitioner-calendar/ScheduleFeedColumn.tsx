'use client';

import Link from 'next/link';
import type { ScheduleBlockDTO } from '@/types/schedule-blocks';

const SLOT_HEIGHT = 48;
const SLOT_MINUTES = 15;

function timeToMinutes(t: string): number {
  const [hh, mm] = t.slice(0, 5).split(':').map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

interface ScheduleFeedColumnProps {
  label: string;
  date: string;
  blocks: ScheduleBlockDTO[];
  startHour: number;
  endHour: number;
  onBookingClick: (bookingId: string) => void;
}

/**
 * Single lane column (Events / Classes / Resources) aligned to the practitioner day grid.
 */
export function ScheduleFeedColumn({
  label,
  date,
  blocks,
  startHour,
  endHour,
  onBookingClick,
}: ScheduleFeedColumnProps) {
  const totalSlots = ((endHour - startHour) * 60) / SLOT_MINUTES;

  function slotTop(time: string): number {
    const mins = timeToMinutes(time);
    const offset = mins - startHour * 60;
    return (offset / SLOT_MINUTES) * SLOT_HEIGHT;
  }

  function slotHeight(start: string, end: string): number {
    const d = Math.max(timeToMinutes(end) - timeToMinutes(start), SLOT_MINUTES);
    return Math.max((d / SLOT_MINUTES) * SLOT_HEIGHT, SLOT_HEIGHT * 0.75);
  }

  const dayBlocks = blocks.filter((b) => b.date === date);

  return (
    <div className="min-w-[180px] flex-1 border-r border-slate-100 last:border-r-0">
      <div className="sticky top-0 z-10 flex h-10 items-center justify-center border-b border-slate-100 bg-white px-3 py-2">
        <span className="truncate text-center text-sm font-semibold text-slate-900">{label}</span>
      </div>
      <div className="relative" style={{ height: totalSlots * SLOT_HEIGHT }}>
        {dayBlocks.map((b) => {
          const top = slotTop(b.start_time);
          const height = slotHeight(b.start_time, b.end_time);
          const accent = b.accent_colour ?? '#64748B';
          const clickable = Boolean(b.booking_id);
          const body = (
            <div
              className={`flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-left shadow-sm ${
                clickable ? 'cursor-pointer hover:bg-slate-50' : ''
              }`}
              style={{ borderLeftWidth: 3, borderLeftColor: accent }}
            >
              <span className="truncate text-xs font-semibold text-slate-900">{b.title}</span>
              {b.subtitle ? <span className="truncate text-[10px] text-slate-500">{b.subtitle}</span> : null}
              <span className="text-[10px] text-slate-400">
                {b.start_time} – {b.end_time}
              </span>
            </div>
          );

          return (
            <div key={b.id} className="absolute left-1 right-1 z-[12]" style={{ top, height }}>
              {clickable && b.booking_id ? (
                <button type="button" onClick={() => onBookingClick(b.booking_id!)} className="h-full w-full text-left">
                  {body}
                </button>
              ) : b.kind === 'event_ticket' && b.experience_event_id ? (
                <Link href="/dashboard/event-manager" className="block h-full">
                  {body}
                </Link>
              ) : b.kind === 'class_session' && b.class_instance_id ? (
                <Link href="/dashboard/class-timetable" className="block h-full">
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
