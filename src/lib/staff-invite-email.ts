/**
 * Staff access emails: when `SENDGRID_API_KEY` is set, we email a magic link from
 * `generateLink({ type: 'magiclink' })` (same PKCE flow as login). Otherwise we fall back to
 * Supabase `inviteUserByEmail` only — configure SendGrid in production for reliable delivery.
 */
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/emails/send-email';

export type StaffAccessLinkChannel = 'sendgrid' | 'supabase';

function isSendGridConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY?.trim());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * When SendGrid is configured, prefer magic links (generateLink + SendGrid) so the same PKCE
 * pipeline as login works reliably. Supabase invite emails are the fallback when SendGrid is
 * unavailable or sending fails (single channel per attempt — no duplicate emails).
 */
export type StaffAccessLinkResult =
  | { ok: true; channel: StaffAccessLinkChannel }
  | { ok: false; error: string; status: number }
  /** Auth user already exists (e.g. invited elsewhere); caller may still insert staff with invite_email_sent: false. */
  | { ok: false; error: string; status: 409; allowStaffInsertWithoutEmail: true };

export async function deliverStaffAccessLinkEmail(params: {
  admin: SupabaseClient;
  email: string;
  redirectTo: string;
  /** Merged into auth user_metadata; must include has_set_password: false for new staff. */
  userMetadata: Record<string, unknown>;
  venueName: string;
}): Promise<StaffAccessLinkResult> {
  const { admin, email, redirectTo, userMetadata, venueName } = params;
  const normalisedEmail = email.trim().toLowerCase();

  if (isSendGridConfigured()) {
    const ensured = await ensureAuthUserWithStaffMetadata(admin, normalisedEmail, userMetadata);
    if (!ensured.ok) {
      return { ok: false, error: ensured.error, status: ensured.status };
    }

    const sendResult = await generateMagicLinkAndSendEmail(
      admin,
      normalisedEmail,
      redirectTo,
      userMetadata,
      venueName,
    );
    if (sendResult.ok) {
      return { ok: true, channel: 'sendgrid' };
    }

    console.error('[staff-invite-email] SendGrid path failed:', sendResult.error);

    if (ensured.createdUserId) {
      const { error: delErr } = await admin.auth.admin.deleteUser(ensured.createdUserId);
      if (delErr) {
        console.error('[staff-invite-email] deleteUser after failed send:', delErr);
      }
    }

    return {
      ok: false,
      error:
        'Could not email a sign-in link. Check SENDGRID_API_KEY and SENDGRID_FROM_EMAIL, then try again.',
      status: 503,
    };
  }

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(normalisedEmail, {
    redirectTo,
    data: userMetadata as Record<string, string | boolean>,
  });

  if (!inviteErr) {
    return { ok: true, channel: 'supabase' };
  }

  const msg = inviteErr.message?.toLowerCase() ?? '';
  const alreadyExists =
    msg.includes('already') || msg.includes('registered') || msg.includes('exists') || msg.includes('duplicate');

  if (alreadyExists) {
    return {
      ok: false,
      error: 'Auth user already exists; email was not sent.',
      status: 409,
      allowStaffInsertWithoutEmail: true,
    };
  }

  console.error('[staff-invite-email] inviteUserByEmail:', inviteErr);
  return {
    ok: false,
    error: inviteErr.message ?? 'Failed to send invite',
    status: 500,
  };
}

/**
 * Resend access link for an existing staff row. When SendGrid is configured this matches the primary
 * magic-link path. Without SendGrid, only `inviteUserByEmail` is available; if the auth user already
 * exists that call fails and we cannot email a link (configure SendGrid).
 */
export async function resendStaffAccessLinkEmail(params: {
  admin: SupabaseClient;
  email: string;
  redirectTo: string;
  userMetadata: Record<string, unknown>;
  venueName: string;
}): Promise<
  | { ok: true; channel: StaffAccessLinkChannel }
  | { ok: false; error: string; status: number }
