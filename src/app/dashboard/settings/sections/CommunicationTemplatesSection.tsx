"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookingModel } from "@/types/booking-models";
import type { CommunicationSettings } from "@/lib/communications/service";
import type { CommMessageType } from "@/lib/emails/types";
import { isUnifiedSchedulingVenue } from "@/lib/booking/unified-scheduling";
import type { DepositConfigLike } from "@/lib/venue/deposit-workflow";
import { venueUsesDepositWorkflow } from "@/lib/venue/deposit-workflow";
import type { VenueNotificationSettings } from "@/lib/notifications/notification-settings";
import {
  isAppointmentPlanTier,
  isRestaurantCommsTier,
} from "@/lib/tier-enforcement";
import { BookingConfirmationSettingsBlock } from "./BookingConfirmationSettingsBlock";
import { TableConfirmOrCancelSettingsBlock } from "./TableConfirmOrCancelSettingsBlock";
import { UnifiedAppointmentNotificationSection } from "./UnifiedAppointmentNotificationSection";
import { CustomMessageBlock } from "./communication-settings-shared";

interface CommOptionalMessageSection {
  label: string;
  description?: string;
  messageKey: keyof CommunicationSettings;
  previewMessageType: CommMessageType;
  maxChars: number;
  previewButtonLabel: string;
  showSmsSegmentHint?: boolean;
}

interface CommCardConfig {
  messageType: CommMessageType;
  label: string;
  description: string;
  /** When true, no EMAIL / SMS / EMAIL+SMS pill (matches blocks like Booking confirmation that use inline channel toggles). */
  hideChannelBadge?: boolean;
  channel: "email" | "sms" | "both";
  enabledKey: keyof CommunicationSettings;
  customMessageKey: keyof CommunicationSettings;
  /** When set, optional wording uses collapsible rows (same pattern as Booking confirmation). Replaces single custom textarea. */
  optionalMessageSections?: CommOptionalMessageSection[];
  locked?: boolean;
  /** When `locked`, replaces the default "Always on" badge (e.g. unified venues). */
  lockedBadgeLabel?: string;
  timeKey?: keyof CommunicationSettings;
  hoursBeforeKey?: keyof CommunicationSettings;
  maxChars: number;
  subToggles?: Array<{
    key: keyof CommunicationSettings;
    label: string;
  }>;
  requireOneSubToggle?: boolean;
}

