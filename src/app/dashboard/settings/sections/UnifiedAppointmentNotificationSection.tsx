"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommunicationSettings } from "@/lib/communications/service";
import type { VenueNotificationSettings } from "@/lib/notifications/notification-settings";
import type { CommMessageType } from "@/lib/emails/types";
import { BookingConfirmationSettingsBlock } from "./BookingConfirmationSettingsBlock";
import {
  CustomMessageBlock,
  FieldBlock,
  ToggleRow,
} from "./communication-settings-shared";

interface UnifiedAppointmentNotificationSectionProps {
  isAdmin: boolean;
  commSettings: CommunicationSettings;
  onUpdateComm: (key: keyof CommunicationSettings, value: unknown) => void;
  onNotificationSaveStatus?: (
    status: "idle" | "saving" | "saved" | "error",
  ) => void;
  onPreview?: (
    messageType: CommMessageType,
    customMessage?: string | null,
    displayLabel?: string,
  ) => void;
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
    (status: "idle" | "saving" | "saved" | "error") => {
      onNotificationSaveStatus?.(status);
    },
    [onNotificationSaveStatus],
  );

  useEffect(() => {
    fetch("/api/venue/notification-settings")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: VenueNotificationSettings) => setNs(data))
      .catch((err) => {
        console.error("Failed to load notification settings:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  const persistNs = useCallback(
    (next: VenueNotificationSettings) => {
      if (!isAdmin) return;
      emitSave("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/venue/notification-settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as VenueNotificationSettings;
          setNs(data);
          emitSave("saved");
          savedTimerRef.current = setTimeout(() => emitSave("idle"), 2000);
        } catch {
          emitSave("error");
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
        // Defer: persistNs updates the parent save indicator; must not run inside this setState updater.
        queueMicrotask(() => {
          persistNs(merged);
        });
        return merged;
      });
    },
    [persistNs],
  );

  const toggleChannel = useCallback(
    (
      key: "reminder_1_channels" | "reminder_2_channels",
      ch: "email" | "sms",
    ) => {
      setNs((prev) => {
        if (!prev) return prev;
        const cur: Array<"email" | "sms"> = [...prev[key]];
        const has = cur.includes(ch);
        const next = has ? cur.filter((c) => c !== ch) : [...cur, ch];
        const emptyFallback: Array<"email" | "sms"> =
          key === "reminder_2_channels" ? ["sms"] : ["email"];
        const normalized: Array<"email" | "sms"> = next.length
          ? next
          : emptyFallback;
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
      <div
        className="h-40 animate-pulse rounded-xl bg-slate-100"
        aria-hidden="true"
      />
    );
  }

  if (!ns) {
    return (
      <p className="text-sm text-red-600">
        Couldn&apos;t load notification settings. Refresh the page or try again
        shortly.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-4 p-5 sm:p-6">
        <BookingConfirmationSettingsBlock
          isAdmin={isAdmin}
          commSettings={commSettings}
          onUpdateComm={onUpdateComm}
          notificationSettings={ns}
          onPatchNotificationSettings={patchNs}
          onPreview={onPreview}
          confirmationEmailHelpText="Optional extra paragraph added to the standard confirmation email (preview uses sample appointment details)."
        />

        <FieldBlock title="Confirm or Cancel Reminder">
          <ToggleRow
            label="Send Confirm or Cancel Reminder"
            checked={ns.reminder_1_enabled}
            disabled={!isAdmin}
            onChange={(v) => patchNs({ reminder_1_enabled: v })}
          />
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <span className="text-slate-600">Hours before the booking</span>
            <input
              type="number"
              min={1}
              max={168}
              disabled={!isAdmin}
              value={ns.reminder_1_hours_before}
              onChange={(e) =>
                patchNs({
                  reminder_1_hours_before: Math.min(
                    168,
                    Math.max(1, parseInt(e.target.value, 10) || 24),
                  ),
                })
              }
              className="w-16 rounded-md border border-slate-200 px-2 py-1 text-center text-sm"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={ns.reminder_1_channels.includes("email")}
                disabled={!isAdmin || !ns.reminder_1_enabled}
                onChange={() => toggleChannel("reminder_1_channels", "email")}
              />
              <span className="text-slate-700">Email</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={ns.reminder_1_channels.includes("sms")}
                disabled={!isAdmin || !ns.reminder_1_enabled}
                onChange={() => toggleChannel("reminder_1_channels", "sms")}
              />
              <span className="text-slate-700">Text</span>
            </label>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-700">
              Confirm or Cancel Reminder (email)
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Optional line added to the standard reminder email.
            </p>
            <CustomMessageBlock
              isAdmin={isAdmin}
              value={commSettings.reminder_email_custom_message ?? ""}
              maxChars={500}
              onChange={(v) =>
                onUpdateComm("reminder_email_custom_message", v || null)
              }
              onPreview={
                onPreview
                  ? () =>
                      onPreview(
                        "reminder_1_email",
                        commSettings.reminder_email_custom_message ?? null,
                        "Confirm or Cancel Reminder (email)",
                      )
                  : undefined
              }
              previewButtonLabel="Preview email"
            />
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-700">
              Reminder texts (SMS)
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Optional line for Confirm or Cancel Reminder texts only (not the
              Day-of Reminder step below). If this field is blank, the optional
              line from the day-of email template is used when set—same as live
              sends.
            </p>
            <CustomMessageBlock
              isAdmin={isAdmin}
              value={
                commSettings.confirm_cancel_reminder_sms_custom_message ?? ""
              }
              maxChars={500}
              onChange={(v) =>
                onUpdateComm(
                  "confirm_cancel_reminder_sms_custom_message",
                  v || null,
                )
              }
              onPreview={
                onPreview
                  ? () =>
                      onPreview(
                        "reminder_1_sms",
                        commSettings.confirm_cancel_reminder_sms_custom_message ??
                          commSettings.day_of_reminder_custom_message ??
                          null,
                        "Confirm or Cancel Reminder (text)",
                      )
                  : undefined
              }
              previewButtonLabel="Preview text"
            />
          </div>
        </FieldBlock>

        <FieldBlock title="Day-of Reminder">
          <ToggleRow
            label="Send Day-of Reminder"
            checked={ns.reminder_2_enabled}
            disabled={!isAdmin}
            onChange={(v) => patchNs({ reminder_2_enabled: v })}
          />
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <span className="text-slate-600">Hours before the booking</span>
            <input
              type="number"
              min={1}
              max={48}
              disabled={!isAdmin || !ns.reminder_2_enabled}
              value={ns.reminder_2_hours_before}
              onChange={(e) =>
                patchNs({
                  reminder_2_hours_before: Math.min(
                    48,
                    Math.max(1, parseInt(e.target.value, 10) || 2),
                  ),
                })
              }
              className="w-16 rounded-md border border-slate-200 px-2 py-1 text-center text-sm"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={ns.reminder_2_channels.includes("email")}
                disabled={!isAdmin || !ns.reminder_2_enabled}
                onChange={() => toggleChannel("reminder_2_channels", "email")}
              />
              <span className="text-slate-700">Email</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={ns.reminder_2_channels.includes("sms")}
                disabled={!isAdmin || !ns.reminder_2_enabled}
                onChange={() => toggleChannel("reminder_2_channels", "sms")}
              />
              <span className="text-slate-700">Text</span>
            </label>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-700">
              Day-of Reminder (email)
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Optional line added to the standard day-of reminder email.
            </p>
            <CustomMessageBlock
              isAdmin={isAdmin}
              value={commSettings.day_of_reminder_custom_message ?? ""}
              maxChars={500}
              onChange={(v) =>
                onUpdateComm("day_of_reminder_custom_message", v || null)
              }
              onPreview={
                onPreview
                  ? () =>
                      onPreview(
                        "reminder_2_email",
                        commSettings.day_of_reminder_custom_message ?? null,
                        "Day-of Reminder (email)",
                      )
                  : undefined
              }
              previewButtonLabel="Preview email"
            />
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-700">
              Day-of Reminder (text)
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Optional line for the day-of reminder text only; if left blank,
              the email line above is used for the text as well.
            </p>
            <CustomMessageBlock
              isAdmin={isAdmin}
              value={commSettings.day_of_reminder_sms_custom_message ?? ""}
              maxChars={500}
              onChange={(v) =>
                onUpdateComm("day_of_reminder_sms_custom_message", v || null)
              }
              onPreview={
                onPreview
                  ? () =>
                      onPreview(
                        "reminder_2_sms",
                        commSettings.day_of_reminder_sms_custom_message ??
                          commSettings.day_of_reminder_custom_message ??
                          null,
                        "Day-of Reminder (text)",
                      )
                  : undefined
              }
              previewButtonLabel="Preview text"
            />
          </div>
        </FieldBlock>

        <FieldBlock title="Thank-you after the visit">
          <ToggleRow
            label="Send thank-you email"
            checked={ns.post_visit_enabled}
            disabled={!isAdmin}
            onChange={(v) => patchNs({ post_visit_enabled: v })}
          />
          <p className="mt-3 text-xs text-slate-500 leading-relaxed">
            Usually a few hours after the appointment ends, or the next morning
            if the appointment finishes later in the day.
          </p>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-700">
              Thank-you email
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Optional line added to the standard thank-you message.
            </p>
            <CustomMessageBlock
              isAdmin={isAdmin}
              value={commSettings.post_visit_email_custom_message ?? ""}
              maxChars={500}
              onChange={(v) =>
                onUpdateComm("post_visit_email_custom_message", v || null)
              }
              onPreview={
                onPreview
                  ? () =>
                      onPreview(
                        "unified_post_visit_email",
                        commSettings.post_visit_email_custom_message ?? null,
                        "Post-visit thank-you (email)",
                      )
                  : undefined
              }
              previewButtonLabel="Preview email"
            />
          </div>
        </FieldBlock>
      </div>
    </div>
  );
}
