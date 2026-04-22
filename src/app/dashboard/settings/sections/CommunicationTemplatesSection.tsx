"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { BookingModel } from "@/types/booking-models";
import {
  type CommunicationChannel,
  type CommunicationLane,
  type CommunicationMessageKey,
  type LaneMessagePolicy,
  type VenueCommunicationPolicies,
  shouldShowAppointmentsOtherLane,
} from "@/lib/communications/policies";
import { isRestaurantCommsTier } from "@/lib/tier-enforcement";
import { NumericInput } from "@/components/ui/NumericInput";

interface CommunicationTemplatesSectionProps {
  venue: { id: string };
  isAdmin: boolean;
  pricingTier?: string;
  bookingModel?: string;
  enabledModels?: BookingModel[];
  depositConfig?: unknown;
  serviceEngineTable?: boolean;
  onUpdate?: (patch: Record<string, unknown>) => void;
  /** Stripe subscription present — Plan checkout completed; hide Light SMS “add a card” banner. */
  hasStripeSubscription?: boolean;
}

const MESSAGE_CARDS: Array<{
  key: CommunicationMessageKey;
  label: string;
  description: string;
  allowedChannels: CommunicationChannel[];
  timing?: "hoursBefore" | "hoursAfter";
  timingLabel?: string;
}> = [
  {
    key: "booking_confirmation",
    label: "Booking confirmation",
    description: "Sent as soon as the booking is confirmed.",
    allowedChannels: ["email", "sms"],
  },
  {
    key: "deposit_payment_request",
    label: "Deposit payment request",
    description: "Used when a booking needs a separate deposit payment link.",
    allowedChannels: ["email", "sms"],
  },
  {
    key: "deposit_confirmation",
    label: "Deposit confirmation",
    description: "Confirms that a deposit has been paid successfully.",
    allowedChannels: ["email"],
  },
  {
    key: "confirm_or_cancel_prompt",
    label: "Confirm or cancel prompt",
    description: "Ask the guest to confirm or cancel before the visit.",
    allowedChannels: ["email", "sms"],
    timing: "hoursBefore",
    timingLabel: "Send hours before",
  },
  {
    key: "deposit_payment_reminder",
    label: "Deposit payment reminder",
    description: "Reminder for unpaid deposit bookings before they are released.",
    allowedChannels: ["email", "sms"],
    timing: "hoursBefore",
    timingLabel: "Send hours before",
  },
  {
    key: "pre_visit_reminder",
    label: "Pre-visit reminder",
    description: "Reminder shortly before the booking starts.",
    allowedChannels: ["email", "sms"],
    timing: "hoursBefore",
    timingLabel: "Send hours before",
  },
  {
    key: "booking_modification",
    label: "Booking modification",
    description: "Sent when the booking details are changed.",
    allowedChannels: ["email", "sms"],
  },
  {
    key: "cancellation_confirmation",
    label: "Cancellation confirmation",
    description: "Sent when a booking is cancelled.",
    allowedChannels: ["email", "sms"],
  },
  {
    key: "auto_cancel_notification",
    label: "Auto-cancel notification",
    description: "Sent when an unpaid booking is automatically cancelled.",
    allowedChannels: ["email", "sms"],
  },
  {
    key: "no_show_notification",
    label: "No-show notification",
    description: "Optional notice when staff mark a booking as a no-show.",
    allowedChannels: ["email"],
  },
  {
    key: "post_visit_thankyou",
    label: "Post-visit thank you",
    description: "Follow-up after the booking has taken place.",
    allowedChannels: ["email"],
    timing: "hoursAfter",
    timingLabel: "Send hours after",
  },
  {
    key: "custom_message",
    label: "Custom message",
    description: "Staff-composed message sent directly to the guest.",
    allowedChannels: ["email", "sms"],
  },
];

const LANE_META: Record<
  CommunicationLane,
  { label: string; description: string }
> = {
  table: {
    label: "Table bookings",
    description:
      "Restaurant reservation messages for standard table bookings.",
  },
  appointments_other: {
    label: "Appointments & other",
    description:
      "Messages for appointments, classes, events, resources, and secondary booking models.",
  },
};

