'use client';

import { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '@/components/ui/dashboard/SectionCard';

interface ActivityRow {
  id: string;
  created_at: string;
  event_type: string;
  display_line: string;
}

export function SupportAccessSection() {
  const [events, setEvents] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/support-activity', { credentials: 'same-origin' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'Failed to load');
      }
      const data = (await res.json()) as { events: ActivityRow[] };
      setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SectionCard elevated>
      <SectionCard.Header
        eyebrow="Security & transparency"
        title="Reserve NI support access"
        description="When you contact support, authorised staff may sign in to your venue dashboard to investigate. Every session is time-limited, logged, and listed below."
      />
      <SectionCard.Body className="space-y-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading activity…</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-600">No support access activity recorded for this venue yet.</p>
        ) : (
          <ul className="max-h-[480px] space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="rounded-md border border-slate-100 bg-white px-3 py-2 text-slate-800 shadow-sm"
              >
                <p className="leading-relaxed">{ev.display_line}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(ev.created_at).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Europe/London',
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </SectionCard.Body>
    </SectionCard>
  );
}
