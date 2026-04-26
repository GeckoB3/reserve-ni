'use client';

import { useCallback, useEffect, useState } from 'react';

interface AuditRow {
  id: string;
  venue_id: string;
  event_type: string;
  created_at: string;
  display_line: string;
}

export default function SuperSupportAuditPage() {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      const res = await fetch(`/api/platform/support-audit?${params.toString()}`, { credentials: 'same-origin' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'Failed to load');
      }
      const data = (await res.json()) as {
        events: AuditRow[];
        totalPages: number;
      };
      setEvents(data.events ?? []);
      setTotalPages(Math.max(1, data.totalPages ?? 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Support audit log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Platform-wide log of support sessions and mutating actions taken while signed in as venue staff.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : (
        <>
          <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            {events.length === 0 ? (
              <li className="text-sm text-slate-500">No audit events yet.</li>
            ) : (
              events.map((ev) => (
                <li key={ev.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-800">
                  <p>{ev.display_line}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Venue {ev.venue_id.slice(0, 8)}… ·{' '}
                    {new Date(ev.created_at).toLocaleString('en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Europe/London',
                    })}
                  </p>
                </li>
              ))
            )}
          </ul>
          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
