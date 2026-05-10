export const CONTACTS_SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'last_visit_desc', label: 'Last visit (newest)' },
  { value: 'last_visit_asc', label: 'Last visit (oldest)' },
  { value: 'name_asc', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'visit_count_desc', label: 'Most visits' },
  { value: 'paid_deposit_desc', label: 'Paid deposits (high → low)' },
  { value: 'created_desc', label: 'Recently added' },
];

/** Directory segment filters (see `ContactsSegment` in guest-contacts-list). */
export const CONTACTS_SEGMENT_OPTIONS: Array<{ value: string; label: string; description?: string }> = [
  { value: 'all', label: 'All contacts' },
  {
    value: 'new',
    label: 'New contacts',
    description: 'Added within the date range (defaults to this calendar month).',
  },
  {
    value: 'upcoming',
    label: 'Upcoming booking',
    description: 'Has a booked appointment with date in the range (defaults from today).',
  },
  {
    value: 'visit',
    label: 'Last visit date',
    description: 'Filter by when they last visited (last visit date in range).',
  },
  {
    value: 'marketing',
    label: 'Marketing consent',
    description: 'Subscribed or not; optional consent-recorded date range.',
  },
  {
    value: 'last_staff',
    label: 'Staff — last appointment',
    description: 'Latest non-cancelled booking matches this column; optional date range on that booking.',
  },
  {
    value: 'last_service',
    label: 'Service — last booked',
    description: 'Latest non-cancelled booking used this service; optional date range on that booking.',
  },
  { value: 'vip', label: 'VIP only' },
];

/** @deprecated Legacy lifecycle URL keys; prefer `segment`. */
export const CONTACTS_LIFECYCLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All contacts' },
  { value: 'upcoming', label: 'Has upcoming booking' },
  { value: 'lapsed', label: 'Lapsed (90+ days since last visit)' },
  { value: 'new_this_month', label: 'New this month' },
  { value: 'vip', label: 'VIP only' },
];
