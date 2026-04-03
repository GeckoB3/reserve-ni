import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  groupScheduleBlocksByDate,
  monthGridDateRange,
  filterScheduleBlocksByModel,
  buildMonthDayScheduleCounts,
} from './schedule-blocks-grouping';
import type { ScheduleBlockDTO } from '@/types/schedule-blocks';

describe('groupScheduleBlocksByDate', () => {
  it('groups by date and sorts by start_time', () => {
    const blocks: ScheduleBlockDTO[] = [
      {
        id: 'a',
        kind: 'event_ticket',
        date: '2026-04-10',
        start_time: '14:00',
        end_time: '15:00',
        title: 'Late',
      },
      {
        id: 'b',
        kind: 'class_session',
        date: '2026-04-10',
        start_time: '09:00',
        end_time: '10:00',
        title: 'Early',
      },
      {
        id: 'c',
        kind: 'event_ticket',
        date: '2026-04-11',
        start_time: '12:00',
        end_time: '13:00',
        title: 'Other day',
      },
    ];
    const m = groupScheduleBlocksByDate(blocks);
    expect(m.get('2026-04-10')?.map((x) => x.id)).toEqual(['b', 'a']);
    expect(m.get('2026-04-11')?.map((x) => x.id)).toEqual(['c']);
  });
});

describe('addCalendarDays', () => {
  it('advances local calendar date without UTC drift at noon anchor', () => {
    expect(addCalendarDays('2026-06-15', 1)).toBe('2026-06-16');
    expect(addCalendarDays('2026-06-15', -1)).toBe('2026-06-14');
  });
});

describe('monthGridDateRange', () => {
  it('returns 42-day span aligned to calendar grid', () => {
    const { from, to } = monthGridDateRange('2026-04-15');
    expect(from <= to).toBe(true);
    const fromD = new Date(from + 'T12:00:00');
    expect(fromD.getDay()).toBe(0);
    const days =
      (new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / (86400 * 1000);
    expect(days).toBe(41);
  });
});

describe('filterScheduleBlocksByModel', () => {
  const blocks: ScheduleBlockDTO[] = [
    {
      id: '1',
      kind: 'event_ticket',
      date: '2026-04-01',
      start_time: '10:00',
      end_time: '11:00',
      title: 'E',
    },
    {
      id: '2',
      kind: 'class_session',
      date: '2026-04-01',
      start_time: '12:00',
      end_time: '13:00',
      title: 'C',
    },
  ];
  it('returns empty for appointments-only filter', () => {
    expect(filterScheduleBlocksByModel(blocks, 'appointments')).toEqual([]);
  });
  it('filters by kind', () => {
    expect(filterScheduleBlocksByModel(blocks, 'event_ticket')).toHaveLength(1);
    expect(filterScheduleBlocksByModel(blocks, 'event_ticket')[0]?.id).toBe('1');
  });
});

describe('buildMonthDayScheduleCounts', () => {
  const dates = ['2026-04-01', '2026-04-02'];
  it('counts practitioner grid bookings and blocks by filter', () => {
    const bookings = [
      {
        booking_date: '2026-04-01',
        status: 'Confirmed',
        practitioner_id: 'p1',
        appointment_service_id: 's1',
      },
    ];
    const blocks: ScheduleBlockDTO[] = [
      {
        id: 'bk',
        kind: 'event_ticket',
        date: '2026-04-01',
        start_time: '10:00',
        end_time: '11:00',
        title: 'Ev',
      },
    ];
    const all = buildMonthDayScheduleCounts(bookings, blocks, dates, 'all');
    expect(all['2026-04-01']?.appointments).toBe(1);
    expect(all['2026-04-01']?.event_ticket).toBe(1);
    const apptOnly = buildMonthDayScheduleCounts(bookings, blocks, dates, 'appointments');
    expect(apptOnly['2026-04-01']?.appointments).toBe(1);
    expect(apptOnly['2026-04-01']?.event_ticket).toBe(0);
  });
});
