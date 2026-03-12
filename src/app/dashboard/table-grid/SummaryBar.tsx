'use client';

interface Props {
  summary: {
    total_covers_booked: number;
    total_covers_capacity: number;
    tables_in_use: number;
    tables_total: number;
    unassigned_count: number;
    combos_in_use?: number;
  };
}

export function SummaryBar({ summary }: Props) {
  const coversPct = summary.total_covers_capacity > 0
    ? Math.round((summary.total_covers_booked / summary.total_covers_capacity) * 100)
    : 0;

  return (
    <div className="flex items-center gap-6 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50">
          <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Covers</p>
          <p className="text-sm font-semibold text-slate-900">
            {summary.total_covers_booked}/{summary.total_covers_capacity}
            <span className="ml-1 text-xs font-normal text-slate-400">({coversPct}%)</span>
          </p>
        </div>
      </div>

      <div className="h-8 w-px bg-slate-200" />

      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50">
          <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Tables</p>
          <p className="text-sm font-semibold text-slate-900">
            {summary.tables_in_use}/{summary.tables_total}
          </p>
        </div>
      </div>

      <div className="h-8 w-px bg-slate-200" />

      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
          summary.unassigned_count > 0 ? 'bg-amber-50' : 'bg-slate-50'
        }`}>
          <svg className={`h-4 w-4 ${summary.unassigned_count > 0 ? 'text-amber-600' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Unassigned</p>
          <p className={`text-sm font-semibold ${summary.unassigned_count > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {summary.unassigned_count}
          </p>
        </div>
      </div>

      <div className="h-8 w-px bg-slate-200" />

      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-50">
          <svg className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5m6.656-1.5 1.5-1.5a4 4 0 015.656 5.656l-3 3a4 4 0 01-5.656 0" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Combos</p>
          <p className="text-sm font-semibold text-slate-900">{summary.combos_in_use ?? 0}</p>
        </div>
      </div>
    </div>
  );
}