> {
  const { admin, email, redirectTo, userMetadata, venueName } = params;
  const normalisedEmail = email.trim().toLowerCase();

  if (isSendGridConfigured()) {
    const ensured = await ensureAuthUserWithStaffMetadata(admin, normalisedEmail, userMetadata);
    if (!ensured.ok) {
      return { ok: false, error: ensured.error, status: ensured.status };
    }

    const sendResult = await generateMagicLinkAndSendEmail(
      admin,
      normalisedEmail,
      redirectTo,
      userMetadata,
      venueName,
    );
    if (sendResult.ok) {
      return { ok: true, channel: 'sendgrid' };
    }

    console.error('[staff-invite-email] resend SendGrid failed:', sendResult.error);

    if (ensured.createdUserId) {
      const { error: delErr } = await admin.auth.admin.deleteUser(ensured.createdUserId);
      if (delErr) {
        console.error('[staff-invite-email] deleteUser after failed resend:', delErr);
      }
    }

    return {
      ok: false,
      error:
        'Could not email a sign-in link. Check SENDGRID_API_KEY and SENDGRID_FROM_EMAIL, then try again.',
      status: 503,
    };
  }

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(normalisedEmail, {
    redirectTo,
    data: userMetadata as Record<string, string | boolean>,
  });

  if (!inviteErr) {
    return { ok: true, channel: 'supabase' };
  }

  const msg = inviteErr.message?.toLowerCase() ?? '';
  const alreadyExists =
    msg.includes('already') || msg.includes('registered') || msg.includes('exists') || msg.includes('duplicate');

  if (alreadyExists) {
    return {
      ok: false,
      error:
        'This account already exists. Configure SENDGRID_API_KEY and SENDGRID_FROM_EMAIL to email a sign-in link, or ask the team member to use the magic link on the login page.',
      status: 503,
    };
  }

  console.error('[staff-invite-email] resend inviteUserByEmail:', inviteErr);
  return {
    ok: false,
    error: inviteErr.message ?? 'Failed to send invite',
    status: 500,
  };
}

async function ensureAuthUserWithStaffMetadata(
  admin: SupabaseClient,
  normalisedEmail: string,
  userMetadata: Record<string, unknown>,
): Promise<{ ok: true; createdUserId: string | null } | { ok: false; error: string; status: number }> {
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) {
    console.error('[staff-invite-email] listUsers:', listErr);
    return { ok: false, error: 'Could not look up auth user', status: 500 };
  }

  const existing = listData?.users?.find((u) => u.email?.toLowerCase() === normalisedEmail);

  if (existing) {
    const merged = { ...(existing.user_metadata ?? {}), ...userMetadata };
    if (existing.user_metadata?.has_set_password === true) {
      merged.has_set_password = true;
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, { user_metadata: merged });
    if (updErr) {
      console.error('[staff-invite-email] updateUserById:', updErr);
      return { ok: false, error: 'Could not update auth profile for this staff member', status: 500 };
    }
    return { ok: true, createdUserId: null };
  }

  const tempPassword = randomBytes(32).toString('hex');
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: normalisedEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (createErr) {
    const msg = createErr.message?.toLowerCase() ?? '';
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return { ok: false, error: 'This email is already registered. Try resending the invite.', status: 409 };
    }
    console.error('[staff-invite-email] createUser:', createErr);
    return { ok: false, error: 'Could not create auth user for this staff member', status: 500 };
  }

  return { ok: true, createdUserId: created.user.id };
}

async function generateMagicLinkAndSendEmail(
  admin: SupabaseClient,
  normalisedEmail: string,
  redirectTo: string,
  userMetadata: Record<string, unknown>,
  venueName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: genData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: normalisedEmail,
    options: {
      redirectTo,
      data: userMetadata as Record<string, string | boolean>,
    },
  });

  const actionLink =
    (genData as { properties?: { action_link?: string } } | null)?.properties?.action_link ?? '';

  if (linkErr || !actionLink) {
    return { ok: false, error: linkErr?.message ?? 'generateLink returned no action_link' };
  }

  const subject = `Sign in to ${venueName} — Reserve NI`;
  const text = [
    `You were invited to access the dashboard for ${venueName}.`,
    '',
    `Open this link to sign in and set or confirm your password:`,
    actionLink,
    '',
    'If you did not expect this email, you can ignore it.',
  ].join('\n');

  const html = `
      <p>You were invited to access the dashboard for <strong>${escapeHtml(venueName)}</strong>.</p>
      <p><a href="${escapeHtml(actionLink)}">Sign in and continue</a></p>
      <p style="font-size:12px;color:#64748b;">If you did not expect this email, you can ignore it.</p>
    `;

  try {
    const messageId = await sendEmail({
      to: normalisedEmail,
      subject,
      html,
      text,
      disableTracking: true,
    });
    if (!messageId) {
      return { ok: false, error: 'SendGrid returned no message id (check SENDGRID_API_KEY)' };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
