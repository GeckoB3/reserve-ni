'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommunicationSettings } from '@/lib/communications/service';
import type { CommMessageType } from '@/lib/emails/types';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import type { BookingModel } from '@/types/booking-models';
import type { DepositConfigLike } from '@/lib/venue/deposit-workflow';
import { venueUsesDepositWorkflow } from '@/lib/venue/deposit-workflow';
import { UnifiedAppointmentNotificationSection } from './UnifiedAppointmentNotificationSection';

interface CommCardConfig {
  messageType: CommMessageType;
  label: string;
  description: string;
  channel: 'email' | 'sms' | 'both';
  enabledKey: keyof CommunicationSettings;
  customMessageKey: keyof CommunicationSettings;
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

/**
 * When true, Standard-tier restaurant (Model A) limits several templates to email-only.
 * Unified scheduling Standard tier includes SMS per product plan §1.1; pass false when `unified_scheduling`.
 */
function buildCommunicationCards(restrictSmsForStandard: boolean, unifiedVenue: boolean): CommCardConfig[] {
  const daySub: CommCardConfig['subToggles'] = restrictSmsForStandard
    ? [{ key: 'day_of_reminder_email_enabled', label: 'Email' }]
    : [
        { key: 'day_of_reminder_email_enabled', label: 'Email' },
        { key: 'day_of_reminder_sms_enabled', label: 'SMS' },
      ];

  const modSub: CommCardConfig['subToggles'] = restrictSmsForStandard
    ? [{ key: 'modification_email_enabled', label: 'Email' }]
    : [
        { key: 'modification_email_enabled', label: 'Email' },
        { key: 'modification_sms_enabled', label: 'SMS' },
      ];

  const cancelSub: CommCardConfig['subToggles'] = unifiedVenue
    ? [{ key: 'cancellation_email_enabled', label: 'Email' }]
    : restrictSmsForStandard
      ? [{ key: 'cancellation_email_enabled', label: 'Email' }]
      : [
          { key: 'cancellation_email_enabled', label: 'Email' },
          { key: 'cancellation_sms_enabled', label: 'SMS' },
        ];

  const cards: CommCardConfig[] = [
    {
      messageType: 'booking_confirmation_email',
      label: 'Booking Confirmation',
      description: unifiedVenue
        ? 'Sent when a booking is confirmed. Channels are controlled under Automated messages above.'
        : 'Sent immediately when a booking is confirmed. Includes booking details and a manage-booking link.',
      channel: 'email',
      enabledKey: 'confirmation_email_enabled',
      customMessageKey: 'confirmation_email_custom_message',
      locked: true,
      ...(unifiedVenue ? { lockedBadgeLabel: 'Channels above' } : {}),
      maxChars: 500,
    },
    {
      messageType: 'deposit_request_email',
      label: 'Deposit request (email)',
      description:
        'Email with a payment link when staff create a booking that requires a separate deposit payment. Not used when guests pay a deposit during online booking.',
      channel: 'email',
      enabledKey: 'deposit_request_email_enabled',
      customMessageKey: 'deposit_request_email_custom_message',
      maxChars: 500,
    },
  ];

  if (!restrictSmsForStandard) {
    cards.push({
      messageType: 'deposit_request_sms',
      label: 'Deposit request (SMS)',
      description: unifiedVenue
        ? 'Text message with a payment link when staff create a booking that needs a separate deposit payment.'
        : 'SMS with a payment link for staff pay-by-link deposits. (Restaurant Standard tier uses email-only deposit requests.)',
      channel: 'sms',
      enabledKey: 'deposit_sms_enabled',
      customMessageKey: 'deposit_sms_custom_message',
      maxChars: 160,
    });
  }

  cards.push(
    {
      messageType: 'deposit_confirmation_email',
      label: 'Deposit Confirmation',
      description:
        'Email after a deposit is paid via pay-by-link (e.g. staff booking). Guests who pay a deposit during online checkout get booking confirmation only.',
      channel: 'email',
      enabledKey: 'deposit_confirmation_email_enabled',
      customMessageKey: 'deposit_confirmation_email_custom_message',
      maxChars: 500,
    },
    {
      messageType: 'reminder_56h_email',
      label: 'Confirm or Cancel Email',
      description: 'Asks guests to confirm or cancel their booking. Includes a confirm button, cancel button, and manage booking link.',
      channel: 'email',
      enabledKey: 'reminder_email_enabled',
      customMessageKey: 'reminder_email_custom_message',
      hoursBeforeKey: 'reminder_hours_before',
      maxChars: 500,
    },
    {
      messageType: 'day_of_reminder_email',
      label: 'Day-of Reminder',
      description: restrictSmsForStandard
        ? 'Reminder on the day of the booking. Restaurant Standard: email only (SMS on Business).'
        : 'Reminder sent on the day of the booking. Choose email and/or SMS.',
      channel: restrictSmsForStandard ? 'email' : 'both',
      enabledKey: 'day_of_reminder_enabled',
      customMessageKey: 'day_of_reminder_custom_message',
      timeKey: 'day_of_reminder_time',
      maxChars: 500,
      subToggles: daySub,
    },
    {
      messageType: 'post_visit_email',
      label: 'Post-Visit Thank You',
      description: 'Thank-you email sent the morning after the guest\'s visit.',
      channel: 'email',
      enabledKey: 'post_visit_email_enabled',
      customMessageKey: 'post_visit_email_custom_message',
      timeKey: 'post_visit_email_time',
      maxChars: 500,
    },
    {
      messageType: 'booking_modification_email',
      label: 'Booking Modification',
      description: unifiedVenue
        ? 'Sent when an appointment is rescheduled or details change. Choose email and, where your plan allows, text.'
        : restrictSmsForStandard
          ? 'Sent when a booking is changed. Restaurant Standard: email only (SMS on Business).'
          : 'Sent when a booking\'s date, time, or party size is changed. Choose email and/or SMS.',
      channel: restrictSmsForStandard ? 'email' : 'both',
      enabledKey: 'modification_email_enabled',
      customMessageKey: 'modification_custom_message',
      locked: true,
      maxChars: 500,
      requireOneSubToggle: true,
      subToggles: modSub,
    },
    {
      messageType: 'cancellation_email',
      label: 'Booking Cancellation',
      description: unifiedVenue
        ? 'Sent when a booking is cancelled. For appointments this is always by email.'
        : restrictSmsForStandard
          ? 'Sent when a booking is cancelled. Restaurant Standard: email only (SMS on Business).'
          : 'Sent when a booking is cancelled. Choose email and/or SMS.',
      channel: unifiedVenue || restrictSmsForStandard ? 'email' : 'both',
      enabledKey: 'cancellation_email_enabled',
      customMessageKey: 'cancellation_custom_message',
      locked: true,
      maxChars: 500,
      requireOneSubToggle: true,
      subToggles: cancelSub,
    },
  );

  return cards;
}

const CHANNEL_BADGE: Record<string, { label: string; className: string }> = {
  email: { label: 'EMAIL', className: 'bg-blue-100 text-blue-700' },
  sms: { label: 'SMS', className: 'bg-emerald-100 text-emerald-700' },
  both: { label: 'EMAIL + SMS', className: 'bg-purple-100 text-purple-700' },
};

interface CommunicationTemplatesSectionProps {
  venue: { id: string };
  isAdmin: boolean;
  /** Standard tier on restaurants only: email-only deposit request; SMS comms hidden for several message types. */
  pricingTier?: string;
  bookingModel?: string;
  /** Normalised secondaries (C/D/E); used to show merge-variable hints for multi-model venues. */
  enabledModels?: BookingModel[];
  /** When unset, deposit-related template cards are shown for unified venues (conservative default). */
  depositConfig?: DepositConfigLike | null;
  onUpdate?: (patch: Record<string, unknown>) => void;
}

const UNIFIED_HIDDEN_TYPES = new Set<CommMessageType>(['reminder_56h_email', 'day_of_reminder_email', 'post_visit_email']);
/** Wording + preview for these live in Unified appointment automation (not in the template list below). */
const UNIFIED_MERGED_IN_AUTOMATION_SECTION = new Set<CommMessageType>(['booking_confirmation_email']);
const DEPOSIT_MESSAGE_TYPES = new Set<CommMessageType>([
  'deposit_request_email',
  'deposit_request_sms',
  'deposit_confirmation_email',
]);

type UnifiedTemplateGroup = 'booking' | 'deposits' | 'changes';

function unifiedTemplateGroup(messageType: CommMessageType): UnifiedTemplateGroup {
  if (DEPOSIT_MESSAGE_TYPES.has(messageType)) return 'deposits';
  if (messageType === 'booking_modification_email' || messageType === 'cancellation_email') return 'changes';
  return 'booking';
}

const UNIFIED_TEMPLATE_GROUP_LABEL: Record<UnifiedTemplateGroup, string> = {
  booking: 'Confirmations',
  deposits: 'Deposits (pay-by-link)',
  changes: 'Reschedules and cancellations',
};

export function CommunicationTemplatesSection({
  venue: _venue,
  isAdmin,
  pricingTier = 'standard',
  bookingModel,
  enabledModels = [],
  depositConfig,
}: CommunicationTemplatesSectionProps) {
  const unifiedVenue = isUnifiedSchedulingVenue(bookingModel);
  const primary = (bookingModel as BookingModel | undefined) ?? 'table_reservation';
  const showCdeMergeHints =
    primary === 'event_ticket' ||
    primary === 'class_session' ||
    primary === 'resource_booking' ||
    enabledModels.some((m) => m === 'event_ticket' || m === 'class_session' || m === 'resource_booking');
  const restrictSmsForStandard = pricingTier === 'standard' && !unifiedVenue;
  const cards = useMemo(
    () => buildCommunicationCards(restrictSmsForStandard, unifiedVenue),
    [restrictSmsForStandard, unifiedVenue],
  );
  /** When deposit JSON is missing, keep deposit cards visible for unified venues (cannot infer intent). */
  const showDepositTemplates =
    !unifiedVenue || depositConfig == null || venueUsesDepositWorkflow(depositConfig);
  const visibleCards = useMemo(() => {
    let list = unifiedVenue ? cards.filter((c) => !UNIFIED_HIDDEN_TYPES.has(c.messageType)) : cards;
    if (unifiedVenue) {
      list = list.filter((c) => !UNIFIED_MERGED_IN_AUTOMATION_SECTION.has(c.messageType));
    }
    if (unifiedVenue && !showDepositTemplates) {
      list = list.filter((c) => !DEPOSIT_MESSAGE_TYPES.has(c.messageType));
    }
    return list;
  }, [cards, unifiedVenue, showDepositTemplates]);

  const unifiedTimelineSteps = useMemo(() => {
    if (!unifiedVenue) return null;
    return [
      { label: 'Booking made', icon: '1' },
      { label: 'First reminder', icon: '2' },
      { label: 'Second reminder', icon: '3' },
      { label: 'Thank you', icon: '4' },
    ];
  }, [unifiedVenue]);

  const [settings, setSettings] = useState<CommunicationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [notifSaveStatus, setNotifSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const mergedSaveStatus = useMemo(() => {
    if (saveStatus === 'saving' || notifSaveStatus === 'saving') return 'saving';
    if (saveStatus === 'error' || notifSaveStatus === 'error') return 'error';
    if (saveStatus === 'saved' || notifSaveStatus === 'saved') return 'saved';
    return 'idle';
  }, [saveStatus, notifSaveStatus]);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<CommMessageType | null>(null);
  const [previewCardLabel, setPreviewCardLabel] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/venue/communication-settings')
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
        console.error('Failed to load communication settings:', err);
        setLoading(false);
      });
  }, []);

  const updateSetting = useCallback(
    (key: keyof CommunicationSettings, value: unknown) => {
      if (!isAdmin) return;
      setSettings((prev) => {
        if (!prev) return prev;
        return { ...prev, [key]: value };
      });
      setSaveStatus('saving');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          await fetch('/api/venue/communication-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: value }),
          });
          setSaveStatus('saved');
          savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
        } catch {
          setSaveStatus('error');
        }
      }, 500);
    },
    [isAdmin],
  );

  const openPreview = useCallback(
    async (messageType: CommMessageType, customMessage?: string | null, displayLabel?: string) => {
      setPreviewLoading(true);
      setPreviewType(messageType);
      setPreviewCardLabel(displayLabel ?? null);
      try {
        const res = await fetch('/api/venue/communication-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageType, customMessage }),
        });
        const data = await res.json();
        setPreviewHtml(data.html ?? null);
        setPreviewText(data.text ?? null);
      } catch {
        setPreviewHtml(null);
        setPreviewText('Preview failed to load');
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
          <span className="text-sm text-slate-500">Loading communication settings...</span>
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-red-600">Failed to load communication settings</p>
      </section>
    );
  }

  const timelineSteps =
    unifiedVenue && unifiedTimelineSteps
      ? unifiedTimelineSteps
      : [
          { label: 'Booking made', icon: '1' },
          { label: 'Deposit paid', icon: '2' },
          { label: 'Confirm/Cancel', icon: '3' },
          { label: 'Day of visit', icon: '4' },
          { label: 'After visit', icon: '5' },
        ];

  return (
    <section className="space-y-10" aria-labelledby="guest-comms-main-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="guest-comms-main-heading" className="text-lg font-semibold text-slate-900">
            Guest communications
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {unifiedVenue
              ? 'For each message: choose channels and timing, then add optional wording and preview. Deposit and change notices are grouped below.'
              : 'Control what messages your guests receive and when they are sent.'}
          </p>
          {unifiedVenue && !showDepositTemplates && (
            <p className="mt-2 text-sm text-slate-500">
              Deposit wording is hidden while deposits are off in your booking and payment settings.
            </p>
          )}
          {restrictSmsForStandard && (
            <p className="mt-2 text-xs text-slate-500">
              Restaurant Standard plan: several guest SMS options are off here; upgrade to Business for full SMS on deposit
              requests, day-of reminders, and change/cancel notices. Unified scheduling venues on Standard include SMS with a
              monthly allowance (see Plan).
            </p>
          )}
          {showCdeMergeHints && (
            <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700">Template variables (events, classes, resources)</summary>
              <p className="mt-2 leading-relaxed">
                Confirmation and reminder emails for ticketed events, classes, and resources are enriched server-side with
                titles and times (e.g. event name, class instance, resource window). Custom lines you add here are appended to
                the standard body — use them for tone or extra instructions. Venue name, date, time, and manage links are
                always included automatically.
              </p>
            </details>
          )}
        </div>
        <SaveIndicator status={mergedSaveStatus} />
      </div>

      {unifiedVenue && (
        <div className="space-y-4">
          <div
            className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3"
            role="region"
            aria-label="Typical message order for your clients"
          >
            <p className="text-xs font-medium text-slate-700">Typical order for your clients</p>
            <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-xs text-slate-600">
              {timelineSteps.map((step, i) => (
                <li key={`${step.label}-${step.icon}`} className="flex items-center gap-1">
                  {i > 0 && <span className="mx-1 text-slate-300" aria-hidden="true">→</span>}
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-brand-700 shadow-sm ring-1 ring-slate-200/80">
                    {step.icon}
                  </span>
                  <span className="whitespace-nowrap pl-0.5">{step.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <section className="space-y-3" aria-labelledby="unified-automation-heading">
            <div>
              <h3 id="unified-automation-heading" className="text-base font-semibold text-slate-900">
                Automated messages
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Channels, timing, optional wording, and previews for each step, together in one place.
              </p>
            </div>
            <UnifiedAppointmentNotificationSection
              isAdmin={isAdmin}
              commSettings={settings}
              onUpdateComm={updateSetting}
              onNotificationSaveStatus={setNotifSaveStatus}
              onPreview={(type, custom) => {
                const labels: Partial<Record<CommMessageType, string>> = {
                  booking_confirmation_email: 'Booking confirmation (email)',
                  reminder_1_email: 'First reminder (email)',
                  reminder_1_sms: 'Reminder text (sample)',
                  reminder_2_sms: 'Reminder text (sample)',
                  unified_post_visit_email: 'Thank-you after visit (email)',
                  booking_confirmation_sms: 'Confirmation text',
                };
                void openPreview(type, custom ?? null, labels[type]);
              }}
            />
          </section>
        </div>
      )}

      <section className="space-y-5" aria-labelledby="message-templates-section-heading">
        <div className={unifiedVenue ? 'pt-2' : 'border-t border-slate-200 pt-8'}>
          <h3 id="message-templates-section-heading" className="text-base font-semibold text-slate-900">
            {unifiedVenue ? 'Deposits and booking changes' : 'Message templates'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {unifiedVenue
              ? 'Pay-by-link deposits and notices when an appointment is changed or cancelled. Preview uses sample appointment details.'
              : 'Edit the wording guests see in each email or text.'}
          </p>
        </div>

        {!unifiedVenue && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3" role="region" aria-label="Typical journey">
            <p className="text-xs font-medium text-slate-700">Typical journey</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-xs text-slate-600">
              {timelineSteps.map((step, i) => (
                <div key={`${step.label}-${step.icon}`} className="flex items-center gap-1">
                  {i > 0 && <span className="mx-1 text-slate-300" aria-hidden="true">→</span>}
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-brand-700 shadow-sm ring-1 ring-slate-200/80">
                    {step.icon}
                  </span>
                  <span className="whitespace-nowrap pl-0.5">{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-8">
          {unifiedVenue
            ? (['booking', 'deposits', 'changes'] as const).map((g) => {
                const groupCards = visibleCards.filter((c) => unifiedTemplateGroup(c.messageType) === g);
                if (groupCards.length === 0) return null;
                return (
                  <div key={g} className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-800">{UNIFIED_TEMPLATE_GROUP_LABEL[g]}</h4>
                    <div className="space-y-4">
                      {groupCards.map((card) => (
                        <CommCard
                          key={card.messageType}
                          card={card}
                          settings={settings}
                          onUpdate={updateSetting}
                          onPreview={(type, msg) => void openPreview(type, msg)}
                          isAdmin={isAdmin}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            : visibleCards.map((card) => (
                <CommCard
                  key={card.messageType}
                  card={card}
                  settings={settings}
                  onUpdate={updateSetting}
                  onPreview={(type, msg) => void openPreview(type, msg)}
                  isAdmin={isAdmin}
                />
              ))}
        </div>
      </section>

      {previewType && (
        <PreviewModal
          messageType={previewType}
          cardLabel={previewCardLabel ?? visibleCards.find((c) => c.messageType === previewType)?.label}
          html={previewHtml}
          text={previewText}
          loading={previewLoading}
          onClose={() => {
            setPreviewType(null);
            setPreviewHtml(null);
            setPreviewText(null);
            setPreviewCardLabel(null);
          }}
        />
      )}
    </section>
  );
}

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  const map = {
    saving: { text: 'Saving...', className: 'text-slate-500' },
    saved: { text: 'Saved', className: 'text-emerald-600' },
    error: { text: 'Save failed', className: 'text-red-600' },
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
}: {
  card: CommCardConfig;
  settings: CommunicationSettings;
  onUpdate: (key: keyof CommunicationSettings, value: unknown) => void;
  onPreview: (type: CommMessageType, customMessage?: string | null) => void;
  isAdmin: boolean;
}) {
  const enabled = card.locked ? true : (settings[card.enabledKey] as boolean);
  const customMessage = (settings[card.customMessageKey] as string | null) ?? '';
  const badge = CHANNEL_BADGE[card.channel];
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border bg-white shadow-sm transition-colors ${enabled ? 'border-slate-200' : 'border-slate-100 bg-slate-50/50'}`}>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={`text-sm font-semibold ${enabled ? 'text-slate-900' : 'text-slate-400'}`}>{card.label}</h3>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.className}`}>{badge.label}</span>
            </div>
            <p className={`mt-0.5 text-xs ${enabled ? 'text-slate-500' : 'text-slate-400'}`}>{card.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!card.locked && isAdmin && (
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => onUpdate(card.enabledKey, !enabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors ${enabled ? 'bg-brand-600' : 'bg-slate-200'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
            </button>
          )}
          {card.locked && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 uppercase">
              {card.lockedBadgeLabel ?? 'Always on'}
            </span>
          )}
        </div>
      </div>

      {enabled && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {card.subToggles?.map((sub) => {
              const checked = settings[sub.key] as boolean;
              const isLastActive = card.requireOneSubToggle && checked &&
                card.subToggles!.filter((s) => settings[s.key] as boolean).length === 1;
              return (
                <label key={sub.key as string} className={`flex items-center gap-1.5 ${isLastActive ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
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
                  <span className={`text-slate-600 ${isLastActive ? 'opacity-60' : ''}`}>{sub.label}</span>
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
                    const val = Math.min(168, Math.max(12, parseInt(e.target.value, 10) || 56));
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
                  value={(settings[card.timeKey] as string)?.slice(0, 5) ?? '09:00'}
                  onChange={(e) => {
                    if (isAdmin) onUpdate(card.timeKey!, `${e.target.value}:00`);
                  }}
                  disabled={!isAdmin}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
                />
              </label>
            )}

            <button
              type="button"
              onClick={() => onPreview(card.messageType, customMessage || null)}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              Preview
            </button>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              <svg className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
              {customMessage ? 'Edit custom message' : 'Add a custom message'}
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
                  placeholder="Add a personalised message that will appear in the email..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 placeholder-slate-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{customMessage.length}/{card.maxChars} characters</span>
                  {card.channel === 'sms' && customMessage.length > 160 && (
                    <span className="text-amber-600 font-medium">SMS messages over 160 chars may be split</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewModal({
  messageType,
  cardLabel,
  html,
  text,
  loading,
  onClose,
}: {
  messageType: CommMessageType;
  cardLabel?: string;
  html: string | null;
  text: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const isSms = messageType.endsWith('_sms');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Preview: {cardLabel ?? messageType}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
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
              <p className="mt-2 text-center text-[11px] text-slate-400">SMS preview (sample data)</p>
            </div>
          ) : html ? (
            <div>
              <iframe
                title="Email preview"
                srcDoc={html}
                className="w-full rounded-lg border border-slate-100"
                style={{ height: '500px' }}
                sandbox="allow-same-origin"
              />
              <p className="mt-2 text-center text-[11px] text-slate-400">Email preview with sample data</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No preview available</p>
          )}
        </div>
      </div>
    </div>
  );
}
