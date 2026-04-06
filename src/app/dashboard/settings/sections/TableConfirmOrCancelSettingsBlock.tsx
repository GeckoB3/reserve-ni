'use client';

import { useCallback } from 'react';
import type { CommunicationSettings } from '@/lib/communications/service';
import type { VenueNotificationSettings } from '@/lib/notifications/notification-settings';
import type { CommMessageType } from '@/lib/emails/types';
import { CustomMessageBlock, FieldBlock, ToggleRow } from './communication-settings-shared';

export interface TableConfirmOrCancelSettingsBlockProps {
  isAdmin: boolean;
  commSettings: CommunicationSettings;
  onUpdateComm: (key: keyof CommunicationSettings, value: unknown) => void;
  notificationSettings: VenueNotificationSettings;
  onPatchNotificationSettings: (patch: Partial<VenueNotificationSettings>) => void;
  onPreview?: (
    messageType: CommMessageType,
    customMessage?: string | null,
    displayLabel?: string,
  ) => void;
}

/**
 * Table restaurant Confirm or Cancel Reminder — same controls as Appointments (same block name):
 * master send, hours before, email/text channels, optional email line + SMS line with previews.
 */
export function TableConfirmOrCancelSettingsBlock({
  isAdmin,
  commSettings,
  onUpdateComm,
  notificationSettings: ns,
  onPatchNotificationSettings,
  onPreview,
}: TableConfirmOrCancelSettingsBlockProps) {
  const sendEnabled = commSettings.reminder_email_enabled && ns.reminder_1_enabled;

  const setSendEnabled = useCallback(
    (v: boolean) => {
      onPatchNotificationSettings({ reminder_1_enabled: v });
      onUpdateComm('reminder_email_enabled', v);
    },
    [onPatchNotificationSettings, onUpdateComm],
  );

  const onHoursChange = useCallback(
    (raw: number) => {
      const clamped = Math.min(168, Math.max(1, raw));
      onUpdateComm('reminder_hours_before', clamped);
      onPatchNotificationSettings({ reminder_1_hours_before: clamped });
    },
    [onUpdateComm, onPatchNotificationSettings],
  );

  const toggleReminder1Channel = useCallback(
    (ch: 'email' | 'sms') => {
      const cur: Array<'email' | 'sms'> = [...ns.reminder_1_channels];
      const has = cur.includes(ch);
      const next = has ? cur.filter((c) => c !== ch) : [...cur, ch];
      const normalized: Array<'email' | 'sms'> = next.length ? next : ['email'];
      onPatchNotificationSettings({ reminder_1_channels: normalized });
    },
    [ns.reminder_1_channels, onPatchNotificationSettings],
  );

  const hoursValue = commSettings.reminder_hours_before ?? ns.reminder_1_hours_before ?? 56;

  return (
    <FieldBlock title="Confirm or Cancel Reminder">
      <ToggleRow label="Send Confirm or Cancel Reminder" checked={sendEnabled} disabled={!isAdmin} onChange={setSendEnabled} />
      <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span className="text-slate-600">Hours before the booking</span>
        <input
          type="number"
          min={1}
          max={168}
          disabled={!isAdmin}
          value={hoursValue}
          onChange={(e) => onHoursChange(parseInt(e.target.value, 10) || 56)}
          className="w-16 rounded-md border border-slate-200 px-2 py-1 text-center text-sm"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
            checked={ns.reminder_1_channels.includes('email')}
            disabled={!isAdmin || !sendEnabled}
            onChange={() => toggleReminder1Channel('email')}
          />
          <span className="text-slate-700">Email</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
            checked={ns.reminder_1_channels.includes('sms')}
            disabled={!isAdmin || !sendEnabled}
            onChange={() => toggleReminder1Channel('sms')}
          />
          <span className="text-slate-700">Text</span>
        </label>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-xs font-medium text-slate-700">Confirm or Cancel Reminder (email)</p>
        <p className="mt-1 text-xs text-slate-500">
          Optional line added to the standard email (preview uses a sample table reservation). The email includes confirm,
          cancel, and manage-booking links.
        </p>
        <CustomMessageBlock
          isAdmin={isAdmin}
          value={commSettings.reminder_email_custom_message ?? ''}
          maxChars={500}
          onChange={(v) => onUpdateComm('reminder_email_custom_message', v || null)}
          onPreview={
            onPreview
              ? () =>
                  onPreview(
                    'reminder_56h_email',
                    commSettings.reminder_email_custom_message ?? null,
                    'Confirm or Cancel Reminder (email)',
                  )
              : undefined
          }
          previewButtonLabel="Preview email"
        />
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-xs font-medium text-slate-700">Reminder texts (SMS)</p>
        <p className="mt-1 text-xs text-slate-500">
          Optional line for Confirm or Cancel Reminder texts only (not the separate Day-of Reminder step below). If this
          field is blank, the optional line from the day-of email template is used when set—same as live sends.
        </p>
        <CustomMessageBlock
          isAdmin={isAdmin}
          value={commSettings.confirm_cancel_reminder_sms_custom_message ?? ''}
          maxChars={500}
          onChange={(v) => onUpdateComm('confirm_cancel_reminder_sms_custom_message', v || null)}
          onPreview={
            onPreview
              ? () =>
                  onPreview(
                    'reminder_1_sms',
                    commSettings.confirm_cancel_reminder_sms_custom_message ??
                      commSettings.day_of_reminder_custom_message ??
                      null,
                    'Confirm or Cancel Reminder (text)',
                  )
              : undefined
          }
          previewButtonLabel="Preview text"
        />
      </div>
    </FieldBlock>
  );
}
