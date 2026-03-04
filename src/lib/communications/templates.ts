/**
 * Default message templates (MVP: code constants). Merge variables in {{name}}.
 */

import type { MessageType } from './types';

const VAR_NAMES = [
  'guest_name',
  'venue_name',
  'booking_date',
  'booking_time',
  'party_size',
  'deposit_amount',
  'cancellation_deadline',
  'venue_address',
  'dietary_notes',
  'occasion',
  'confirm_link',
  'cancel_link',
  'payment_link',
  'manage_booking_link',
  'booking_page_link',
  'dietary_summary',
  'dietary_count',
] as const;

export function mergeVariables(template: string, variables: Record<string, string | number | undefined>): string {
  let out = template;
  for (const key of VAR_NAMES) {
    const val = variables[key];
    if (val !== undefined && val !== null) {
      out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
    }
  }
  Object.entries(variables).forEach(([key, val]) => {
    if (val !== undefined && val !== null && !VAR_NAMES.includes(key as (typeof VAR_NAMES)[number])) {
      out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
    }
  });
  return out;
}

interface TemplateDef {
  subject?: string;
  body: string;
}

const EMAIL_TEMPLATES: Partial<Record<MessageType, TemplateDef>> = {
  booking_confirmation: {
    subject: 'Booking confirmed at {{venue_name}}',
    body: `Hi {{guest_name}},

Your reservation at {{venue_name}} is confirmed.

Date: {{booking_date}}
Time: {{booking_time}}
Party size: {{party_size}}
{{#dietary_notes}}Dietary notes: {{dietary_notes}}{{/dietary_notes}}
{{#occasion}}Occasion: {{occasion}}{{/occasion}}

{{#deposit_amount}}Deposit paid: £{{deposit_amount}}{{/deposit_amount}}

Cancellation policy: Full refund if you cancel by {{cancellation_deadline}}. No refund after that or for no-shows.

{{#manage_booking_link}}View or cancel your booking: {{manage_booking_link}}{{/manage_booking_link}}

We look forward to seeing you!
{{venue_name}}`,
  },
  cancellation_confirmation: {
    subject: 'Booking cancelled – {{venue_name}}',
    body: `Hi {{guest_name}},

Your reservation at {{venue_name}} for {{booking_date}} at {{booking_time}} has been cancelled.

{{#deposit_amount}}Your deposit has been refunded.{{/deposit_amount}}

We hope to see you another time.
{{venue_name}}`,
  },
  no_show_notification: {
    subject: 'We missed you – {{venue_name}}',
    body: `Hi {{guest_name}},

You had a reservation at {{venue_name}} for {{booking_date}} at {{booking_time}} that was marked as a no-show.

{{#deposit_amount}}As per our policy, your deposit is non-refundable for no-shows.{{/deposit_amount}}

If you need to rebook, we’d love to see you.
{{venue_name}}`,
  },
  auto_cancel_notification: {
    subject: 'Booking cancelled – {{venue_name}}',
    body: `Hi {{guest_name}},

Your reservation at {{venue_name}} for {{booking_date}} at {{booking_time}} (party of {{party_size}}) was cancelled because the deposit was not paid within 24 hours.

You can make a new booking anytime.
{{venue_name}}`,
  },
  pre_visit_reminder: {
    subject: 'Reminder: Your reservation at {{venue_name}}',
    body: `Hi {{guest_name}},

This is a reminder that you have a reservation at {{venue_name}} on {{booking_date}} at {{booking_time}} for {{party_size}} guests.

{{#dietary_notes}}Dietary notes on file: {{dietary_notes}}

{{/dietary_notes}}{{#venue_address}}Address: {{venue_address}}

{{/venue_address}}Cancellation policy: Full refund if cancelled 48+ hours before your reservation. No refund within 48 hours.

{{#manage_booking_link}}Manage your booking: {{manage_booking_link}}

{{/manage_booking_link}}We look forward to seeing you!
{{venue_name}}`,
  },
  booking_modification: {
    subject: 'Your reservation at {{venue_name}} has been updated',
    body: `Hi {{guest_name}},

Your reservation at {{venue_name}} has been updated.

New details:
Date: {{booking_date}}
Time: {{booking_time}}
Party size: {{party_size}}

{{#deposit_amount}}Deposit: £{{deposit_amount}}

{{/deposit_amount}}{{#manage_booking_link}}Manage your booking: {{manage_booking_link}}

{{/manage_booking_link}}If you have any questions, please contact us.
{{venue_name}}`,
  },
  dietary_digest: {
    subject: 'Dietary requirements for today — {{venue_name}}',
    body: `Here are today's dietary requirements and allergies for {{booking_date}}:

{{dietary_summary}}

Total covers with dietary notes: {{dietary_count}}`,
  },
  post_visit_thankyou: {
    subject: 'Thank you for dining at {{venue_name}}',
    body: `Hi {{guest_name}},

Thank you for dining with us at {{venue_name}}. We hope you had a wonderful experience.

We'd love to see you again soon. You can book your next visit at {{booking_page_link}}.

{{venue_name}}`,
  },
  deposit_payment_request: {
    subject: 'Deposit required for your reservation at {{venue_name}}',
    body: `Hi {{guest_name}},

Thank you for your reservation at {{venue_name}} on {{booking_date}} at {{booking_time}} for {{party_size}} guests.

A deposit of £{{deposit_amount}} is required to confirm your booking.

Pay your deposit here: {{payment_link}}

Cancellation policy: Full refund if cancelled 48+ hours before your reservation. No refund within 48 hours.

If the deposit is not paid within 24 hours, your booking will be automatically cancelled.

{{venue_name}}`,
  },
};

const SMS_TEMPLATES: Partial<Record<MessageType, string>> = {
  deposit_payment_request: `{{venue_name}}: Pay your deposit for {{booking_date}} at {{booking_time}} ({{party_size}} guests). {{payment_link}}`,
  confirm_or_cancel_prompt: `{{venue_name}}: Confirm your booking for {{booking_date}} at {{booking_time}}. Confirm: {{confirm_link}} Cancel: {{cancel_link}}`,
  deposit_payment_reminder: `{{venue_name}}: Reminder – please pay your deposit for {{booking_date}}. {{payment_link}}`,
  auto_cancel_notification: `{{venue_name}}: Your booking for {{booking_date}} at {{booking_time}} was cancelled (deposit not paid in time).`,
};

function stripOptionalBlocks(text: string, variables: Record<string, string | number | undefined>): string {
  return text.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    const v = variables[key];
    return v !== undefined && v !== null && String(v).trim() !== '' ? content : '';
  });
}

export function getEmailTemplate(type: MessageType): TemplateDef | null {
  const t = EMAIL_TEMPLATES[type];
  return t ?? null;
}

export function getSmsTemplate(type: MessageType): string | null {
  return SMS_TEMPLATES[type] ?? null;
}

export function compileEmailTemplate(
  type: MessageType,
  variables: Record<string, string | number | undefined>
): { subject: string; body: string } | null {
  const t = getEmailTemplate(type);
  if (!t) return null;
  const vars = { ...variables };
  const body = mergeVariables(stripOptionalBlocks(t.body, vars), vars);
  const subject = t.subject ? mergeVariables(t.subject, vars) : '';
  return { subject, body };
}

export function compileSmsTemplate(
  type: MessageType,
  variables: Record<string, string | number | undefined>
): string | null {
  const t = getSmsTemplate(type);
  if (!t) return null;
  return mergeVariables(t, variables);
}
