'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  expiresAtIso: string;
}

export function SupportSessionControls({ expiresAtIso }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endSession = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/support-sessions/current', { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'Could not end session');
      }
      router.push('/super');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }, [router]);

  const extendSession = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/support-sessions/current', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extend' }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'Could not extend session');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }, [router]);

  const expiresLabel = (() => {
    try {
      return new Date(expiresAtIso).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/London',
      });
    } catch {
      return expiresAtIso;
    }
  })();

  return (
    <div className="border-b border-slate-800 bg-slate-950 px-3 py-2 lg:pl-[calc(14rem+0.75rem)]">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">
          Support session · expires {expiresLabel} ·{' '}
          <span className="font-semibold text-slate-200">full venue access</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {error ? <span className="text-xs text-rose-400">{error}</span> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void extendSession()}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Extend 60 min
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void endSession()}
            className="rounded-lg border border-rose-700/80 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-900/50 disabled:opacity-50"
          >
            End support session
          </button>
        </div>
      </div>
    </div>
  );
}
