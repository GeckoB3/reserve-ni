import { sanitizeAuthNextPath } from './safe-auth-redirect';

export const SET_PASSWORD_PATH = '/auth/set-password';

const OTP_ERROR_HINTS = ['expired', 'invalid', 'already been used', 'code verifier', 'bad code'] as const;
const SUPPORTED_OTP_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change'] as const;

export type AuthErrorDetail = 'otp_expired' | 'exchange_failed';
export type SupportedOtpType = (typeof SUPPORTED_OTP_TYPES)[number];

export function parseHashSearchParams(rawHash: string | null | undefined): URLSearchParams {
  return new URLSearchParams((rawHash ?? '').replace(/^#/, ''));
}

export function getAuthCode(
  searchParams: Pick<URLSearchParams, 'get'>,
  hashParams?: Pick<URLSearchParams, 'get'>,
): string | null {
  return getParam(searchParams, hashParams, 'code');
}

export function getAuthOtpParams(
  searchParams: Pick<URLSearchParams, 'get'>,
  hashParams?: Pick<URLSearchParams, 'get'>,
): { tokenHash: string; type: SupportedOtpType } | null {
  const tokenHash = getParam(searchParams, hashParams, 'token_hash');
  const rawType = getParam(searchParams, hashParams, 'type');
  if (!tokenHash || !isSupportedOtpType(rawType)) {
    return null;
  }

  return {
    tokenHash,
    type: rawType,
  };
}

export function getAuthErrorDetail(
  searchParams: Pick<URLSearchParams, 'get'>,
  hashParams?: Pick<URLSearchParams, 'get'>,
): AuthErrorDetail | null {
  const explicitDetail = normaliseAuthErrorDetail(
    getParam(searchParams, hashParams, 'detail') ?? getParam(searchParams, hashParams, 'error_code'),
  );
  if (explicitDetail) {
    return explicitDetail;
  }

  const error = getParam(searchParams, hashParams, 'error');
  if (!error) {
    return null;
  }

  return mapAuthErrorMessageToDetail(getParam(searchParams, hashParams, 'error_description') ?? error);
}

export function mapAuthErrorMessageToDetail(message: string | null | undefined): AuthErrorDetail {
  const lower = (message ?? '').toLowerCase();
  if (lower.includes('access_denied') || OTP_ERROR_HINTS.some((hint) => lower.includes(hint))) {
    return 'otp_expired';
  }

  return 'exchange_failed';
}

export function getAuthFailurePath(rawNext: string | null | undefined, detail: AuthErrorDetail): string {
  const nextPath = sanitizeAuthNextPath(rawNext);
  const query = new URLSearchParams({
    error: 'auth_callback_error',
    detail,
  }).toString();

  if (nextPath === SET_PASSWORD_PATH) {
    return `${SET_PASSWORD_PATH}?${query}`;
  }

  return `/login?${query}`;
}

function getParam(
  searchParams: Pick<URLSearchParams, 'get'>,
  hashParams: Pick<URLSearchParams, 'get'> | undefined,
  key: string,
): string | null {
  return searchParams.get(key) ?? hashParams?.get(key) ?? null;
}

function normaliseAuthErrorDetail(raw: string | null | undefined): AuthErrorDetail | null {
  if (raw === 'otp_expired' || raw === 'exchange_failed') {
    return raw;
  }

  return null;
}

function isSupportedOtpType(value: string | null): value is SupportedOtpType {
  return value != null && SUPPORTED_OTP_TYPES.includes(value as SupportedOtpType);
}
