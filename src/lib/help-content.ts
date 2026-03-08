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
  onboarding: {
    venueType: 'Selecting your venue type helps us set smart defaults for capacity, dining durations, and booking rules.',
    openingHours: 'We use your opening hours to automatically create service periods. You can customise these later.',
  },
} as const;
