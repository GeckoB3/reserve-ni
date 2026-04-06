"use client";

import { useCallback } from "react";
import type { CommunicationSettings } from "@/lib/communications/service";
import type { VenueNotificationSettings } from "@/lib/notifications/notification-settings";
import type { CommMessageType } from "@/lib/emails/types";
import {
  CustomMessageBlock,
  FieldBlock,
  ToggleRow,
} from "./communication-settings-shared";

const CONFIRMATION_EMAIL_MAX = 500;

export interface BookingConfirmationSettingsBlockProps {
  isAdmin: boolean;
  commSettings: CommunicationSettings;
  onUpdateComm: (key: keyof CommunicationSettings, value: unknown) => void;
  notificationSettings: VenueNotificationSettings;
  onPatchNotificationSettings: (
    patch: Partial<VenueNotificationSettings>,
  ) => void;
  onPreview?: (
    messageType: CommMessageType,
    customMessage?: string | null,
    displayLabel?: string,
  ) => void;
  /** Shown under "Confirmation email" */
  confirmationEmailHelpText: string;
}

export function BookingConfirmationSettingsBlock({
  isAdmin,
  commSettings,
  onUpdateComm,
  notificationSettings: ns,
  onPatchNotificationSettings,
  onPreview,
  confirmationEmailHelpText,
}: BookingConfirmationSettingsBlockProps) {
  const toggleConfirmationChannel = useCallback(
    (ch: "email" | "sms") => {
      const cur: Array<"email" | "sms"> = [...ns.confirmation_channels];
      const has = cur.includes(ch);
      const next = has ? cur.filter((c) => c !== ch) : [...cur, ch];
      const normalized: Array<"email" | "sms"> = next.length ? next : ["email"];
      onPatchNotificationSettings({ confirmation_channels: normalized });
    },
    [ns.confirmation_channels, onPatchNotificationSettings],
  );

  return (
    <FieldBlock title="Booking confirmation">
      <ToggleRow
        label="Send confirmations"
        checked={ns.confirmation_enabled}
        disabled={!isAdmin}
        onChange={(v) =>
          onPatchNotificationSettings({ confirmation_enabled: v })
        }
      />
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
            checked={ns.confirmation_channels.includes("email")}
            disabled={!isAdmin || !ns.confirmation_enabled}
            onChange={() => toggleConfirmationChannel("email")}
          />
          <span className="text-slate-700">Email</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
            checked={ns.confirmation_channels.includes("sms")}
            disabled={!isAdmin || !ns.confirmation_enabled}
            onChange={() => toggleConfirmationChannel("sms")}
          />
          <span className="text-slate-700">Text</span>
        </label>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-xs font-medium text-slate-700">Confirmation email</p>
        <p className="mt-1 text-xs text-slate-500">
          {confirmationEmailHelpText}
        </p>
        <CustomMessageBlock
          isAdmin={isAdmin}
          value={commSettings.confirmation_email_custom_message ?? ""}
          maxChars={CONFIRMATION_EMAIL_MAX}
          onChange={(v) =>
            onUpdateComm("confirmation_email_custom_message", v || null)
          }
          onPreview={
            onPreview
              ? () =>
                  onPreview(
                    "booking_confirmation_email",
                    commSettings.confirmation_email_custom_message ?? null,
                    "Booking confirmation (email)",
                  )
              : undefined
          }
          previewButtonLabel="Preview email"
        />
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-xs font-medium text-slate-700">
          Confirmation text (SMS)
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Optional short line at the start of confirmation texts.
        </p>
        <CustomMessageBlock
          isAdmin={isAdmin}
          value={ns.confirmation_sms_custom_message ?? ""}
          maxChars={160}
          onChange={(v) =>
            onPatchNotificationSettings({
              confirmation_sms_custom_message: v || null,
            })
          }
          onPreview={
            onPreview
              ? () =>
                  onPreview(
                    "booking_confirmation_sms",
                    ns.confirmation_sms_custom_message ?? null,
                    "Booking confirmation (text)",
                  )
              : undefined
          }
          previewButtonLabel="Preview text"
        />
      </div>
    </FieldBlock>
  );
}