function buildCommunicationCards(
  unifiedVenue: boolean,
): CommCardConfig[] {
  const daySub: CommCardConfig["subToggles"] = [
    { key: "day_of_reminder_email_enabled", label: "Email" },
    { key: "day_of_reminder_sms_enabled", label: "SMS" },
  ];

  const modSub: CommCardConfig["subToggles"] = [
    { key: "modification_email_enabled", label: "Email" },
    { key: "modification_sms_enabled", label: "SMS" },
  ];

  const cancelSub: CommCardConfig["subToggles"] = unifiedVenue
    ? [{ key: "cancellation_email_enabled", label: "Email" }]
    : [
        { key: "cancellation_email_enabled", label: "Email" },
        { key: "cancellation_sms_enabled", label: "SMS" },
      ];

  const cards: CommCardConfig[] = [
    {
      messageType: "booking_confirmation_email",
      label: "Booking Confirmation",
      description: unifiedVenue
        ? "Sent when a booking is confirmed. Channels are controlled under Message templates above."
        : "Sent immediately when a booking is confirmed. Includes booking details and a manage-booking link.",
      channel: "email",
      enabledKey: "confirmation_email_enabled",
      customMessageKey: "confirmation_email_custom_message",
      locked: true,
      ...(unifiedVenue ? { lockedBadgeLabel: "Channels above" } : {}),
      maxChars: 500,
    },
    {
      messageType: "deposit_request_email",
      label: "Deposit request (email)",
      description:
        "Email with a payment link when staff create a booking that requires a separate deposit payment. Not used when guests pay a deposit during online booking.",
      channel: "email",
      enabledKey: "deposit_request_email_enabled",
      customMessageKey: "deposit_request_email_custom_message",
      maxChars: 500,
    },
    {
      messageType: "deposit_request_sms",
      label: "Deposit request (SMS)",
      description: unifiedVenue
        ? "Text message with a payment link when staff create a booking that needs a separate deposit payment."
        : "SMS with a payment link for staff pay-by-link deposits.",
      channel: "sms",
      enabledKey: "deposit_sms_enabled",
      customMessageKey: "deposit_sms_custom_message",
      maxChars: 160,
    },
  ];

  cards.push(
    {
      messageType: "deposit_confirmation_email",
      label: "Deposit Confirmation",
      description:
        "Email after a deposit is paid via pay-by-link (e.g. staff booking). Guests who pay a deposit during online checkout get booking confirmation only.",
      channel: "email",
      enabledKey: "deposit_confirmation_email_enabled",
      customMessageKey: "deposit_confirmation_email_custom_message",
      maxChars: 500,
    },
    {
      messageType: "reminder_56h_email",
      label: "Confirm or Cancel Reminder",
      description:
        "Asks guests to confirm or cancel their booking. Includes a confirm button, cancel button, and manage booking link.",
      channel: "email",
      enabledKey: "reminder_email_enabled",
      customMessageKey: "reminder_email_custom_message",
      hoursBeforeKey: "reminder_hours_before",
      maxChars: 500,
    },
    {
      messageType: "day_of_reminder_email",
      label: "Day-of Reminder",
      description: unifiedVenue
        ? "Reminder sent on the day of the booking. Choose email and/or SMS."
        : "A simple reminder on the day of the booking.",
      hideChannelBadge: true,
      channel: "both",
      enabledKey: "day_of_reminder_enabled",
      customMessageKey: "day_of_reminder_custom_message",
      timeKey: "day_of_reminder_time",
      maxChars: 500,
      subToggles: daySub,
      optionalMessageSections: [
        {
          label: "Day-of reminder (email)",
          description: "Optional line added to the day-of email.",
          messageKey: "day_of_reminder_custom_message",
          previewMessageType: "day_of_reminder_email",
          maxChars: 500,
          previewButtonLabel: "Preview email",
        },
        {
          label: "Day-of reminder (text)",
          description:
            "Optional line at the start of the day-of text. Leave blank to use the same line as the email.",
          messageKey: "day_of_reminder_sms_custom_message",
          previewMessageType: "day_of_reminder_sms",
          maxChars: 500,
          previewButtonLabel: "Preview text",
          showSmsSegmentHint: true,
        },
      ],
    },
    {
      messageType: "post_visit_email",
      label: "Post-Visit Thank You",
      description:
        "Thank-you email for completed table bookings, sent the day after the visit at the send time you choose (default morning).",
      channel: "email",
      enabledKey: "post_visit_email_enabled",
      customMessageKey: "post_visit_email_custom_message",
      timeKey: "post_visit_email_time",
      maxChars: 500,
    },
    {
      messageType: "booking_modification_email",
      label: "Booking Modification",
      description: unifiedVenue
        ? "Channels and optional wording for reschedule and change notices."
        : "Sent when a booking's date, time, or party size is changed. Choose email and/or SMS.",
      channel: "both",
      enabledKey: "modification_email_enabled",
      customMessageKey: "modification_custom_message",
      locked: true,
      maxChars: 500,
      requireOneSubToggle: true,
      subToggles: modSub,
    },
    {
      messageType: "cancellation_email",
      label: "Booking Cancellation",
      description: unifiedVenue
        ? "Email content for cancellation notices (appointments: email only)."
        : "Sent when a booking is cancelled. Choose email and/or SMS.",
      channel: unifiedVenue ? "email" : "both",
      enabledKey: "cancellation_email_enabled",
      customMessageKey: "cancellation_custom_message",
      locked: true,
      maxChars: 500,
      requireOneSubToggle: true,
      subToggles: cancelSub,
    },
  );

  return cards;
}

const CHANNEL_BADGE: Record<string, { label: string; className: string }> = {
  email: { label: "EMAIL", className: "bg-blue-100 text-blue-700" },
  sms: { label: "SMS", className: "bg-emerald-100 text-emerald-700" },
  both: { label: "EMAIL + SMS", className: "bg-purple-100 text-purple-700" },
};

interface CommunicationTemplatesSectionProps {
  venue: { id: string };
  isAdmin: boolean;
  pricingTier?: string;
  bookingModel?: string;
  /** Normalised secondaries (C/D/E); used to show merge-variable hints for multi-model venues. */
  enabledModels?: BookingModel[];
  /** When unset, deposit-related template cards are shown for unified venues (conservative default). */
  depositConfig?: DepositConfigLike | null;
  onUpdate?: (patch: Record<string, unknown>) => void;
}

const UNIFIED_HIDDEN_TYPES = new Set<CommMessageType>([
  "reminder_56h_email",
  "day_of_reminder_email",
  "post_visit_email",
]);
/** Wording + preview for these live in Unified appointment automation (not in the template list below). */
const UNIFIED_MERGED_IN_AUTOMATION_SECTION = new Set<CommMessageType>([
  "booking_confirmation_email",
]);
const DEPOSIT_MESSAGE_TYPES = new Set<CommMessageType>([
  "deposit_request_email",
  "deposit_request_sms",
  "deposit_confirmation_email",
]);

type UnifiedTemplateGroup = "booking" | "deposits" | "changes";

function unifiedTemplateGroup(
  messageType: CommMessageType,
): UnifiedTemplateGroup {
  if (DEPOSIT_MESSAGE_TYPES.has(messageType)) return "deposits";
  if (
    messageType === "booking_modification_email" ||
    messageType === "cancellation_email"
  )
    return "changes";
  return "booking";
}

const UNIFIED_TEMPLATE_GROUP_LABEL: Record<UnifiedTemplateGroup, string> = {
  booking: "Confirmations",
  deposits: "Deposits (pay-by-link)",
  changes: "When bookings change or cancel",
};

