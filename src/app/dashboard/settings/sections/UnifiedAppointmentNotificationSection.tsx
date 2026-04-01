'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CommunicationSettings } from '@/lib/communications/service';
import type { VenueNotificationSettings } from '@/lib/notifications/notification-settings';
import type { CommMessageType } from '@/lib/emails/types';

interface UnifiedAppointmentNotificationSectionProps {
  isAdmin: boolean;
  commSettings: CommunicationSettings;
  onUpdateComm: (key: keyof CommunicationSettings, value: unknown) => void;
  onNotificationSaveStatus?: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
  onPreview?: (messageType: CommMessageType, customMessage?: string | null) => void;
}

export function UnifiedAppointmentNotificationSection({
  isAdmin,
  commSettings,
  onUpdateComm,
  onNotificationSaveStatus,
  onPreview,
}: UnifiedAppointmentNotificationSectionProps) {
  const [ns, setNs] = useState<VenueNotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitSave = useCallback(
    (status: 'idle' | 'saving' | 'saved' | 'error') => {
      onNotificationSaveStatus?.(status);
    },
    [onNotificationSaveStatus],
  );

  useEffect(() => {
    fetch('/api/venue/notification-settings')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: VenueNotificationSettings) => setNs(data))
      .catch((err) => {
        console.error('Failed to load notification settings:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const persistNs = useCallback(
    (next: VenueNotificationSettings) => {
      if (!isAdmin) return;
      emitSave('saving');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch('/api/venue/notification-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as VenueNotificationSettings;
          setNs(data);
          emitSave('saved');
          savedTimerRef.current = setTimeout(() => emitSave('idle'), 2000);
        } catch {
          emitSave('error');
        }
      }, 400);
    },
    [isAdmin, emitSave],
  );

  const patchNs = useCallback(
    (partial: Partial<VenueNotificationSettings>) => {
      setNs((prev) => {
        if (!prev) return prev;
        const merged = { ...prev, ...partial };
        // Defer: persistNs updates the parent save indicator — must not run inside this setState updater.
        queueMicrotask(() => {
          persistNs(merged);
        });
        return merged;
      });
    },
    [persistNs],
  );

  const toggleChannel = useCallback(
    (key: 'confirmation_channels' | 'reminder_1_channels', ch: 'email' | 'sms') => {
      setNs((prev) => {
        if (!prev) return prev;
        const cur = [...prev[key]];
        const has = cur.includes(ch);
        const next = has ? cur.filter((c) => c !== ch) : [...cur, ch];
        const normalized = next.length ? next : ['email'];
        const merged = { ...prev, [key]: normalized };
        queueMicrotask(() => {
          persistNs(merged);
        });
        return merged;
      });
    },
    [persistNs],
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          Loading your notification settings…
        </div>
      </div>
    );
  }

  if (!ns) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-red-600">We couldn&apos;t load these settings. Please refresh the page or try again shortly.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-5 p-5 sm:p-6">
        <p className="text-sm text-slate-600">
          SMS needs a mobile number on the booking. Text messages use your plan&apos;s guest SMS allowance.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:gap-5">
          <FieldBlock title="Booking confirmation">
            <ToggleRow
              label="Send confirmations"
              checked={ns.confirmation_enabled}
              disabled={!isAdmin}
              onChange={(v) => patchNs({ confirmation_enabled: v })}
            />
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={ns.confirmation_channels.includes('email')}
                  disabled={!isAdmin || !ns.confirmation_enabled}
                  onChange={() => toggleChannel('confirmation_channels', 'email')}
                />
                <span className="text-slate-700">Email</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={ns.confirmation_channels.includes('sms')}
                  disabled={!isAdmin || !ns.confirmation_enabled}
                  onChange={() => toggleChannel('confirmation_channels', 'sms')}
                />
                <span className="text-slate-700">Text</span>
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Add an optional short line at the start of confirmation texts. The main confirmation email is edited under{' '}
              <span className="font-medium text-slate-600">Wording for each message</span> → Booking confirmation.
            </p>
            <label className="mt-2 block text-xs font-medium text-slate-700">Optional line on confirmation texts</label>
            <textarea
              value={ns.confirmation_sms_custom_message ?? ''}
              disabled={!isAdmin}
              rows={2}
              maxLength={160}
              onChange={(e) => patchNs({ confirmation_sms_custom_message: e.target.value || null })}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 disabled:bg-slate-50"
              placeholder="Short greeting or thank-you before the booking details"
            />
            {onPreview && (
              <PreviewButton
                isAdmin={isAdmin}
                label="Preview text"
                onClick={() => onPreview('booking_confirmation_sms', ns.confirmation_sms_custom_message ?? null)}
              />
            )}
          </FieldBlock>

          <FieldBlock title="First reminder">
            <ToggleRow
              label="Send first reminder"
              checked={ns.reminder_1_enabled}
              disabled={!isAdmin}
              onChange={(v) => patchNs({ reminder_1_enabled: v })}
            />
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="text-slate-600">Hours before</span>
              <input
                type="number"
                min={1}
                max={168}
                disabled={!isAdmin}
                value={ns.reminder_1_hours_before}
                onChange={(e) =>
                  patchNs({ reminder_1_hours_before: Math.min(168, Math.max(1, parseInt(e.target.value, 10) || 24)) })
                }
                className="w-16 rounded-md border border-slate-200 px-2 py-1 text-center text-sm"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={ns.reminder_1_channels.includes('email')}
                  disabled={!isAdmin || !ns.reminder_1_enabled}
                  onChange={() => toggleChannel('reminder_1_channels', 'email')}
                />
                <span>Email</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={ns.reminder_1_channels.includes('sms')}
                  disabled={!isAdmin || !ns.reminder_1_enabled}
                  onChange={() => toggleChannel('reminder_1_channels', 'sms')}
                />
                <span>Text</span>
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">Optional lines for this reminder are in Extra wording below.</p>
          </FieldBlock>

          <FieldBlock title="Second reminder">
            <ToggleRow
              label="Send second reminder"
              checked={ns.reminder_2_enabled}
              disabled={!isAdmin}
              onChange={(v) => patchNs({ reminder_2_enabled: v })}
            />
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="text-slate-600">Hours before</span>
              <input
                type="number"
                min={1}
                max={48}
                disabled={!isAdmin}
                value={ns.reminder_2_hours_before}
                onChange={(e) =>
                  patchNs({ reminder_2_hours_before: Math.min(48, Math.max(1, parseInt(e.target.value, 10) || 2)) })
                }
                className="w-16 rounded-md border border-slate-200 px-2 py-1 text-center text-sm"
              />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Sent as a text only. Uses the same optional wording as your first reminder (Extra wording → Reminder texts).
            </p>
          </FieldBlock>

          <FieldBlock title="Thank-you after the visit">
            <ToggleRow
              label="Send thank-you email"
              checked={ns.post_visit_enabled}
              disabled={!isAdmin}
              onChange={(v) => patchNs({ post_visit_enabled: v })}
            />
            <p className="mt-3 text-xs text-slate-500 leading-relaxed">
              Usually a few hours after the appointment ends, or the next morning if the appointment finishes later in the
              day.
            </p>
          </FieldBlock>
        </div>
      </div>

      <section className="p-5 sm:p-6" aria-labelledby="booking-change-emails-heading">
        <h4 id="booking-change-emails-heading" className="text-sm font-semibold text-slate-900">
          When a booking changes
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          Turn off any notice you do not want sent. Cancellations are always by email. You can still edit the exact wording
          under Wording for each message.
        </p>
        <div className="mt-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-4">
          <ToggleRow
            label="Date or time changed"
            checked={ns.reschedule_notification_enabled}
            disabled={!isAdmin}
            onChange={(v) => patchNs({ reschedule_notification_enabled: v })}
          />
          <ToggleRow
            label="Booking cancelled"
            checked={ns.cancellation_notification_enabled}
            disabled={!isAdmin}
            onChange={(v) => patchNs({ cancellation_notification_enabled: v })}
          />
          <ToggleRow
            label="Marked as no-show"
            checked={ns.no_show_notification_enabled}
            disabled={!isAdmin}
            onChange={(v) => patchNs({ no_show_notification_enabled: v })}
          />
        </div>
      </section>

      <section className="p-5 sm:p-6" aria-labelledby="custom-reminder-text-heading">
        <h4 id="custom-reminder-text-heading" className="text-sm font-semibold text-slate-900">
          Extra wording (optional)
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          Added on top of the standard text. Leave blank to keep the default messages.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-slate-700">First reminder — email</label>
              {onPreview && (
                <PreviewButton
                  isAdmin={isAdmin}
                  label="Preview"
                  onClick={() => onPreview('reminder_1_email', commSettings.reminder_email_custom_message ?? null)}
                />
              )}
            </div>
            <textarea
              value={commSettings.reminder_email_custom_message ?? ''}
              disabled={!isAdmin}
              rows={2}
              maxLength={500}
              onChange={(e) => onUpdateComm('reminder_email_custom_message', e.target.value || null)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-slate-700">Reminder texts — first and second</label>
              {onPreview && (
                <PreviewButton
                  isAdmin={isAdmin}
                  label="Preview"
                  onClick={() => onPreview('reminder_1_sms', commSettings.day_of_reminder_custom_message ?? null)}
                />
              )}
            </div>
            <textarea
              value={commSettings.day_of_reminder_custom_message ?? ''}
              disabled={!isAdmin}
              rows={2}
              maxLength={500}
              onChange={(e) => onUpdateComm('day_of_reminder_custom_message', e.target.value || null)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-slate-700">Thank-you email after the visit</label>
              {onPreview && (
                <PreviewButton
                  isAdmin={isAdmin}
                  label="Preview"
                  onClick={() => onPreview('unified_post_visit_email', commSettings.post_visit_email_custom_message ?? null)}
                />
              )}
            </div>
            <textarea
              value={commSettings.post_visit_email_custom_message ?? ''}
              disabled={!isAdmin}
              rows={2}
              maxLength={500}
              onChange={(e) => onUpdateComm('post_visit_email_custom_message', e.target.value || null)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function PreviewButton({
  isAdmin,
  label,
  onClick,
}: {
  isAdmin: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!isAdmin}
      onClick={onClick}
      className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function FieldBlock({
  title,
  titleId,
  children,
}: {
  title: string;
  titleId?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
      <h4 id={titleId} className="text-sm font-semibold text-slate-900">
        {title}
      </h4>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
          checked ? 'bg-brand-600' : 'bg-slate-200'
        } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
