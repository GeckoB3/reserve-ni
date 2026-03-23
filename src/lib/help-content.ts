/**
 * Centralized help content strings for contextual (i) tooltips
 * throughout the dashboard and onboarding wizard.
 */

export const helpContent = {
  services: {
    name: 'The name shown to guests, e.g. "Lunch", "Dinner", "Sunday Brunch".',
    daysOfWeek: 'Select which days this service operates. You can have different services on different days.',
    startTime: 'When this service opens. First available booking slot.',
    endTime: 'When this service closes. Tables should be cleared by this time.',
    lastBookingTime: 'The latest time a guest can book. Usually 1-2 hours before end time to allow for dining.',
    isActive: 'Inactive services are hidden from guests but preserved for your records.',
  },
  capacityRules: {
    maxCoversPerSlot: 'Maximum total guest covers that can overlap at any given time slot. Think of this as your total seating capacity.',
    maxBookingsPerSlot: 'Maximum number of separate bookings per time slot. Prevents too many small tables overwhelming the kitchen.',
    slotInterval: 'How frequently booking times are offered (e.g. every 15 minutes). Smaller intervals = more flexibility for guests.',
    bufferMinutes: 'Extra time added after estimated dining duration for table turnaround (clearing, resetting).',
    dayOverride: 'Override the default rule for a specific day. Useful for quieter midweek vs busy weekends.',
    timeOverride: 'Override the rule for a specific time range. Useful for peak vs off-peak within a service.',
  },
  diningDuration: {
    general: 'How long guests typically dine for each party size. Used to calculate when tables become free for the next booking.',
    partyRange: 'The range of party sizes this duration applies to. Larger groups generally need more time.',
    duration: 'Estimated dining time in minutes. Include time from seating to departure.',
  },
  bookingRules: {
    minAdvance: 'Minimum time before a booking that guests can reserve. Prevents last-second bookings that staff cannot prepare for.',
    maxAdvance: 'How far in advance guests can book. 60 days is standard; longer for popular venues.',
    partySize: 'Min and max party size for online bookings. Larger parties can be redirected to phone.',
    largePartyThreshold: 'Party sizes at or above this number see a "call us" message instead of booking online.',
    depositThreshold: 'Party sizes at or above this number require a deposit to confirm their booking.',
  },
  closures: {
    closed: 'Completely blocks all bookings for the selected date range. Use for holidays, refurbishments, etc.',
    reducedCapacity: 'Allows bookings but with a lower capacity limit. Use for private functions taking partial space.',
    specialEvent: 'Mark dates as special events (shows in guest-facing UI). Can combine with reduced capacity.',
  },
  /** Calendar tab: date-scoped blocks and exceptions (aligned with the availability engine). */
  availabilityCalendar: {
    tabIntro:
      'Pick a day on the calendar to see blocks that touch that date. Create blocks for closures, reduced capacity, or special events. Dots summarise block types; click a listed block to edit it.',
    blockType:
      'Closed blocks all bookings for the scope. Reduced capacity keeps bookings open but lets you cap covers and optionally tighten spacing, party counts per slot, or turnaround. Special event blocks online booking for the scope (use for ticketed nights, buyouts, etc.).',
    serviceScope:
      'All services applies this block to every active service. Choose one service to affect only that sitting (e.g. dinner only).',
    dateRange:
      'First and last day this block applies, inclusive. For one day only, set start and end to the same date.',
    timeWindow:
      'Optional: limit the block to part of the day (e.g. 12:00–15:00). Leave both empty for the full service day on each affected date.',
    maxCoversPerSlot:
      'Maximum total guest covers that can overlap in one time slot during this block. Lower this on quiet-staffed days. If several reduced-capacity blocks overlap, the strictest (lowest) cap wins.',
    maxBookingsPerSlot:
      'Maximum separate bookings allowed in the same time slot during this block. Use to limit kitchen or floor load. If several blocks set this, the strictest (lowest) number wins.',
    slotInterval:
      'How often booking times are offered during this block (e.g. every 30 minutes). A larger interval than your default means fewer, more spaced slots. If several blocks disagree, the widest (strictest) interval wins.',
    bufferMinutes:
      'Extra minutes after dining time before the table counts as free for the next booking. Higher buffer reduces simultaneous covers. If several blocks set this, the strictest (highest) buffer wins.',
    diningDurationOverride:
      'How long each booking is treated as occupying the table for overlap maths during this block. Higher values mean fewer overlapping parties. Leave blank to use your Dining Duration rules for party size.',
    reason: 'Optional note for staff (e.g. "short kitchen", "private area"). Not shown to guests unless your product uses it elsewhere.',
    scheduleExceptions:
      'Change when a service runs on specific dates: fully closed, open on a day it normally does not run (with usual hours), or custom start, end, and last-booking times for a date range.',
    scheduleWhichService: 'Pick which service (sitting) these dates apply to. Other services keep their normal pattern unless you add a separate exception.',
    scheduleClosed:
      'No online bookings for this service on the selected dates. Other services are unaffected unless you add exceptions for them too.',
    scheduleOpensExtraDay:
      'Allows this service on dates that fall on weekdays it does not normally run. Uses the service’s usual start, end, and last-booking times unless you also fill in custom times below.',
    scheduleCustomTimes:
      'Set all three when overriding hours. Last booking is the latest time a guest can start a reservation; end is when the service ends.',
    restrictionExceptions:
      'Temporarily change online booking rules (advance notice, how far ahead guests can book, party size limits) for specific dates. Optional time window limits the override to part of the day.',
    restrictionTimeWindow:
      'If set, the party-size and advance limits below apply only between these times on each day in the range. Leave empty to apply for the whole day.',
  },
  onboarding: {
    venueType: 'Selecting your venue type helps us set smart defaults for capacity, dining durations, and booking rules.',
    openingHours: 'We use your opening hours to automatically create service periods. You can customise these later.',
  },
} as const;
