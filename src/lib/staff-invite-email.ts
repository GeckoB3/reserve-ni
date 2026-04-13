/**
 * Staff access emails: use the same Supabase magic-link pipeline as the login page
 * (`signInWithOtp` → email from Supabase with `/auth/v1/verify?...`).
 *
 * Fallback when OTP send fails: `generateLink` + SendGrid (disableTracking). Last resort:
 * `inviteUserByEmail` when no auth user exists yet (rare with ensure-first flow).
 */
import { randomBytes } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/emails/send-email';

export type StaffAccessLinkChannel = 'supabase_otp' | 'sendgrid' | 'supabase_invite';

function isSendGridConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY?.trim());
}

function getSupabaseAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for staff magic links');
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type StaffAccessLinkResult =
  | { ok: true; channel: StaffAccessLinkChannel }
  | { ok: false; error: string; status: number }
  /** Auth user already exists (e.g. invited elsewhere); caller may still insert staff with invite_email_sent: false. */
  | { ok: false; error: string; status: 409; allowStaffInsertWithoutEmail: true };

/**
 * Same magic-link send path as [`login-form.tsx`](src/app/login/login-form.tsx) (`signInWithOtp` + `emailRedirectTo`).
 */
async function sendStaffMagicLinkViaSignInWithOtp(
  email: string,
  redirectTo: string,
  userMetadata: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseAnonClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
      data: userMetadata as Record<string, string | boolean>,
    },
  });

  if (error) {
    console.error('[staff-invite-email] signInWithOtp:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

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

  const ensured = await ensureAuthUserWithStaffMetadata(admin, normalisedEmail, userMetadata);
  if (!ensured.ok) {
    return { ok: false, error: ensured.error, status: ensured.status };
  }

  const otpResult = await sendStaffMagicLinkViaSignInWithOtp(normalisedEmail, redirectTo, userMetadata);
  if (otpResult.ok) {
    return { ok: true, channel: 'supabase_otp' };
  }

  if (isSendGridConfigured()) {
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
    console.error('[staff-invite-email] SendGrid fallback failed:', sendResult.error);
  }

  if (ensured.createdUserId) {
    const { error: delErr } = await admin.auth.admin.deleteUser(ensured.createdUserId);
    if (delErr) {
      console.error('[staff-invite-email] deleteUser before invite fallback:', delErr);
    }
  }

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(normalisedEmail, {
    redirectTo,
    data: userMetadata as Record<string, string | boolean>,
  });

  if (!inviteErr) {
    return { ok: true, channel: 'supabase_invite' };
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

  const ensured = await ensureAuthUserWithStaffMetadata(admin, normalisedEmail, userMetadata);
  if (!ensured.ok) {
    return { ok: false, error: ensured.error, status: ensured.status };
  }

  const otpResult = await sendStaffMagicLinkViaSignInWithOtp(normalisedEmail, redirectTo, userMetadata);
  if (otpResult.ok) {
    return { ok: true, channel: 'supabase_otp' };
  }

  if (isSendGridConfigured()) {
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
    console.error('[staff-invite-email] resend SendGrid fallback failed:', sendResult.error);
  }

  if (ensured.createdUserId) {
    const { error: delErr } = await admin.auth.admin.deleteUser(ensured.createdUserId);
    if (delErr) {
      console.error('[staff-invite-email] deleteUser before invite fallback (resend):', delErr);
    }
  }

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(normalisedEmail, {
    redirectTo,
    data: userMetadata as Record<string, string | boolean>,
  });

  if (!inviteErr) {
    return { ok: true, channel: 'supabase_invite' };
  }

  const msg = inviteErr.message?.toLowerCase() ?? '';
  const alreadyExists =
    msg.includes('already') || msg.includes('registered') || msg.includes('exists') || msg.includes('duplicate');

  if (alreadyExists) {
    return {
      ok: false,
      error:
        'Could not send a magic link. Configure SENDGRID_API_KEY as a fallback, or ask the team member to use the Magic link tab on the login page.',
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
