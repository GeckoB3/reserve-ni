export const TABLE_SERVICE_STATUSES = [
  'available',
  'reserved',
  'seated',
  'starters',
  'mains',
  'dessert',
  'bill',
  'paid',
  'bussing',
] as const;

export type TableServiceStatus = (typeof TABLE_SERVICE_STATUSES)[number];

export const TABLE_STATUS_LABELS: Record<TableServiceStatus, string> = {
  available: 'Available',
  reserved: 'Booked',
  seated: 'Seated',
  starters: 'In Service (Starters)',
  mains: 'In Service (Mains)',
  dessert: 'In Service (Dessert)',
  bill: 'Bill Requested',
  paid: 'Payment Complete',
  bussing: 'Held / Resetting',
};

export const TABLE_STATUS_SEQUENCE: Record<TableServiceStatus, TableServiceStatus> = {
  available: 'reserved',
  reserved: 'seated',
  seated: 'starters',
  starters: 'mains',
  mains: 'dessert',
  dessert: 'bill',
  bill: 'paid',
  paid: 'bussing',
  bussing: 'available',
};

/**
 * Statuses that represent active/live bookings for table availability checks.
 * IMPORTANT: These values MUST exist in the booking_status PostgreSQL enum.
 * 'Arrived' is NOT in the database enum - do NOT add it here.
 */
export const BOOKING_ACTIVE_STATUSES = ['Pending', 'Confirmed', 'Seated'] as const;

export const BOOKING_MUTABLE_STATUSES = [
  'Pending',
  'Confirmed',
  'Cancelled',
  'No-Show',
  'Completed',
  'Seated',
] as const;
