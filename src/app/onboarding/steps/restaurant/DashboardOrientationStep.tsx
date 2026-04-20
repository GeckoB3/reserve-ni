'use client';

interface Props {
  onDone: () => Promise<void>;
  tableManagementEnabled: boolean;
}

interface DashboardCard {
  title: string;
  href: string;
  description: string;
  detail: string;
  active: boolean;
  badge?: string;
}

export function DashboardOrientationStep({ onDone, tableManagementEnabled }: Props) {
  const cards: DashboardCard[] = [
    {
      title: 'Day Sheet',
      href: '/dashboard/day-sheet',
      description: 'Chronological list of all reservations for the day.',
      detail: tableManagementEnabled
        ? 'Available in Simple covers mode. In Advanced table management, the Floor Plan is your live view.'
        : 'Your main operations view: reservations in time order with guest details, party size, dietary notes, and check-in status.',
      active: !tableManagementEnabled,
      badge: !tableManagementEnabled ? 'Your main view' : undefined,
    },
    {
      title: 'Bookings',
      href: '/dashboard/bookings',
      description: 'Full booking management: search, filter, create, and edit reservations.',
      detail: 'Available in all modes. Use this to find any booking, add walk-ins, or edit existing reservations. Your staff can also create bookings from here.',
      active: true,
      badge: 'All modes',
    },
    {
      title: 'Table Grid',
      href: '/dashboard/table-grid',
      description: 'Per-table timeline showing which tables are occupied across the day.',
      detail: tableManagementEnabled
        ? 'See every table as a lane on a timeline. Spot gaps, move bookings between tables, and manage the full day at a glance.'
        : 'Requires Advanced table management. Switch mode from Availability → Table when you are ready.',
      active: tableManagementEnabled,
      badge: tableManagementEnabled ? 'Advanced mode' : undefined,
    },
    {
      title: 'Floor Plan',
      href: '/dashboard/floor-plan',
      description: 'Visual room layout with live table status during service.',
      detail: tableManagementEnabled
        ? 'Your live operations view in Advanced mode: see table status at a glance, assign bookings, mark tables as seated or cleared, and manage the room in real time.'
        : 'Requires Advanced table management. Switch mode from Availability → Table when you are ready.',
      active: tableManagementEnabled,
      badge: tableManagementEnabled ? 'Your main view' : undefined,
    },
  ];

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Your dashboard</h2>
      <p className="mb-2 text-sm text-slate-500">
        Here&apos;s what each view does, and when to use it based on your{' '}
        <strong>{tableManagementEnabled ? 'Advanced table management' : 'Simple covers'}</strong> mode.
      </p>

      {tableManagementEnabled && (
        <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50/60 p-3 text-sm text-brand-900">
          You&apos;re in <strong>Advanced table management</strong> mode. Your primary live view is the{' '}
          <strong>Floor Plan</strong>. The <strong>Table Grid</strong> gives you a full-day timeline.
        </div>
      )}
      {!tableManagementEnabled && (
        <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50/60 p-3 text-sm text-brand-900">
          You&apos;re in <strong>Simple covers mode</strong>. Your primary live view is the{' '}
          <strong>Day Sheet</strong>. You can switch to Advanced table management any time from{' '}
          Availability &rarr; Table.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <div
            key={card.title}
            className={`rounded-xl border p-4 ${
              card.active
                ? 'border-slate-200 bg-white shadow-sm'
                : 'border-slate-100 bg-slate-50/60 opacity-60'
            }`}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900">{card.title}</p>
              {card.badge && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  card.active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {card.badge}
                </span>
              )}
            </div>
            <p className="mb-2 text-sm font-medium text-slate-700">{card.description}</p>
            <p className="text-xs text-slate-500">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
