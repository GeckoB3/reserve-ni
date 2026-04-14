'use client';

interface Props {
  onDone: () => Promise<void>;
}

export function TableSetupStep({ onDone }: Props) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Set up your tables</h2>
      <p className="mb-6 text-sm text-slate-500">
        You&apos;ve chosen Advanced table management. To get the most from the Table Grid and Floor Plan, add your
        tables and arrange your floor plan. You can do this now or come back to it later.
      </p>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5">
          <p className="mb-2 text-sm font-semibold text-slate-800">What you&apos;ll set up</p>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-brand-100 text-center text-xs font-bold leading-5 text-brand-700">1</span>
              <span><strong>Add tables</strong> — give each table a name or number and set its minimum and maximum covers.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-brand-100 text-center text-xs font-bold leading-5 text-brand-700">2</span>
              <span><strong>Arrange the floor plan</strong> — drag tables onto a visual layout of your room.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-brand-100 text-center text-xs font-bold leading-5 text-brand-700">3</span>
              <span><strong>Set combinations</strong> (optional) — define which tables can be pushed together for larger parties.</span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
          <p className="font-medium">You can skip this for now</p>
          <p className="mt-1 text-amber-800/90">
            Your dashboard will work straight away. Set up your tables whenever you&apos;re ready from{' '}
            <strong>Dashboard → Floor Plan</strong>. Bookings can be assigned to tables once your floor plan is
            configured.
          </p>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Skip for now
        </button>
        <a
          href="/dashboard/floor-plan"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Set up my tables ↗
        </a>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        The floor plan editor opens in a new tab. Come back here to continue onboarding when you&apos;re ready.
      </p>
    </div>
  );
}