type PreviewState = {
  lane: CommunicationLane;
  messageKey: CommunicationMessageKey;
  channel: CommunicationChannel;
  title: string;
  html: string | null;
  text: string | null;
  sampleKind: string | null;
  loading: boolean;
};

export function CommunicationTemplatesSection({
  venue,
  isAdmin,
  pricingTier = "appointments",
  bookingModel,
  enabledModels = [],
  hasStripeSubscription = false,
}: CommunicationTemplatesSectionProps) {
  const primary =
    (bookingModel as BookingModel | undefined) ?? "table_reservation";
  const showTableLane =
    primary === "table_reservation" && isRestaurantCommsTier(pricingTier);
  const showAppointmentsLane = shouldShowAppointmentsOtherLane({
    pricingTier,
    bookingModel: primary,
    enabledModels,
  });

  const availableLanes = useMemo(() => {
    const lanes: CommunicationLane[] = [];
    if (showTableLane) lanes.push("table");
    if (showAppointmentsLane) lanes.push("appointments_other");
    return lanes;
  }, [showAppointmentsLane, showTableLane]);

  const [activeLane, setActiveLane] = useState<CommunicationLane>(
    showTableLane ? "table" : "appointments_other",
  );
  const [policies, setPolicies] = useState<VenueCommunicationPolicies | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);

  /**
   * Save queue:
   * - `pendingRef` holds the latest intended state the user wants persisted (or null if up-to-date).
   * - `inFlightRef` prevents overlapping requests.
   * - `debounceRef` collects rapid successive edits into a single PUT.
   * When a save completes, the UI state is NOT overwritten with the server echo unless that
   * response corresponds to the latest pending payload (prevents mid-edit flicker where a stale
   * response reverts a newer toggle).
   */
  const pendingRef = useRef<VenueCommunicationPolicies | null>(null);
  const inFlightRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setActiveLane(showTableLane ? "table" : "appointments_other");
  }, [showTableLane, venue.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/venue/communication-policies")
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data: VenueCommunicationPolicies) => {
        if (!cancelled) {
          setPolicies(data);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("Failed to load communication policies:", error);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [venue.id]);

  const flushNow = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (inFlightRef.current) return;
    const payload = pendingRef.current;
    if (!payload) return;

    inFlightRef.current = true;
    if (savedFlashRef.current) {
      clearTimeout(savedFlashRef.current);
      savedFlashRef.current = null;
    }
    setSaveStatus("saving");

    try {
      const response = await fetch("/api/venue/communication-policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as VenueCommunicationPolicies;

      if (pendingRef.current === payload) {
        pendingRef.current = null;
        setPolicies(data);
        setSaveStatus("saved");
        savedFlashRef.current = setTimeout(
          () => setSaveStatus("idle"),
          1500,
        );
      }
    } catch (error) {
      console.error("Failed to save communication policies:", error);
      setSaveStatus("error");
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        void flushNow();
      }
    }
  }, []);

  const schedulePersist = useCallback(
    (next: VenueCommunicationPolicies) => {
      if (!isAdmin) return;
      pendingRef.current = next;
      if (savedFlashRef.current) {
        clearTimeout(savedFlashRef.current);
        savedFlashRef.current = null;
      }
      setSaveStatus("saving");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void flushNow();
      }, 350);
    },
    [isAdmin, flushNow],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
    };
  }, []);

  const updateMessagePolicy = useCallback(
    (
      lane: CommunicationLane,
      messageKey: CommunicationMessageKey,
      patch: Partial<LaneMessagePolicy>,
    ) => {
      setPolicies((current) => {
        if (!current) return current;
        const next: VenueCommunicationPolicies = {
          ...current,
          [lane]: {
            ...current[lane],
            [messageKey]: {
              ...current[lane][messageKey],
              ...patch,
            },
          },
        };
        queueMicrotask(() => schedulePersist(next));
        return next;
      });
    },
    [schedulePersist],
  );

  const openPreview = useCallback(
    async (
      lane: CommunicationLane,
      messageKey: CommunicationMessageKey,
      channel: CommunicationChannel,
      title: string,
      customMessage: string | null,
    ) => {
      setPreviewState({
        lane,
        messageKey,
        channel,
        title,
        html: null,
        text: null,
        sampleKind: null,
        loading: true,
      });
      try {
        const response = await fetch("/api/venue/communication-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lane,
            messageKey,
            channel,
            customMessage,
          }),
        });
        const data = (await response.json()) as {
          html?: string | null;
          text?: string | null;
          previewSampleKind?: string | null;
        };
        setPreviewState({
          lane,
          messageKey,
          channel,
          title,
          html: data.html ?? null,
          text: data.text ?? null,
          sampleKind: data.previewSampleKind ?? null,
          loading: false,
        });
      } catch (error) {
        console.error("Failed to load preview:", error);
        setPreviewState({
          lane,
          messageKey,
          channel,
          title,
          html: null,
          text: "Preview failed to load",
          sampleKind: null,
          loading: false,
        });
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

  if (!policies || availableLanes.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-500">
          Communication settings are not available for this venue.
        </p>
      </section>
    );
  }

  const lanePolicies = policies[activeLane];

  return (
    <section className="space-y-6" aria-labelledby="guest-comms-main-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            id="guest-comms-main-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Guest communications
          </h2>
        </div>
        <SaveIndicator status={saveStatus} />
      </div>

      {pricingTier === "light" && !hasStripeSubscription && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p className="font-medium">SMS on Appointments Light</p>
          <p className="mt-1 text-sky-900">
            Each SMS is billed at 8p (metered). Add a card under{" "}
            <Link
              href="/dashboard/settings?tab=plan"
              className="font-medium text-sky-800 underline underline-offset-2 hover:text-sky-950"
            >
              Settings → Plan
            </Link>{" "}
            to enable SMS sending.
          </p>
        </div>
      )}

      {availableLanes.length > 1 && (
        <div
          className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
          role="tablist"
          aria-label="Communication lanes"
        >
          {availableLanes.map((lane) => (
            <button
              key={lane}
              type="button"
              role="tab"
              aria-selected={activeLane === lane}
              onClick={() => setActiveLane(lane)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeLane === lane
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {LANE_META[lane].label}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
        <p className="text-sm font-medium text-slate-900">
          {LANE_META[activeLane].label}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {LANE_META[activeLane].description}
        </p>
      </div>

      <div className="space-y-4">
        {MESSAGE_CARDS.map((card) => (
          <MessagePolicyCard
            key={`${activeLane}-${card.key}`}
            lane={activeLane}
            card={card}
            policy={lanePolicies[card.key]}
            isAdmin={isAdmin}
            onUpdate={updateMessagePolicy}
            onPreview={openPreview}
          />
        ))}
      </div>

      {previewState && (
        <PreviewModal
          state={previewState}
          onClose={() => setPreviewState(null)}
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
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="flex h-6 min-w-[6rem] items-center justify-end"
    >
      {status === "saving" && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
          Saving…
        </span>
      )}
      {status === "saved" && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 10.5l3.5 3.5L15 7" />
          </svg>
          Saved
        </span>
      )}
      {status === "error" && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-red-600">
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 6v4.5" />
            <path d="M10 13.75v.01" />
            <circle cx="10" cy="10" r="7.5" />
          </svg>
          Save failed — retrying next change
        </span>
      )}
    </div>
  );
}

function MessagePolicyCard({
  lane,
  card,
  policy,
  isAdmin,
  onUpdate,
  onPreview,
}: {
  lane: CommunicationLane;
  card: (typeof MESSAGE_CARDS)[number];
  policy: LaneMessagePolicy;
  isAdmin: boolean;
  onUpdate: (
    lane: CommunicationLane,
    messageKey: CommunicationMessageKey,
    patch: Partial<LaneMessagePolicy>,
  ) => void;
  onPreview: (
    lane: CommunicationLane,
    messageKey: CommunicationMessageKey,
    channel: CommunicationChannel,
    title: string,
    customMessage: string | null,
  ) => void;
}) {
  const activeChannels = new Set(policy.channels);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{card.label}</h3>
          <p className="mt-1 text-xs text-slate-500">{card.description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={policy.enabled}
          aria-label={`${policy.enabled ? "Disable" : "Enable"} ${card.label}`}
          disabled={!isAdmin}
          onClick={() => onUpdate(lane, card.key, { enabled: !policy.enabled })}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
            policy.enabled ? "bg-brand-600" : "bg-slate-200"
          } ${!isAdmin ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        >
          <span
            className={`mt-0.5 inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-150 ease-out ${
              policy.enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {policy.enabled && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <div className="flex flex-wrap items-center gap-4">
            {card.allowedChannels.map((channel) => {
              const checked = activeChannels.has(channel);
              const isOnlyChannel =
                checked && policy.channels.length === 1 && card.allowedChannels.length > 1;
              return (
                <label
                  key={channel}
                  className={`flex items-center gap-2 text-sm ${
                    isOnlyChannel ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!isAdmin || isOnlyChannel}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...policy.channels, channel]
                        : policy.channels.filter((item) => item !== channel);
                      onUpdate(lane, card.key, { channels: next });
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="capitalize text-slate-700">{channel}</span>
                </label>
              );
            })}

            {card.timing && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span>{card.timingLabel}</span>
                <NumericInput
                  min={1}
                  max={168}
                  disabled={!isAdmin}
                  value={
                    card.timing === "hoursBefore"
                      ? policy.hoursBefore ?? 1
                      : policy.hoursAfter ?? 1
                  }
                  onChange={(v) => {
                    onUpdate(
                      lane,
                      card.key,
                      card.timing === "hoursBefore"
                        ? { hoursBefore: v }
                        : { hoursAfter: v },
                    );
                  }}
                  className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 disabled:opacity-50"
                />
              </label>
            )}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {card.allowedChannels.includes("email") && (
              <ChannelEditor
                label="Email optional message"
                value={policy.emailCustomMessage ?? ""}
                isAdmin={isAdmin}
                onChange={(value) =>
                  onUpdate(lane, card.key, {
                    emailCustomMessage: value || null,
                  })
                }
                onPreview={() =>
                  onPreview(
                    lane,
                    card.key,
                    "email",
                    `${card.label} (email)`,
                    policy.emailCustomMessage,
                  )
                }
              />
            )}
            {card.allowedChannels.includes("sms") && (
              <ChannelEditor
                label="SMS optional message"
                value={policy.smsCustomMessage ?? ""}
                isAdmin={isAdmin}
                onChange={(value) =>
                  onUpdate(lane, card.key, {
                    smsCustomMessage: value || null,
                  })
                }
                onPreview={() =>
                  onPreview(
                    lane,
                    card.key,
                    "sms",
                    `${card.label} (SMS)`,
                    policy.smsCustomMessage,
                  )
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelEditor({
  label,
  value,
  isAdmin,
  onChange,
  onPreview,
}: {
  label: string;
  value: string;
  isAdmin: boolean;
  onChange: (value: string) => void;
  onPreview: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        <button
          type="button"
          onClick={onPreview}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
        >
          Preview
        </button>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={!isAdmin}
        rows={4}
        placeholder="Optional extra line shown with the standard template..."
        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100"
      />
      <p className="mt-2 text-[11px] text-slate-400">{value.length} characters</p>
    </div>
  );
}

function PreviewModal({
  state,
  onClose,
}: {
  state: PreviewState;
  onClose: () => void;
}) {
  const isSms = state.channel === "sms";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Preview: {state.title}
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
          {state.loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            </div>
          ) : isSms ? (
            <div className="mx-auto max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                {state.text}
              </p>
            </div>
          ) : state.html ? (
            <iframe
              title="Email preview"
              srcDoc={state.html}
              className="w-full rounded-lg border border-slate-100"
              style={{ height: "500px" }}
              sandbox="allow-same-origin"
            />
          ) : (
            <p className="text-sm text-slate-500">No preview available.</p>
          )}
          {state.sampleKind ? (
            <p className="mt-3 text-center text-[11px] text-slate-400">
              Sample context: {state.sampleKind}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
