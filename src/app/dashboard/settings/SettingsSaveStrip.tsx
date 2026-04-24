'use client';

import { useSettingsSave } from './SettingsSaveContext';
import { Pill } from '@/components/ui/dashboard/Pill';

export function SettingsSaveStrip() {
  const { banner } = useSettingsSave();
  if (banner.status === 'idle' && !banner.message) return null;

  const tone =
    banner.status === 'error'
      ? 'border-red-200/90 bg-red-50/90 text-red-950'
      : banner.status === 'saving'
        ? 'border-amber-200/90 bg-amber-50/80 text-amber-950'
        : banner.status === 'saved'
          ? 'border-emerald-200/90 bg-emerald-50/80 text-emerald-950'
          : 'border-slate-200/90 bg-slate-50/90 text-slate-800';

  return (
    <div
      className={`flex min-h-10 flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${tone}`}
      role="status"
      aria-live="polite"
    >
      {banner.status === 'saving' ? (
        <>
          <span className="inline-flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-600" />
          <span className="font-medium">Saving changes…</span>
        </>
      ) : null}
      {banner.status === 'saved' ? (
        <>
          <Pill variant="success" size="sm" dot>
            Saved
          </Pill>
          <span>{banner.message ?? 'Your settings were updated.'}</span>
        </>
      ) : null}
      {banner.status === 'error' ? (
        <>
          <Pill variant="danger" size="sm">
            Error
          </Pill>
          <span>{banner.message ?? 'Something went wrong. Try again.'}</span>
        </>
      ) : null}
      {banner.status === 'idle' && banner.message ? <span>{banner.message}</span> : null}
    </div>
  );
}