/** Order for table restaurant template cards (Confirm or Cancel Reminder + booking confirmation are separate blocks above). */
const TABLE_RESTAURANT_MESSAGE_ORDER: CommMessageType[] = [
  "day_of_reminder_email",
  "post_visit_email",
  "deposit_request_email",
  "deposit_request_sms",
  "deposit_confirmation_email",
  "booking_modification_email",
  "cancellation_email",
];

function sortTableRestaurantCards(list: CommCardConfig[]): CommCardConfig[] {
  const orderIndex = (t: CommMessageType) => {
    const i = TABLE_RESTAURANT_MESSAGE_ORDER.indexOf(t);
    return i === -1 ? 999 : i;
  };
  return [...list].sort(
    (a, b) => orderIndex(a.messageType) - orderIndex(b.messageType),
  );
}

export function CommunicationTemplatesSection({
  venue,
  isAdmin,
  pricingTier = "appointments",
  bookingModel,
  enabledModels = [],
  depositConfig,
}: CommunicationTemplatesSectionProps) {
  const unifiedVenue = isUnifiedSchedulingVenue(bookingModel);
  const primary =
    (bookingModel as BookingModel | undefined) ?? "table_reservation";
  const tablePrimaryWithSecondaries =
    primary === "table_reservation" && enabledModels.length > 0;
  const appointmentPlanTier = isAppointmentPlanTier(pricingTier);
  /** Show unified automation + grouped templates (same as pure unified venues). */
  const unifiedColumnStyle =
    unifiedVenue ||
    tablePrimaryWithSecondaries ||
    (appointmentPlanTier && !unifiedVenue);
  /**
   * Restaurant plans with table primary + secondaries: two tabs (table vs appointments).
   * Appointments plan never shows table-only tabs — they use the unified column only.
   */
  const showCommsTabs =
    tablePrimaryWithSecondaries &&
    !unifiedVenue &&
    isRestaurantCommsTier(pricingTier);

  const cardsTable = useMemo(
    () => buildCommunicationCards(false),
    [],
  );
  const cardsUnifiedColumn = useMemo(
    () => buildCommunicationCards(true),
    [],
  );

  /** When deposit JSON is missing, keep deposit cards visible for unified-style column (cannot infer intent). */
  const showDepositTemplates =
    !unifiedColumnStyle ||
    depositConfig == null ||
    venueUsesDepositWorkflow(depositConfig);

  const visibleCardsTable = useMemo(() => {
    const filtered = cardsTable.filter(
      (c) =>
        c.messageType !== "booking_confirmation_email" &&
        c.messageType !== "reminder_56h_email",
    );
    return sortTableRestaurantCards(filtered);
  }, [cardsTable]);

  const visibleCardsUnified = useMemo(() => {
    if (!unifiedColumnStyle) return [];
    let list = cardsUnifiedColumn.filter(
      (c) => !UNIFIED_HIDDEN_TYPES.has(c.messageType),
    );
    list = list.filter(
      (c) => !UNIFIED_MERGED_IN_AUTOMATION_SECTION.has(c.messageType),
    );
    if (!showDepositTemplates) {
      list = list.filter((c) => !DEPOSIT_MESSAGE_TYPES.has(c.messageType));
    }
    return list;
  }, [cardsUnifiedColumn, unifiedColumnStyle, showDepositTemplates]);

  const previewCardsForLookup = useMemo(() => {
    const bookingCard = cardsTable.find(
      (c) => c.messageType === "booking_confirmation_email",
    );
    const reminder56Card = cardsTable.find(
      (c) => c.messageType === "reminder_56h_email",
    );
    const withAutomationCards = (list: typeof cardsTable) => {
      let out = [...list];
      if (
        bookingCard &&
        !out.some((c) => c.messageType === "booking_confirmation_email")
      ) {
        out = [...out, bookingCard];
      }
      if (
        reminder56Card &&
        !out.some((c) => c.messageType === "reminder_56h_email")
      ) {
        out = [...out, reminder56Card];
      }
      return out;
    };
    if (unifiedVenue) return visibleCardsUnified;
    if (showCommsTabs)
      return withAutomationCards([
        ...visibleCardsTable,
        ...visibleCardsUnified,
      ]);
    if (appointmentPlanTier && unifiedColumnStyle)
      return withAutomationCards([
        ...visibleCardsTable,
        ...visibleCardsUnified,
      ]);
    return withAutomationCards(visibleCardsTable);
  }, [
    unifiedVenue,
    showCommsTabs,
    appointmentPlanTier,
    unifiedColumnStyle,
    visibleCardsTable,
    visibleCardsUnified,
    cardsTable,
  ]);

  const unifiedTimelineSteps = useMemo(() => {
    if (!unifiedColumnStyle) return null;
    return [
      { label: "Booking confirmation", icon: "1" },
      { label: "Confirm or Cancel Reminder", icon: "2" },
      { label: "Day-of Reminder", icon: "3" },
      { label: "Post-visit thank you", icon: "4" },
    ];
  }, [unifiedColumnStyle]);

  const [commsTab, setCommsTab] = useState<"table" | "appointments">("table");

  useEffect(() => {
    setCommsTab("table");
  }, [venue.id]);

  const [settings, setSettings] = useState<CommunicationSettings | null>(null);
  const [notificationSettings, setNotificationSettings] =
    useState<VenueNotificationSettings | null>(null);
  const [notificationSettingsFetchDone, setNotificationSettingsFetchDone] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [notifSaveStatus, setNotifSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const mergedSaveStatus = useMemo(() => {
    if (saveStatus === "saving" || notifSaveStatus === "saving")
      return "saving";
    if (saveStatus === "error" || notifSaveStatus === "error") return "error";
    if (saveStatus === "saved" || notifSaveStatus === "saved") return "saved";
    return "idle";
  }, [saveStatus, notifSaveStatus]);

  const notifSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistNotificationSettings = useCallback(
    (next: VenueNotificationSettings) => {
      if (!isAdmin) return;
      setNotifSaveStatus("saving");
      if (notifSaveTimerRef.current) clearTimeout(notifSaveTimerRef.current);
      if (notifSavedTimerRef.current) clearTimeout(notifSavedTimerRef.current);
      notifSaveTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/venue/notification-settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as VenueNotificationSettings;
          setNotificationSettings(data);
          setNotifSaveStatus("saved");
          notifSavedTimerRef.current = setTimeout(
            () => setNotifSaveStatus("idle"),
            2000,
          );
        } catch {
          setNotifSaveStatus("error");
        }
      }, 400);
    },
    [isAdmin],
  );

  const patchNotificationSettings = useCallback(
    (partial: Partial<VenueNotificationSettings>) => {
      setNotificationSettings((prev) => {
        if (!prev) return prev;
        const merged = { ...prev, ...partial };
        queueMicrotask(() => {
          persistNotificationSettings(merged);
        });
        return merged;
      });
    },
    [persistNotificationSettings],
  );

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<CommMessageType | null>(null);
  const [previewCardLabel, setPreviewCardLabel] = useState<string | null>(null);
  const [previewSampleKind, setPreviewSampleKind] = useState<
    "table" | "appointment" | null
  >(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/venue/communication-settings")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data && data.venue_id) {
          setSettings(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load communication settings:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    setNotificationSettingsFetchDone(false);
    fetch("/api/venue/notification-settings")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: VenueNotificationSettings) => {
        if (!cancelled) setNotificationSettings(data);
      })
      .catch((err) => {
        console.error("Failed to load notification settings:", err);
      })
      .finally(() => {
        if (!cancelled) setNotificationSettingsFetchDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [settings]);

  const updateSetting = useCallback(
    (key: keyof CommunicationSettings, value: unknown) => {
      if (!isAdmin) return;
      setSettings((prev) => {
        if (!prev) return prev;
        return { ...prev, [key]: value };
      });
      setSaveStatus("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          await fetch("/api/venue/communication-settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [key]: value }),
          });
          setSaveStatus("saved");
          savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        } catch {
          setSaveStatus("error");
        }
      }, 500);
    },
    [isAdmin],
  );

  const openPreview = useCallback(
    async (
      messageType: CommMessageType,
      customMessage?: string | null,
      displayLabel?: string,
    ) => {
      setPreviewLoading(true);
      setPreviewType(messageType);
      setPreviewCardLabel(displayLabel ?? null);
      setPreviewSampleKind(null);
      try {
        const res = await fetch("/api/venue/communication-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageType, customMessage }),
        });
        const data = (await res.json()) as {
          html?: string | null;
          text?: string | null;
          previewSampleKind?: "table" | "appointment";
        };
        setPreviewHtml(data.html ?? null);
        setPreviewText(data.text ?? null);
        setPreviewSampleKind(data.previewSampleKind ?? null);
      } catch {
        setPreviewHtml(null);
        setPreviewText("Preview failed to load");
        setPreviewSampleKind(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [],
  );

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="text-sm text-slate-500">
            Loading communication settings...
          </span>
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-red-600">
          Failed to load communication settings
        </p>
      </section>
    );
  }

  const restaurantTimelineSteps = [
    { label: "Booking confirmation", icon: "1" },
    { label: "Confirm or Cancel Reminder", icon: "2" },
    { label: "Day-of Reminder", icon: "3" },
    { label: "Post-visit thank you", icon: "4" },
  ];

  const showUnifiedCommsBlocks =
    unifiedVenue ||
    (showCommsTabs && commsTab === "appointments") ||
    (appointmentPlanTier && unifiedColumnStyle && !unifiedVenue);
  const showRestaurantTemplatesSection =
    isRestaurantCommsTier(pricingTier) &&
    !unifiedVenue &&
    ((showCommsTabs && commsTab === "table") ||
      (!showCommsTabs && primary === "table_reservation"));

  const previewLabels: Partial<Record<CommMessageType, string>> = {
    booking_confirmation_email: "Booking confirmation (email)",
    booking_confirmation_sms: "Booking confirmation (text)",
    deposit_request_email: "Deposit request (email)",
    deposit_request_sms: "Deposit request (text)",
    deposit_confirmation_email: "Deposit confirmation (email)",
    reminder_56h_email: "Confirm or Cancel Reminder (email)",
    reminder_1_email: "Confirm or Cancel Reminder (email)",
    reminder_1_sms: "Confirm or Cancel Reminder (text)",
    reminder_2_email: "Day-of Reminder (email)",
    reminder_2_sms: "Day-of Reminder (text)",
    unified_post_visit_email: "Post-visit thank-you (email)",
    day_of_reminder_email: "Day-of Reminder (email)",
    day_of_reminder_sms: "Day-of Reminder (text)",
    post_visit_email: "Post-visit thank-you (email)",
    booking_modification_email: "Booking change notice (email)",
    cancellation_email: "Cancellation notice (email)",
  };

  return (
    <section className="space-y-10" aria-labelledby="guest-comms-main-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            id="guest-comms-main-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Guest communications
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {showCommsTabs
              ? "You offer table reservations and other booking types. Use the Table bookings tab for restaurant-style messages (Confirm or Cancel Reminder, day-of, post-visit). Use Appointments & other bookings for automated confirmations, reminders, and change notices for classes, events, resources, and unified appointments."
              : unifiedVenue
                ? "For each automated step: choose channels and timing, then add optional wording and preview. Deposit and booking-change templates are grouped in the section below."
                : "Control what messages your guests receive and when they are sent."}
          </p>
          {unifiedColumnStyle && !showDepositTemplates && (
            <p className="mt-2 text-sm text-slate-500">
              Deposit wording is hidden while deposits are off in your booking
              and payment settings.
            </p>
          )}
        </div>
        <SaveIndicator status={mergedSaveStatus} />
      </div>

      {showCommsTabs && (
        <div
          className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
          role="tablist"
          aria-label="Communication scope"
        >
          <button
            type="button"
            role="tab"
            aria-selected={commsTab === "table"}
            onClick={() => setCommsTab("table")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              commsTab === "table"
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Table bookings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={commsTab === "appointments"}
            onClick={() => setCommsTab("appointments")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              commsTab === "appointments"
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Appointments &amp; other bookings
          </button>
        </div>
      )}

      {showUnifiedCommsBlocks && (
        <div className="space-y-5">
          <div className="space-y-4">
            <div
              className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3"
              role="region"
              aria-label="Typical guest message journey"
            >
              <p className="text-xs font-medium text-slate-700">
                Typical journey
              </p>
              <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-xs text-slate-600">
                {(unifiedTimelineSteps ?? restaurantTimelineSteps).map(
                  (step, i) => (
                    <li
                      key={`${step.label}-${step.icon}`}
                      className="flex items-center gap-1"
                    >
                      {i > 0 && (
                        <span
                          className="mx-1 text-slate-300"
                          aria-hidden="true"
                        >
                          →
                        </span>
                      )}
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-brand-700 shadow-sm ring-1 ring-slate-200/80">
                        {step.icon}
                      </span>
                      <span className="whitespace-nowrap pl-0.5">
                        {step.label}
                      </span>
                    </li>
                  ),
                )}
              </ol>
            </div>

            <section
              className="space-y-3"
              aria-labelledby="unified-automation-heading"
            >
              <div>
                <h3
                  id="unified-automation-heading"
                  className="text-base font-semibold text-slate-900"
                >
                  Message templates
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  Booking Confirmation, Confirm or Cancel Reminder, day-of
                  reminders, post-visit thank-you, deposits, and changes.
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  SMS needs a mobile number on the booking. Text messages use
                  your plan&apos;s SMS allowance.
                </p>
              </div>
              <UnifiedAppointmentNotificationSection
                isAdmin={isAdmin}
                commSettings={settings}
                onUpdateComm={updateSetting}
                onNotificationSaveStatus={setNotifSaveStatus}
                onPreview={(type, custom, label) => {
                  void openPreview(
                    type,
                    custom ?? null,
                    label ?? previewLabels[type],
                  );
                }}
              />
            </section>
          </div>

          <section
            className="space-y-5"
            aria-labelledby="unified-templates-section-heading"
          >
            <div>
              <h3
                id="unified-templates-section-heading"
                className="text-base font-semibold text-slate-900"
              >
                Deposits and booking changes
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Pay-by-link deposit wording is grouped first. Reschedule,
                cancellation, and no-show guest notices are grouped together
                below so you can turn each type on or off and edit channels and
                messages in one place.
              </p>
            </div>

            <div className="space-y-8">
              {(["booking", "deposits", "changes"] as const).map((g) => {
                const groupCards = visibleCardsUnified.filter(
                  (c) => unifiedTemplateGroup(c.messageType) === g,
                );
                if (groupCards.length === 0) return null;
                return (
                  <div key={g} className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-800">
                      {UNIFIED_TEMPLATE_GROUP_LABEL[g]}
                    </h4>
                    {g === "changes" && (
                      <p className="max-w-2xl text-sm text-slate-600">
                        Use the switch on each card to turn guest notices on or
                        off. When a notice is on, choose email and text (where
                        your plan allows) and add optional wording. Cancellation
                        notices are email only for appointments. No-show notices
                        use email with standard wording.
                      </p>
                    )}
                    {g === "changes" && !notificationSettingsFetchDone && (
                      <div
                        className="h-14 animate-pulse rounded-lg bg-slate-100"
                        aria-hidden="true"
                      />
                    )}
                    <div className="space-y-4">
                      {groupCards.map((card) => (
                        <CommCard
                          key={card.messageType}
                          card={card}
                          settings={settings}
                          onUpdate={updateSetting}
                          onPreview={(type, msg, label) =>
                            void openPreview(
                              type,
                              msg,
                              label ?? previewLabels[type],
                            )
                          }
                          isAdmin={isAdmin}
                          masterToggle={
                            g === "changes" && notificationSettings
                              ? card.messageType ===
                                "booking_modification_email"
                                ? {
                                    helper:
                                      "When the date, time, or appointment details change.",
                                    checked:
                                      notificationSettings.reschedule_notification_enabled,
                                    onChange: (v) =>
                                      patchNotificationSettings({
                                        reschedule_notification_enabled: v,
                                      }),
                                  }
                                : card.messageType === "cancellation_email"
                                  ? {
                                      helper: "When the booking is cancelled.",
                                      checked:
                                        notificationSettings.cancellation_notification_enabled,
                                      onChange: (v) =>
                                        patchNotificationSettings({
                                          cancellation_notification_enabled: v,
                                        }),
                                    }
                                  : undefined
                              : undefined
                          }
                        />
                      ))}
                      {g === "changes" && notificationSettings && (
                        <NoShowGuestNoticeCard
                          isAdmin={isAdmin}
                          checked={
                            notificationSettings.no_show_notification_enabled
                          }
                          onChange={(v) =>
                            patchNotificationSettings({
                              no_show_notification_enabled: v,
                            })
                          }
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {showRestaurantTemplatesSection && (
        <section
          className="space-y-5"
          aria-labelledby="message-templates-section-heading"
        >
          <div
            className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3"
            role="region"
            aria-label="Typical guest message journey"
          >
            <p className="text-xs font-medium text-slate-700">
              Typical journey
            </p>
            <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-xs text-slate-600">
              {restaurantTimelineSteps.map((step, i) => (
                <li
                  key={`${step.label}-${step.icon}`}
                  className="flex items-center gap-1"
                >
                  {i > 0 && (
                    <span className="mx-1 text-slate-300" aria-hidden="true">
                      →
                    </span>
                  )}
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-brand-700 shadow-sm ring-1 ring-slate-200/80">
                    {step.icon}
                  </span>
                  <span className="whitespace-nowrap pl-0.5">{step.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <div
            className={showCommsTabs ? "" : "border-t border-slate-200 pt-8"}
          >
            <h3
              id="message-templates-section-heading"
              className="text-base font-semibold text-slate-900"
            >
              Message templates
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {showCommsTabs
                ? "Messages for table reservations: Confirm or Cancel Reminder, day-of reminders, post-visit thank-you, deposits, and changes. Other booking types use the Appointments & other bookings tab."
                : "Edit the wording guests see in each email or text."}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              SMS needs a mobile number on the booking. Text messages use your
              plan&apos;s SMS allowance.
            </p>
            {!notificationSettingsFetchDone ? (
              <div
                className="h-40 animate-pulse rounded-xl bg-slate-100"
                aria-hidden="true"
              />
            ) : notificationSettings ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="space-y-4 p-5 sm:p-6">
                  <BookingConfirmationSettingsBlock
                    isAdmin={isAdmin}
                    commSettings={settings}
                    onUpdateComm={updateSetting}
                    notificationSettings={notificationSettings}
                    onPatchNotificationSettings={patchNotificationSettings}
                    onPreview={(type, custom, label) =>
                      void openPreview(
                        type,
                        custom ?? null,
                        label ?? previewLabels[type],
                      )
                    }
                    confirmationEmailHelpText="Optional extra paragraph added to the standard confirmation email (preview uses sample table reservation details)."
                  />
                  <TableConfirmOrCancelSettingsBlock
                    isAdmin={isAdmin}
                    commSettings={settings}
                    onUpdateComm={updateSetting}
                    notificationSettings={notificationSettings}
                    onPatchNotificationSettings={patchNotificationSettings}
                    onPreview={(type, custom, label) =>
                      void openPreview(
                        type,
                        custom ?? null,
                        label ?? previewLabels[type],
                      )
                    }
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-red-600">
                Couldn&apos;t load notification settings. Refresh the page or
                try again shortly.
              </p>
            )}
          </div>

          <div className="space-y-8">
            {visibleCardsTable.map((card) => (
              <CommCard
                key={card.messageType}
                card={card}
                settings={settings}
                onUpdate={updateSetting}
                onPreview={(type, msg, label) =>
                  void openPreview(
                    type,
                    msg,
                    label ?? previewLabels[type],
                  )
                }
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </section>
      )}

      {previewType && (
        <PreviewModal
          messageType={previewType}
          cardLabel={
            previewCardLabel ??
            previewCardsForLookup.find((c) => c.messageType === previewType)
              ?.label
          }
          sampleKind={previewSampleKind}
          html={previewHtml}
          text={previewText}
          loading={previewLoading}
          onClose={() => {
            setPreviewType(null);
            setPreviewHtml(null);
            setPreviewText(null);
            setPreviewCardLabel(null);
            setPreviewSampleKind(null);
          }}
        />
      )}
    </section>
  );
}

function SaveIndicator({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return null;
  const map = {
    saving: { text: "Saving...", className: "text-slate-500" },
    saved: { text: "Saved", className: "text-emerald-600" },
    error: { text: "Save failed", className: "text-red-600" },
  };
  const { text, className } = map[status];
  return <span className={`text-xs font-medium ${className}`}>{text}</span>;
}

function CommCard({
  card,
  settings,
  onUpdate,
  onPreview,
  isAdmin,
  masterToggle,
}: {
  card: CommCardConfig;
  settings: CommunicationSettings;
  onUpdate: (key: keyof CommunicationSettings, value: unknown) => void;
  onPreview: (
    type: CommMessageType,
    customMessage?: string | null,
    displayLabel?: string,
  ) => void;
  isAdmin: boolean;
  /** When set (unified “booking changes” group), gates channel + wording controls. */
  masterToggle?: {
    helper: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  };
}) {
  const baseEnabled = card.locked
    ? true
    : (settings[card.enabledKey] as boolean);
  const effectiveEnabled = masterToggle
    ? masterToggle.checked && baseEnabled
    : baseEnabled;
  const headerMuted = masterToggle ? !masterToggle.checked : !baseEnabled;
  const customMessage =
    (settings[card.customMessageKey] as string | null) ?? "";
  const badge = card.hideChannelBadge ? null : CHANNEL_BADGE[card.channel];
  const optionalSections = card.optionalMessageSections;
  const showLegacySingleOptional = !optionalSections?.length;
  const [expanded, setExpanded] = useState(false);

  const previewValueForSection = (
    sec: CommOptionalMessageSection,
  ): string | null => {
    if (sec.messageKey === "day_of_reminder_sms_custom_message") {
      const sms = (
        settings.day_of_reminder_sms_custom_message as string | null
      )?.trim();
      if (sms) return sms;
      return (settings.day_of_reminder_custom_message as string | null) ?? null;
    }
    return (settings[sec.messageKey] as string | null) ?? null;
  };

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm transition-colors ${
        effectiveEnabled
          ? "border-slate-200"
          : "border-slate-100 bg-slate-50/50"
      }`}
    >
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3
                className={`text-sm font-semibold ${headerMuted ? "text-slate-400" : "text-slate-900"}`}
              >
                {card.label}
              </h3>
              {(!masterToggle || masterToggle.checked) && badge && (
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.className}`}
                >
                  {badge.label}
                </span>
              )}
            </div>
            <p
              className={`mt-0.5 text-xs ${headerMuted ? "text-slate-400" : "text-slate-500"}`}
            >
              {card.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!card.locked && !masterToggle && isAdmin && (
            <button
              type="button"
              role="switch"
              aria-checked={baseEnabled}
              onClick={() => onUpdate(card.enabledKey, !baseEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors ${baseEnabled ? "bg-brand-600" : "bg-slate-200"}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${baseEnabled ? "translate-x-5" : "translate-x-0.5"} mt-0.5`}
              />
            </button>
          )}
          {card.locked && !masterToggle && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 uppercase">
              {card.lockedBadgeLabel ?? "Always on"}
            </span>
          )}
        </div>
      </div>

      {masterToggle && (
        <div className="border-t border-slate-100 px-4 pb-3 pt-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800">
                  Send guest notice
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {masterToggle.helper}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={masterToggle.checked}
                disabled={!isAdmin}
                onClick={() => masterToggle.onChange(!masterToggle.checked)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                  masterToggle.checked ? "bg-brand-600" : "bg-slate-200"
                } ${!isAdmin ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                    masterToggle.checked ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {effectiveEnabled && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {card.subToggles?.map((sub) => {
              const checked = settings[sub.key] as boolean;
              const isLastActive =
                card.requireOneSubToggle &&
                checked &&
                card.subToggles!.filter((s) => settings[s.key] as boolean)
                  .length === 1;
              return (
                <label
                  key={sub.key as string}
                  className={`flex items-center gap-1.5 ${isLastActive ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (!isAdmin) return;
                      if (isLastActive && !e.target.checked) return;
                      onUpdate(sub.key, e.target.checked);
                    }}
                    disabled={!isAdmin || isLastActive}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                  />
                  <span
                    className={`text-slate-600 ${isLastActive ? "opacity-60" : ""}`}
                  >
                    {sub.label}
                  </span>
                </label>
              );
            })}

            {card.hoursBeforeKey && (
              <label className="flex items-center gap-1.5">
                <span className="text-slate-500">Send</span>
                <input
                  type="number"
                  min={12}
                  max={168}
                  value={(settings[card.hoursBeforeKey] as number) ?? 56}
                  onChange={(e) => {
                    const val = Math.min(
                      168,
                      Math.max(12, parseInt(e.target.value, 10) || 56),
                    );
                    if (isAdmin) onUpdate(card.hoursBeforeKey!, val);
                  }}
                  disabled={!isAdmin}
                  className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
                />
                <span className="text-slate-500">hours before booking</span>
              </label>
            )}

            {card.timeKey && (
              <label className="flex items-center gap-1.5">
                <span className="text-slate-500">Send at:</span>
                <input
                  type="time"
                  value={
                    (settings[card.timeKey] as string)?.slice(0, 5) ?? "09:00"
                  }
                  onChange={(e) => {
                    if (isAdmin)
                      onUpdate(card.timeKey!, `${e.target.value}:00`);
                  }}
                  disabled={!isAdmin}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
                />
              </label>
            )}

            {showLegacySingleOptional && (
              <button
                type="button"
                onClick={() =>
                  onPreview(card.messageType, customMessage || null, card.label)
                }
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                </svg>
                Preview
              </button>
            )}
          </div>

          {optionalSections && optionalSections.length > 0 ? (
            <div className="mt-3 space-y-4">
              {optionalSections.map((sec) => (
                <div key={String(sec.messageKey)}>
                  <p className="text-xs font-medium text-slate-700">
                    {sec.label}
                  </p>
                  {sec.description ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {sec.description}
                    </p>
                  ) : null}
                  <CustomMessageBlock
                    isAdmin={isAdmin}
                    value={(settings[sec.messageKey] as string | null) ?? ""}
                    maxChars={sec.maxChars}
                    onChange={(v) => onUpdate(sec.messageKey, v || null)}
                    onPreview={() =>
                      onPreview(
                        sec.previewMessageType,
                        previewValueForSection(sec),
                        sec.label,
                      )
                    }
                    previewButtonLabel={sec.previewButtonLabel}
                    showSmsSegmentHint={sec.showSmsSegmentHint}
                  />
                </div>
              ))}
            </div>
          ) : (
            showLegacySingleOptional && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
                >
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m19.5 8.25-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                  {customMessage.trim()
                    ? "Edit optional message"
                    : "Add optional message"}
                </button>

                {expanded && (
                  <div className="mt-2">
                    <textarea
                      value={customMessage}
                      onChange={(e) => {
                        const val = e.target.value.slice(0, card.maxChars);
                        onUpdate(card.customMessageKey, val || null);
                      }}
                      disabled={!isAdmin}
                      rows={3}
                      placeholder="Added after the standard text in the message…"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
                    />
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span>
                        {customMessage.length}/{card.maxChars} characters
                      </span>
                      {card.channel === "sms" && customMessage.length > 160 && (
                        <span className="font-medium text-amber-600">
                          SMS messages over 160 characters may be split
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function NoShowGuestNoticeCard({
  isAdmin,
  checked,
  onChange,
}: {
  isAdmin: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={`rounded-xl border bg-white shadow-sm transition-colors ${
        checked ? "border-slate-200" : "border-slate-100 bg-slate-50/50"
      }`}
    >
      <div className="p-4">
        <div className="min-w-0">
          <h3
            className={`text-sm font-semibold ${checked ? "text-slate-900" : "text-slate-400"}`}
          >
            Marked as no-show
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Sent when a booking is marked as no-show. Email only; standard
            message content.
          </p>
        </div>
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-800">
              Send guest notice
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={checked}
              disabled={!isAdmin}
              onClick={() => onChange(!checked)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                checked ? "bg-brand-600" : "bg-slate-200"
              } ${!isAdmin ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                  checked ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({
  messageType,
  cardLabel,
  sampleKind,
  html,
  text,
  loading,
  onClose,
}: {
  messageType: CommMessageType;
  cardLabel?: string;
  sampleKind?: "table" | "appointment" | null;
  html: string | null;
  text: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const isSms = messageType.endsWith("_sms");
  const sampleNote =
    sampleKind === "appointment"
      ? "Sample: appointment-style booking (service, practitioner, single guest)."
      : sampleKind === "table"
        ? "Sample: table reservation (party size, dietary notes)."
        : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Preview: {cardLabel ?? messageType}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            </div>
          ) : isSms ? (
            <div className="mx-auto w-full min-w-0 max-w-sm">
              <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="max-w-full text-sm break-words text-slate-800 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {text}
                </p>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-500">
                Text message — same template and optional line as live sends.
              </p>
              {sampleNote ? (
                <p className="mt-1 text-center text-[11px] text-slate-400">
                  {sampleNote}
                </p>
              ) : null}
            </div>
          ) : html ? (
            <div>
              <iframe
                title="Email preview"
                srcDoc={html}
                className="w-full rounded-lg border border-slate-100"
                style={{ height: "500px" }}
                sandbox="allow-same-origin"
              />
              <p className="mt-2 text-center text-[11px] text-slate-500">
                Email — same template and optional wording as live sends.
              </p>
              {sampleNote ? (
                <p className="mt-1 text-center text-[11px] text-slate-400">
                  {sampleNote}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No preview available</p>
          )}
        </div>
      </div>
    </div>
  );
}
